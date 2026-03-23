/**
 * CRM Report Query Builders
 *
 * 8 client-relationship queries: spending, repeat clients, dormant clients,
 * passport expiry, upcoming birthdays, new clients, data completeness,
 * top clients by revenue.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - contacts: id, agency_id, first_name, last_name, email, phone,
 *               date_of_birth, passport_number, passport_expiry,
 *               passport_country, address_line1, created_at
 *   - trip_travelers: id, trip_id, contact_id
 *   - trips: id, agency_id, status, start_date, end_date
 *   - activity_pricing: total_price_cents, activity_id
 *   - itinerary_activities: id, itinerary_day_id, trip_id, booking_status, activity_type
 *   - itinerary_days: id, itinerary_id
 *   - itineraries: id, trip_id
 */

import { sql, type SQL } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'
import { sqlIdList, paginationSql } from './sales.queries'

// ============================================================================
// Types
// ============================================================================

export interface CrmQueryOptions {
  startDate?: string
  endDate?: string
  daysThreshold?: number   // context-dependent default
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface CrmQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// Helpers
// ============================================================================

const EXCLUDED_ACTIVITY_TYPES = sql`('port_info', 'tour_day')`

/**
 * Builds a contact agency filter. When tripIds is 'all', only filter by agency_id
 * on contacts. When specific tripIds, filter contacts to those appearing in trip_travelers
 * for those trips.
 */
function contactScopeFilter(tripIds: string[] | 'all', agencyId: string): SQL {
  if (tripIds === 'all') {
    return sql`c.agency_id = ${agencyId}`
  }
  if (tripIds.length === 0) {
    return sql`false`
  }
  return sql`c.agency_id = ${agencyId}
    AND c.id IN (
      SELECT tt_scope.contact_id FROM trip_travelers tt_scope
      WHERE tt_scope.trip_id IN ${sqlIdList(tripIds)}
    )`
}

// ============================================================================
// 1. Client Spending
// ============================================================================

/**
 * Per-contact: trip count, total spend (via canonical chain), avg trip value,
 * first/last trip dates.
 * Joins contacts -> trip_travelers -> trips -> activity_pricing.
 */
export async function queryClientSpending(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const tScope = tripIds === 'all'
    ? sql`t.agency_id = ${agencyId}`
    : sql`t.id IN ${sqlIdList(tripIds)}`
  const { page, pageSize } = options

  const sortCol = options.sortBy === 'totalSpendCents'
    ? sql`total_spend_cents`
    : options.sortBy === 'tripCount'
      ? sql`trip_count`
      : options.sortBy === 'avgTripValueCents'
        ? sql`avg_trip_value_cents`
        : sql`total_spend_cents`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT c.id)::int AS total_rows
    FROM contacts c
    JOIN trip_travelers tt ON tt.contact_id = c.id
    JOIN trips t ON t.id = tt.trip_id
    WHERE ${cScope}
      AND ${tScope}
      AND t.status IN ('active', 'travelling', 'travelled')
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      count(DISTINCT t.id)::int AS trip_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_spend_cents,
      CASE
        WHEN count(DISTINCT t.id) > 0
        THEN (coalesce(sum(ap.total_price_cents), 0) / count(DISTINCT t.id))::bigint
        ELSE 0
      END AS avg_trip_value_cents,
      min(t.start_date) AS first_trip_date,
      max(t.start_date) AS last_trip_date
    FROM contacts c
    JOIN trip_travelers tt ON tt.contact_id = c.id
    JOIN trips t ON t.id = tt.trip_id
    LEFT JOIN (
      SELECT
        COALESCE(itin2.trip_id, ia2.trip_id) AS trip_id,
        ap2.total_price_cents
      FROM activity_pricing ap2
      JOIN itinerary_activities ia2 ON ia2.id = ap2.activity_id
      LEFT JOIN itinerary_days iday2 ON iday2.id = ia2.itinerary_day_id
      LEFT JOIN itineraries itin2 ON itin2.id = iday2.itinerary_id
      WHERE ia2.booking_status = 'booked'
        AND ia2.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
    ) ap ON ap.trip_id = t.id
    WHERE ${cScope}
      AND ${tScope}
      AND t.status IN ('active', 'travelling', 'travelled')
    GROUP BY c.id, c.first_name, c.last_name, c.email
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    tripCount: Number(row.trip_count ?? 0),
    totalSpendCents: Number(row.total_spend_cents ?? 0),
    avgTripValueCents: Number(row.avg_trip_value_cents ?? 0),
    firstTripDate: row.first_trip_date ? String(row.first_trip_date) : null,
    lastTripDate: row.last_trip_date ? String(row.last_trip_date) : null,
    currency: 'CAD',
  }))

  return { data, totalRows }
}

