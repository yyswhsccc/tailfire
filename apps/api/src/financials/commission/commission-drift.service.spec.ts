/**
 * commission-drift.service.spec.ts (PR-3 Commit 2)
 *
 * Parity tests on aggregateDriftSnapshots — proves the bucket math is
 * consistent with commission-formula's computeAgentShare for every
 * scenario the formula spec locked in (canonical $570, ACV tax-inclusive,
 * fee override, split override, 70/30 collaborator rounding, reversed
 * item).
 *
 * Tests aggregateDriftSnapshots directly (pure function — no DB) so the
 * formula contract is what's under test, not the SQL loader.
 */

import {
  aggregateDriftSnapshots,
  type DriftCheckItemInput,
} from './commission-drift.service'
import type { CommissionInputs } from './commission-formula'

const AGENCY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SOLO_AGENT = '11111111-1111-1111-1111-111111111111'
const COLLAB_A = '22222222-2222-2222-2222-222222222222'
const COLLAB_B = '33333333-3333-3333-3333-333333333333'

const DEFAULT_FORMULA: Pick<
  CommissionInputs,
  | 'defaultFeeRatePercent'
  | 'defaultAgentSplitPercent'
  | 'feeRateOverridePercent'
  | 'agentSplitOverridePercent'
> = {
  defaultFeeRatePercent: 5,
  defaultAgentSplitPercent: 60,
  feeRateOverridePercent: null,
  agentSplitOverridePercent: null,
}

function makeItem(
  overrides: Partial<DriftCheckItemInput> = {},
): DriftCheckItemInput {
  return {
    checkItemId: `cci-${Math.random().toString(36).slice(2, 8)}`,
    activityPricingId: `ap-${Math.random().toString(36).slice(2, 8)}`,
    currency: 'CAD',
    recipientUserId: SOLO_AGENT,
    tripStatus: 'travelled',
    isReconciled: true,
    formulaInputs: {
      grossReceivedCents: 100_000, // $1000
      embeddedTaxCents: 0,
      embeddedTaxType: null,
      embeddedTaxRatePercent: null,
      ...DEFAULT_FORMULA,
      collaboratorPercent: 100,
    },
    expectedCommissionCents: 100_000,
    hasActiveSettlement: false,
    ...overrides,
  }
}

