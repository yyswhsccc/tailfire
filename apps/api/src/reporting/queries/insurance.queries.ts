/**
 * Insurance Report Query Builders
 *
 * 5 insurance queries: penetration rate, declines, revenue, policy type breakdown,
 * unresolved (pending) travelers.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - trip_insurance_packages: id, trip_id, provider_name, package_name,
 *                              policy_type, premium_cents, coverage_amount_cents,
 *                              deductible_cents, currency, is_active
 *   - trip_traveler_insurance: id, trip_id, trip_traveler_id, status,
 *                              selected_package_id, acknowledged_at, declined_at,
 *                              declined_reason, premium_paid_cents
 *   - trip_travelers: id, trip_id, contact_id
 *   - contacts: id, first_name, last_name, email, phone
 *   - trips: id, agency_id, name, status, start_date, end_date, reference_number
 */

import { sql } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'
import { tripScopeFilter, paginationSql } from './sales.queries'

// ============================================================================
// Types
// ============================================================================

export interface InsuranceQueryOptions {
  startDate?: string
  endDate?: string
  daysThreshold?: number
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface InsuranceQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// 1. Insurance Penetration Rate
// ============================================================================

/**
 * Monthly: total travelers vs covered vs declined vs pending.
 * Covered = trip_traveler_insurance.status IN ('selected_package', 'has_own_insurance').
 * Group by month of trip start_date.
 */
export async function queryInsurancePenetration(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: InsuranceQueryOptions,
): Promise<InsuranceQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const startDate = options.startDate
  const endDate = options.endDate
  const { page, pageSize } = options

  const dateFilter = startDate && endDate
    ? sql`AND t.start_date >= ${startDate}::date AND t.start_date <= ${endDate}::date`
    : sql``

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT to_char(t.start_date, 'YYYY-MM'))::int AS total_rows
    FROM trips t
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND t.start_date IS NOT NULL
      ${dateFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      to_char(t.start_date, 'YYYY-MM') AS month_label,
      count(DISTINCT tt.id)::int AS total_travelers,
      count(DISTINCT tt.id) FILTER (
        WHERE tti.status IN ('selected_package', 'has_own_insurance')
      )::int AS covered_travelers,
      count(DISTINCT tt.id) FILTER (
        WHERE tti.status = 'declined'
      )::int AS declined_travelers,
      count(DISTINCT tt.id) FILTER (
        WHERE tti.status = 'pending' OR tti.id IS NULL
      )::int AS pending_travelers,
      CASE
        WHEN count(DISTINCT tt.id) > 0
        THEN round(
          count(DISTINCT tt.id) FILTER (
            WHERE tti.status IN ('selected_package', 'has_own_insurance')
          )::numeric / count(DISTINCT tt.id)::numeric * 100, 1
        )
        ELSE 0
      END AS penetration_rate
    FROM trips t
    JOIN trip_travelers tt ON tt.trip_id = t.id
    LEFT JOIN trip_traveler_insurance tti ON tti.trip_traveler_id = tt.id AND tti.trip_id = t.id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND t.start_date IS NOT NULL
      ${dateFilter}
    GROUP BY month_label
    ORDER BY month_label ASC
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    monthLabel: row.month_label,
    totalTravelers: Number(row.total_travelers ?? 0),
    coveredTravelers: Number(row.covered_travelers ?? 0),
    declinedTravelers: Number(row.declined_travelers ?? 0),
    pendingTravelers: Number(row.pending_travelers ?? 0),
    penetrationRate: Number(row.penetration_rate ?? 0),
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT tt.id)::int AS total_travelers,
      count(DISTINCT tt.id) FILTER (
        WHERE tti.status IN ('selected_package', 'has_own_insurance')
      )::int AS covered_travelers,
      CASE
        WHEN count(DISTINCT tt.id) > 0
        THEN round(
          count(DISTINCT tt.id) FILTER (
            WHERE tti.status IN ('selected_package', 'has_own_insurance')
          )::numeric / count(DISTINCT tt.id)::numeric * 100, 1
        )
        ELSE 0
      END AS overall_penetration_rate
    FROM trips t
    JOIN trip_travelers tt ON tt.trip_id = t.id
    LEFT JOIN trip_traveler_insurance tti ON tti.trip_traveler_id = tt.id AND tti.trip_id = t.id
    WHERE ${scope}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND t.start_date IS NOT NULL
      ${dateFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalTravelers: Number(summaryRow?.total_travelers ?? 0),
      coveredTravelers: Number(summaryRow?.covered_travelers ?? 0),
      overallPenetrationRate: Number(summaryRow?.overall_penetration_rate ?? 0),
    },
  }
}

// ============================================================================
// 2. Insurance Declines
// ============================================================================

