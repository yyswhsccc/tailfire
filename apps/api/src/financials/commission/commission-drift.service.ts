/**
 * CommissionDriftService (PR-3)
 *
 * Per-(agency, currency, recipient) snapshot of the IC v2 commission
 * reconciliation state. Append-only writes to commission_drift_snapshots.
 *
 * KEYSTONE DECISION (Codex round-2 plan validation): every cents value
 * in this service comes from calling computeAgentShare() — the SAME
 * formula PR-1 wired into the money path. NO SQL re-implementation;
 * commission-formula.ts is the single source of truth. The view
 * v_commission_position (later commit) is a thin aggregate over the
 * snapshot rows this service writes.
 *
 * Drift invariant (LOCKED):
 *   true_drift_cents = committed_payable
 *                    - in_flight_reconciled_unsettled
 *                    - adjustments_reconciled
 *                    - settled_active
 * Any non-zero = real bug → Sentry with fingerprint
 *   commission_drift_${agency_id}_${currency}.
 *
 * Reversal pair imbalance is a SEPARATE alarm — original + reversal
 * cents should always net to 0; non-zero = orphan / mismatched negation
 * → Sentry fingerprint commission_reversal_imbalance_${agency_id}_${currency}.
 */

import { Injectable, Logger } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { schema } from '@tailfire/database'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import {
  computeAgentShare,
  type CommissionInputs,
} from './commission-formula'

// ─── Pure helper types (exported for parity tests) ───────────────────────────

/**
 * Single (check_item × collaborator) input. The drift service loads these
 * from SQL JOINs and feeds them through computeAgentShare.
 */
export interface DriftCheckItemInput {
  checkItemId: string
  activityPricingId: string
  // Currency lives on the parent commission_check
  currency: string
  // The recipient who would receive this share
  recipientUserId: string
  // Trip + reconciliation gates
  tripStatus: 'planning' | 'inbound' | 'active' | 'travelling' | 'travelled' | 'cancelled'
  isReconciled: boolean
  // Formula inputs (mirror commission-formula's CommissionInputs)
  formulaInputs: CommissionInputs
  // Expected vs received — for the supplier_short visibility bucket
  expectedCommissionCents: number
  // Whether an ACTIVE (non-reversal, non-reversed) settlement exists for
  // this (checkItem, recipient) pair. Drives in_flight vs settled split.
  hasActiveSettlement: boolean
}

/**
 * Settlement row pulled directly from commission_item_settlements.
 * settled_amount_cents is the agentShareCents PR-1 wrote at submit time —
 * the snapshot consumes this verbatim, no recompute (per Codex plan).
 */
export interface DriftSettlementRow {
  /**
   * PR-3 Commit 5 (Codex round-1 fix #4): pairing key. Without the row id,
   * we couldn't match originals to their negation rows individually — only
   * sum them in bulk. Two broken pairs could then cancel each other and
   * mask integrity violations. The aggregator now pairs by
   * reverses_settlement_id → id explicitly.
   */
  id: string
  checkItemId: string
  recipientUserId: string
  currency: string
  settledAmountCents: number
  isReversal: boolean
  reversedAt: Date | null
  reversesSettlementId: string | null
}

export interface DriftAdjustmentRow {
  agentUserId: string
  currency: string
  amountCents: number
  status: 'pending' | 'reconciled'
  /**
   * PR-3 Commit 5 (Codex round-1 fix #2): when NOT NULL, this adjustment
   * was created to close a gap on a specific check_item (gap-fill). When
   * NULL, it's a standalone payout the IC claimed independently.
   *
   * Only item-scoped reconciled adjustments enter the drift formula;
   * standalone are visibility-only (would otherwise false-alert on every
   * adjustment-only claim, which IC v2 explicitly allows).
   */
  activityPricingId: string | null
}

export interface DriftSnapshotKey {
  agencyId: string
  currency: string
  recipientUserId: string
}