// ============================================================================
// 2. Repeat Clients
// ============================================================================

/**
 * Contacts with 2+ trips. Calculate avg days between trips using LAG window.
 */
export async function queryRepeatClients(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const tScope = tripIds === 'all'
    ? sql`t.agency_id = ${agencyId}`
    : sql`t.id IN ${sqlIdList(tripIds)}`
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows FROM (
      SELECT 1
      FROM contacts c
      JOIN trip_travelers tt ON tt.contact_id = c.id
      JOIN trips t ON t.id = tt.trip_id
      WHERE ${cScope}
        AND ${tScope}
        AND t.status IN ('active', 'travelling', 'travelled')
      GROUP BY c.id
      HAVING count(DISTINCT t.id) >= 2
    ) sub
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    WITH contact_trips AS (
      SELECT
        c.id AS contact_id,
        c.first_name,
        c.last_name,
        c.email,
        t.id AS trip_id,
        t.start_date,
        ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.start_date) AS rn,
        LAG(t.start_date) OVER (PARTITION BY c.id ORDER BY t.start_date) AS prev_start_date
      FROM contacts c
      JOIN trip_travelers tt ON tt.contact_id = c.id
      JOIN trips t ON t.id = tt.trip_id
      WHERE ${cScope}
        AND ${tScope}
        AND t.status IN ('active', 'travelling', 'travelled')
    )
    SELECT
      contact_id,
      first_name,
      last_name,
      email,
      count(DISTINCT trip_id)::int AS trip_count,
      round(avg(
        CASE WHEN prev_start_date IS NOT NULL
          THEN (start_date::date - prev_start_date::date)
          ELSE NULL
        END
      ))::int AS avg_days_between_trips,
      min(start_date) AS first_trip_date,
      max(start_date) AS last_trip_date
    FROM contact_trips
    GROUP BY contact_id, first_name, last_name, email
    HAVING count(DISTINCT trip_id) >= 2
    ORDER BY trip_count DESC, last_name ASC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    tripCount: Number(row.trip_count ?? 0),
    totalSpendCents: 0,
    avgDaysBetweenTrips: row.avg_days_between_trips != null ? Number(row.avg_days_between_trips) : null,
    firstTripDate: row.first_trip_date ? String(row.first_trip_date) : null,
    lastTripDate: row.last_trip_date ? String(row.last_trip_date) : null,
    currency: 'CAD',
  }))

  return { data, totalRows }
}

// ============================================================================
// 3. Dormant Clients
// ============================================================================

/**
 * Contacts where last trip end_date > N days ago (default 365).
 * Include lifetime spend and trip count.
 */
export async function queryDormantClients(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const tScope = tripIds === 'all'
    ? sql`t.agency_id = ${agencyId}`
    : sql`t.id IN ${sqlIdList(tripIds)}`
  const daysThreshold = options.daysThreshold ?? 365
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows FROM (
      SELECT 1
      FROM contacts c
      JOIN trip_travelers tt ON tt.contact_id = c.id
      JOIN trips t ON t.id = tt.trip_id
      WHERE ${cScope}
        AND ${tScope}
        AND t.status IN ('active', 'travelling', 'travelled')
      GROUP BY c.id
      HAVING max(coalesce(t.end_date::date, t.start_date::date)) < CURRENT_DATE - ${daysThreshold}::int
    ) sub
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      count(DISTINCT t.id)::int AS trip_count,
      max(coalesce(t.end_date::date, t.start_date::date)) AS last_trip_end_date,
      (CURRENT_DATE - max(coalesce(t.end_date::date, t.start_date::date)))::int AS days_since_last_trip,
      coalesce(spend.lifetime_spend_cents, 0)::bigint AS lifetime_spend_cents
    FROM contacts c
    JOIN trip_travelers tt ON tt.contact_id = c.id
    JOIN trips t ON t.id = tt.trip_id
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(ap2.total_price_cents), 0) AS lifetime_spend_cents
      FROM activity_pricing ap2
      JOIN itinerary_activities ia2 ON ia2.id = ap2.activity_id
      LEFT JOIN itinerary_days iday2 ON iday2.id = ia2.itinerary_day_id
      LEFT JOIN itineraries itin2 ON itin2.id = iday2.itinerary_id
      JOIN trips t2 ON t2.id = COALESCE(itin2.trip_id, ia2.trip_id)
      JOIN trip_travelers tt2 ON tt2.trip_id = t2.id AND tt2.contact_id = c.id
      WHERE ia2.booking_status = 'booked'
        AND ia2.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
        AND t2.status IN ('active', 'travelling', 'travelled')
    ) spend ON true
    WHERE ${cScope}
      AND ${tScope}
      AND t.status IN ('active', 'travelling', 'travelled')
    GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, spend.lifetime_spend_cents
    HAVING max(coalesce(t.end_date::date, t.start_date::date)) < CURRENT_DATE - ${daysThreshold}::int
    ORDER BY days_since_last_trip DESC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    phone: row.phone,
    agentName: null as string | null,
    tripCount: Number(row.trip_count ?? 0),
    lastTripDate: row.last_trip_end_date ? String(row.last_trip_end_date) : null,
    daysSinceLastTrip: Number(row.days_since_last_trip ?? 0),
    lifetimeSpendCents: Number(row.lifetime_spend_cents ?? 0),
    currency: 'CAD',
  }))

  return { data, totalRows }
}