/**
 * trip_traveler_insurance.status = 'declined'.
 * Join to contacts for names, trips for trip info.
 * Include acknowledged_at for compliance tracking.
 * Flag if NOT acknowledged (acknowledged_at IS NULL).
 */
export async function queryInsuranceDeclines(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: InsuranceQueryOptions,
): Promise<InsuranceQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const dateFilter = options.startDate && options.endDate
    ? sql`AND t.start_date >= ${options.startDate}::date AND t.start_date <= ${options.endDate}::date`
    : sql``

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    WHERE ${scope}
      AND tti.status = 'declined'
      ${dateFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      tti.id AS insurance_record_id,
      t.id AS trip_id,
      t.name AS trip_name,
      t.reference_number,
      t.start_date AS departure_date,
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      tti.declined_reason,
      tti.declined_at,
      tti.acknowledged_at,
      CASE WHEN tti.acknowledged_at IS NULL THEN true ELSE false END AS not_acknowledged
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    JOIN trip_travelers tt ON tt.id = tti.trip_traveler_id
    JOIN contacts c ON c.id = tt.contact_id
    WHERE ${scope}
      AND tti.status = 'declined'
      ${dateFilter}
    ORDER BY
      CASE WHEN tti.acknowledged_at IS NULL THEN 0 ELSE 1 END ASC,
      t.start_date ASC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    insuranceRecordId: row.insurance_record_id,
    tripId: row.trip_id,
    tripName: row.trip_name,
    referenceNumber: row.reference_number,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    contactId: row.contact_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    declinedReason: row.declined_reason,
    declinedAt: row.declined_at ? String(row.declined_at) : null,
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    notAcknowledged: row.not_acknowledged === true || row.not_acknowledged === 't',
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_declines,
      count(*) FILTER (WHERE tti.acknowledged_at IS NULL)::int AS unacknowledged_count
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    WHERE ${scope}
      AND tti.status = 'declined'
      ${dateFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalDeclines: Number(summaryRow?.total_declines ?? 0),
      unacknowledgedCount: Number(summaryRow?.unacknowledged_count ?? 0),
    },
  }
}

// ============================================================================
// 3. Insurance Revenue
// ============================================================================

/**
 * Group by trip_insurance_packages.provider_name, package_name.
 * SUM premium_cents. Count traveler selections via trip_traveler_insurance
 * where status = 'selected_package'.
 */
export async function queryInsuranceRevenue(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: InsuranceQueryOptions,
): Promise<InsuranceQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const dateFilter = options.startDate && options.endDate
    ? sql`AND t.start_date >= ${options.startDate}::date AND t.start_date <= ${options.endDate}::date`
    : sql``

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows FROM (
      SELECT 1
      FROM trip_insurance_packages tip
      JOIN trips t ON t.id = tip.trip_id
      WHERE ${scope}
        AND tip.is_active = true
        ${dateFilter}
      GROUP BY tip.provider_name, tip.package_name
    ) sub
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      tip.provider_name,
      tip.package_name,
      tip.policy_type,
      count(DISTINCT tip.id)::int AS package_count,
      coalesce(sum(tip.premium_cents), 0)::bigint AS total_premium_cents,
      coalesce(selections.traveler_count, 0)::int AS traveler_selections
    FROM trip_insurance_packages tip
    JOIN trips t ON t.id = tip.trip_id
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT tti.id) AS traveler_count
      FROM trip_traveler_insurance tti
      WHERE tti.selected_package_id = tip.id
        AND tti.status = 'selected_package'
    ) selections ON true
    WHERE ${scope}
      AND tip.is_active = true
      ${dateFilter}
    GROUP BY tip.provider_name, tip.package_name, tip.policy_type, selections.traveler_count
    ORDER BY total_premium_cents DESC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    providerName: row.provider_name,
    packageName: row.package_name,
    policyType: row.policy_type,
    packageCount: Number(row.package_count ?? 0),
    totalPremiumCents: Number(row.total_premium_cents ?? 0),
    travelerSelections: Number(row.traveler_selections ?? 0),
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT tip.provider_name)::int AS provider_count,
      coalesce(sum(tip.premium_cents), 0)::bigint AS total_premium_cents,
      (
        SELECT count(*)::int
        FROM trip_traveler_insurance tti2
        JOIN trips t2 ON t2.id = tti2.trip_id
        WHERE t2.agency_id = ${agencyId}
          AND tti2.status = 'selected_package'
      ) AS total_selections
    FROM trip_insurance_packages tip
    JOIN trips t ON t.id = tip.trip_id
    WHERE ${scope}
      AND tip.is_active = true
      ${dateFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      providerCount: Number(summaryRow?.provider_count ?? 0),
      totalPremiumCents: Number(summaryRow?.total_premium_cents ?? 0),
      totalSelections: Number(summaryRow?.total_selections ?? 0),
    },
  }
}

