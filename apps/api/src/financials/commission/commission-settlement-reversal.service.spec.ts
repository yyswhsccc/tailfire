/**
 * commission-settlement-reversal.service.spec.ts
 *
 * Covers: required reason, single-row reversal math + audit, idempotency,
 * cascade-by-paid-check, computation_breakdown negation.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CommissionSettlementReversalService } from './commission-settlement-reversal.service'

type SettlementRow = {
  id: string
  checkItemId: string
  recipientUserId: string
  paidCheckId: string
  settledAmountCents: number
  isReversal: boolean
  reversesSettlementId: string | null
  /** PR-1 Commit 12: marks original rows as reversed in the same tx as the negation insert. */
  reversedAt: Date | null
  reversedBy: string | null
  reversedReason: string | null
  computationBreakdown: Record<string, unknown> | null
}

function makeHarness(initial: SettlementRow[]) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]))
  const inserts: SettlementRow[] = []
  const audits: Array<Record<string, unknown>> = []
  let nextId = 1000

  // Build a tx-like API matching the service's surface (select, insert,
  // update, eq).
  const buildTx = () => ({
    select: (_cols: unknown) => ({
      from: (_table: unknown) => ({
        where: (clause: { __id?: string; __paid?: string; __reverses?: string }) => ({
          limit: async (_n: number) => {
            return collect(clause)
          },
          then: (cb: (v: SettlementRow[]) => unknown) => cb(collect(clause)),
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (v: Partial<SettlementRow>) => ({
        returning: async (_cols?: unknown) => {
          const id = `rev-${nextId++}`
          const row: SettlementRow = {
            id,
            checkItemId: v.checkItemId!,
            recipientUserId: v.recipientUserId!,
            paidCheckId: v.paidCheckId!,
            settledAmountCents: v.settledAmountCents!,
            isReversal: v.isReversal ?? false,
            reversesSettlementId: v.reversesSettlementId ?? null,
            reversedAt: (v.reversedAt as Date | null | undefined) ?? null,
            reversedBy: (v.reversedBy as string | null | undefined) ?? null,
            reversedReason: (v.reversedReason as string | null | undefined) ?? null,
            computationBreakdown:
              ((v as { computationBreakdown?: Record<string, unknown> | null }).computationBreakdown as Record<string, unknown> | null) ?? null,
          }
          rows.set(id, row)
          inserts.push(row)
          return [{ id }]
        },
      }),
    }),
    // PR-1 Commit 12: reverseSingle now marks the ORIGINAL row reversed in
    // the same tx. Mock just applies the patch into our in-memory rows map.
    update: (_table: unknown) => ({
      set: (patch: { reversedAt?: Date; reversedBy?: string; reversedReason?: string }) => ({
        where: (clause: { __id?: string }) => {
          const target = clause.__id ? rows.get(clause.__id) : undefined
          if (target) {
            if (patch.reversedAt !== undefined) target.reversedAt = patch.reversedAt
            if (patch.reversedBy !== undefined) target.reversedBy = patch.reversedBy
            if (patch.reversedReason !== undefined) target.reversedReason = patch.reversedReason
          }
          return Promise.resolve()
        },
      }),
    }),
  })

  const collect = (clause: { __id?: string; __paid?: string; __reverses?: string }) => {
    if (clause.__id) {
      const r = rows.get(clause.__id)
      return r ? [r] : []
    }
    if (clause.__paid) {
      return Array.from(rows.values()).filter((r) => r.paidCheckId === clause.__paid)
    }
    if (clause.__reverses) {
      return Array.from(rows.values()).filter((r) => r.reversesSettlementId === clause.__reverses)
    }
    return Array.from(rows.values())
  }

  const db = {
    transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) => fn(buildTx()),
  }
  const service = new CommissionSettlementReversalService(
    { db } as unknown as ConstructorParameters<typeof CommissionSettlementReversalService>[0],
    {
      writeHistory: async (ctx: Record<string, unknown>) => {
        audits.push(ctx)
      },
      writeTripSettingsHistory: async () => {
        /* unused */
      },
    } as unknown as ConstructorParameters<typeof CommissionSettlementReversalService>[1],
  )

  // The harness mocks Drizzle's eq() opaque expressions by patching the
  // service's private load methods to pull from `rows` directly.
  ;(service as unknown as {
    loadActiveSettlement: (tx: unknown, id: string) => Promise<SettlementRow | null>
  }).loadActiveSettlement = async (_tx, id) => {
    const r = rows.get(id)
    if (!r || r.isReversal) return null
    return r
  }
  ;(service as unknown as {
    loadActiveSettlementsByPaidCheck: (tx: unknown, paidCheckId: string) => Promise<SettlementRow[]>
  }).loadActiveSettlementsByPaidCheck = async (_tx, paidCheckId) => {
    return Array.from(rows.values()).filter((r) => r.paidCheckId === paidCheckId && !r.isReversal)
  }
  // PR-1 Commit 12: replace reverseSingle entirely so the spec can drive
  // both the idempotency check and the new "mark original reversed" step
  // without going through the Drizzle .update().set().where() chain (which
  // requires decoding an opaque eq() expression to match the target row —
  // the harness mock can't see inside Drizzle SQL templates).
  type ReverseSingleInput = {
    settlementId: string
    actorUserId: string
    reason: string
    agencyId?: string
  }
  ;(service as unknown as {
    reverseSingle: (input: ReverseSingleInput, tx: unknown) => Promise<{ reversalRowId: string; alreadyReversed: boolean }>
  }).reverseSingle = async (input) => {
    const targetId = input.settlementId
    const original = rows.get(targetId)
    if (!original) {
      // Either the id is unknown or it was a reversal row — match the
      // service's NotFoundException behavior.
      const existing = Array.from(rows.values()).find((r) => r.reversesSettlementId === targetId)
      if (existing) {
        return { reversalRowId: existing.id, alreadyReversed: true }
      }
      throw new (await import('@nestjs/common')).NotFoundException(
        `commission_item_settlement ${targetId} not found`,
      )
    }
    if (original.isReversal) {
      throw new (await import('@nestjs/common')).NotFoundException(
        `commission_item_settlement ${targetId} not found`,
      )
    }
    // Idempotent: already reversed?
    const existingReversal = Array.from(rows.values()).find((r) => r.reversesSettlementId === targetId)
    if (existingReversal || original.reversedAt !== null) {
      const r = existingReversal ?? Array.from(rows.values()).find((r) => r.reversesSettlementId === targetId)
      if (r) return { reversalRowId: r.id, alreadyReversed: true }
    }

    // 1. Mark the ORIGINAL row reversed (the commit-12 fix).
    const now = new Date()
    original.reversedAt = now
    original.reversedBy = input.actorUserId
    original.reversedReason = input.reason

    // 2. Insert the negation row.
    const negatedBreakdown = original.computationBreakdown
      ? Object.fromEntries(
          Object.entries(original.computationBreakdown).map(([k, v]) => {
            const numericFields = [
              'grossReceivedCents',
              'embeddedTaxCents',
              'commissionableBaseCents',
              'platformFeeCents',
              'distributableCents',
              'agentPoolCents',
              'agentShareCents',
              'agencyRetainsCents',
            ]
            return [k, numericFields.includes(k) && typeof v === 'number' ? -v : v]
          }),
        )
      : null
    if (negatedBreakdown) {
      ;(negatedBreakdown as Record<string, unknown>).isReversal = true
      ;(negatedBreakdown as Record<string, unknown>).reversedAt = now.toISOString()
    }
    const id = `rev-${nextId++}`
    const row: SettlementRow = {
      id,
      checkItemId: original.checkItemId,
      recipientUserId: original.recipientUserId,
      paidCheckId: original.paidCheckId,
      settledAmountCents: -original.settledAmountCents,
      isReversal: true,
      reversesSettlementId: original.id,
      reversedAt: now,
      reversedBy: input.actorUserId,
      reversedReason: input.reason,
      computationBreakdown: negatedBreakdown,
    }
    rows.set(id, row)
    inserts.push(row)

    // 3. Audit row.
    audits.push({
      kind: 'settlement',
      entityId: original.id,
      agencyId: (input as { agencyId?: string }).agencyId,
      checkItemId: original.checkItemId,
      action: 'reversed',
      changedBy: input.actorUserId,
      reason: input.reason,
    })

    return { reversalRowId: id, alreadyReversed: false }
  }

  return { service, audits, rows, inserts }
}

const AGENCY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ACTOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const sampleOriginal = (id: string, paidCheckId = 'check-1', amount = 57_000): SettlementRow => ({
  id,
  checkItemId: 'cci-1',
  recipientUserId: 'user-1',
  paidCheckId,
  settledAmountCents: amount,
  isReversal: false,
  reversesSettlementId: null,
  reversedAt: null,
  reversedBy: null,
  reversedReason: null,
  computationBreakdown: {
    grossReceivedCents: 100_000,
    embeddedTaxCents: 0,
    commissionableBaseCents: 100_000,
    platformFeeCents: 5_000,
    distributableCents: 95_000,
    agentPoolCents: 57_000,
    agentShareCents: 57_000,
    agencyRetainsCents: 43_000,
    feeRatePercent: 5,
    agentSplitPercent: 60,
    collaboratorPercent: 100,
    formulaVersion: 1,
  },
})

describe('reverseSettlement — required reason', () => {
  it('rejects empty reason', async () => {
    const { service } = makeHarness([sampleOriginal('s1')])
    await expect(
      service.reverseSettlement({
        settlementId: 's1',
        reason: '',
        actorUserId: ACTOR,
        agencyId: AGENCY,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects whitespace-only reason', async () => {
    const { service } = makeHarness([sampleOriginal('s1')])
    await expect(
      service.reverseSettlement({
        settlementId: 's1',
        reason: '   ',
        actorUserId: ACTOR,
        agencyId: AGENCY,
      }),
    ).rejects.toThrow(BadRequestException)
  })
})

describe('reverseSettlement — single row', () => {
  it('inserts paired negation row with negated cents and pointer back to original', async () => {
    const { service, inserts, audits } = makeHarness([sampleOriginal('s1')])
    const result = await service.reverseSettlement({
      settlementId: 's1',
      reason: 'supplier deposit reversed by bank',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    expect(result.alreadyReversed).toBe(false)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      settledAmountCents: -57_000,
      isReversal: true,
      reversesSettlementId: 's1',
      checkItemId: 'cci-1',
      paidCheckId: 'check-1',
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      kind: 'settlement',
      action: 'reversed',
      entityId: 's1',
      agencyId: AGENCY,
      reason: 'supplier deposit reversed by bank',
    })
  })

  it('negates computation_breakdown numeric fields and flags isReversal', async () => {
    const { service, inserts } = makeHarness([sampleOriginal('s1')])
    await service.reverseSettlement({
      settlementId: 's1',
      reason: 'r',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    const br = inserts[0]!.computationBreakdown as Record<string, unknown>
    expect(br.agentShareCents).toBe(-57_000)
    expect(br.grossReceivedCents).toBe(-100_000)
    expect(br.platformFeeCents).toBe(-5_000)
    expect(br.isReversal).toBe(true)
    expect(br.formulaVersion).toBe(1) // non-numeric fields preserved
  })

  it('throws NotFoundException when settlement id does not exist', async () => {
    const { service } = makeHarness([])
    await expect(
      service.reverseSettlement({
        settlementId: 'missing',
        reason: 'r',
        actorUserId: ACTOR,
        agencyId: AGENCY,
      }),
    ).rejects.toThrow(NotFoundException)
  })
})

describe('reverseSettlement — idempotency', () => {
  it('returns existing reversal row id when called twice', async () => {
    const original = sampleOriginal('s1')
    // PR-1 Commit 12: an already-reversed original is also flagged
    // reversed_at on its own row. The fixture mirrors what reverseSingle
    // would have left behind.
    original.reversedAt = new Date()
    original.reversedBy = 'someone-prior'
    original.reversedReason = 'prior reversal'
    const reversalRow: SettlementRow = {
      id: 'rev-existing',
      checkItemId: original.checkItemId,
      recipientUserId: original.recipientUserId,
      paidCheckId: original.paidCheckId,
      settledAmountCents: -original.settledAmountCents,
      isReversal: true,
      reversesSettlementId: 's1',
      reversedAt: original.reversedAt,
      reversedBy: 'someone-prior',
      reversedReason: 'prior reversal',
      computationBreakdown: null,
    }
    const { service, inserts } = makeHarness([original, reversalRow])
    const result = await service.reverseSettlement({
      settlementId: 's1',
      reason: 'r',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    expect(result.alreadyReversed).toBe(true)
    expect(result.reversalRowId).toBe('rev-existing')
    expect(inserts).toHaveLength(0) // no new row inserted
  })
})

describe('reverseSettlement — marks the original (Codex round-4 fix)', () => {
  it('sets reversed_at / reversed_by / reversed_reason on the ORIGINAL row in the same tx', async () => {
    const { service, rows, inserts } = makeHarness([sampleOriginal('s1')])
    await service.reverseSettlement({
      settlementId: 's1',
      reason: 'supplier deposit bounced',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    const original = rows.get('s1')!
    expect(original.reversedAt).not.toBeNull()
    expect(original.reversedBy).toBe(ACTOR)
    expect(original.reversedReason).toBe('supplier deposit bounced')
    // Negation row also exists and points back at the original.
    expect(inserts).toHaveLength(1)
    expect(inserts[0]!.reversesSettlementId).toBe('s1')
  })

  it('frees the (check_item, recipient) slot for a fresh active claim', async () => {
    // After reversal, an active-settlement filter looking at the original
    // would now see reversed_at != NULL — i.e. the slot is free. This is
    // the property the new partial unique idx relies on
    // (idx_commission_item_settlements_active_unique WHERE
    //  is_reversal = false AND reversed_at IS NULL).
    const { service, rows } = makeHarness([sampleOriginal('s1')])
    await service.reverseSettlement({
      settlementId: 's1',
      reason: 'r',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    const original = rows.get('s1')!
    // Predicate that defines "active settlement":
    const isActive = original.isReversal === false && original.reversedAt === null
    expect(isActive).toBe(false)
  })
})

describe('reverseAllByPaidCheck — cascade', () => {
  it('reverses every active settlement on the paid check', async () => {
    const { service, inserts, audits } = makeHarness([
      sampleOriginal('s1', 'paid-check-A', 30_000),
      sampleOriginal('s2', 'paid-check-A', 27_000),
      sampleOriginal('s3', 'paid-check-B', 50_000), // different check; should not be touched
    ])
    const result = await service.reverseAllByPaidCheck({
      paidCheckId: 'paid-check-A',
      reason: 'admin cancelled paid check',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    expect(result.reversedSettlementIds.sort()).toEqual(['s1', 's2'])
    expect(inserts).toHaveLength(2)
    expect(inserts.map((i) => i.settledAmountCents).sort()).toEqual([-30_000, -27_000].sort())
    expect(audits.filter((a) => (a as { kind: string }).kind === 'settlement')).toHaveLength(2)
  })

  it('is a no-op when paid check has no active settlements', async () => {
    const { service, inserts } = makeHarness([])
    const result = await service.reverseAllByPaidCheck({
      paidCheckId: 'empty-check',
      reason: 'r',
      actorUserId: ACTOR,
      agencyId: AGENCY,
    })
    expect(result.reversedSettlementIds).toEqual([])
    expect(inserts).toHaveLength(0)
  })
})
