/**
 * Compliance Report Query Builders
 *
 * Ontario Gross Sales (TICO Form 1) — monthly breakdown for regulatory reporting.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - activity_pricing: total_price_cents, activity_id
 *   - itinerary_activities: id, itinerary_day_id, trip_id, booking_status, activity_type
 *   - itinerary_days: id, itinerary_id
 *   - itineraries: id, trip_id
 *   - trips: id, agency_id, status, booking_date, created_at
 *   - service_fees: trip_id, amount_cents, status
 */

import { sql } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'
import { paginationSql } from './sales.queries'

// ============================================================================
// Types
// ============================================================================

export interface ComplianceQueryOptions {
  startDate: string   // ISO date string (typically fiscal year start)
  endDate: string     // ISO date string (typically fiscal year end)
  page: number
  pageSize: number
}

export interface ComplianceQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// Canonical join chain (same as sales.queries.ts)
// ============================================================================

const CANONICAL_JOIN = sql`
  FROM activity_pricing ap
  JOIN itinerary_activities ia ON ia.id = ap.activity_id
  LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
  LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
  JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
`

/** Informational activity types to exclude */
const EXCLUDED_ACTIVITY_TYPES = sql`('port_info', 'tour_day')`

// ============================================================================
// Ontario Gross Sales (TICO Form 1)
// ============================================================================

/**
 * Admin-only, agency-wide report. No tripIds filter — always full agency.
 * Monthly breakdown of:
 *   - Activity sales (SUM activity_pricing.total_price_cents for booked activities)
 *   - Service fees (SUM service_fees.amount_cents for paid/sent fees)
 *   - Gross = activity sales + service fees
 *
 * Date range: booking date (coalesce(t.booking_date::timestamptz, t.created_at))
 * Status: active, travelling, travelled
 */
export async function queryOntarioGrossSales(
  db: DatabaseService,
  agencyId: string,
  options: ComplianceQueryOptions,
): Promise<ComplianceQueryResult> {
  const { startDate, endDate, page, pageSize } = options

  // Monthly activity sales
  const activityResult = await db.client.execute(sql`
    SELECT
      to_char(coalesce(t.booking_date::timestamptz, t.created_at), 'YYYY-MM') AS month_label,
      count(DISTINCT t.id)::int AS booking_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE t.agency_id = ${agencyId}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
    GROUP BY month_label
    ORDER BY month_label ASC
    ${paginationSql(page, pageSize)}
  `)

  // Monthly service fees (paid or sent status)
  const feesResult = await db.client.execute(sql`
    SELECT
      to_char(sf.created_at, 'YYYY-MM') AS month_label,
      coalesce(sum(sf.amount_cents), 0)::bigint AS service_fees_cents
    FROM service_fees sf
    JOIN trips t ON t.id = sf.trip_id
    WHERE t.agency_id = ${agencyId}
      AND sf.status IN ('paid', 'sent')
      AND sf.created_at >= ${startDate}::timestamptz
      AND sf.created_at <= ${endDate}::timestamptz
    GROUP BY month_label
    ORDER BY month_label ASC
  `)

  // Merge activity sales and service fees by month
  const feesByMonth = new Map<string, number>()
  for (const row of (feesResult as any[])) {
    feesByMonth.set(row.month_label, Number(row.service_fees_cents ?? 0))
  }

  const data = (activityResult as any[]).map((row: any) => {
    const totalSalesCents = Number(row.total_sales_cents ?? 0)
    const serviceFeesCents = feesByMonth.get(row.month_label) ?? 0
    return {
      monthLabel: row.month_label,
      bookingCount: Number(row.booking_count ?? 0),
      totalSalesCents,
      serviceFeesCents,
      grossSalesCents: totalSalesCents + serviceFeesCents,
    }
  })

  // Also include months that have only service fees but no activity sales
  const activityMonths = new Set(data.map(d => d.monthLabel))
  for (const [month, feesCents] of feesByMonth.entries()) {
    if (!activityMonths.has(month)) {
      data.push({
        monthLabel: month,
        bookingCount: 0,
        totalSalesCents: 0,
        serviceFeesCents: feesCents,
        grossSalesCents: feesCents,
      })
    }
  }
  // Re-sort after merging
  data.sort((a, b) => a.monthLabel.localeCompare(b.monthLabel))

  // Summary: annual totals
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT t.id)::int AS total_bookings,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE t.agency_id = ${agencyId}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
  `)
  const summaryRow = (summaryResult as any[])[0]

  const totalFeesResult = await db.client.execute(sql`
    SELECT coalesce(sum(sf.amount_cents), 0)::bigint AS total_service_fees_cents
    FROM service_fees sf
    JOIN trips t ON t.id = sf.trip_id
    WHERE t.agency_id = ${agencyId}
      AND sf.status IN ('paid', 'sent')
      AND sf.created_at >= ${startDate}::timestamptz
      AND sf.created_at <= ${endDate}::timestamptz
  `)
  const totalFeesRow = (totalFeesResult as any[])[0]

  const annualSalesCents = Number(summaryRow?.total_sales_cents ?? 0)
  const annualFeesCents = Number(totalFeesRow?.total_service_fees_cents ?? 0)

  return {
    data,
    totalRows: data.length, // after merge, use actual count
    summary: {
      totalBookings: Number(summaryRow?.total_bookings ?? 0),
      totalSalesCents: annualSalesCents,
      totalServiceFeesCents: annualFeesCents,
      grossSalesCents: annualSalesCents + annualFeesCents,
    },
  }
}