describe('aggregateDriftSnapshots — parity with computeAgentShare', () => {
  it('canonical $1000 / 5% / 60% solo → $570 committed_payable when reconciled+travelled', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [makeItem()],
      settlements: [],
      adjustments: [],
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.committedPayableCents).toBe(57_000)
    expect(row.inFlightReconciledUnsettledCents).toBe(57_000)
    expect(row.settledActiveCents).toBe(0)
    expect(row.adjustmentsReconciledCents).toBe(0)
    expect(row.trueDriftCents).toBe(0) // 57000 - 57000 - 0 - 0 = 0
  })

  it('ACV $105 inclusive 5% GST → agent share = $57', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          formulaInputs: {
            grossReceivedCents: 10_500,
            embeddedTaxCents: 500,
            embeddedTaxType: 'GST',
            embeddedTaxRatePercent: 5,
            ...DEFAULT_FORMULA,
            collaboratorPercent: 100,
          },
          expectedCommissionCents: 10_000,
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows[0]!.committedPayableCents).toBe(5_700)
  })

  it('trip fee override = 0 → agent share = full 60% of $1000', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          formulaInputs: {
            grossReceivedCents: 100_000,
            embeddedTaxCents: 0,
            embeddedTaxType: null,
            embeddedTaxRatePercent: null,
            defaultFeeRatePercent: 5,
            feeRateOverridePercent: 0,
            defaultAgentSplitPercent: 60,
            agentSplitOverridePercent: null,
            collaboratorPercent: 100,
          },
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows[0]!.committedPayableCents).toBe(60_000)
  })

  it('agent split override = 100 → agent gets distributable in full', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          formulaInputs: {
            grossReceivedCents: 100_000,
            embeddedTaxCents: 0,
            embeddedTaxType: null,
            embeddedTaxRatePercent: null,
            defaultFeeRatePercent: 5,
            feeRateOverridePercent: null,
            defaultAgentSplitPercent: 60,
            agentSplitOverridePercent: 100,
            collaboratorPercent: 100,
          },
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    // $1000 - 5% fee = $950 × 100% = $950
    expect(rows[0]!.committedPayableCents).toBe(95_000)
  })

  it('70/30 multi-collaborator on the same check_item → both agents get their share', () => {
    const checkItemId = 'cci-shared'
    const apId = 'ap-shared'
    const baseInputs: Omit<CommissionInputs, 'collaboratorPercent'> = {
      grossReceivedCents: 100_000,
      embeddedTaxCents: 0,
      embeddedTaxType: null,
      embeddedTaxRatePercent: null,
      ...DEFAULT_FORMULA,
    }
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          checkItemId,
          activityPricingId: apId,
          recipientUserId: COLLAB_A,
          formulaInputs: { ...baseInputs, collaboratorPercent: 70 },
        }),
        makeItem({
          checkItemId,
          activityPricingId: apId,
          recipientUserId: COLLAB_B,
          formulaInputs: { ...baseInputs, collaboratorPercent: 30 },
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows).toHaveLength(2)
    const a = rows.find((r) => r.recipientUserId === COLLAB_A)!
    const b = rows.find((r) => r.recipientUserId === COLLAB_B)!
    // 95_000 × 60% = 57_000 agent pool → × 70/30
    expect(a.committedPayableCents).toBe(39_900)
    expect(b.committedPayableCents).toBe(17_100)
    // Sum matches the solo agent_pool exactly (no rounding loss)
    expect(a.committedPayableCents + b.committedPayableCents).toBe(57_000)
  })
})

describe('aggregateDriftSnapshots — gates and visibility buckets', () => {
  it('non-departed trips are excluded from every bucket', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({ tripStatus: 'planning' }),
        makeItem({ tripStatus: 'active' }),
        makeItem({ tripStatus: 'cancelled' }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows).toHaveLength(0)
  })

  it('unreconciled items land in unreconciled_committed_cents only — never in committed_payable', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [makeItem({ isReconciled: false })],
      settlements: [],
      adjustments: [],
    })
    expect(rows[0]!.committedPayableCents).toBe(0)
    expect(rows[0]!.inFlightReconciledUnsettledCents).toBe(0)
    expect(rows[0]!.unreconciledCommittedCents).toBe(57_000)
    expect(rows[0]!.trueDriftCents).toBe(0)
  })

  it('supplier_short_cents counts only when received < expected on RECONCILED rows', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          isReconciled: true,
          formulaInputs: {
            grossReceivedCents: 80_000,
            embeddedTaxCents: 0,
            embeddedTaxType: null,
            embeddedTaxRatePercent: null,
            ...DEFAULT_FORMULA,
            collaboratorPercent: 100,
          },
          expectedCommissionCents: 100_000, // supplier short $200
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows[0]!.supplierShortCents).toBe(20_000)
  })

  it('over-payment does NOT register as supplier_short', () => {
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [
        makeItem({
          formulaInputs: {
            grossReceivedCents: 120_000,
            embeddedTaxCents: 0,
            embeddedTaxType: null,
            embeddedTaxRatePercent: null,
            ...DEFAULT_FORMULA,
            collaboratorPercent: 100,
          },
          expectedCommissionCents: 100_000,
        }),
      ],
      settlements: [],
      adjustments: [],
    })
    expect(rows[0]!.supplierShortCents).toBe(0)
  })
})