// ============================================================================
// 4. Insurance by Policy Type
// ============================================================================

/**
 * Group by trip_insurance_packages.policy_type enum.
 * Count packages, travelers, SUM premiums. Calculate avg premium.
 */
export async function queryInsuranceByPolicyType(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: InsuranceQueryOptions,
): Promise<InsuranceQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const dateFilter = options.startDate && options.endDate
    ? sql`AND t.start_date >= ${options.startDate}::date AND t.start_date <= ${options.endDate}::date`
    : sql``

  const countResult = await db.client.execute(sql`
    SELECT count(DISTINCT tip.policy_type)::int AS total_rows
    FROM trip_insurance_packages tip
    JOIN trips t ON t.id = tip.trip_id
    WHERE ${scope}
      AND tip.is_active = true
      ${dateFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      tip.policy_type,
      count(DISTINCT tip.id)::int AS package_count,
      coalesce(sum(tip.premium_cents), 0)::bigint AS total_premium_cents,
      CASE
        WHEN count(DISTINCT tip.id) > 0
        THEN (coalesce(sum(tip.premium_cents), 0) / count(DISTINCT tip.id))::bigint
        ELSE 0
      END AS avg_premium_cents,
      coalesce(traveler_counts.traveler_count, 0)::int AS traveler_count
    FROM trip_insurance_packages tip
    JOIN trips t ON t.id = tip.trip_id
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT tti.id) AS traveler_count
      FROM trip_traveler_insurance tti
      WHERE tti.selected_package_id IN (
        SELECT tip2.id FROM trip_insurance_packages tip2
        WHERE tip2.policy_type = tip.policy_type
          AND tip2.trip_id = tip.trip_id
      )
      AND tti.status = 'selected_package'
    ) traveler_counts ON true
    WHERE ${scope}
      AND tip.is_active = true
      ${dateFilter}
    GROUP BY tip.policy_type, traveler_counts.traveler_count
    ORDER BY total_premium_cents DESC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    policyType: row.policy_type,
    packageCount: Number(row.package_count ?? 0),
    totalPremiumCents: Number(row.total_premium_cents ?? 0),
    avgPremiumCents: Number(row.avg_premium_cents ?? 0),
    travelerCount: Number(row.traveler_count ?? 0),
  }))

  return { data, totalRows }
}

// ============================================================================
// 5. Insurance Unresolved (Pending)
// ============================================================================

/**
 * trip_traveler_insurance.status = 'pending' on trips departing within 90 days.
 * Join trips, contacts for names.
 * Sort by departure date asc (most urgent first).
 */
export async function queryInsuranceUnresolved(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: InsuranceQueryOptions,
): Promise<InsuranceQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const daysThreshold = options.daysThreshold ?? 90
  const { page, pageSize } = options

  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    WHERE ${scope}
      AND tti.status = 'pending'
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  const dataResult = await db.client.execute(sql`
    SELECT
      tti.id AS insurance_record_id,
      t.id AS trip_id,
      t.name AS trip_name,
      t.reference_number,
      t.start_date AS departure_date,
      (t.start_date::date - CURRENT_DATE)::int AS days_until_departure,
      c.id AS contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      tti.created_at AS pending_since
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    JOIN trip_travelers tt ON tt.id = tti.trip_traveler_id
    JOIN contacts c ON c.id = tt.contact_id
    WHERE ${scope}
      AND tti.status = 'pending'
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
    ORDER BY t.start_date ASC NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    insuranceRecordId: row.insurance_record_id,
    tripId: row.trip_id,
    tripName: row.trip_name,
    referenceNumber: row.reference_number,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    daysUntilDeparture: Number(row.days_until_departure ?? 0),
    contactId: row.contact_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    pendingSince: row.pending_since ? String(row.pending_since) : null,
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_pending,
      count(*) FILTER (
        WHERE t.start_date <= CURRENT_DATE + 30
      )::int AS urgent_within_30_days,
      count(DISTINCT t.id)::int AS affected_trips
    FROM trip_traveler_insurance tti
    JOIN trips t ON t.id = tti.trip_id
    WHERE ${scope}
      AND tti.status = 'pending'
      AND t.status IN ('active', 'travelling')
      AND t.start_date >= CURRENT_DATE
      AND t.start_date <= CURRENT_DATE + ${daysThreshold}::int
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalPending: Number(summaryRow?.total_pending ?? 0),
      urgentWithin30Days: Number(summaryRow?.urgent_within_30_days ?? 0),
      affectedTrips: Number(summaryRow?.affected_trips ?? 0),
    },
  }
}
