/**
 * commission-audit.service.spec.ts
 *
 * Covers shape mapping per audit kind + agencyId enforcement. Uses an
 * in-memory mock of the Drizzle insert chain — no DB round-trip required.
 */

import { CommissionAuditService } from './commission-audit.service'

type InsertCall = { table: unknown; values: Record<string, unknown> }

function makeMockDb(): {
  db: {
    insert: (table: unknown) => { values: (v: Record<string, unknown>) => Promise<void> }
    transaction: () => Promise<unknown>
  }
  calls: InsertCall[]
} {
  const calls: InsertCall[] = []
  const db = {
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        calls.push({ table, values: v })
      },
    }),
    transaction: async () => {
      /* unused — service accepts tx as DB-shaped */
      return undefined
    },
  }
  return { db, calls }
}

function makeService(): { service: CommissionAuditService; calls: InsertCall[] } {
  const { db, calls } = makeMockDb()
  const service = new CommissionAuditService({
    db,
    client: db,
  } as unknown as ConstructorParameters<typeof CommissionAuditService>[0])
  return { service, calls }
}

const ENTITY_ID = '11111111-1111-1111-1111-111111111111'
const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

describe('CommissionAuditService.writeHistory', () => {
  it('check kind writes to commission_check_history with agency_id', async () => {
    const { service, calls } = makeService()
    await service.writeHistory({
      kind: 'check',
      entityId: ENTITY_ID,
      agencyId: AGENCY_ID,
      action: 'accepted',
      beforeData: { status: 'pending' },
      afterData: { status: 'accepted' },
      changedBy: ACTOR_ID,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.values).toMatchObject({
      entityId: ENTITY_ID,
      agencyId: AGENCY_ID,
      action: 'accepted',
      beforeData: { status: 'pending' },
      afterData: { status: 'accepted' },
      changedBy: ACTOR_ID,
      reason: null,
      userAgent: null,
    })
  })

  it('check_item kind records parent_check_id', async () => {
    const { service, calls } = makeService()
    await service.writeHistory({
      kind: 'check_item',
      entityId: ENTITY_ID,
      agencyId: AGENCY_ID,
      parentCheckId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      action: 'created',
      afterData: { receivedCents: 100_000 },
    })
    expect(calls[0]!.values.parentCheckId).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc')
  })

  it('settlement kind records check_item_id and reason', async () => {
    const { service, calls } = makeService()
    await service.writeHistory({
      kind: 'settlement',
      entityId: ENTITY_ID,
      agencyId: AGENCY_ID,
      checkItemId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      action: 'reversed',
      beforeData: { settledAmountCents: 57_000 },
      afterData: { settledAmountCents: 57_000, isReversal: true, reversesSettlementId: ENTITY_ID },
      reason: 'supplier reversed deposit',
    })
    expect(calls[0]!.values).toMatchObject({
      checkItemId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      action: 'reversed',
      reason: 'supplier reversed deposit',
    })
  })

  it('tracking kind does NOT require agencyId and records activity_pricing_id', async () => {
    const { service, calls } = makeService()
    await service.writeHistory({
      kind: 'tracking',
      entityId: ENTITY_ID,
      activityPricingId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      action: 'reconciled',
      changedBy: ACTOR_ID,
    })
    expect(calls[0]!.values).toMatchObject({
      entityId: ENTITY_ID,
      activityPricingId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      action: 'reconciled',
    })
    expect((calls[0]!.values as Record<string, unknown>).agencyId).toBeUndefined()
  })

  it('activity_pricing_commission kind writes minimal shape', async () => {
    const { service, calls } = makeService()
    await service.writeHistory({
      kind: 'activity_pricing_commission',
      entityId: ENTITY_ID,
      action: 'updated',
      beforeData: { priceCents: 50_000 },
      afterData: { priceCents: 55_000 },
    })
    expect(calls[0]!.values).toMatchObject({
      entityId: ENTITY_ID,
      action: 'updated',
    })
  })

  it('throws when agencyId missing on a kind that requires it', async () => {
    const { service } = makeService()
    await expect(
      service.writeHistory({
        kind: 'check',
        entityId: ENTITY_ID,
        action: 'updated',
      }),
    ).rejects.toThrow(/agencyId is required/)
  })

  it('uses provided tx instead of default db', async () => {
    const { service } = makeService()
    const txCalls: InsertCall[] = []
    const tx = {
      insert: (table: unknown) => ({
        values: async (v: Record<string, unknown>) => {
          txCalls.push({ table, values: v })
        },
      }),
    } as unknown as Parameters<typeof service.writeHistory>[1]
    await service.writeHistory(
      {
        kind: 'adjustment',
        entityId: ENTITY_ID,
        agencyId: AGENCY_ID,
        action: 'created',
      },
      tx,
    )
    expect(txCalls).toHaveLength(1)
  })
})

describe('CommissionAuditService.writeTripSettingsHistory', () => {
  it('records trip scope with override change', async () => {
    const { service, calls } = makeService()
    await service.writeTripSettingsHistory({
      tripId: ENTITY_ID,
      scope: 'trip',
      scopeId: ENTITY_ID,
      action: 'updated',
      beforeData: { commissionFeeRateOverride: null },
      afterData: { commissionFeeRateOverride: '0.00' },
      changedBy: ACTOR_ID,
      reason: 'legacy payroll trip — no tech fee',
    })
    expect(calls[0]!.values).toMatchObject({
      tripId: ENTITY_ID,
      scope: 'trip',
      scopeId: ENTITY_ID,
      action: 'updated',
      reason: 'legacy payroll trip — no tech fee',
    })
  })

  it('records collaborator scope with agent_split_override', async () => {
    const { service, calls } = makeService()
    await service.writeTripSettingsHistory({
      tripId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      scope: 'collaborator',
      scopeId: ENTITY_ID,
      action: 'updated',
      beforeData: { agentSplitOverride: null },
      afterData: { agentSplitOverride: '100.00' },
      changedBy: ACTOR_ID,
      reason: 'agent earns 100% on own travel',
    })
    expect(calls[0]!.values).toMatchObject({
      scope: 'collaborator',
      scopeId: ENTITY_ID,
    })
  })
})
