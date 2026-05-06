/**
 * Sales Report Query Builders
 *
 * All queries use the canonical join chain:
 *   FROM activity_pricing ap
 *   JOIN itinerary_activities ia ON ia.id = ap.activity_id
 *   LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
 *   LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
 *   JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
 *
 * LEFT JOINs + COALESCE handle both day-bound and floating package activities.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - activity_pricing.supplier (varchar)
 *   - itinerary_activities.activity_type (enum)
 *   - trips.primary_destination_name (on trips table, NOT itineraries)
 *   - commission_tracking.component_pricing_id (legacy FK name → maps to activity_pricing.id)
 *   - Booked date: coalesce(t.booking_date::timestamptz, t.created_at)
 */

import { sql, type SQL } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'

// ============================================================================
// Types
// ============================================================================

export interface SalesQueryOptions {
  startDate: string   // ISO date string
  endDate: string     // ISO date string
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  agentId?: string
  supplierName?: string
  tripType?: string
  status?: string
  /** For querySalesBySupplier: filter by booked-date or departure-date */
  variant?: 'booked' | 'departed'
}

export interface SalesQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// Shared Helpers
// ============================================================================

/** Build a parameterized SQL list from an array of IDs -- safe from SQL injection */
export function sqlIdList(ids: string[]): SQL {
  const params = ids.map((id, i) => (i === 0 ? sql`${id}` : sql`, ${id}`))
  return sql`(${sql.join(params, sql.raw(''))})`
}

/** Build trip-scope filter fragment: either agency-wide or limited to specific trip IDs */
export function tripScopeFilter(tripIds: string[] | 'all', agencyId: string): SQL {
  if (tripIds === 'all') {
    return sql`t.agency_id = ${agencyId}`
  }
  if (tripIds.length === 0) {
    return sql`false`
  }
  return sql`t.agency_id = ${agencyId} AND t.id IN ${sqlIdList(tripIds)}`
}

/** Informational activity types to exclude from sales queries */
const EXCLUDED_ACTIVITY_TYPES = sql`('port_info', 'tour_day')`

/** Canonical FROM clause for activity pricing queries */
const CANONICAL_JOIN = sql`
  FROM activity_pricing ap
  JOIN itinerary_activities ia ON ia.id = ap.activity_id
  LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
  LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
  JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
`

/** Apply pagination offset/limit */
export function paginationSql(page: number, pageSize: number): SQL {
  const offset = (page - 1) * pageSize
  return sql`LIMIT ${pageSize} OFFSET ${offset}`
}

// ============================================================================
// 1. Booked Sales
// ============================================================================

/**
 * Trips with booking_status='booked' activities where the booking date
 * (coalesce of t.booking_date::timestamptz, t.created_at) falls in range.
 * Status IN ('active','travelling','travelled').
 */
