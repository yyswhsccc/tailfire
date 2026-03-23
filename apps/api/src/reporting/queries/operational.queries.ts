/**
 * Operational Report Query Builders
 *
 * Upcoming departures with payment status, traveler counts, and urgency ranking.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - trips: id, agency_id, owner_id, name, status, start_date, end_date,
 *            primary_contact_id, reference_number, trip_type
 *   - contacts: id, first_name, last_name, email, phone
 *   - user_profiles: id, first_name, last_name
 *   - trip_travelers: id, trip_id, contact_id
 *   - payment_transactions: expected_payment_item_id, transaction_type, amount_cents
 *   - expected_payment_items: payment_schedule_config_id, expected_amount_cents
 *   - payment_schedule_config: component_pricing_id (legacy FK → activity_pricing.id)
 *   - activity_pricing: id, activity_id
 */

import { sql } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'
import { tripScopeFilter, paginationSql } from './sales.queries'

// ============================================================================
// Types
// ============================================================================

export interface OperationalQueryOptions {
  daysThreshold?: number   // default 30
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  agentId?: string
}

export interface OperationalQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// Upcoming Departures
// ============================================================================

/**
 * Trips departing within N days (default 30).
 * Joins trips -> contacts (primary_contact_id) -> user_profiles (owner_id).
 * Calculates payment status by comparing SUM(payment_transactions.amount_cents)
 * vs SUM(expected_payment_items.expected_amount_cents) per trip.
 * Includes traveler count, days until departure.
 * Filtered to status IN ('active', 'travelling').
 * Sorted by departure date ASC (most urgent first).
 */
export async function queryUpcomingDepartures(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: OperationalQueryOptions,
): Promise<OperationalQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const daysThreshold = options.daysThreshold ?? 30
  const { page, pageSize } = options

  const agentFilter = options.agentId
    ? sql`AND t.owner_id = ${options.agentId}`
    : sql``

  // Count query
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM trips t
    WHERE ${scope}
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
      ${agentFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query with payment status calculation
  const dataResult = await db.client.execute(sql`
    SELECT
      t.id AS trip_id,
      t.name AS trip_name,
      t.reference_number,
      t.status,
      t.trip_type,
      t.start_date AS departure_date,
      t.end_date,
      (t.start_date::date - CURRENT_DATE)::int AS days_until_departure,
      c.id AS client_id,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      c.email AS client_email,
      c.phone AS client_phone,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      (SELECT count(*)::int FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count,
      coalesce(expected.total_expected_cents, 0)::bigint AS total_expected_cents,
      coalesce(paid.total_paid_cents, 0)::bigint AS total_paid_cents,
      CASE
        WHEN coalesce(expected.total_expected_cents, 0) = 0 THEN 'no_schedule'
        WHEN coalesce(paid.total_paid_cents, 0) >= coalesce(expected.total_expected_cents, 0) THEN 'paid'
        WHEN coalesce(paid.total_paid_cents, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS payment_status
    FROM trips t
    LEFT JOIN contacts c ON c.id = t.primary_contact_id
    LEFT JOIN user_profiles up ON up.id = t.owner_id
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(epi.expected_amount_cents), 0) AS total_expected_cents
      FROM activity_pricing ap2
      JOIN itinerary_activities ia2 ON ia2.id = ap2.activity_id
      LEFT JOIN itinerary_days iday2 ON iday2.id = ia2.itinerary_day_id
      LEFT JOIN itineraries itin2 ON itin2.id = iday2.itinerary_id
      JOIN payment_schedule_config psc ON psc.component_pricing_id = ap2.id
      JOIN expected_payment_items epi ON epi.payment_schedule_config_id = psc.id
      WHERE COALESCE(itin2.trip_id, ia2.trip_id) = t.id
    ) expected ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(pt.amount_cents), 0) AS total_paid_cents
      FROM activity_pricing ap3
      JOIN itinerary_activities ia3 ON ia3.id = ap3.activity_id
      LEFT JOIN itinerary_days iday3 ON iday3.id = ia3.itinerary_day_id
      LEFT JOIN itineraries itin3 ON itin3.id = iday3.itinerary_id
      JOIN payment_schedule_config psc2 ON psc2.component_pricing_id = ap3.id
      JOIN expected_payment_items epi2 ON epi2.payment_schedule_config_id = psc2.id
      JOIN payment_transactions pt ON pt.expected_payment_item_id = epi2.id
        AND pt.transaction_type = 'payment'
      WHERE COALESCE(itin3.trip_id, ia3.trip_id) = t.id
    ) paid ON true
    WHERE ${scope}
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
      ${agentFilter}
    ORDER BY t.start_date ASC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    tripId: row.trip_id,
    tripName: row.trip_name,
    referenceNumber: row.reference_number,
    status: row.status,
    tripType: row.trip_type,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    daysUntilDeparture: Number(row.days_until_departure ?? 0),
    clientId: row.client_id,
    clientName: [row.client_first_name, row.client_last_name].filter(Boolean).join(' ') || null,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    travelerCount: Number(row.traveler_count ?? 0),
    totalExpectedCents: Number(row.total_expected_cents ?? 0),
    totalPaidCents: Number(row.total_paid_cents ?? 0),
    paymentStatus: row.payment_status,
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_trips,
      count(*) FILTER (WHERE t.start_date <= CURRENT_DATE + 7) ::int AS departing_within_7_days,
      count(*) FILTER (WHERE t.start_date <= CURRENT_DATE + 14) ::int AS departing_within_14_days
    FROM trips t
    WHERE ${scope}
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
      ${agentFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalTrips: Number(summaryRow?.total_trips ?? 0),
      departingWithin7Days: Number(summaryRow?.departing_within_7_days ?? 0),
      departingWithin14Days: Number(summaryRow?.departing_within_14_days ?? 0),
    },
  }
}