// ============================================================================
// 4. Passport Expiry
// ============================================================================

/**
 * Contacts with passport_expiry within N days of today (default 180).
 * Join to upcoming trips via trip_travelers.
 */
export async function queryPassportExpiry(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const daysThreshold = options.daysThreshold ?? 180
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT c.id)::int AS total_rows
    FROM contacts c
    WHERE ${cScope}
      AND c.passport_expiry IS NOT NULL
      AND c.passport_expiry::date >= CURRENT_DATE
      AND c.passport_expiry::date <= CURRENT_DATE + ${daysThreshold}::int
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.passport_number,
      c.passport_expiry,
      c.passport_country,
      (c.passport_expiry::date - CURRENT_DATE)::int AS days_until_expiry,
      upcoming.trip_id AS upcoming_trip_id,
      upcoming.trip_name AS upcoming_trip_name,
      upcoming.departure_date AS upcoming_departure_date
    FROM contacts c
    LEFT JOIN LATERAL (
      SELECT
        t.id AS trip_id,
        t.name AS trip_name,
        t.start_date AS departure_date
      FROM trip_travelers tt
      JOIN trips t ON t.id = tt.trip_id
      WHERE tt.contact_id = c.id
        AND t.status IN ('active', 'travelling')
        AND t.start_date >= CURRENT_DATE
      ORDER BY t.start_date ASC
      LIMIT 1
    ) upcoming ON true
    WHERE ${cScope}
      AND c.passport_expiry IS NOT NULL
      AND c.passport_expiry::date >= CURRENT_DATE
      AND c.passport_expiry::date <= CURRENT_DATE + ${daysThreshold}::int
    ORDER BY c.passport_expiry::date ASC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    travelerName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    phone: row.phone,
    passportNumber: row.passport_number,
    passportExpiry: row.passport_expiry ? String(row.passport_expiry) : null,
    nationality: row.passport_country,
    daysUntilExpiry: Number(row.days_until_expiry ?? 0),
    upcomingTripId: row.upcoming_trip_id,
    upcomingTripName: row.upcoming_trip_name,
    upcomingTripDate: row.upcoming_departure_date ? String(row.upcoming_departure_date) : null,
  }))

  return { data, totalRows }
}

// ============================================================================
// 5. Upcoming Birthdays
// ============================================================================

/**
 * Contacts with date_of_birth. Filter to next N days (default 30).
 * Uses modular arithmetic to compute next birthday.
 */