describe('aggregateDriftSnapshots — settlements + reversals', () => {
  it('active settlement subtracts from in_flight, raises settled_active, keeps true_drift = 0', () => {
    const item = makeItem({ hasActiveSettlement: true })
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        {
          id: `s-${item.checkItemId}-active`,
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 57_000,
          isReversal: false,
          reversedAt: null,
          reversesSettlementId: null,
        },
      ],
      adjustments: [],
    })
    expect(rows[0]!.committedPayableCents).toBe(57_000)
    expect(rows[0]!.inFlightReconciledUnsettledCents).toBe(0) // settled, not in flight
    expect(rows[0]!.settledActiveCents).toBe(57_000)
    expect(rows[0]!.trueDriftCents).toBe(0) // 57000 - 0 - 0 - 57000 = 0
  })

  it('reversed original + paired reversal row net to 0 in pair_net + no imbalance alarm', () => {
    const item = makeItem()
    const reversedAt = new Date('2026-05-10T12:00:00Z')
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        // Original — now marked reversed
        {
          id: 'orig-1',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 57_000,
          isReversal: false,
          reversedAt,
          reversesSettlementId: null,
        },
        // Negation row pointing at orig-1
        {
          id: 'rev-1',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: -57_000,
          isReversal: true,
          reversedAt,
          reversesSettlementId: 'orig-1',
        },
      ],
      adjustments: [],
    })
    // Reversed original is NOT in settled_active
    expect(rows[0]!.settledActiveCents).toBe(0)
    // Pair nets to 0 (orig +57k + rev -57k = 0)
    expect(rows[0]!.settledReversedPairNetCents).toBe(0)
    expect(rows[0]!.reversalPairImbalance).toBe(0)
  })

  it('PR-3 Commit 5 (Codex fix #4): two broken pairs cannot cancel each other', () => {
    const item = makeItem()
    const reversedAt = new Date('2026-05-10T12:00:00Z')
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        // Pair A: original $100 paired with reversal -$110 (over-reversed by $10)
        {
          id: 'orig-A',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 10_000,
          isReversal: false,
          reversedAt,
          reversesSettlementId: null,
        },
        {
          id: 'rev-A',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: -11_000,
          isReversal: true,
          reversedAt,
          reversesSettlementId: 'orig-A',
        },
        // Pair B: original $200 paired with reversal -$190 (under-reversed by $10)
        {
          id: 'orig-B',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 20_000,
          isReversal: false,
          reversedAt,
          reversesSettlementId: null,
        },
        {
          id: 'rev-B',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: -19_000,
          isReversal: true,
          reversedAt,
          reversesSettlementId: 'orig-B',
        },
      ],
      adjustments: [],
    })
    // Per-pair: A = -$10 (over-reversed by $10), B = +$10 (under-reversed by $10).
    // settledReversedPairNetCents is SIGNED net for forensic visibility — it
    // happens to be 0 here, but that does NOT mask the bugs because the
    // alarm bucket is the sum of absolute per-pair deviations:
    expect(rows[0]!.settledReversedPairNetCents).toBe(0)
    expect(rows[0]!.reversalPairImbalance).toBe(2_000) // |−1000| + |+1000|
  })

  it('PR-3 Commit 5: single mismatched pair surfaces non-zero imbalance', () => {
    const item = makeItem()
    const reversedAt = new Date()
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        {
          id: 'orig-X',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 57_000,
          isReversal: false,
          reversedAt,
          reversesSettlementId: null,
        },
        {
          id: 'rev-X',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: -50_000, // off by $70
          isReversal: true,
          reversedAt,
          reversesSettlementId: 'orig-X',
        },
      ],
      adjustments: [],
    })
    expect(rows[0]!.settledReversedPairNetCents).toBe(7_000)
    expect(rows[0]!.reversalPairImbalance).toBe(7_000)
  })

  it('orphan reversal (no matching original) leaves an imbalance', () => {
    const item = makeItem()
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        {
          id: 'rev-orphan',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: -57_000,
          isReversal: true,
          reversedAt: new Date(),
          reversesSettlementId: 'orphan-original-id-does-not-exist',
        },
      ],
      adjustments: [],
    })
    expect(rows[0]!.settledReversedPairNetCents).toBe(-57_000) // signed
    expect(rows[0]!.reversalPairImbalance).toBe(57_000) // absolute
  })
})

