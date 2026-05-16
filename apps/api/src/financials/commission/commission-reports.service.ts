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
}
