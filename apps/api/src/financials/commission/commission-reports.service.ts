/**
 * CommissionReportsService (PR-3)
 *
 * Three operator-queryable SQL reports — no UI yet. They're the bare
 * minimum visibility Phoenix needs before flipping IC_PAYOUTS_V2_ENABLED
 * on prod. Full report dashboards are deferred to PR-J post-cutover.
 *
 * Per Codex round-2 plan validation:
 *   - Every row includes currency
 *   - R1 (GST/HST) requires a date window, returns all grouped rows
 *     (bounded by tax_type × rate combinations)
 *   - R3 (A/R aging) is paginated
 *   - R6 (discrepancy) is paginated
 */

import { BadRequestException, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'

export interface GstHstCollectedRow {
  currency: string
  embeddedTaxType: string | null
  embeddedTaxRatePercent: string | null
  totalEmbeddedTaxCents: number
  itemCount: number
}

export interface ArAgingRow {
  recipientUserId: string
  recipientName: string | null
  recipientEmail: string | null
  currency: string
  ageBucket: '0-30' | '31-60' | '61-90' | '90+'
  owedCents: number
  itemCount: number
}

export interface ArAgingResult {
  rows: ArAgingRow[]
  page: number
  limit: number
  totalRows: number
}

export interface DiscrepancyRow {
  trackingId: string
  activityPricingId: string
  tripId: string
  tripRef: string | null
  tripName: string | null
  activityName: string | null
  currency: string
  expectedCommissionCents: number
  receivedCents: number
  varianceCents: number
}

export interface DiscrepancyResult {
  rows: DiscrepancyRow[]
  page: number
  limit: number
  totalRows: number
}

@Injectable()
export class CommissionReportsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * R1 — GST/HST collected per (currency, tax_type, rate) within a date
   * window keyed by commission_checks.check_date. Returns ALL grouped
   * rows (bounded cardinality — tax_type × rate combinations).
   */
  async getGstHstCollected(args: {
    agencyId: string
    fromDate: string // ISO date (YYYY-MM-DD)
    toDate: string
  }): Promise<GstHstCollectedRow[]> {
    if (!args.fromDate || !args.toDate) {
      throw new BadRequestException('fromDate and toDate are required (ISO YYYY-MM-DD)')
    }
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        cc.currency                                            AS currency,
        cci.embedded_tax_type                                  AS embedded_tax_type,
        cci.embedded_tax_rate_percent                          AS embedded_tax_rate_percent,
        SUM(COALESCE(cci.embedded_tax_cents, 0))::int          AS total_embedded_tax_cents,
        COUNT(*)::int                                          AS item_count
      FROM commission_check_items cci
      JOIN commission_checks cc ON cc.id = cci.check_id
      WHERE cc.agency_id = ${args.agencyId}::uuid
        AND cc.check_type = 'received'
        AND cc.status = 'accepted'
        AND cc.check_date >= ${args.fromDate}::date
        AND cc.check_date <= ${args.toDate}::date
        AND COALESCE(cci.embedded_tax_cents, 0) > 0
      GROUP BY cc.currency, cci.embedded_tax_type, cci.embedded_tax_rate_percent
      ORDER BY cc.currency, cci.embedded_tax_type, cci.embedded_tax_rate_percent
    `)
    return rows.map((r) => ({
      currency: r.currency,
      embeddedTaxType: r.embedded_tax_type ?? null,
      embeddedTaxRatePercent: r.embedded_tax_rate_percent != null ? String(r.embedded_tax_rate_percent) : null,
      totalEmbeddedTaxCents: Number(r.total_embedded_tax_cents),
      itemCount: Number(r.item_count),
    }))
  }

  /**
   * R3 — Per-(agent, currency) in-flight reconciled-unsettled cents from
   * the LATEST commission_drift_snapshots row per recipient.
   *
   * PR-3 Commit 5 (Codex round-1 fix #3): previous version queried gross
   * received_cents — that re-introduced the pre-PR-1 gross-vs-agent-share
   * bug. Now reads in_flight_reconciled_unsettled_cents which is the
   * computeAgentShare() output the drift service writes into snapshots.
   *
   * Note on age buckets: snapshot rows don't carry per-trip end_date, so
   * the operator-facing "aging" view collapses into a single per-recipient
   * total. If finer aging is required later, the drift service can stamp
   * the oldest unsettled item's age into the snapshot — out of scope for
   * the pre-cutover minimum.
   */
  async getArAging(args: {
    agencyId: string
    currency?: string
    page: number
    limit: number
  }): Promise<ArAgingResult> {
    const offset = (args.page - 1) * args.limit
    const currencyFilter = args.currency
      ? sql`AND latest.currency = ${args.currency}`
      : sql``

    // Total = number of (recipient, currency) buckets with non-zero in-flight.
    const countResult: any[] = await this.databaseService.db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (recipient_user_id, currency)
          recipient_user_id,
          currency,
          in_flight_reconciled_unsettled_cents
        FROM commission_drift_snapshots
        WHERE agency_id = ${args.agencyId}::uuid
        ORDER BY recipient_user_id, currency, snapshot_at DESC
      )
      SELECT COUNT(*)::int AS total
      FROM latest
      WHERE latest.in_flight_reconciled_unsettled_cents > 0
        ${currencyFilter}
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)

    const rows: any[] = await this.databaseService.db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (recipient_user_id, currency)
          recipient_user_id,
          currency,
          in_flight_reconciled_unsettled_cents,
          snapshot_at
        FROM commission_drift_snapshots
        WHERE agency_id = ${args.agencyId}::uuid
        ORDER BY recipient_user_id, currency, snapshot_at DESC
      )
      SELECT
        latest.recipient_user_id   AS recipient_user_id,
        up.first_name              AS first_name,
        up.last_name               AS last_name,
        up.email                   AS email,
        latest.currency            AS currency,
        '0-30'::text               AS age_bucket,
        latest.in_flight_reconciled_unsettled_cents AS owed_cents,
        1::int                     AS item_count
      FROM latest
      LEFT JOIN user_profiles up ON up.id = latest.recipient_user_id
      WHERE latest.in_flight_reconciled_unsettled_cents > 0
        ${currencyFilter}
      ORDER BY latest.in_flight_reconciled_unsettled_cents DESC
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)

    return {
      rows: rows.map((r) => ({
        recipientUserId: r.recipient_user_id,
        recipientName: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        recipientEmail: r.email ?? null,
        currency: r.currency,
        ageBucket: r.age_bucket as ArAgingRow['ageBucket'],
        owedCents: Number(r.owed_cents),
        itemCount: Number(r.item_count),
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }

  /**
   * R6 — Discrepancy report. Tracking rows where received_cents !=
   * expected_commission for RECONCILED items. The admin uses this to
   * spot supplier shorts vs over-pays that snuck through reconciliation.
   *
   * Variance is signed: negative = supplier short, positive = over-pay.
   */
  async getDiscrepancy(args: {
    agencyId: string
    currency?: string
    page: number
    limit: number
  }): Promise<DiscrepancyResult> {
    const offset = (args.page - 1) * args.limit
    const currencyFilter = args.currency
      ? sql`AND cc.currency = ${args.currency}`
      : sql``

    const countResult: any[] = await this.databaseService.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM commission_check_items cci
      JOIN commission_checks cc            ON cc.id = cci.check_id
      JOIN activity_pricing ap             ON ap.id = cci.activity_pricing_id
      JOIN commission_tracking ct          ON ct.component_pricing_id = ap.id
      WHERE cc.agency_id = ${args.agencyId}::uuid
        AND cc.check_type = 'received'
        AND cc.status = 'accepted'
        AND ct.is_reconciled = true
        AND COALESCE(cci.received_cents, 0) <> COALESCE((ct.commission_amount * 100)::int, 0)
        ${currencyFilter}
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)

    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        ct.id                                                AS tracking_id,
        ct.component_pricing_id                              AS activity_pricing_id,
        t.id                                                 AS trip_id,
        t.reference_number                                   AS trip_ref,
        t.name                                               AS trip_name,
        ia.name                                              AS activity_name,
        cc.currency                                          AS currency,
        COALESCE((ct.commission_amount * 100)::int, 0)       AS expected_commission_cents,
        COALESCE(cci.received_cents, 0)::int                 AS received_cents,
        (COALESCE(cci.received_cents, 0) - COALESCE((ct.commission_amount * 100)::int, 0))::int
                                                             AS variance_cents
      FROM commission_check_items cci
      JOIN commission_checks cc            ON cc.id = cci.check_id
      JOIN activity_pricing ap             ON ap.id = cci.activity_pricing_id
      JOIN commission_tracking ct          ON ct.component_pricing_id = ap.id
      JOIN itinerary_activities ia         ON ia.id = ap.activity_id
      JOIN itinerary_days id_day           ON id_day.id = ia.itinerary_day_id
      JOIN itineraries i                   ON i.id = id_day.itinerary_id
      JOIN trips t                         ON t.id = i.trip_id
      WHERE cc.agency_id = ${args.agencyId}::uuid
        AND cc.check_type = 'received'
        AND cc.status = 'accepted'
        AND ct.is_reconciled = true
        AND COALESCE(cci.received_cents, 0) <> COALESCE((ct.commission_amount * 100)::int, 0)
        ${currencyFilter}
      ORDER BY ABS(COALESCE(cci.received_cents, 0) - COALESCE((ct.commission_amount * 100)::int, 0)) DESC
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)

    return {
      rows: rows.map((r) => ({
        trackingId: r.tracking_id,
        activityPricingId: r.activity_pricing_id,
        tripId: r.trip_id,
        tripRef: r.trip_ref ?? null,
        tripName: r.trip_name ?? null,
        activityName: r.activity_name ?? null,
        currency: r.currency,
        expectedCommissionCents: Number(r.expected_commission_cents),
        receivedCents: Number(r.received_cents),
        varianceCents: Number(r.variance_cents),
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }

  // ============================================================================
  // PR-J — additional audit reports
  // ============================================================================

  /**
   * R2 — T4A slip data per IC per tax year (Canada).
   *
   * CRA T4A rule: report what was PAID in the calendar year, in CAD, for
   * self-employed commissions. Sources:
   *   - https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4a-information-payers/t4a-slip.html
   *   - https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4a-information-payers/t4a-summary.html
   *
   * Implementation (per Codex round-1 BLOCK fix):
   *   - Anchor on ic_disbursements.completed_at (the actual sent date), not
   *     ic_invoices.approved_at — approval is not payment under CRA rules.
   *   - Filter ic_disbursements.status = 'sent' so unsent/cancelled rows
   *     are excluded.
   *   - Sum cad_equivalent_base_cents for reportable income (already CAD,
   *     FX-converted at send time and immutable).
   *   - Keep tax/total as CAD-equivalent informational; do NOT collapse by
   *     invoice currency since cad_equivalent normalizes to CAD.
   *
   * Bounded cardinality (one row per IC), no pagination.
   */
  async getT4aSlipData(args: {
    agencyId: string
    taxYear: number
    userId?: string
  }): Promise<Array<{
    userId: string
    userEmail: string | null
    icLegalName: string | null
    icDomicileProvince: string | null
    icGstHstNumber: string | null
    icSinOrBnMask: string | null
    disbursementCount: number
    reportableBaseCents: number
    taxCents: number
    totalCents: number
  }>> {
    if (!Number.isInteger(args.taxYear) || args.taxYear < 2020 || args.taxYear > 2099) {
      throw new BadRequestException('taxYear must be an integer between 2020 and 2099')
    }
    const userFilter = args.userId
      ? sql`AND inv.user_id = ${args.userId}::uuid`
      : sql``
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        inv.user_id                                                  AS user_id,
        up.email                                                     AS user_email,
        MAX(inv.ic_legal_name)                                       AS ic_legal_name,
        MAX(inv.ic_domicile_province)                                AS ic_domicile_province,
        MAX(inv.ic_gst_hst_number)                                   AS ic_gst_hst_number,
        MAX(inv.ic_sin_or_bn_mask)                                   AS ic_sin_or_bn_mask,
        COUNT(*)::int                                                AS disbursement_count,
        SUM(COALESCE(d.cad_equivalent_base_cents, 0))::bigint        AS reportable_base_cents,
        SUM(COALESCE(d.cad_equivalent_tax_cents, 0))::bigint         AS tax_cents,
        SUM(COALESCE(d.cad_equivalent_total_cents, 0))::bigint       AS total_cents
      FROM ic_disbursements d
      JOIN ic_invoices inv ON inv.id = d.invoice_id
      LEFT JOIN user_profiles up ON up.id = inv.user_id
      WHERE inv.agency_id = ${args.agencyId}::uuid
        AND d.status = 'sent'
        AND d.completed_at IS NOT NULL
        AND EXTRACT(YEAR FROM d.completed_at AT TIME ZONE 'UTC')::int = ${args.taxYear}
        ${userFilter}
      GROUP BY inv.user_id, up.email
      ORDER BY inv.user_id
    `)
    return rows.map((r) => ({
      userId: r.user_id,
      userEmail: r.user_email ?? null,
      icLegalName: r.ic_legal_name ?? null,
      icDomicileProvince: r.ic_domicile_province ?? null,
      icGstHstNumber: r.ic_gst_hst_number ?? null,
      icSinOrBnMask: r.ic_sin_or_bn_mask ?? null,
      disbursementCount: Number(r.disbursement_count),
      reportableBaseCents: Number(r.reportable_base_cents),
      taxCents: Number(r.tax_cents),
      totalCents: Number(r.total_cents),
    }))
  }

  /**
   * R4 — Per-agent payment history.
   *
   * Every commission_item_settlements row for a recipient, ordered newest
   * first. Includes both active settlements and reversal rows (NOT filtered
   * out) so the auditor sees the full reversal chain. Paginated.
   */
  async getAgentPaymentHistory(args: {
    agencyId: string
    userId: string
    page: number
    limit: number
  }): Promise<{
    rows: Array<{
      settlementId: string
      checkItemId: string
      paidCheckId: string
      paidCheckNumber: string | null
      paidCheckDate: string | null
      currency: string
      settledAmountCents: number
      isReversal: boolean
      reversesSettlementId: string | null
      reversedAt: string | null
      reversedReason: string | null
      createdAt: string
      tripRef: string | null
      tripName: string | null
      activityName: string | null
    }>
    page: number
    limit: number
    totalRows: number
  }> {
    if (!args.userId) {
      throw new BadRequestException('userId is required')
    }
    const offset = (args.page - 1) * args.limit
    // Tenant scope via paid check's agency_id.
    const countResult: any[] = await this.databaseService.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM commission_item_settlements cis
      JOIN commission_checks pc ON pc.id = cis.paid_check_id
      WHERE cis.recipient_user_id = ${args.userId}::uuid
        AND pc.agency_id = ${args.agencyId}::uuid
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        cis.id                AS settlement_id,
        cis.check_item_id     AS check_item_id,
        cis.paid_check_id     AS paid_check_id,
        pc.check_number       AS paid_check_number,
        pc.check_date         AS paid_check_date,
        pc.currency           AS currency,
        cis.settled_amount_cents AS settled_amount_cents,
        cis.is_reversal       AS is_reversal,
        cis.reverses_settlement_id AS reverses_settlement_id,
        cis.reversed_at       AS reversed_at,
        cis.reversed_reason   AS reversed_reason,
        cis.created_at        AS created_at,
        t.reference_number    AS trip_ref,
        t.name                AS trip_name,
        ia.name               AS activity_name
      FROM commission_item_settlements cis
      JOIN commission_checks pc          ON pc.id = cis.paid_check_id
      LEFT JOIN commission_check_items cci ON cci.id = cis.check_item_id
      LEFT JOIN activity_pricing ap      ON ap.id = cci.activity_pricing_id
      LEFT JOIN itinerary_activities ia  ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days id_day    ON id_day.id = ia.itinerary_day_id
      LEFT JOIN itineraries i            ON i.id = id_day.itinerary_id
      LEFT JOIN trips t                  ON t.id = i.trip_id
      WHERE cis.recipient_user_id = ${args.userId}::uuid
        AND pc.agency_id = ${args.agencyId}::uuid
      ORDER BY cis.created_at DESC
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)
    return {
      rows: rows.map((r) => ({
        settlementId: r.settlement_id,
        checkItemId: r.check_item_id,
        paidCheckId: r.paid_check_id,
        paidCheckNumber: r.paid_check_number ?? null,
        paidCheckDate: r.paid_check_date ?? null,
        currency: r.currency,
        settledAmountCents: Number(r.settled_amount_cents),
        isReversal: Boolean(r.is_reversal),
        reversesSettlementId: r.reverses_settlement_id ?? null,
        reversedAt: r.reversed_at ?? null,
        reversedReason: r.reversed_reason ?? null,
        createdAt: r.created_at,
        tripRef: r.trip_ref ?? null,
        tripName: r.trip_name ?? null,
        activityName: r.activity_name ?? null,
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }

  /**
   * R5 — Per-supplier received history.
   *
   * All received commission_checks from a given supplier within an optional
   * date window. Useful for reconciling against supplier statements.
   */
  async getSupplierReceivedHistory(args: {
    agencyId: string
    supplierId: string
    fromDate?: string
    toDate?: string
    page: number
    limit: number
  }): Promise<{
    rows: Array<{
      checkId: string
      checkNumber: string
      checkDate: string
      status: string
      currency: string
      checkAmountCents: number
      senderName: string | null
      itemCount: number
      itemsTotalReceivedCents: number
    }>
    page: number
    limit: number
    totalRows: number
  }> {
    if (!args.supplierId) {
      throw new BadRequestException('supplierId is required')
    }
    const offset = (args.page - 1) * args.limit
    const dateFilter = args.fromDate && args.toDate
      ? sql`AND cc.check_date BETWEEN ${args.fromDate}::date AND ${args.toDate}::date`
      : args.fromDate
        ? sql`AND cc.check_date >= ${args.fromDate}::date`
        : args.toDate
          ? sql`AND cc.check_date <= ${args.toDate}::date`
          : sql``
    const countResult: any[] = await this.databaseService.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM commission_checks cc
      WHERE cc.agency_id = ${args.agencyId}::uuid
        AND cc.check_type = 'received'
        AND cc.sender_supplier_id = ${args.supplierId}::uuid
        ${dateFilter}
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        cc.id                                 AS check_id,
        cc.check_number                       AS check_number,
        cc.check_date                         AS check_date,
        cc.status                             AS status,
        cc.currency                           AS currency,
        cc.check_amount_cents                 AS check_amount_cents,
        cc.sender_name                        AS sender_name,
        COUNT(cci.id)::int                    AS item_count,
        COALESCE(SUM(cci.received_cents), 0)::bigint AS items_total_received_cents
      FROM commission_checks cc
      LEFT JOIN commission_check_items cci ON cci.check_id = cc.id
      WHERE cc.agency_id = ${args.agencyId}::uuid
        AND cc.check_type = 'received'
        AND cc.sender_supplier_id = ${args.supplierId}::uuid
        ${dateFilter}
      GROUP BY cc.id
      ORDER BY cc.check_date DESC
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)
    return {
      rows: rows.map((r) => ({
        checkId: r.check_id,
        checkNumber: r.check_number,
        checkDate: r.check_date,
        status: r.status,
        currency: r.currency,
        checkAmountCents: Number(r.check_amount_cents),
        senderName: r.sender_name ?? null,
        itemCount: Number(r.item_count),
        itemsTotalReceivedCents: Number(r.items_total_received_cents),
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }

  /**
   * R7 — Audit trail for a single record.
   *
   * Returns history rows from the appropriate *_history table for the given
   * entity. All history tables share the same diff-snapshot shape:
   *   id, entity_id (or trip_id), action, before_data jsonb, after_data jsonb,
   *   changed_by, changed_at, reason
   *
   * Tenant scope (per Codex round-1 BLOCK fix #1):
   *   - 4 history tables have agency_id directly: check, item, settlement,
   *     adjustment → enforce `agency_id = $agency` in WHERE
   *   - 3 do NOT: tracking, activity_pricing, trip_settings → join through
   *     parent entity to trips.agency_id
   *
   * Without this, cross-agency UUID knowledge would expose audit diffs.
   *
   * Each entityType branch emits a static SQL template — no identifier
   * injection path. All parameters (agencyId, entityId) bound via Drizzle
   * template params. The controller additionally validates entityType
   * against an allowlist before calling.
   */
  async getAuditTrail(args: {
    agencyId: string
    entityType:
      | 'check'
      | 'item'
      | 'settlement'
      | 'adjustment'
      | 'tracking'
      | 'activity_pricing'
      | 'trip_settings'
    entityId: string
  }): Promise<Array<{
    historyId: string
    entityId: string
    action: string
    changedAt: string
    changedByUserId: string | null
    reason: string | null
    beforeData: Record<string, unknown> | null
    afterData: Record<string, unknown> | null
  }>> {
    if (!args.entityId) throw new BadRequestException('entityId is required')

    // Build the WHERE clause based on whether the history table has agency_id
    // directly or needs a parent-entity join. ALWAYS scoped to agencyId.
    let queryFragment: ReturnType<typeof sql> | null = null

    switch (args.entityType) {
      case 'check':
        queryFragment = sql`
          SELECT id::text AS history_id, entity_id::text AS entity_id, action, changed_at, changed_by, reason, before_data, after_data
          FROM commission_check_history
          WHERE entity_id = ${args.entityId}::uuid AND agency_id = ${args.agencyId}::uuid
          ORDER BY changed_at ASC LIMIT 500
        `
        break
      case 'item':
        queryFragment = sql`
          SELECT id::text AS history_id, entity_id::text AS entity_id, action, changed_at, changed_by, reason, before_data, after_data
          FROM commission_check_item_history
          WHERE entity_id = ${args.entityId}::uuid AND agency_id = ${args.agencyId}::uuid
          ORDER BY changed_at ASC LIMIT 500
        `
        break
      case 'settlement':
        queryFragment = sql`
          SELECT id::text AS history_id, entity_id::text AS entity_id, action, changed_at, changed_by, reason, before_data, after_data
          FROM commission_item_settlement_history
          WHERE entity_id = ${args.entityId}::uuid AND agency_id = ${args.agencyId}::uuid
          ORDER BY changed_at ASC LIMIT 500
        `
        break
      case 'adjustment':
        queryFragment = sql`
          SELECT id::text AS history_id, entity_id::text AS entity_id, action, changed_at, changed_by, reason, before_data, after_data
          FROM commission_adjustment_history
          WHERE entity_id = ${args.entityId}::uuid AND agency_id = ${args.agencyId}::uuid
          ORDER BY changed_at ASC LIMIT 500
        `
        break
      case 'tracking':
        // Tracking history → activity_pricing.activity_id → itinerary_activities
        // → itinerary_days → itineraries → trips.agency_id
        queryFragment = sql`
          SELECT h.id::text AS history_id, h.entity_id::text AS entity_id, h.action, h.changed_at,
                 h.changed_by, h.reason, h.before_data, h.after_data
          FROM commission_tracking_history h
          JOIN activity_pricing ap     ON ap.id = h.activity_pricing_id
          JOIN itinerary_activities ia ON ia.id = ap.activity_id
          JOIN itinerary_days id_day   ON id_day.id = ia.itinerary_day_id
          JOIN itineraries i           ON i.id = id_day.itinerary_id
          JOIN trips t                 ON t.id = i.trip_id
          WHERE h.entity_id = ${args.entityId}::uuid
            AND t.agency_id = ${args.agencyId}::uuid
          ORDER BY h.changed_at ASC LIMIT 500
        `
        break
      case 'activity_pricing':
        // entity_id IS the activity_pricing_id → walk to trips.agency_id
        queryFragment = sql`
          SELECT h.id::text AS history_id, h.entity_id::text AS entity_id, h.action, h.changed_at,
                 h.changed_by, h.reason, h.before_data, h.after_data
          FROM activity_pricing_commission_history h
          JOIN activity_pricing ap     ON ap.id = h.entity_id
          JOIN itinerary_activities ia ON ia.id = ap.activity_id
          JOIN itinerary_days id_day   ON id_day.id = ia.itinerary_day_id
          JOIN itineraries i           ON i.id = id_day.itinerary_id
          JOIN trips t                 ON t.id = i.trip_id
          WHERE h.entity_id = ${args.entityId}::uuid
            AND t.agency_id = ${args.agencyId}::uuid
          ORDER BY h.changed_at ASC LIMIT 500
        `
        break
      case 'trip_settings':
        // trip_settings_history uses trip_id; tenant-scope via trips.agency_id
        queryFragment = sql`
          SELECT h.id::text AS history_id, h.trip_id::text AS entity_id, h.action, h.changed_at,
                 h.changed_by, h.reason, h.before_data, h.after_data
          FROM trip_settings_history h
          JOIN trips t ON t.id = h.trip_id
          WHERE h.trip_id = ${args.entityId}::uuid
            AND t.agency_id = ${args.agencyId}::uuid
          ORDER BY h.changed_at ASC LIMIT 500
        `
        break
      default: {
        // Compile-time exhaustiveness: every case above returns; this should
        // be unreachable. Belt-and-suspenders runtime guard.
        const _exhaustive: never = args.entityType
        throw new BadRequestException(`Unknown entityType: ${_exhaustive}`)
      }
    }

    const rows: any[] = await this.databaseService.db.execute(queryFragment)
    return rows.map((r) => ({
      historyId: r.history_id,
      entityId: r.entity_id,
      action: r.action,
      changedAt: r.changed_at,
      changedByUserId: r.changed_by ?? null,
      reason: r.reason ?? null,
      beforeData: r.before_data ?? null,
      afterData: r.after_data ?? null,
    }))
  }

  /**
   * R8 — Reversal / clawback report.
   *
   * Every reversal action (is_reversal=true) within a date window, joined
   * to the original settlement for context. Paginated.
   */
  async getReversalReport(args: {
    agencyId: string
    fromDate?: string
    toDate?: string
    page: number
    limit: number
  }): Promise<{
    rows: Array<{
      reversalSettlementId: string
      originalSettlementId: string | null
      recipientUserId: string
      recipientEmail: string | null
      currency: string
      reversalAmountCents: number
      originalAmountCents: number | null
      reversedAt: string | null
      reversedByUserId: string | null
      reversedReason: string | null
      paidCheckNumber: string | null
    }>
    page: number
    limit: number
    totalRows: number
  }> {
    const offset = (args.page - 1) * args.limit
    const dateFilter = args.fromDate && args.toDate
      ? sql`AND rev.created_at BETWEEN ${args.fromDate}::date AND (${args.toDate}::date + INTERVAL '1 day')`
      : sql``
    const countResult: any[] = await this.databaseService.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM commission_item_settlements rev
      JOIN commission_checks pc ON pc.id = rev.paid_check_id
      WHERE pc.agency_id = ${args.agencyId}::uuid
        AND rev.is_reversal = TRUE
        ${dateFilter}
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        rev.id                          AS reversal_settlement_id,
        rev.reverses_settlement_id      AS original_settlement_id,
        rev.recipient_user_id           AS recipient_user_id,
        up.email                        AS recipient_email,
        pc.currency                     AS currency,
        rev.settled_amount_cents        AS reversal_amount_cents,
        orig.settled_amount_cents       AS original_amount_cents,
        rev.created_at                  AS reversed_at,
        rev.created_by                  AS reversed_by_user_id,
        rev.reversed_reason             AS reversed_reason,
        pc.check_number                 AS paid_check_number
      FROM commission_item_settlements rev
      JOIN commission_checks pc        ON pc.id = rev.paid_check_id
      LEFT JOIN commission_item_settlements orig
        ON orig.id = rev.reverses_settlement_id
      LEFT JOIN user_profiles up       ON up.id = rev.recipient_user_id
      WHERE pc.agency_id = ${args.agencyId}::uuid
        AND rev.is_reversal = TRUE
        ${dateFilter}
      ORDER BY rev.created_at DESC
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)
    return {
      rows: rows.map((r) => ({
        reversalSettlementId: r.reversal_settlement_id,
        originalSettlementId: r.original_settlement_id ?? null,
        recipientUserId: r.recipient_user_id,
        recipientEmail: r.recipient_email ?? null,
        currency: r.currency,
        reversalAmountCents: Number(r.reversal_amount_cents),
        originalAmountCents: r.original_amount_cents != null ? Number(r.original_amount_cents) : null,
        reversedAt: r.reversed_at ?? null,
        reversedByUserId: r.reversed_by_user_id ?? null,
        reversedReason: r.reversed_reason ?? null,
        paidCheckNumber: r.paid_check_number ?? null,
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }

  /**
   * R9 — Override usage report.
   *
   * Tracks two override surfaces (the only ones that exist in the schema):
   *   1. `trips.commission_fee_rate_override` — per-trip fee rate override
   *   2. `trip_collaborators.agent_split_override` — per-collaborator split
   *
   * The plan doc mentioned a trip-level split override but the schema does
   * not have one (split overrides are intentionally per-collaborator). One
   * row per (trip, collaborator) where EITHER override is non-null.
   */
  async getOverrideUsageReport(args: {
    agencyId: string
    page: number
    limit: number
  }): Promise<{
    rows: Array<{
      tripId: string
      tripRef: string | null
      tripName: string | null
      tripStatus: string
      tripFeeRateOverride: string | null
      collaboratorUserId: string | null
      collaboratorEmail: string | null
      collaboratorRole: string | null
      collaboratorSplitOverride: string | null
    }>
    page: number
    limit: number
    totalRows: number
  }> {
    const offset = (args.page - 1) * args.limit
    const countResult: any[] = await this.databaseService.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM trips t
      LEFT JOIN trip_collaborators tc ON tc.trip_id = t.id AND tc.is_active = TRUE
      WHERE t.agency_id = ${args.agencyId}::uuid
        AND (
          t.commission_fee_rate_override IS NOT NULL
          OR tc.agent_split_override IS NOT NULL
        )
    `)
    const totalRows = Number((countResult[0] as { total: number } | undefined)?.total ?? 0)
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        t.id                              AS trip_id,
        t.reference_number                AS trip_ref,
        t.name                            AS trip_name,
        t.status                          AS trip_status,
        t.commission_fee_rate_override    AS trip_fee_rate_override,
        tc.user_id                        AS collaborator_user_id,
        up.email                          AS collaborator_email,
        tc.role                           AS collaborator_role,
        tc.agent_split_override           AS collaborator_split_override
      FROM trips t
      LEFT JOIN trip_collaborators tc ON tc.trip_id = t.id AND tc.is_active = TRUE
      LEFT JOIN user_profiles up      ON up.id = tc.user_id
      WHERE t.agency_id = ${args.agencyId}::uuid
        AND (
          t.commission_fee_rate_override IS NOT NULL
          OR tc.agent_split_override IS NOT NULL
        )
      ORDER BY t.created_at DESC, tc.user_id
      LIMIT ${args.limit}
      OFFSET ${offset}
    `)
    return {
      rows: rows.map((r) => ({
        tripId: r.trip_id,
        tripRef: r.trip_ref ?? null,
        tripName: r.trip_name ?? null,
        tripStatus: r.trip_status,
        tripFeeRateOverride: r.trip_fee_rate_override != null ? String(r.trip_fee_rate_override) : null,
        collaboratorUserId: r.collaborator_user_id ?? null,
        collaboratorEmail: r.collaborator_email ?? null,
        collaboratorRole: r.collaborator_role ?? null,
        collaboratorSplitOverride: r.collaborator_split_override != null ? String(r.collaborator_split_override) : null,
      })),
      page: args.page,
      limit: args.limit,
      totalRows,
    }
  }
}