export interface DriftSnapshotRow extends DriftSnapshotKey {
  committedPayableCents: number
  inFlightReconciledUnsettledCents: number
  settledActiveCents: number
  adjustmentsReconciledCents: number
  trueDriftCents: number
  settledReversedPairNetCents: number
  reversalPairImbalance: number
  unreconciledCommittedCents: number
  pendingAdjustmentsCents: number
  supplierShortCents: number
  // PR-3 Commit 5: visibility-only, NOT in true_drift formula.
  standaloneReconciledAdjustmentsCents: number
}

// ─── Pure helper (exported for parity tests) ─────────────────────────────────

/**
 * Pure aggregation: takes already-loaded inputs and produces the snapshot
 * rows for a single agency. No DB calls — testable against the
 * commission-formula fixtures.
 */
export function aggregateDriftSnapshots(args: {
  agencyId: string
  checkItems: DriftCheckItemInput[]
  settlements: DriftSettlementRow[]
  adjustments: DriftAdjustmentRow[]
}): DriftSnapshotRow[] {
  const { agencyId, checkItems, settlements, adjustments } = args
  const byKey = new Map<string, DriftSnapshotRow>()

  const keyOf = (currency: string, recipientUserId: string) =>
    `${currency}::${recipientUserId}`

  const ensureRow = (currency: string, recipientUserId: string): DriftSnapshotRow => {
    const k = keyOf(currency, recipientUserId)
    let row = byKey.get(k)
    if (!row) {
      row = {
        agencyId,
        currency,
        recipientUserId,
        committedPayableCents: 0,
        inFlightReconciledUnsettledCents: 0,
        settledActiveCents: 0,
        adjustmentsReconciledCents: 0,
        trueDriftCents: 0,
        settledReversedPairNetCents: 0,
        reversalPairImbalance: 0,
        unreconciledCommittedCents: 0,
        pendingAdjustmentsCents: 0,
        supplierShortCents: 0,
        standaloneReconciledAdjustmentsCents: 0,
      }
      byKey.set(k, row)
    }
    return row
  }

  // 1) check_item × collaborator → committed / in_flight / unreconciled / supplier_short
  //    Trip status gate: only travelling/travelled count toward payable.
  for (const item of checkItems) {
    const isDeparted = item.tripStatus === 'travelling' || item.tripStatus === 'travelled'
    if (!isDeparted) continue

    const { agentShareCents } = computeAgentShare(item.formulaInputs)
    const row = ensureRow(item.currency, item.recipientUserId)

    if (item.isReconciled) {
      row.committedPayableCents += agentShareCents
      if (!item.hasActiveSettlement) {
        row.inFlightReconciledUnsettledCents += agentShareCents
      }
      // Supplier-short visibility (only meaningful on reconciled rows;
      // unreconciled = admin still chasing).
      const variance =
        item.formulaInputs.grossReceivedCents - item.expectedCommissionCents
      if (variance < 0) {
        row.supplierShortCents += -variance
      }
    } else {
      row.unreconciledCommittedCents += agentShareCents
    }
  }

  // 2) settlements → settled_active + per-pair reversal_pair_imbalance
  //    (Codex round-1 fix #4): pair originals to reversals individually
  //    via reverses_settlement_id → original.id. Two broken pairs cannot
  //    cancel each other anymore — we check each pair on its own and
  //    sum the per-pair imbalances + flag orphans.
  const originalsById = new Map<string, DriftSettlementRow>()
  const reversalsByOriginalId = new Map<string, DriftSettlementRow>()
  for (const s of settlements) {
    if (!s.isReversal) {
      originalsById.set(s.id, s)
    } else if (s.reversesSettlementId) {
      // Only one reversal per original is allowed (commit 12 partial unique
      // on reverses_settlement_id WHERE is_reversal = true). Last write
      // wins if the DB invariant were broken — we'd still flag it via the
      // pair-imbalance sum below.
      reversalsByOriginalId.set(s.reversesSettlementId, s)
    }
  }

  // Pass A: active settlement OR active original — accumulate settled_active
  // and per-pair imbalance. Per-pair imbalance is the SUM OF ABSOLUTE VALUES
  // of each broken pair's signed deviation, so two broken pairs with
  // opposite signs cannot cancel each other in the alarm bucket.
  // settledReversedPairNetCents stays SIGNED for forensic visibility
  // (admin can see which way the net leans across all pairs).
  for (const s of settlements) {
    if (s.isReversal) continue
    const row = ensureRow(s.currency, s.recipientUserId)
    if (s.reversedAt === null) {
      // Active original — agent has been paid this much.
      row.settledActiveCents += s.settledAmountCents
    } else {
      // Reversed original — find its negation row and check the pair.
      const reversal = reversalsByOriginalId.get(s.id)
      // Pair net = original + reversal (should equal 0). When reversal
      // is missing (orphan original), the original cents IS the imbalance.
      const pairNet = s.settledAmountCents + (reversal?.settledAmountCents ?? 0)
      row.settledReversedPairNetCents += pairNet
      row.reversalPairImbalance += Math.abs(pairNet)
    }
  }

  // Pass B: orphan reversals — reversal rows with no matching original on
  // the active or reversed-original side. The negation cents become the
  // imbalance for the orphan's bucket.
  for (const s of settlements) {
    if (!s.isReversal) continue
    if (s.reversesSettlementId && originalsById.has(s.reversesSettlementId)) {
      // Matched — already accounted for in Pass A's pair sum.
      continue
    }
    const row = ensureRow(s.currency, s.recipientUserId)
    row.settledReversedPairNetCents += s.settledAmountCents
    row.reversalPairImbalance += Math.abs(s.settledAmountCents)
  }

  // 3) adjustments → split by item-scoped vs standalone (Codex round-1 fix #2)
  //    Item-scoped (activity_pricing_id NOT NULL): closes a gap on an
  //      already-counted committed item → enters the drift formula.
  //    Standalone (activity_pricing_id NULL): independent payout the IC
  //      claimed via IC v2's adjustment-only path → visibility only,
  //      excluded from drift (otherwise every adj-only claim alerts).
  for (const a of adjustments) {
    const row = ensureRow(a.currency, a.agentUserId)
    if (a.status === 'reconciled') {
      if (a.activityPricingId !== null) {
        row.adjustmentsReconciledCents += a.amountCents
      } else {
        row.standaloneReconciledAdjustmentsCents += a.amountCents
      }
    } else {
      row.pendingAdjustmentsCents += a.amountCents
    }
  }

  // 4) Compute derived values
  //    reversalPairImbalance is already accumulated as a sum of per-pair
  //    absolute deviations during Pass A + Pass B — do NOT clobber it
  //    with the signed net here.
  for (const row of byKey.values()) {
    row.trueDriftCents =
      row.committedPayableCents
      - row.inFlightReconciledUnsettledCents
      - row.adjustmentsReconciledCents
      - row.settledActiveCents
  }

  return Array.from(byKey.values())
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CommissionDriftService {
  private readonly logger = new Logger(CommissionDriftService.name)

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Take a single drift snapshot for one agency (or all agencies when
   * agencyId is omitted). Inserts the snapshot rows + fires Sentry on
   * any non-zero true_drift or reversal_pair_imbalance.
   *
   * Returns the inserted snapshot rows so the admin trigger endpoint can
   * surface them in the response.
   */
  async runSnapshot(agencyId?: string): Promise<DriftSnapshotRow[]> {
    const agencies = await this.loadAgenciesToSnapshot(agencyId)
    const allRows: DriftSnapshotRow[] = []

    // PR-3 Commit 5 (Codex round-1 fix): per-agency error isolation. One
    // bad agency cannot kill the whole tick; we log and continue. The
    // admin-trigger endpoint still propagates errors because it calls
    // runSnapshot with an explicit agencyId, but the all-agency
    // scheduler path must keep going.
    for (const aId of agencies) {
      try {
        const rows = await this.runSnapshotForOneAgency(aId)
        allRows.push(...rows)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Re-throw if caller scoped to one agency — preserves the
        // admin-trigger contract.
        if (agencyId) throw err
        this.logger.error(
          `drift snapshot agency=${aId} FAILED: ${msg}. Skipping; other agencies will continue.`,
        )
      }
    }

    return allRows
  }

  /**
   * Single-agency snapshot. Extracted so the all-agency loop can wrap
   * it in per-tenant error isolation.
   */
  private async runSnapshotForOneAgency(aId: string): Promise<DriftSnapshotRow[]> {
    const [checkItems, settlements, adjustments] = await Promise.all([
      this.loadCheckItemInputs(aId),
      this.loadSettlements(aId),
      this.loadAdjustments(aId),
    ])

    const snapshots = aggregateDriftSnapshots({
      agencyId: aId,
      checkItems,
      settlements,
      adjustments,
    })

    for (const snap of snapshots) {
      const eventId = await this.maybeAlert(snap)
      await this.databaseService.db
        .insert(schema.commissionDriftSnapshots)
        .values({
          agencyId: snap.agencyId,
          currency: snap.currency,
          recipientUserId: snap.recipientUserId,
          committedPayableCents: snap.committedPayableCents,
          inFlightReconciledUnsettledCents: snap.inFlightReconciledUnsettledCents,
          settledActiveCents: snap.settledActiveCents,
          adjustmentsReconciledCents: snap.adjustmentsReconciledCents,
          trueDriftCents: snap.trueDriftCents,
          settledReversedPairNetCents: snap.settledReversedPairNetCents,
          reversalPairImbalance: snap.reversalPairImbalance,
          unreconciledCommittedCents: snap.unreconciledCommittedCents,
          pendingAdjustmentsCents: snap.pendingAdjustmentsCents,
          supplierShortCents: snap.supplierShortCents,
          standaloneReconciledAdjustmentsCents: snap.standaloneReconciledAdjustmentsCents,
          sentryAlertFired: !!eventId,
          sentryEventId: eventId,
        })
    }

    this.logger.log(
      `drift snapshot agency=${aId}: ${snapshots.length} rows, ` +
        `alerts=${snapshots.filter((s) => s.trueDriftCents !== 0 || s.reversalPairImbalance !== 0).length}`,
    )

    return snapshots
  }

  /**
   * Fires Sentry events for non-zero drift. Returns the event id (or
   * null when nothing alerted) so the snapshot row records what was sent.
   *
   * Per-currency fingerprints so dupes coalesce per agency × currency —
   * Phoenix doesn't get N events for the same CAD drift on consecutive
   * 6h ticks.
   */
  private async maybeAlert(snap: DriftSnapshotRow): Promise<string | null> {
    let eventId: string | null = null

    if (snap.trueDriftCents !== 0) {
      eventId = Sentry.captureMessage(
        `Commission drift detected: agency=${snap.agencyId} currency=${snap.currency} ` +
          `recipient=${snap.recipientUserId} drift=${snap.trueDriftCents}c`,
        {
          level: 'error',
          fingerprint: ['commission_drift', snap.agencyId, snap.currency],
          tags: {
            agency_id: snap.agencyId,
            currency: snap.currency,
            recipient_user_id: snap.recipientUserId,
            drift_kind: 'true_drift',
          },
          extra: {
            true_drift_cents: snap.trueDriftCents,
            committed_payable_cents: snap.committedPayableCents,
            in_flight_reconciled_unsettled_cents: snap.inFlightReconciledUnsettledCents,
            settled_active_cents: snap.settledActiveCents,
            adjustments_reconciled_cents: snap.adjustmentsReconciledCents,
          },
        },
      )
    }

    if (snap.reversalPairImbalance !== 0) {
      const id = Sentry.captureMessage(
        `Commission reversal-pair imbalance: agency=${snap.agencyId} ` +
          `currency=${snap.currency} recipient=${snap.recipientUserId} ` +
          `imbalance=${snap.reversalPairImbalance}c`,
        {
          level: 'error',
          fingerprint: ['commission_reversal_imbalance', snap.agencyId, snap.currency],
          tags: {
            agency_id: snap.agencyId,
            currency: snap.currency,
            recipient_user_id: snap.recipientUserId,
            drift_kind: 'reversal_imbalance',
          },
          extra: {
            reversal_pair_imbalance: snap.reversalPairImbalance,
            settled_reversed_pair_net_cents: snap.settledReversedPairNetCents,
          },
        },
      )
      eventId = eventId ?? id
    }

    return eventId
  }

  // ─── Loaders ────────────────────────────────────────────────────────────────

  private async loadAgenciesToSnapshot(agencyId?: string): Promise<string[]> {
    if (agencyId) return [agencyId]
    // PR-3 Commit 5 (Codex round-1 fix): agencies has is_active (boolean),
    // NOT deleted_at. The previous query failed at runtime on every
    // startup tick. Sticking to active tenants matches what every other
    // tenant-iterating job in the codebase does.
    const rows = await this.databaseService.db.execute<{ id: string }>(sql`
      SELECT id FROM agencies WHERE is_active = true
    `)
    return rows.map((r) => r.id)
  }

  /**
   * Load every (check_item × collaborator) tuple for an agency along with
   * the formula inputs the drift formula needs. Returns one row per
   * collaborator on each commission_check_item — the aggregator multiplies
   * upward to (agency, currency, recipient).
   *
   * Filters: only active (non-reversal, non-reversed) settlements count as
   * "claimed" — the existing settlement join uses the same active predicate
   * as IC v2.
   */
  private async loadCheckItemInputs(agencyId: string): Promise<DriftCheckItemInput[]> {
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        cci.id                                              AS check_item_id,
        cci.activity_pricing_id                             AS activity_pricing_id,
        src_cc.currency                                     AS currency,
        tc.user_id                                          AS recipient_user_id,
        t.status                                            AS trip_status,
        ct.is_reconciled                                    AS is_reconciled,
        GREATEST(COALESCE(cci.received_cents, 0), 0)        AS gross_received_cents,
        COALESCE(cci.embedded_tax_cents, 0)                 AS embedded_tax_cents,
        cci.embedded_tax_type                               AS embedded_tax_type,
        cci.embedded_tax_rate_percent                       AS embedded_tax_rate_percent,
        COALESCE(ags.commission_fee_rate, '5.00')::numeric  AS default_fee_rate_percent,
        t.commission_fee_rate_override::numeric             AS fee_rate_override_percent,
        COALESCE(((up.commission_settings->>'splitValue')::numeric), 60)::numeric
                                                            AS default_agent_split_percent,
        tc.agent_split_override::numeric                    AS agent_split_override_percent,
        tc.commission_percentage::numeric                   AS collaborator_percent,
        COALESCE((ct.commission_amount * 100)::int, 0)      AS expected_commission_cents,
        EXISTS (
          SELECT 1
          FROM commission_item_settlements existing
          WHERE existing.check_item_id = cci.id
            AND existing.recipient_user_id = tc.user_id
            AND existing.is_reversal = false
            AND existing.reversed_at IS NULL
        )                                                   AS has_active_settlement
      FROM commission_check_items cci
      JOIN commission_checks src_cc ON src_cc.id = cci.check_id
      JOIN activity_pricing ap      ON ap.id = cci.activity_pricing_id
      JOIN commission_tracking ct   ON ct.component_pricing_id = ap.id
      JOIN itinerary_activities ia  ON ia.id = ap.activity_id
      JOIN itinerary_days id_day    ON id_day.id = ia.itinerary_day_id
      JOIN itineraries i            ON i.id = id_day.itinerary_id
      JOIN trips t                  ON t.id = i.trip_id
      JOIN trip_collaborators tc    ON tc.trip_id = t.id AND tc.is_active = true
      LEFT JOIN user_profiles up    ON up.id = tc.user_id
      LEFT JOIN agency_settings ags ON ags.agency_id = ${agencyId}::uuid
      WHERE src_cc.agency_id = ${agencyId}::uuid
        AND src_cc.check_type = 'received'
        AND src_cc.status = 'accepted'
    `)

    return rows.map((r) => ({
      checkItemId: r.check_item_id,
      activityPricingId: r.activity_pricing_id,
      currency: r.currency,
      recipientUserId: r.recipient_user_id,
      tripStatus: r.trip_status,
      isReconciled: r.is_reconciled,
      formulaInputs: {
        grossReceivedCents: Number(r.gross_received_cents),
        embeddedTaxCents: Number(r.embedded_tax_cents),
        embeddedTaxType: r.embedded_tax_type ?? null,
        embeddedTaxRatePercent:
          r.embedded_tax_rate_percent != null ? Number(r.embedded_tax_rate_percent) : null,
        defaultFeeRatePercent: Number(r.default_fee_rate_percent),
        feeRateOverridePercent:
          r.fee_rate_override_percent != null ? Number(r.fee_rate_override_percent) : null,
        defaultAgentSplitPercent: Number(r.default_agent_split_percent),
        agentSplitOverridePercent:
          r.agent_split_override_percent != null ? Number(r.agent_split_override_percent) : null,
        collaboratorPercent: Number(r.collaborator_percent),
      },
      expectedCommissionCents: Number(r.expected_commission_cents),
      hasActiveSettlement: !!r.has_active_settlement,
    }))
  }

  private async loadSettlements(agencyId: string): Promise<DriftSettlementRow[]> {
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        cis.id                   AS id,
        cis.check_item_id        AS check_item_id,
        cis.recipient_user_id    AS recipient_user_id,
        src_cc.currency          AS currency,
        cis.settled_amount_cents AS settled_amount_cents,
        cis.is_reversal          AS is_reversal,
        cis.reversed_at          AS reversed_at,
        cis.reverses_settlement_id AS reverses_settlement_id
      FROM commission_item_settlements cis
      JOIN commission_check_items cci ON cci.id = cis.check_item_id
      JOIN commission_checks src_cc   ON src_cc.id = cci.check_id
      WHERE src_cc.agency_id = ${agencyId}::uuid
    `)
    return rows.map((r) => ({
      id: r.id,
      checkItemId: r.check_item_id,
      recipientUserId: r.recipient_user_id,
      currency: r.currency,
      settledAmountCents: Number(r.settled_amount_cents),
      isReversal: !!r.is_reversal,
      reversedAt: r.reversed_at ? new Date(r.reversed_at) : null,
      reversesSettlementId: r.reverses_settlement_id ?? null,
    }))
  }

  private async loadAdjustments(agencyId: string): Promise<DriftAdjustmentRow[]> {
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        agent_user_id        AS agent_user_id,
        currency             AS currency,
        amount_cents         AS amount_cents,
        status               AS status,
        activity_pricing_id  AS activity_pricing_id
      FROM commission_adjustments
      WHERE agency_id = ${agencyId}::uuid
        AND agent_user_id IS NOT NULL
    `)
    return rows.map((r) => ({
      agentUserId: r.agent_user_id,
      currency: r.currency,
      amountCents: Number(r.amount_cents),
      status: r.status,
      activityPricingId: r.activity_pricing_id ?? null,
    }))
  }
}