export async function queryUpcomingBirthdays(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const daysThreshold = options.daysThreshold ?? 30
  const { page, pageSize } = options

  // Calculate next birthday: take DOB, add enough years to get next occurrence
  // next_birthday = date_of_birth + interval '1 year' * (extract(year from age(date_of_birth)) + 1)
  // but if birthday already passed this year, it needs +1 year
  // Simpler: compute this year's birthday, if past add 1 year
  const birthdayCalc = sql`
    CASE
      WHEN (date_of_birth + (EXTRACT(YEAR FROM AGE(date_of_birth))::int * INTERVAL '1 year')) >= CURRENT_DATE
      THEN (date_of_birth + (EXTRACT(YEAR FROM AGE(date_of_birth))::int * INTERVAL '1 year'))::date
      ELSE (date_of_birth + ((EXTRACT(YEAR FROM AGE(date_of_birth))::int + 1) * INTERVAL '1 year'))::date
    END
  `

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM contacts c
    WHERE ${cScope}
      AND c.date_of_birth IS NOT NULL
      AND ${birthdayCalc} >= CURRENT_DATE
      AND ${birthdayCalc} <= CURRENT_DATE + ${daysThreshold}::int
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.date_of_birth,
      EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS current_age,
      ${birthdayCalc} AS next_birthday,
      (${birthdayCalc} - CURRENT_DATE)::int AS days_until_birthday
    FROM contacts c
    WHERE ${cScope}
      AND c.date_of_birth IS NOT NULL
      AND ${birthdayCalc} >= CURRENT_DATE
      AND ${birthdayCalc} <= CURRENT_DATE + ${daysThreshold}::int
    ORDER BY days_until_birthday ASC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    phone: row.phone,
    birthDate: row.date_of_birth ? String(row.date_of_birth) : null,
    age: Number(row.current_age ?? 0),
    agentName: null as string | null,
    nextBirthday: row.next_birthday ? String(row.next_birthday) : null,
    daysUntilBirthday: Number(row.days_until_birthday ?? 0),
  }))

  return { data, totalRows }
}

// ============================================================================
// 6. New Clients
// ============================================================================

/**
 * Contacts created within date range.
 * LEFT JOIN trip_travelers to show if they have a trip booked.
 */
export async function queryNewClients(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const startDate = options.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const endDate = options.endDate ?? new Date().toISOString().slice(0, 10)
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT c.id)::int AS total_rows
    FROM contacts c
    WHERE ${cScope}
      AND c.created_at >= ${startDate}::timestamptz
      AND c.created_at <= ${endDate}::timestamptz
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.contact_type,
      c.created_at,
      CASE WHEN tt.trip_id IS NOT NULL THEN true ELSE false END AS has_trip,
      trip_info.trip_id,
      trip_info.trip_name,
      trip_info.trip_status
    FROM contacts c
    LEFT JOIN LATERAL (
      SELECT tt2.trip_id
      FROM trip_travelers tt2
      WHERE tt2.contact_id = c.id
      LIMIT 1
    ) tt ON true
    LEFT JOIN LATERAL (
      SELECT t.id AS trip_id, t.name AS trip_name, t.status AS trip_status
      FROM trips t
      WHERE t.id = tt.trip_id
      LIMIT 1
    ) trip_info ON tt.trip_id IS NOT NULL
    WHERE ${cScope}
      AND c.created_at >= ${startDate}::timestamptz
      AND c.created_at <= ${endDate}::timestamptz
    ORDER BY c.created_at DESC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    phone: row.phone,
    agentName: null as string | null,
    contactType: row.contact_type,
    createdAt: row.created_at ? String(row.created_at) : null,
    hasTrip: row.has_trip === true || row.has_trip === 't',
    firstTripDate: null as string | null,
    tripId: row.trip_id,
    tripName: row.trip_name,
    tripStatus: row.trip_status,
  }))

  return { data, totalRows }
}

// ============================================================================
// 7. Client Data Completeness
// ============================================================================

/**
 * Score each contact: check for email, phone, address_line1, date_of_birth,
 * passport_number. Score = 20pts each present (max 100). Return score and
 * missing fields array.
 */