export async function queryBookedSales(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { startDate, endDate, page, pageSize } = options

  const sortCol = options.sortBy === 'bookedDate'
    ? sql`booked_date`
    : options.sortBy === 'departureDate'
      ? sql`departure_date`
      : options.sortBy === 'totalPriceCents'
        ? sql`total_price_cents`
        : sql`booked_date`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Optional agent filter
  const agentFilter = options.agentId
    ? sql`AND t.owner_id = ${options.agentId}`
    : sql``

  // Optional trip type filter
  const tripTypeFilter = options.tripType
    ? sql`AND t.trip_type = ${options.tripType}`
    : sql``

  // Count query
  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT t.id)::int AS total_rows
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
      ${agentFilter}
      ${tripTypeFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query: per-trip aggregation
  const dataResult = await db.client.execute(sql`
    SELECT
      t.id AS trip_id,
      t.name AS trip_name,
      t.reference_number,
      t.status,
      t.trip_type,
      coalesce(t.booking_date::timestamptz, t.created_at) AS booked_date,
      t.start_date AS departure_date,
      t.end_date,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_price_cents,
      count(DISTINCT ia.id)::int AS activity_count,
      (SELECT count(*)::int FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
    ${CANONICAL_JOIN}
    LEFT JOIN user_profiles up ON up.id = t.owner_id
    LEFT JOIN contacts c ON c.id = t.primary_contact_id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
      ${agentFilter}
      ${tripTypeFilter}
    GROUP BY t.id, t.name, t.reference_number, t.status, t.trip_type,
             t.booking_date, t.created_at, t.start_date, t.end_date,
             up.first_name, up.last_name, c.first_name, c.last_name
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    tripId: row.trip_id,
    tripName: row.trip_name,
    referenceNumber: row.reference_number,
    status: row.status,
    tripType: row.trip_type,
    bookedDate: row.booked_date ? String(row.booked_date) : null,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    clientName: [row.client_first_name, row.client_last_name].filter(Boolean).join(' ') || null,
    totalPriceCents: Number(row.total_price_cents ?? 0),
    currency: 'CAD',
    activityCount: Number(row.activity_count ?? 0),
    travelerCount: Number(row.traveler_count ?? 0),
  }))

  // Summary: total sales and booking count
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT t.id)::int AS total_bookings,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
      ${agentFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
      totalBookings: Number(summaryRow?.total_bookings ?? 0),
    },
  }
}

// ============================================================================
// 2. Departed Sales
// ============================================================================

/**
 * Same aggregation as booked sales but filtered by t.start_date BETWEEN dates
 * instead of the booked date.
 */
export async function queryDepartedSales(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { startDate, endDate, page, pageSize } = options

  const sortCol = options.sortBy === 'departureDate'
    ? sql`departure_date`
    : options.sortBy === 'totalPriceCents'
      ? sql`total_price_cents`
      : sql`departure_date`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  const agentFilter = options.agentId
    ? sql`AND t.owner_id = ${options.agentId}`
    : sql``

  const tripTypeFilter = options.tripType
    ? sql`AND t.trip_type = ${options.tripType}`
    : sql``

  // Count query
  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT t.id)::int AS total_rows
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.start_date >= ${startDate}::date
      AND t.start_date <= ${endDate}::date
      ${agentFilter}
      ${tripTypeFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query
  const dataResult = await db.client.execute(sql`
    SELECT
      t.id AS trip_id,
      t.name AS trip_name,
      t.reference_number,
      t.status,
      t.trip_type,
      coalesce(t.booking_date::timestamptz, t.created_at) AS booked_date,
      t.start_date AS departure_date,
      t.end_date,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_price_cents,
      count(DISTINCT ia.id)::int AS activity_count,
      (SELECT count(*)::int FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
    ${CANONICAL_JOIN}
    LEFT JOIN user_profiles up ON up.id = t.owner_id
    LEFT JOIN contacts c ON c.id = t.primary_contact_id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.start_date >= ${startDate}::date
      AND t.start_date <= ${endDate}::date
      ${agentFilter}
      ${tripTypeFilter}
    GROUP BY t.id, t.name, t.reference_number, t.status, t.trip_type,
             t.booking_date, t.created_at, t.start_date, t.end_date,
             up.first_name, up.last_name, c.first_name, c.last_name
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    tripId: row.trip_id,
    tripName: row.trip_name,
    referenceNumber: row.reference_number,
    status: row.status,
    tripType: row.trip_type,
    bookedDate: row.booked_date ? String(row.booked_date) : null,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    returnDate: row.end_date ? String(row.end_date) : null,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    clientName: [row.client_first_name, row.client_last_name].filter(Boolean).join(' ') || null,
    totalPriceCents: Number(row.total_price_cents ?? 0),
    currency: 'CAD',
    activityCount: Number(row.activity_count ?? 0),
    travelerCount: Number(row.traveler_count ?? 0),
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT t.id)::int AS total_bookings,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.start_date >= ${startDate}::date
      AND t.start_date <= ${endDate}::date
      ${agentFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
      totalBookings: Number(summaryRow?.total_bookings ?? 0),
    },
  }
}

// ============================================================================
// 3. Sales by Agent
// ============================================================================

/**
 * Admin-only report. GROUP BY t.owner_id.
 * Returns agent name, booking count, total sales, average booking value.
 */
