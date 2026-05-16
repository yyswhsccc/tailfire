/**
 * commission-reconcile.service.spec.ts
 *
 * Covers idempotency, required-reason on unreconcile, audit linkage, bulk
 * skipping of already-reconciled rows, and not-found / bad-input errors.
 *
 * Uses lightweight in-memory mocks for the DB and the audit service so we
 * can assert on what the reconcile service intends to do without a real DB.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CommissionReconcileService } from './commission-reconcile.service'

type TrackingRow = {
  id: string
  activityPricingId: string
  isReconciled: boolean
  reconciliationDate: Date | null
  reconciledBy: string | null
}

function makeHarness(initialRows: TrackingRow[]): {
  service: CommissionReconcileService
  audits: Array<Record<string, unknown>>
  updates: Array<{ id: string; isReconciled: boolean; reconciledBy: string | null }>
  rows: Map<string, TrackingRow>
} {
  const rows = new Map(initialRows.map((r) => [r.id, { ...r }]))
  const updates: Array<{ id: string; isReconciled: boolean; reconciledBy: string | null }> = []
  const audits: Array<Record<string, unknown>> = []

  // Build a tx that mirrors the small surface the service uses.
  const buildTx = () => ({
    update: (_table: unknown) => ({
      set: (values: { isReconciled: boolean; reconciledBy: string | null }) => ({
        where: (_w: unknown) => ({
          returning: async () => {
            // Find the row being updated — service always calls eq(id, row.id).
            // We get the row from the surrounding closure (lastTargetedId).
            const id = lastTargetedId
            const row = rows.get(id)
            if (!row) return []
            row.isReconciled = values.isReconciled
            row.reconciledBy = values.reconciledBy
            row.reconciliationDate = values.isReconciled ? new Date() : null
            updates.push({ id, isReconciled: values.isReconciled, reconciledBy: values.reconciledBy })
            return [row]
          },
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        audits.push(v)
      },
    }),
  })

  // The service's eq(...).id is opaque; we set lastTargetedId in the select
  // path so the mocked update knows which row it's targeting.
  let lastTargetedId = ''

  const db = {
    select: (_cols: unknown) => ({
      from: (_table: unknown) => ({
        where: async (w: { __ids?: string[]; __apIds?: string[] }) => {
          // Inspection of the where clause not feasible here; we treat any
          // single-id lookup as targeting the requested row. The harness
          // exposes loadRow() to set lastTargetedId before calls.
          return Array.from(rows.values()).filter((r) =>
            w.__ids ? w.__ids.includes(r.id) : w.__apIds ? w.__apIds.includes(r.activityPricingId) : true,
          )
        },
      }),
    }),
    transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<void>) => {
      await fn(buildTx())
    },
  }

  // Monkey-patch loadTrackingRows-equivalent. The real service uses Drizzle's
  // inArray() which our mock can't read; we hijack the service's private
  // method via prototype patch. For simplicity, we re-derive id list from
  // a wrapping setter call.
  const service = new CommissionReconcileService(
    { db } as unknown as ConstructorParameters<typeof CommissionReconcileService>[0],
    {
      writeHistory: async (ctx: Record<string, unknown>) => {
        audits.push(ctx)
      },
      writeTripSettingsHistory: async () => {
        /* unused */
      },
    } as unknown as ConstructorParameters<typeof CommissionReconcileService>[1],
  )

  // Patch the private loadTrackingRows to use our mock map directly. Avoids
  // dealing with Drizzle's opaque where-expression in the mock.
  ;(service as unknown as { loadTrackingRows: (i: {
    trackingIds?: string[]
    activityPricingIds?: string[]
  }) => Promise<TrackingRow[]> }).loadTrackingRows = async (input) => {
    if (!input.trackingIds?.length && !input.activityPricingIds?.length) {
      throw new BadRequestException('reconcile requires trackingIds or activityPricingIds')
    }
    if (input.trackingIds?.length) {
      const found = input.trackingIds.map((id) => rows.get(id)).filter(Boolean) as TrackingRow[]
      if (found.length) lastTargetedId = found[0]!.id
      return found
    }
    const found = Array.from(rows.values()).filter((r) =>
      input.activityPricingIds!.includes(r.activityPricingId),
    )
    if (found.length) lastTargetedId = found[0]!.id
    return found
  }

  return { service, audits, updates, rows }
}

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ACTOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

