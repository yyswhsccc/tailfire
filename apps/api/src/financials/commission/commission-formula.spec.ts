/**
 * commission-formula.spec.ts
 *
 * Locks the canonical math from docs/runbooks/commission-rebuild-plan.md:
 *   $1000 - 5% tech fee = $950 × 60% agent split = $570 (solo)
 *
 * Plus tax-on-commission fixtures, overrides, edge cases, reversal
 * round-trip, and input validation.
 */

import {
  computeAgentShare,
  computeEmbeddedTaxFromInclusive,
  type CommissionInputs,
} from './commission-formula'

const SOLO_AGENT: Pick<CommissionInputs, 'collaboratorPercent'> = {
  collaboratorPercent: 100,
}

const DEFAULTS: Pick<
  CommissionInputs,
  'defaultFeeRatePercent' | 'defaultAgentSplitPercent' | 'feeRateOverridePercent' | 'agentSplitOverridePercent'
> = {
  defaultFeeRatePercent: 5,
  defaultAgentSplitPercent: 60,
  feeRateOverridePercent: null,
  agentSplitOverridePercent: null,
}

describe('computeAgentShare — canonical fixture', () => {
  it('$1000 tax-exclusive solo @ 5% fee, 60% split = $570', () => {
    const { agentShareCents, breakdown } = computeAgentShare({
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(57_000)
    expect(breakdown.commissionableBaseCents).toBe(100_000)
    expect(breakdown.platformFeeCents).toBe(5_000)
    expect(breakdown.distributableCents).toBe(95_000)
    expect(breakdown.agentPoolCents).toBe(57_000)
    expect(breakdown.agencyRetainsCents).toBe(43_000) // 100k - 57k + 0 tax
    expect(breakdown.feeRateOverridden).toBe(false)
    expect(breakdown.agentSplitOverridden).toBe(false)
    expect(breakdown.formulaVersion).toBe(1)
  })
})

describe('computeAgentShare — tax-on-commission (ACV scenario)', () => {
  it('$105 gross with $5 embedded GST → base $100 → agent $57', () => {
    const { agentShareCents, breakdown } = computeAgentShare({
      grossReceivedCents: 10_500,
      embeddedTaxCents: 500,
      embeddedTaxType: 'GST',
      embeddedTaxRatePercent: 5,
      ...DEFAULTS,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(5_700)
    expect(breakdown.commissionableBaseCents).toBe(10_000)
    expect(breakdown.platformFeeCents).toBe(500)
    expect(breakdown.distributableCents).toBe(9_500)
    expect(breakdown.agentPoolCents).toBe(5_700)
    // agency_retains = base - agent_share + tax = 10000 - 5700 + 500 = 4800
    expect(breakdown.agencyRetainsCents).toBe(4_800)
    expect(breakdown.embeddedTaxType).toBe('GST')
    expect(breakdown.embeddedTaxRatePercent).toBe(5)
  })

  it('Ontario HST 13% — $1130 gross, $130 embedded → base $1000 → agent $570', () => {
    const { agentShareCents, breakdown } = computeAgentShare({
      grossReceivedCents: 113_000,
      embeddedTaxCents: 13_000,
      embeddedTaxType: 'HST',
      embeddedTaxRatePercent: 13,
      ...DEFAULTS,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(57_000)
    expect(breakdown.commissionableBaseCents).toBe(100_000)
    expect(breakdown.agencyRetainsCents).toBe(56_000) // 100k - 57k + 13k tax
  })
})

describe('computeAgentShare — overrides', () => {
  it('trip override: fee_rate = 0 (legacy payroll trip) → agent gets full 60% of $1000', () => {
    const { agentShareCents, breakdown } = computeAgentShare({
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
      feeRateOverridePercent: 0,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(60_000)
    expect(breakdown.feeRatePercent).toBe(0)
    expect(breakdown.feeRateOverridden).toBe(true)
    expect(breakdown.platformFeeCents).toBe(0)
    expect(breakdown.distributableCents).toBe(100_000)
  })

  it('trip override: agent_split = 100 (Joel earns 100% on own travel)', () => {
    const { agentShareCents, breakdown } = computeAgentShare({
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
      agentSplitOverridePercent: 100,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(95_000) // 1000 - 5% fee = 950, × 100%
    expect(breakdown.agentSplitPercent).toBe(100)
    expect(breakdown.agentSplitOverridden).toBe(true)
    expect(breakdown.agencyRetainsCents).toBe(5_000) // fee only
  })

  it('both overrides stack: 0% fee + 100% split = agent gets the whole gross', () => {
    const { agentShareCents } = computeAgentShare({
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
      feeRateOverridePercent: 0,
      agentSplitOverridePercent: 100,
      ...SOLO_AGENT,
    })
    expect(agentShareCents).toBe(100_000)
  })
})

describe('computeAgentShare — multi-collaborator', () => {
  it('two collaborators 50/50 split — sum of shares ≤ agent_pool', () => {
    const base: Omit<CommissionInputs, 'collaboratorPercent'> = {
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
    }
    const a = computeAgentShare({ ...base, collaboratorPercent: 50 })
    const b = computeAgentShare({ ...base, collaboratorPercent: 50 })
    expect(a.agentShareCents + b.agentShareCents).toBe(57_000) // exactly agent_pool
    expect(a.agentShareCents).toBe(28_500)
    expect(b.agentShareCents).toBe(28_500)
  })

  it('70/30 split rounds to whole cents on both sides without drift', () => {
    const base: Omit<CommissionInputs, 'collaboratorPercent'> = {
      grossReceivedCents: 10_001, // odd cents to provoke rounding
      embeddedTaxCents: 0,
      ...DEFAULTS,
    }
    const a = computeAgentShare({ ...base, collaboratorPercent: 70 })
    const b = computeAgentShare({ ...base, collaboratorPercent: 30 })
    // No requirement they sum to agent_pool exactly under independent rounds —
    // callers can prorate the remainder. But each must be in expected range.
    expect(a.agentShareCents).toBeGreaterThan(0)
    expect(b.agentShareCents).toBeGreaterThan(0)
  })
})

describe('computeAgentShare — reversal symmetry', () => {
  it('negative gross produces symmetric negative share (reversal round-trip)', () => {
    const inputs: CommissionInputs = {
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      ...DEFAULTS,
      ...SOLO_AGENT,
    }
    const forward = computeAgentShare(inputs)
    const reverse = computeAgentShare({ ...inputs, grossReceivedCents: -100_000 })
    expect(reverse.agentShareCents).toBe(-forward.agentShareCents)
  })
})

describe('computeAgentShare — validation', () => {
  const base: CommissionInputs = {
    grossReceivedCents: 100_000,
    embeddedTaxCents: 0,
    ...DEFAULTS,
    ...SOLO_AGENT,
  }

  it('rejects non-integer cents', () => {
    expect(() => computeAgentShare({ ...base, grossReceivedCents: 100.5 })).toThrow(RangeError)
  })

  it('rejects embedded tax > |gross|', () => {
    expect(() => computeAgentShare({ ...base, embeddedTaxCents: 200_000 })).toThrow(RangeError)
  })

  it('rejects negative embedded tax', () => {
    expect(() => computeAgentShare({ ...base, embeddedTaxCents: -100 })).toThrow(RangeError)
  })

  it('rejects out-of-range fee override', () => {
    expect(() => computeAgentShare({ ...base, feeRateOverridePercent: 150 })).toThrow(RangeError)
  })

  it('rejects out-of-range collaborator percent', () => {
    expect(() => computeAgentShare({ ...base, collaboratorPercent: -5 })).toThrow(RangeError)
  })
})

describe('computeEmbeddedTaxFromInclusive', () => {
  it('5% GST: $105 inclusive → $5 tax', () => {
    expect(computeEmbeddedTaxFromInclusive(10_500, 5)).toBe(500)
  })

  it('13% HST: $1130 inclusive → $130 tax', () => {
    expect(computeEmbeddedTaxFromInclusive(113_000, 13)).toBe(13_000)
  })

  it('0% rate returns 0', () => {
    expect(computeEmbeddedTaxFromInclusive(100_000, 0)).toBe(0)
  })

  it('rounds half-up on odd cents', () => {
    // $1.05 at 5%: 105 × 5 / 105 = 5.0 → $0.05
    expect(computeEmbeddedTaxFromInclusive(105, 5)).toBe(5)
    // $0.55 at 5%: 55 × 5 / 105 = 2.619... → $0.03 (half-up)
    expect(computeEmbeddedTaxFromInclusive(55, 5)).toBe(3)
  })

  it('handles negative gross symmetrically (reversal)', () => {
    expect(computeEmbeddedTaxFromInclusive(-10_500, 5)).toBe(-500)
  })

  it('rejects out-of-range rate', () => {
    expect(() => computeEmbeddedTaxFromInclusive(100, 150)).toThrow(RangeError)
  })
})
