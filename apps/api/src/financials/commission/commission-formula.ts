/**
 * Commission Formula — THE math.
 *
 * Single source of truth for converting a supplier deposit (the "gross
 * received" on a commission_check_item) into an agent share. Every code path
 * that pays an agent — IC Payouts V2, legacy payAgents, importers — MUST
 * call computeAgentShare(). Inlining the math elsewhere is a regression.
 *
 * Math (per locked-decision in docs/runbooks/commission-rebuild-plan.md):
 *
 *   gross_received       (e.g. $105.00 supplier deposit)
 *   embedded_tax         (e.g. $5.00 GST embedded in gross)
 *   commissionable_base  = gross_received - embedded_tax
 *   platform_fee         = round(base × fee_rate%)               (5% default)
 *   distributable        = base - platform_fee
 *   agent_pool           = round(distributable × split%)         (60% default)
 *   agent_share          = round(agent_pool × collaborator%)
 *   agency_retains       = base - agent_share + embedded_tax     (tax passes through)
 *
 * Overrides:
 *   - trips.commission_fee_rate_override overrides the agency fee_rate%
 *   - trip_collaborators.agent_split_override overrides the agent's profile splitValue
 *   - trip_collaborators.commission_percentage is the share between collaborators
 *     (always non-NULL; defaults to 100 for a solo agent)
 *
 * All amounts in INTEGER CENTS to avoid float drift. Rounding policy: half-up
 * to nearest cent on every multiplication. Tested invariant: round-tripping
 * a single full claim should net to zero drift on the source row.
 */

/**
 * Snapshot of the inputs that produced an agent_share. Persisted verbatim
 * into commission_item_settlements.computation_breakdown so an auditor can
 * answer "why was Sandra paid exactly $171 for booking X?" deterministically
 * forever — even if formula constants change later.
 */
export interface CommissionBreakdown {
  /** Gross cents the supplier deposited for this booking (= check_item.received_cents). */
  grossReceivedCents: number
  /** Tax embedded in gross (= check_item.embedded_tax_cents). */
  embeddedTaxCents: number
  /** Tax label captured at deposit time. */
  embeddedTaxType: string | null
  /** Effective tax rate (%) captured at deposit time. */
  embeddedTaxRatePercent: number | null
  /** Gross minus embedded tax. The number all percentages apply to. */
  commissionableBaseCents: number
  /** The agency's fee rate (%) actually applied (after override). */
  feeRatePercent: number
  /** Whether trips.commission_fee_rate_override was in effect. */
  feeRateOverridden: boolean
  /** Tech fee taken by the agency (= base × feeRate%). */
  platformFeeCents: number
  /** Base minus platform fee — the pool that gets split agent/agency. */
  distributableCents: number
  /** The agent split % (after override). */
  agentSplitPercent: number
  /** Whether trip_collaborators.agent_split_override was in effect. */
  agentSplitOverridden: boolean
  /** Distributable × splitPct — pool shared between collaborators. */
  agentPoolCents: number
  /** This collaborator's slice of the agent_pool (%). */
  collaboratorPercent: number
  /** Final cents paid to this collaborator. */
  agentShareCents: number
  /** Cents the agency keeps after paying this collaborator (incl. tax passthrough). */
  agencyRetainsCents: number
  /** Schema version of this breakdown record (bump if shape changes). */
  formulaVersion: 1
  /** ISO timestamp when this breakdown was computed. */
  computedAt: string
}

export interface CommissionInputs {
  /** Supplier paid this many cents on the check item. */
  grossReceivedCents: number
  /** GST/HST embedded inside grossReceivedCents (0 when supplier paid tax-exclusive). */
  embeddedTaxCents: number
  /** Optional tax label for the breakdown record. */
  embeddedTaxType?: string | null
  /** Optional tax rate (%) for the breakdown record. */
  embeddedTaxRatePercent?: number | null
  /** Agency-wide default fee rate (%) — typically 5.00. */
  defaultFeeRatePercent: number
  /** Per-trip override of the fee rate (%) — null when no override. */
  feeRateOverridePercent: number | null
  /** Agent profile splitValue (%) — typically 60.00 for ICs. */
  defaultAgentSplitPercent: number
  /** Per-trip override of the agent split (%) — null when no override. */
  agentSplitOverridePercent: number | null
  /**
   * This collaborator's slice of the agent_pool (%), from
   * trip_collaborators.commission_percentage. Must be >= 0 and <= 100. For a
   * solo agent, pass 100.
   */
  collaboratorPercent: number
}

/**
 * Half-up cent rounding. Avoids JS float drift on `* 0.6` etc.
 * Operates on integer cents × percent / 100.
 */
function applyPercent(cents: number, percent: number): number {
  // Promote to a single integer multiply, then divide+round to integer cents.
  // (cents × percent_basis_points) / 10000, half-up.
  const basisPoints = Math.round(percent * 100) // 5.00% → 500 bp
  const product = cents * basisPoints
  // Half-up rounding: floor((n + 5000) / 10000) is wrong for negatives.
  // Use a sign-aware half-up so reversal-row negatives round symmetrically.
  if (product >= 0) {
    return Math.floor((product + 5000) / 10000)
  }
  return -Math.floor((-product + 5000) / 10000)
}