export async function queryClientCompleteness(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const sortCol = options.sortBy === 'completenessScore'
    ? sql`completeness_score`
    : options.sortBy === 'clientName'
      ? sql`c.last_name`
      : sql`completeness_score`
  const sortDir = options.sortOrder === 'desc' ? sql`DESC` : sql`ASC`

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM contacts c
    WHERE ${cScope}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.address_line1,
      c.date_of_birth,
      c.passport_number,
      (
        CASE WHEN c.email IS NOT NULL AND c.email != '' THEN 20 ELSE 0 END +
        CASE WHEN c.phone IS NOT NULL AND c.phone != '' THEN 20 ELSE 0 END +
        CASE WHEN c.address_line1 IS NOT NULL AND c.address_line1 != '' THEN 20 ELSE 0 END +
        CASE WHEN c.date_of_birth IS NOT NULL THEN 20 ELSE 0 END +
        CASE WHEN c.passport_number IS NOT NULL AND c.passport_number != '' THEN 20 ELSE 0 END
      ) AS completeness_score
    FROM contacts c
    WHERE ${cScope}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => {
    const missing: string[] = []
    if (!row.email) missing.push('email')
    if (!row.phone) missing.push('phone')
    if (!row.address_line1) missing.push('address')
    if (!row.date_of_birth) missing.push('dateOfBirth')
    if (!row.passport_number) missing.push('passport')

    return {
      contactId: row.contact_id,
      clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
      hasEmail: !!row.email,
      hasPhone: !!row.phone,
      hasAddress: !!row.address_line1,
      hasDob: !!row.date_of_birth,
      hasPassport: !!row.passport_number,
      completenessScore: Number(row.completeness_score ?? 0),
      missingFields: missing,
    }
  })

  // Summary: average completeness
  const summaryResult = await db.client.execute(sql`
    SELECT
      round(avg(
        CASE WHEN c.email IS NOT NULL AND c.email != '' THEN 20 ELSE 0 END +
        CASE WHEN c.phone IS NOT NULL AND c.phone != '' THEN 20 ELSE 0 END +
        CASE WHEN c.address_line1 IS NOT NULL AND c.address_line1 != '' THEN 20 ELSE 0 END +
        CASE WHEN c.date_of_birth IS NOT NULL THEN 20 ELSE 0 END +
        CASE WHEN c.passport_number IS NOT NULL AND c.passport_number != '' THEN 20 ELSE 0 END
      ), 1)::numeric AS avg_completeness,
      count(*) FILTER (WHERE
        c.email IS NOT NULL AND c.email != '' AND
        c.phone IS NOT NULL AND c.phone != '' AND
        c.address_line1 IS NOT NULL AND c.address_line1 != '' AND
        c.date_of_birth IS NOT NULL AND
        c.passport_number IS NOT NULL AND c.passport_number != ''
      )::int AS fully_complete_count,
      count(*)::int AS total_contacts
    FROM contacts c
    WHERE ${cScope}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      avgCompleteness: Number(summaryRow?.avg_completeness ?? 0),
      fullyCompleteCount: Number(summaryRow?.fully_complete_count ?? 0),
      totalContacts: Number(summaryRow?.total_contacts ?? 0),
    },
  }
}

// ============================================================================
// 8. Top Clients by Revenue
// ============================================================================

/**
 * Top N contacts by total spend. Same joins as clientSpending but sorted desc,
 * pageSize as limit.
 */
export async function queryTopClientsRevenue(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: CrmQueryOptions,
): Promise<CrmQueryResult> {
  const cScope = contactScopeFilter(tripIds, agencyId)
  const tScope = tripIds === 'all'
    ? sql`t.agency_id = ${agencyId}`
    : sql`t.id IN ${sqlIdList(tripIds)}`
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT c.id)::int AS total_rows
    FROM contacts c
    JOIN trip_travelers tt ON tt.contact_id = c.id
    JOIN trips t ON t.id = tt.trip_id
    WHERE ${cScope}
      AND ${tScope}
      AND t.status IN ('active', 'travelling', 'travelled')
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      count(DISTINCT t.id)::int AS trip_count,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_spend_cents,
      CASE
        WHEN count(DISTINCT t.id) > 0
        THEN (coalesce(sum(ap.total_price_cents), 0) / count(DISTINCT t.id))::bigint
        ELSE 0
      END AS avg_trip_value_cents,
      min(t.start_date) AS first_trip_date,
      max(t.start_date) AS last_trip_date
    FROM contacts c
    JOIN trip_travelers tt ON tt.contact_id = c.id
    JOIN trips t ON t.id = tt.trip_id
    LEFT JOIN (
      SELECT
        COALESCE(itin2.trip_id, ia2.trip_id) AS trip_id,
        ap2.total_price_cents
      FROM activity_pricing ap2
      JOIN itinerary_activities ia2 ON ia2.id = ap2.activity_id
      LEFT JOIN itinerary_days iday2 ON iday2.id = ia2.itinerary_day_id
      LEFT JOIN itineraries itin2 ON itin2.id = iday2.itinerary_id
      WHERE ia2.booking_status = 'booked'
        AND ia2.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
    ) ap ON ap.trip_id = t.id
    WHERE ${cScope}
      AND ${tScope}
      AND t.status IN ('active', 'travelling', 'travelled')
    GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone
    ORDER BY total_spend_cents DESC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    contactId: row.contact_id,
    clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown',
    email: row.email,
    phone: row.phone,
    tripCount: Number(row.trip_count ?? 0),
    totalSpendCents: Number(row.total_spend_cents ?? 0),
    avgTripValueCents: Number(row.avg_trip_value_cents ?? 0),
    firstTripDate: row.first_trip_date ? String(row.first_trip_date) : null,
    lastTripDate: row.last_trip_date ? String(row.last_trip_date) : null,
    currency: 'CAD',
  }))

  return { data, totalRows }
}