export async function querySalesByAgent(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { startDate, endDate, page, pageSize } = options

  const sortCol = options.sortBy === 'totalSalesCents'
    ? sql`total_sales_cents`
    : options.sortBy === 'bookingCount'
      ? sql`booking_count`
      : options.sortBy === 'avgBookingValueCents'
        ? sql`avg_booking_value_cents`
        : sql`total_sales_cents`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Count distinct agents
  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT t.owner_id)::int AS total_rows
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.owner_id IS NOT NULL
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query
  const dataResult = await db.client.execute(sql`
    SELECT
      t.owner_id AS agent_id,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      count(DISTINCT t.id)::int AS booking_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents,
      CASE
        WHEN count(DISTINCT t.id) > 0
        THEN (coalesce(sum(ap.total_price_cents), 0) / count(DISTINCT t.id))::bigint
        ELSE 0
      END AS avg_booking_value_cents
    ${CANONICAL_JOIN}
    LEFT JOIN user_profiles up ON up.id = t.owner_id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.owner_id IS NOT NULL
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
    GROUP BY t.owner_id, up.first_name, up.last_name
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    agentId: row.agent_id,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || 'Unknown',
    bookingCount: Number(row.booking_count ?? 0),
    totalSalesCents: Number(row.total_sales_cents ?? 0),
    avgBookingValueCents: Number(row.avg_booking_value_cents ?? 0),
    currency: 'CAD',
  }))

  // Summary: agency-wide totals
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT t.owner_id)::int AS agent_count,
      count(DISTINCT t.id)::int AS total_bookings,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND t.owner_id IS NOT NULL
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      agentCount: Number(summaryRow?.agent_count ?? 0),
      totalBookings: Number(summaryRow?.total_bookings ?? 0),
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
    },
  }
}

// ============================================================================
// 4. Sales by Destination
// ============================================================================

/**
 * GROUP BY itineraries.primary_destination_name, trips.trip_type.
 * Note: primary_destination_name lives on the itineraries table, not trips.
 * Returns destination, trip type, booking count, total sales, traveler count.
 */
export async function querySalesByDestination(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { startDate, endDate, page, pageSize } = options

  const sortCol = options.sortBy === 'totalSalesCents'
    ? sql`total_sales_cents`
    : options.sortBy === 'bookingCount'
      ? sql`booking_count`
      : options.sortBy === 'travelerCount'
        ? sql`traveler_count`
        : sql`total_sales_cents`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Optional trip type filter
  const tripTypeFilter = options.tripType
    ? sql`AND t.trip_type = ${options.tripType}`
    : sql``

  // Count distinct destination+type combos
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows FROM (
      SELECT 1
      ${CANONICAL_JOIN}
      WHERE ${scope}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND ia.booking_status = 'booked'
        AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
        AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
        AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
        ${tripTypeFilter}
      GROUP BY coalesce(t.primary_destination_name, 'Unknown'), t.trip_type
    ) sub
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query
  const dataResult = await db.client.execute(sql`
    SELECT
      coalesce(t.primary_destination_name, 'Unknown') AS destination,
      t.trip_type,
      count(DISTINCT t.id)::int AS booking_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents,
      (
        SELECT count(DISTINCT tt2.id)::int
        FROM trip_travelers tt2
        WHERE tt2.trip_id = ANY(array_agg(DISTINCT t.id))
      ) AS traveler_count
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
      ${tripTypeFilter}
    GROUP BY coalesce(t.primary_destination_name, 'Unknown'), t.trip_type
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    destination: row.destination,
    tripType: row.trip_type,
    bookingCount: Number(row.booking_count ?? 0),
    totalSalesCents: Number(row.total_sales_cents ?? 0),
    travelerCount: Number(row.traveler_count ?? 0),
    currency: 'CAD',
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT coalesce(t.primary_destination_name, 'Unknown'))::int AS destination_count,
      count(DISTINCT t.id)::int AS total_bookings,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents
    ${CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
      AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz
      ${tripTypeFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      destinationCount: Number(summaryRow?.destination_count ?? 0),
      totalBookings: Number(summaryRow?.total_bookings ?? 0),
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
    },
  }
}

// ============================================================================
// 5. Sales by Supplier
// ============================================================================

/**
 * GROUP BY ap.supplier, ia.activity_type.
 * Joins commission_tracking via ct.component_pricing_id = ap.id.
 * variant: 'booked' filters by booking date, 'departed' by start_date.
 */