describe('CommissionReconcileService.reconcile', () => {
  it('flips is_reconciled false→true and writes audit row', async () => {
    const { service, audits, rows } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: false, reconciliationDate: null, reconciledBy: null },
    ])
    const out = await service.reconcile({ trackingId: A, actorUserId: ACTOR, reason: 'matches deposit' })
    expect(out.isReconciled).toBe(true)
    expect(out.reconciledBy).toBe(ACTOR)
    expect(rows.get(A)!.isReconciled).toBe(true)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      kind: 'tracking',
      action: 'reconciled',
      changedBy: ACTOR,
      reason: 'matches deposit',
    })
  })

  it('is idempotent — second reconcile is a no-op (no audit row)', async () => {
    const { service, audits } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: true, reconciliationDate: new Date(), reconciledBy: ACTOR },
    ])
    await service.reconcile({ trackingId: A, actorUserId: ACTOR })
    expect(audits).toHaveLength(0)
  })

  it('throws NotFoundException for unknown tracking id', async () => {
    const { service } = makeHarness([])
    await expect(service.reconcile({ trackingId: A, actorUserId: ACTOR })).rejects.toThrow(NotFoundException)
  })

  it('accepts activityPricingId as the lookup key', async () => {
    const { service, rows } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: false, reconciliationDate: null, reconciledBy: null },
    ])
    const out = await service.reconcile({ activityPricingId: 'p1', actorUserId: ACTOR })
    expect(out.trackingId).toBe(A)
    expect(rows.get(A)!.isReconciled).toBe(true)
  })

  it('throws BadRequestException when no key provided', async () => {
    const { service } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: false, reconciliationDate: null, reconciledBy: null },
    ])
    await expect(service.reconcile({ actorUserId: ACTOR })).rejects.toThrow(BadRequestException)
  })
})

describe('CommissionReconcileService.unreconcile', () => {
  it('requires reason', async () => {
    const { service } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: true, reconciliationDate: new Date(), reconciledBy: ACTOR },
    ])
    await expect(service.unreconcile({ trackingId: A, actorUserId: ACTOR, reason: '' })).rejects.toThrow(
      BadRequestException,
    )
  })

  it('flips true→false with reason and writes audit', async () => {
    const { service, audits, rows } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: true, reconciliationDate: new Date(), reconciledBy: ACTOR },
    ])
    const out = await service.unreconcile({
      trackingId: A,
      actorUserId: ACTOR,
      reason: 'supplier short — chasing missing $50',
    })
    expect(out.isReconciled).toBe(false)
    expect(out.reconciledBy).toBeNull()
    expect(rows.get(A)!.isReconciled).toBe(false)
    expect(audits[0]).toMatchObject({
      action: 'unreconciled',
      reason: 'supplier short — chasing missing $50',
    })
  })
})

describe('CommissionReconcileService.bulkReconcile', () => {
  it('skips rows already reconciled — no audit row for skips', async () => {
    const { service, audits, rows } = makeHarness([
      { id: A, activityPricingId: 'p1', isReconciled: false, reconciliationDate: null, reconciledBy: null },
      { id: B, activityPricingId: 'p2', isReconciled: true, reconciliationDate: new Date(), reconciledBy: ACTOR },
    ])
    const out = await service.bulkReconcile({ trackingIds: [A, B], actorUserId: ACTOR })
    expect(out.reconciledCount).toBe(2)
    expect(rows.get(A)!.isReconciled).toBe(true)
    expect(rows.get(B)!.isReconciled).toBe(true)
    // Only one new audit row (for A); B was already reconciled
    expect(audits).toHaveLength(1)
    expect((audits[0] as Record<string, unknown>).entityId).toBe(A)
  })
})