/**
 * Computes an agent's share for a single commission_check_item × collaborator
 * pair. Returns both the cents owed and the full breakdown snapshot for
 * audit persistence.
 *
 * @throws RangeError when inputs are out of spec (negative gross, percentages
 *         outside 0..100). Callers must validate upstream — this function is
 *         a pure calculator and refuses garbage.
 */
export function computeAgentShare(inputs: CommissionInputs): {
  agentShareCents: number
  breakdown: CommissionBreakdown
} {
  validateInputs(inputs)

  const feeRatePercent =
    inputs.feeRateOverridePercent ?? inputs.defaultFeeRatePercent
  const agentSplitPercent =
    inputs.agentSplitOverridePercent ?? inputs.defaultAgentSplitPercent

  const commissionableBaseCents =
    inputs.grossReceivedCents - inputs.embeddedTaxCents
  const platformFeeCents = applyPercent(commissionableBaseCents, feeRatePercent)
  const distributableCents = commissionableBaseCents - platformFeeCents
  const agentPoolCents = applyPercent(distributableCents, agentSplitPercent)
  const agentShareCents = applyPercent(agentPoolCents, inputs.collaboratorPercent)

  // Agency retains everything that isn't paid out to this collaborator,
  // including the embedded tax (which is passed through to CRA, not kept).
  // For multi-collaborator splits, callers compute agency_retains by summing
  // all collaborator shares first — this single-collaborator value is the
  // "what's left after this one agent" view.
  const agencyRetainsCents = commissionableBaseCents - agentShareCents + inputs.embeddedTaxCents

  const breakdown: CommissionBreakdown = {
    grossReceivedCents: inputs.grossReceivedCents,
    embeddedTaxCents: inputs.embeddedTaxCents,
    embeddedTaxType: inputs.embeddedTaxType ?? null,
    embeddedTaxRatePercent: inputs.embeddedTaxRatePercent ?? null,
    commissionableBaseCents,
    feeRatePercent,
    feeRateOverridden: inputs.feeRateOverridePercent !== null,
    platformFeeCents,
    distributableCents,
    agentSplitPercent,
    agentSplitOverridden: inputs.agentSplitOverridePercent !== null,
    agentPoolCents,
    collaboratorPercent: inputs.collaboratorPercent,
    agentShareCents,
    agencyRetainsCents,
    formulaVersion: 1,
    computedAt: new Date().toISOString(),
  }

  return { agentShareCents, breakdown }
}

function validateInputs(inputs: CommissionInputs): void {
  if (!Number.isInteger(inputs.grossReceivedCents)) {
    throw new RangeError(`grossReceivedCents must be an integer, got ${inputs.grossReceivedCents}`)
  }
  if (!Number.isInteger(inputs.embeddedTaxCents)) {
    throw new RangeError(`embeddedTaxCents must be an integer, got ${inputs.embeddedTaxCents}`)
  }
  if (inputs.embeddedTaxCents < 0) {
    throw new RangeError(`embeddedTaxCents must be non-negative, got ${inputs.embeddedTaxCents}`)
  }
  if (inputs.embeddedTaxCents > Math.abs(inputs.grossReceivedCents)) {
    throw new RangeError(
      `embeddedTaxCents (${inputs.embeddedTaxCents}) cannot exceed |grossReceivedCents| (${inputs.grossReceivedCents})`,
    )
  }
  for (const [name, value] of [
    ['defaultFeeRatePercent', inputs.defaultFeeRatePercent],
    ['defaultAgentSplitPercent', inputs.defaultAgentSplitPercent],
    ['collaboratorPercent', inputs.collaboratorPercent],
  ] as const) {
    if (value < 0 || value > 100) {
      throw new RangeError(`${name} must be in [0, 100], got ${value}`)
    }
  }
  if (
    inputs.feeRateOverridePercent !== null &&
    (inputs.feeRateOverridePercent < 0 || inputs.feeRateOverridePercent > 100)
  ) {
    throw new RangeError(
      `feeRateOverridePercent must be in [0, 100] or null, got ${inputs.feeRateOverridePercent}`,
    )
  }
  if (
    inputs.agentSplitOverridePercent !== null &&
    (inputs.agentSplitOverridePercent < 0 || inputs.agentSplitOverridePercent > 100)
  ) {
    throw new RangeError(
      `agentSplitOverridePercent must be in [0, 100] or null, got ${inputs.agentSplitOverridePercent}`,
    )
  }
}

/**
 * Computes embedded tax from a tax-inclusive gross. Used by the importer when
 * suppliers.commission_includes_tax = true.
 *
 * embedded_tax = gross × rate / (100 + rate)
 *
 * Example: $105 gross at 5% GST → embedded = 105 × 5 / 105 = $5.
 */
export function computeEmbeddedTaxFromInclusive(
  grossCents: number,
  ratePercent: number,
): number {
  if (!Number.isInteger(grossCents)) {
    throw new RangeError(`grossCents must be an integer, got ${grossCents}`)
  }
  if (ratePercent < 0 || ratePercent > 100) {
    throw new RangeError(`ratePercent must be in [0, 100], got ${ratePercent}`)
  }
  if (ratePercent === 0) return 0
  const basisPoints = Math.round(ratePercent * 100)
  // gross × bp / (10000 + bp), half-up.
  const numerator = grossCents * basisPoints
  const denominator = 10000 + basisPoints
  if (numerator >= 0) {
    return Math.floor((numerator + denominator / 2) / denominator)
  }
  return -Math.floor((-numerator + denominator / 2) / denominator)
}