export async function querySalesBySupplier(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { startDate, endDate, page, pageSize } = options
  const variant = options.variant ?? 'booked'

  const dateFilter = variant === 'departed'
    ? sql`AND t.start_date >= ${startDate}::date AND t.start_date <= ${endDate}::date`
    : sql`AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startDate}::timestamptz
          AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endDate}::timestamptz`

  const sortCol = options.sortBy === 'totalSalesCents'
    ? sql`total_sales_cents`
    : options.sortBy === 'activityCount'
      ? sql`activity_count`
      : options.sortBy === 'totalCommissionCents'
        ? sql`total_commission_cents`
        : sql`total_sales_cents`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Supplier join — use activity_suppliers → suppliers for real names,
  // fall back to denormalized ap.supplier field
  const SUPPLIER_JOIN = sql`
    LEFT JOIN activity_suppliers asup ON asup.activity_id = ia.id AND asup.primary_supplier = true
    LEFT JOIN suppliers s ON s.id = asup.supplier_id
  `
  const supplierNameExpr = sql`coalesce(s.name, ap.supplier, 'Unknown')`

  // Optional supplier filter — supports comma-separated names for multi-select
  let supplierFilter = sql``
  if (options.supplierName) {
    const names = options.supplierName.split(',').map(n => n.trim()).filter(Boolean)
    if (names.length === 1) {
      supplierFilter = sql`AND coalesce(s.name, ap.supplier) ILIKE ${'%' + names[0] + '%'}`
    } else if (names.length > 1) {
      const conditions = names.map(n => sql`coalesce(s.name, ap.supplier) ILIKE ${'%' + n + '%'}`)
      supplierFilter = sql`AND (${sql.join(conditions, sql` OR `)})`
    }
  }

  // Count distinct supplier+type combos
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows FROM (
      SELECT 1
      ${CANONICAL_JOIN}
      ${SUPPLIER_JOIN}
      LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
      WHERE ${scope}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND ia.booking_status = 'booked'
        AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
        ${dateFilter}
        ${supplierFilter}
      GROUP BY ${supplierNameExpr}, ia.activity_type
    ) sub
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query
  const dataResult = await db.client.execute(sql`
    SELECT
      ${supplierNameExpr} AS supplier_name,
      ia.activity_type,
      count(DISTINCT ia.id)::int AS activity_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents,
      coalesce(sum(ct.gross_commission_cents), 0)::bigint AS total_commission_cents,
      coalesce(sum(ct.net_commission_cents), 0)::bigint AS net_commission_cents
    ${CANONICAL_JOIN}
    ${SUPPLIER_JOIN}
    LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${dateFilter}
      ${supplierFilter}
    GROUP BY ${supplierNameExpr}, ia.activity_type
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    supplierName: row.supplier_name,
    activityType: row.activity_type,
    activityCount: Number(row.activity_count ?? 0),
    totalSalesCents: Number(row.total_sales_cents ?? 0),
    commissionCents: Number(row.total_commission_cents ?? 0),
    netCommissionCents: Number(row.net_commission_cents ?? 0),
    currency: 'CAD',
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT ${supplierNameExpr})::int AS supplier_count,
      count(DISTINCT ia.id)::int AS total_activities,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents,
      coalesce(sum(ct.gross_commission_cents), 0)::bigint AS total_commission_cents
    ${CANONICAL_JOIN}
    ${SUPPLIER_JOIN}
    LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${dateFilter}
      ${supplierFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      supplierCount: Number(summaryRow?.supplier_count ?? 0),
      totalActivities: Number(summaryRow?.total_activities ?? 0),
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
      totalCommissionCents: Number(summaryRow?.total_commission_cents ?? 0),
    },
  }
}

// ============================================================================
// 6. Booking Pipeline
// ============================================================================

/**
 * GROUP BY t.status. No date filter (shows current state snapshot).
 * Returns status, trip count, estimated total (from t.estimated_total_cost * 100).
 */
export async function queryBookingPipeline(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
): Promise<SalesQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  // Optional status filter
  const statusFilter = options.status
    ? sql`AND t.status = ${options.status}`
    : sql``

  // Count distinct statuses (small number, always fits in one page)
  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT t.status)::int AS total_rows
    FROM trips t
    WHERE ${scope}
      ${statusFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data query
  const dataResult = await db.client.execute(sql`
    SELECT
      t.status,
      count(*)::int AS trip_count,
      coalesce(sum((t.estimated_total_cost::numeric * 100)::bigint), 0)::bigint AS estimated_total_cents
    FROM trips t
    WHERE ${scope}
      ${statusFilter}
    GROUP BY t.status
    ORDER BY
      CASE t.status
        WHEN 'inbound' THEN 1
        WHEN 'planning' THEN 2
        WHEN 'active' THEN 3
        WHEN 'travelling' THEN 4
        WHEN 'travelled' THEN 5
        WHEN 'cancelled' THEN 6
        ELSE 7
      END
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    status: row.status,
    tripCount: Number(row.trip_count ?? 0),
    totalEstimatedCents: Number(row.estimated_total_cents ?? 0),
    currency: 'CAD',
  }))

  // Summary: total across all statuses
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_trips,
      coalesce(sum((t.estimated_total_cost::numeric * 100)::bigint), 0)::bigint AS estimated_total_cents
    FROM trips t
    WHERE ${scope}
      ${statusFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalTrips: Number(summaryRow?.total_trips ?? 0),
      estimatedTotalCents: Number(summaryRow?.estimated_total_cents ?? 0),
    },
  }
}