describe('aggregateDriftSnapshots — adjustments', () => {
  it('reconciled adjustments reduce true_drift, pending stays in visibility-only', () => {
    const item = makeItem({ hasActiveSettlement: true })
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [item],
      settlements: [
        {
          id: 's-gap',
          checkItemId: item.checkItemId,
          recipientUserId: item.recipientUserId,
          currency: 'CAD',
          settledAmountCents: 50_000, // less than committed_payable by 7_000
          isReversal: false,
          reversedAt: null,
          reversesSettlementId: null,
        },
      ],
      adjustments: [
        // Item-scoped (activity_pricing_id NOT NULL) — closes the gap.
        // Enters the drift formula.
        {
          agentUserId: item.recipientUserId,
          currency: 'CAD',
          amountCents: 7_000,
          status: 'reconciled',
          activityPricingId: item.activityPricingId,
        },
        // Pending — visibility only regardless of scope.
        {
          agentUserId: item.recipientUserId,
          currency: 'CAD',
          amountCents: 3_000,
          status: 'pending',
          activityPricingId: null,
        },
      ],
    })
    expect(rows[0]!.adjustmentsReconciledCents).toBe(7_000)
    expect(rows[0]!.pendingAdjustmentsCents).toBe(3_000)
    expect(rows[0]!.trueDriftCents).toBe(0) // 57000 - 0 - 7000 - 50000 = 0
  })

  it('PR-3 Commit 5 (Codex fix #2): standalone reconciled adjustments DO NOT enter true_drift', () => {
    // Reproduces the false-alert scenario: an IC v2 claim with ONLY a
    // standalone +$100 adjustment (no items, no settlements). Before the
    // fix this would have produced true_drift = -10000. After the fix
    // the standalone adjustment lands in its own visibility bucket and
    // true_drift = 0.
    const standaloneAdj = {
      agentUserId: SOLO_AGENT,
      currency: 'CAD',
      amountCents: 10_000,
      status: 'reconciled' as const,
      activityPricingId: null, // ← standalone
    }
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [],
      settlements: [],
      adjustments: [standaloneAdj],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.standaloneReconciledAdjustmentsCents).toBe(10_000)
    expect(rows[0]!.adjustmentsReconciledCents).toBe(0) // NOT in formula
    expect(rows[0]!.trueDriftCents).toBe(0) // no false alert
  })
})

describe('aggregateDriftSnapshots — multi-currency separation', () => {
  it('CAD and USD on the same recipient never net against each other', () => {
    const itemCad = makeItem({
      currency: 'CAD',
      formulaInputs: {
        grossReceivedCents: 100_000,
        embeddedTaxCents: 0,
        embeddedTaxType: null,
        embeddedTaxRatePercent: null,
        ...DEFAULT_FORMULA,
        collaboratorPercent: 100,
      },
    })
    const itemUsd = makeItem({
      currency: 'USD',
      formulaInputs: {
        grossReceivedCents: 50_000,
        embeddedTaxCents: 0,
        embeddedTaxType: null,
        embeddedTaxRatePercent: null,
        ...DEFAULT_FORMULA,
        collaboratorPercent: 100,
      },
    })
    const rows = aggregateDriftSnapshots({
      agencyId: AGENCY,
      checkItems: [itemCad, itemUsd],
      settlements: [],
      adjustments: [],
    })
    expect(rows).toHaveLength(2)
    const cad = rows.find((r) => r.currency === 'CAD')!
    const usd = rows.find((r) => r.currency === 'USD')!
    expect(cad.committedPayableCents).toBe(57_000)
    expect(usd.committedPayableCents).toBe(28_500)
  })
})
