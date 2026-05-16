/**
 * commission-reports.service.spec.ts (PR-J)
 *
 * Codex round-1 BLOCK fix #1 spec requirement: cover R2 (T4A) and R7
 * (audit trail) to lock down the rules that previous versions got wrong.
 *
 * R2 must:
 *   - anchor on ic_disbursements.completed_at (the payment event)
 *   - filter ic_disbursements.status = 'sent'
 *   - sum cad_equivalent_base_cents (NOT raw invoice cents in invoice currency)
 *   - reject invalid taxYear
 *
 * R7 must:
 *   - map each entityType to its specific history table by name
 *   - enforce agency_id, either directly or via parent join
 *   - read entity_id / before_data / after_data (not the old diff column)
 *   - reject missing entityId
 *
 * Strategy: stub `databaseService.db.execute(sqlTemplate)` and inspect the
 * SQL text that gets rendered. Returns []. We're checking SQL shape, not
 * row hydration; row hydration is exercised in the tf-demo smoke.
 */

import { BadRequestException } from '@nestjs/common'
import { CommissionReportsService } from './commission-reports.service'

interface CapturedQuery {
  sqlText: string
  params: unknown[]
}

function makeService(): {
  service: CommissionReportsService
  captured: CapturedQuery[]
} {
  const captured: CapturedQuery[] = []
  const db = {
    execute: (sqlTemplate: { queryChunks?: unknown[]; toQuery?: (cfg: unknown) => { sql: string; params: unknown[] } }) => {
      // Drizzle's `sql` template exposes the rendered SQL via `toQuery`.
      // In tests against Postgres dialect, the standard accessor is `sqlText`
      // and `params`, but the precise property depends on the dialect.
      // We dump the JSON shape and look for the SQL fragments we care about.
      const txt = JSON.stringify(sqlTemplate)
      captured.push({ sqlText: txt, params: [] })
      return Promise.resolve([])
    },
  }
  // The real service injects a DatabaseService whose .db is a Drizzle client.
  // We only need .execute() here.
  const service = new CommissionReportsService({ db } as never)
  return { service, captured }
}

const AGENCY_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const ENTITY_ID = '33333333-3333-3333-3333-333333333333'

describe('CommissionReportsService — R2 T4A (CRA payment-based)', () => {
  it('rejects taxYear outside 2020..2099', async () => {
    const { service } = makeService()
    await expect(service.getT4aSlipData({ agencyId: AGENCY_ID, taxYear: 1999 })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.getT4aSlipData({ agencyId: AGENCY_ID, taxYear: 2100 })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.getT4aSlipData({ agencyId: AGENCY_ID, taxYear: 2025.5 })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('queries ic_disbursements joined to ic_invoices, filtered to sent + completed_at year', async () => {
    const { service, captured } = makeService()
    await service.getT4aSlipData({ agencyId: AGENCY_ID, taxYear: 2026 })
    expect(captured).toHaveLength(1)
    const sql = captured[0]!.sqlText
    // Must read from disbursements (payment event), not solely invoices
    expect(sql).toContain('FROM ic_disbursements d')
    expect(sql).toContain('JOIN ic_invoices inv')
    // Must filter status = 'sent' and require completed_at non-null
    expect(sql).toContain("d.status = 'sent'")
    expect(sql).toContain('d.completed_at IS NOT NULL')
    // Must anchor on completed_at, not approved_at
    expect(sql).toContain('EXTRACT(YEAR FROM d.completed_at')
    expect(sql).not.toContain('inv.approved_at')
    // Must aggregate cad_equivalent_base_cents for reportable income
    expect(sql).toContain('cad_equivalent_base_cents')
    // Must enforce tenant scope on inv.agency_id
    expect(sql).toContain('inv.agency_id')
  })

  it('applies userId filter when provided', async () => {
    const { service, captured } = makeService()
    await service.getT4aSlipData({ agencyId: AGENCY_ID, taxYear: 2026, userId: USER_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('inv.user_id')
  })
})

describe('CommissionReportsService — R7 audit trail (tenant-scoped per entity type)', () => {
  it('rejects missing entityId', async () => {
    const { service } = makeService()
    await expect(
      service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'check', entityId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('check history: reads commission_check_history with agency_id filter', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'check', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('commission_check_history')
    expect(sql).toContain('agency_id')
    // Must read entity_id, not the old "check_id" column
    expect(sql).toContain('entity_id')
    // Must read before_data + after_data (not the old "diff" column)
    expect(sql).toContain('before_data')
    expect(sql).toContain('after_data')
  })

  it('item history: reads commission_check_item_history with agency_id filter', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'item', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('commission_check_item_history')
    expect(sql).toContain('agency_id')
  })

  it('settlement history: reads commission_item_settlement_history with agency_id filter', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'settlement', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('commission_item_settlement_history')
    expect(sql).toContain('agency_id')
  })

  it('adjustment history: reads commission_adjustment_history with agency_id filter', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'adjustment', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('commission_adjustment_history')
    expect(sql).toContain('agency_id')
  })

  it('tracking history: joins through activity_pricing → trips to enforce agency_id', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'tracking', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('commission_tracking_history')
    // tracking has no agency_id column → must join to trips
    expect(sql).toContain('JOIN activity_pricing')
    expect(sql).toContain('JOIN trips')
    expect(sql).toContain('t.agency_id')
  })

  it('activity_pricing history: joins through trips to enforce agency_id', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'activity_pricing', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('activity_pricing_commission_history')
    expect(sql).toContain('JOIN trips')
    expect(sql).toContain('t.agency_id')
  })

  it('trip_settings history: joins trips to enforce agency_id', async () => {
    const { service, captured } = makeService()
    await service.getAuditTrail({ agencyId: AGENCY_ID, entityType: 'trip_settings', entityId: ENTITY_ID })
    const sql = captured[0]!.sqlText
    expect(sql).toContain('trip_settings_history')
    expect(sql).toContain('JOIN trips')
    expect(sql).toContain('t.agency_id')
  })
})
