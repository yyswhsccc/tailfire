/**
 * Financial Report Query Builders
 *
 * Commission aging, reconciliation, payment schedule, and agent commission
 * statement queries.
 *
 * DB column names verified against Drizzle schema definitions:
 *   - commission_tracking.component_pricing_id (legacy FK → activity_pricing.id)
 *   - commission_tracking.gross_commission_cents, received_cents, paid_cents, commission_rate
 *   - commission_checks.check_number, check_date, check_amount_cents, sender_name, status
 *   - commission_check_items.check_id, activity_pricing_id, received_cents, projected_cents
 *   - expected_payment_items.payment_schedule_config_id, payment_name, expected_amount_cents,
 *     due_date, status, paid_amount_cents, contact_id
 *   - payment_schedule_config.component_pricing_id (legacy FK → activity_pricing.id)
 *   - payment_transactions.expected_payment_item_id, amount_cents, transaction_type
 */

import { sql } from 'drizzle-orm'
import type { DatabaseService } from '../../db/database.service'
import {
  sqlIdList,
  tripScopeFilter,
  paginationSql,
  TRIP_AGENT_LATERAL,
  TRIP_PRIMARY_AGENT_ID,
} from './sales.queries'

// Re-export shared helpers for downstream consumers
export { sqlIdList, tripScopeFilter }

// ============================================================================
// Types
// ============================================================================

export interface FinancialQueryOptions {
  startDate?: string  // ISO date string
  endDate?: string    // ISO date string
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  agentId?: string
}

export interface FinancialQueryResult {
  data: any[]
  totalRows: number
  summary?: Record<string, any>
}

// ============================================================================
// Shared SQL fragments
// ============================================================================

/** Canonical FROM for commission_tracking → activity_pricing → trip */
const CT_CANONICAL_JOIN = sql`
  FROM commission_tracking ct
  JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
  JOIN itinerary_activities ia ON ia.id = ap.activity_id
  LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
  LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
  JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
  ${TRIP_AGENT_LATERAL}
`

/** Informational activity types to exclude */
const EXCLUDED_ACTIVITY_TYPES = sql`('port_info', 'tour_day')`

// ============================================================================
// 1. Commission Aging
// ============================================================================

/**
 * Per-activity commission aging for departed trips.
 *
 * Shows every commission_tracking row where gross > received, on trips that
 * have status IN ('travelling','travelled').  Buckets by days since departure.
 */
export async function queryCommissionAging(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: FinancialQueryOptions,
): Promise<FinancialQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const agentFilter = options.agentId
    ? sql`AND ${TRIP_PRIMARY_AGENT_ID} = ${options.agentId}`
    : sql``

  const sortCol = options.sortBy === 'daysSinceDeparture'
    ? sql`days_since_departure`
    : options.sortBy === 'outstanding'
      ? sql`outstanding`
      : options.sortBy === 'departureDate'
        ? sql`departure_date`
        : sql`days_since_departure`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Count
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    ${CT_CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('travelling', 'travelled')
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(ct.gross_commission_cents, 0) > coalesce(ct.received_cents, 0)
      ${agentFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data
  const dataResult = await db.client.execute(sql`
    SELECT
      ct.id AS commission_tracking_id,
      ia.name AS activity_name,
      ap.supplier,
      t.name AS trip_name,
      t.id AS trip_id,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      coalesce(ct.gross_commission_cents, 0)::int AS expected_cents,
      coalesce(ct.received_cents, 0)::int AS received_cents,
      (coalesce(ct.gross_commission_cents, 0) - coalesce(ct.received_cents, 0))::int AS outstanding,
      t.start_date AS departure_date,
      (CURRENT_DATE - t.start_date::date)::int AS days_since_departure,
      CASE
        WHEN (CURRENT_DATE - t.start_date::date) <= 30 THEN '0-30'
        WHEN (CURRENT_DATE - t.start_date::date) <= 60 THEN '31-60'
        WHEN (CURRENT_DATE - t.start_date::date) <= 90 THEN '61-90'
        ELSE '90+'
      END AS aging_bucket
    ${CT_CANONICAL_JOIN}
    LEFT JOIN user_profiles up ON up.id = ${TRIP_PRIMARY_AGENT_ID}
    WHERE ${scope}
      AND t.status IN ('travelling', 'travelled')
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(ct.gross_commission_cents, 0) > coalesce(ct.received_cents, 0)
      ${agentFilter}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    commissionTrackingId: row.commission_tracking_id,
    activityName: row.activity_name,
    supplierName: row.supplier,
    tripName: row.trip_name,
    tripId: row.trip_id,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    expectedCents: Number(row.expected_cents ?? 0),
    receivedCents: Number(row.received_cents ?? 0),
    outstandingCents: Number(row.outstanding ?? 0),
    departureDate: row.departure_date ? String(row.departure_date) : null,
    daysSinceDeparture: Number(row.days_since_departure ?? 0),
    agingBucket: row.aging_bucket,
    currency: 'CAD',
  }))

  // Summary: totals by aging bucket
  const summaryResult = await db.client.execute(sql`
    SELECT
      CASE
        WHEN (CURRENT_DATE - t.start_date::date) <= 30 THEN '0-30'
        WHEN (CURRENT_DATE - t.start_date::date) <= 60 THEN '31-60'
        WHEN (CURRENT_DATE - t.start_date::date) <= 90 THEN '61-90'
        ELSE '90+'
      END AS aging_bucket,
      coalesce(sum(coalesce(ct.gross_commission_cents, 0) - coalesce(ct.received_cents, 0)), 0)::bigint AS total_outstanding
    ${CT_CANONICAL_JOIN}
    WHERE ${scope}
      AND t.status IN ('travelling', 'travelled')
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      AND coalesce(ct.gross_commission_cents, 0) > coalesce(ct.received_cents, 0)
      ${agentFilter}
    GROUP BY aging_bucket
    ORDER BY aging_bucket
  `)

  const buckets: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  let grandTotal = 0
  for (const row of summaryResult as any[]) {
    const val = Number(row.total_outstanding ?? 0)
    buckets[row.aging_bucket] = val
    grandTotal += val
  }

  return {
    data,
    totalRows,
    summary: {
      buckets,
      totalOutstanding: grandTotal,
    },
  }
}

// ============================================================================
// 2. Commission Reconciliation
// ============================================================================

/**
 * Admin-level commission check reconciliation.
 *
 * Lists commission_checks with aggregated item data, optionally filtered by
 * date range on check_date.
 */
export async function queryCommissionReconciliation(
  db: DatabaseService,
  agencyId: string,
  options: FinancialQueryOptions,
): Promise<FinancialQueryResult> {
  const { page, pageSize } = options

  const dateFilter = options.startDate && options.endDate
    ? sql`AND cc.check_date >= ${options.startDate}::date AND cc.check_date <= ${options.endDate}::date`
    : sql``

  const sortCol = options.sortBy === 'checkDate'
    ? sql`check_date`
    : options.sortBy === 'checkAmountCents'
      ? sql`check_amount_cents`
      : options.sortBy === 'unmatchedAmount'
        ? sql`unmatched_amount`
        : sql`check_date`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Count
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM commission_checks cc
    WHERE cc.agency_id = ${agencyId}
      ${dateFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data: each check with aggregated item totals
  const dataResult = await db.client.execute(sql`
    SELECT
      cc.id AS check_id,
      cc.check_number,
      cc.check_type,
      coalesce(cc.sender_name, s.name) AS supplier_name,
      cc.check_date,
      cc.check_amount_cents,
      cc.status,
      coalesce(item_agg.total_received_cents, 0)::bigint AS matched_received_cents,
      (cc.check_amount_cents - coalesce(item_agg.total_received_cents, 0))::bigint AS unmatched_amount,
      coalesce(item_agg.item_count, 0)::int AS item_count
    FROM commission_checks cc
    LEFT JOIN suppliers s ON s.id = cc.sender_supplier_id
    LEFT JOIN LATERAL (
      SELECT
        sum(coalesce(cci.received_cents, 0))::bigint AS total_received_cents,
        count(*)::int AS item_count
      FROM commission_check_items cci
      WHERE cci.check_id = cc.id
    ) item_agg ON true
    WHERE cc.agency_id = ${agencyId}
      ${dateFilter}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    checkId: row.check_id,
    checkNumber: row.check_number,
    checkType: row.check_type,
    supplierName: row.supplier_name,
    checkDate: row.check_date ? String(row.check_date) : null,
    checkAmountCents: Number(row.check_amount_cents ?? 0),
    status: row.status,
    matchedAmountCents: Number(row.matched_received_cents ?? 0),
    unmatchedAmountCents: Number(row.unmatched_amount ?? 0),
    itemCount: Number(row.item_count ?? 0),
    currency: 'CAD',
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_checks,
      coalesce(sum(cc.check_amount_cents), 0)::bigint AS total_check_amount,
      coalesce(sum(item_agg.total_received_cents), 0)::bigint AS total_matched,
      (coalesce(sum(cc.check_amount_cents), 0) - coalesce(sum(item_agg.total_received_cents), 0))::bigint AS total_unmatched
    FROM commission_checks cc
    LEFT JOIN LATERAL (
      SELECT sum(coalesce(cci.received_cents, 0))::bigint AS total_received_cents
      FROM commission_check_items cci
      WHERE cci.check_id = cc.id
    ) item_agg ON true
    WHERE cc.agency_id = ${agencyId}
      ${dateFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalChecks: Number(summaryRow?.total_checks ?? 0),
      totalCheckAmount: Number(summaryRow?.total_check_amount ?? 0),
      totalMatched: Number(summaryRow?.total_matched ?? 0),
      totalUnmatched: Number(summaryRow?.total_unmatched ?? 0),
    },
  }
}

// ============================================================================
// 3. Payment Schedule
// ============================================================================

/**
 * Expected payment items with paid amounts and days until due.
 *
 * Joins expected_payment_items → payment_schedule_config → activity_pricing
 * → canonical chain → trips, plus aggregated payment_transactions.
 */
export async function queryPaymentSchedule(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: FinancialQueryOptions,
): Promise<FinancialQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const agentFilter = options.agentId
    ? sql`AND ${TRIP_PRIMARY_AGENT_ID} = ${options.agentId}`
    : sql``

  const sortCol = options.sortBy === 'dueDate'
    ? sql`due_date`
    : options.sortBy === 'remaining'
      ? sql`remaining`
      : options.sortBy === 'daysUntilDue'
        ? sql`days_until_due`
        : sql`due_date`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Count
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    FROM expected_payment_items epi
    JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
    JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data
  const dataResult = await db.client.execute(sql`
    SELECT
      epi.id AS item_id,
      t.id AS trip_id,
      t.name AS trip_name,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      epi.payment_name AS item_label,
      epi.due_date,
      epi.expected_amount_cents,
      epi.paid_amount_cents,
      (epi.expected_amount_cents - epi.paid_amount_cents)::int AS remaining,
      epi.status,
      CASE
        WHEN epi.due_date IS NOT NULL THEN (epi.due_date::date - CURRENT_DATE)::int
        ELSE NULL
      END AS days_until_due
    FROM expected_payment_items epi
    JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
    JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    LEFT JOIN contacts c ON c.id = t.primary_contact_id
    LEFT JOIN user_profiles up ON up.id = ${TRIP_PRIMARY_AGENT_ID}
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    itemId: row.item_id,
    tripId: row.trip_id,
    tripName: row.trip_name,
    clientName: [row.client_first_name, row.client_last_name].filter(Boolean).join(' ') || null,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    itemLabel: row.item_label,
    dueDate: row.due_date ? String(row.due_date) : null,
    amountCents: Number(row.expected_amount_cents ?? 0),
    paidCents: Number(row.paid_amount_cents ?? 0),
    remainingCents: Number(row.remaining ?? 0),
    status: row.status,
    daysUntilDue: row.days_until_due != null ? Number(row.days_until_due) : null,
    currency: 'CAD',
  }))

  // Summary
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(*)::int AS total_items,
      coalesce(sum(epi.expected_amount_cents), 0)::bigint AS total_expected,
      coalesce(sum(epi.paid_amount_cents), 0)::bigint AS total_paid,
      (coalesce(sum(epi.expected_amount_cents), 0) - coalesce(sum(epi.paid_amount_cents), 0))::bigint AS total_remaining,
      count(*) FILTER (WHERE epi.status = 'overdue')::int AS overdue_count,
      coalesce(sum(epi.expected_amount_cents - epi.paid_amount_cents) FILTER (WHERE epi.status = 'overdue'), 0)::bigint AS overdue_amount
    FROM expected_payment_items epi
    JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
    JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      totalItems: Number(summaryRow?.total_items ?? 0),
      totalExpected: Number(summaryRow?.total_expected ?? 0),
      totalPaid: Number(summaryRow?.total_paid ?? 0),
      totalRemaining: Number(summaryRow?.total_remaining ?? 0),
      overdueCount: Number(summaryRow?.overdue_count ?? 0),
      overdueAmount: Number(summaryRow?.overdue_amount ?? 0),
    },
  }
}

// ============================================================================
// 4. Agent Commission Statement
// ============================================================================

/**
 * Per-agent commission detail.
 *
 * Joins commission_tracking → activity_pricing → canonical chain → trips.
 * Optionally filtered by options.agentId.
 * Sorted by trip, then activity.
 */
export async function queryAgentCommissionStatement(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: FinancialQueryOptions,
): Promise<FinancialQueryResult> {
  const scope = tripScopeFilter(tripIds, agencyId)
  const { page, pageSize } = options

  const agentFilter = options.agentId
    ? sql`AND ${TRIP_PRIMARY_AGENT_ID} = ${options.agentId}`
    : sql``

  const sortCol = options.sortBy === 'grossCommission'
    ? sql`gross_commission`
    : options.sortBy === 'totalSalesCents'
      ? sql`total_sales_cents`
      : options.sortBy === 'departureDate'
        ? sql`departure_date`
        : sql`trip_name`
  const sortDir = options.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  // Count
  const countResult = await db.client.execute(sql`
    SELECT count(*)::int AS total_rows
    ${CT_CANONICAL_JOIN}
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
  `)
  const totalRows = Number((countResult as any[])[0]?.total_rows ?? 0)

  // Data
  const dataResult = await db.client.execute(sql`
    SELECT
      ct.id AS commission_tracking_id,
      ia.name AS activity_name,
      t.id AS trip_id,
      t.name AS trip_name,
      ap.supplier,
      t.start_date AS departure_date,
      up.first_name AS agent_first_name,
      up.last_name AS agent_last_name,
      ${TRIP_PRIMARY_AGENT_ID} AS agent_id,
      coalesce(ap.total_price_cents, 0)::bigint AS total_sales_cents,
      ct.commission_rate,
      coalesce(ct.gross_commission_cents, 0)::int AS gross_commission,
      coalesce(ct.received_cents, 0)::int AS received,
      coalesce(ct.paid_cents, 0)::int AS paid_to_agent,
      (coalesce(ct.gross_commission_cents, 0) - coalesce(ct.paid_cents, 0))::int AS pending
    ${CT_CANONICAL_JOIN}
    LEFT JOIN user_profiles up ON up.id = ${TRIP_PRIMARY_AGENT_ID}
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
    ORDER BY t.name ASC, ${sortCol} ${sortDir} NULLS LAST
    ${paginationSql(page, pageSize)}
  `)

  const data = (dataResult as any[]).map((row: any) => ({
    commissionTrackingId: row.commission_tracking_id,
    activityId: row.commission_tracking_id,
    activityName: row.activity_name,
    tripId: row.trip_id,
    tripName: row.trip_name,
    supplierName: row.supplier,
    departureDate: row.departure_date ? String(row.departure_date) : null,
    agentId: row.agent_id,
    agentName: [row.agent_first_name, row.agent_last_name].filter(Boolean).join(' ') || null,
    totalSalesCents: Number(row.total_sales_cents ?? 0),
    commissionRate: row.commission_rate != null ? Number(row.commission_rate) : null,
    grossCommissionCents: Number(row.gross_commission ?? 0),
    receivedCents: Number(row.received ?? 0),
    paidToAgentCents: Number(row.paid_to_agent ?? 0),
    pendingCents: Number(row.pending ?? 0),
    currency: 'CAD',
  }))

  // Summary: aggregates across all matching rows
  const summaryResult = await db.client.execute(sql`
    SELECT
      count(DISTINCT ${TRIP_PRIMARY_AGENT_ID})::int AS agent_count,
      count(*)::int AS total_items,
      coalesce(sum(ap.total_price_cents), 0)::bigint AS total_sales_cents,
      coalesce(sum(ct.gross_commission_cents), 0)::bigint AS total_gross_commission,
      coalesce(sum(ct.received_cents), 0)::bigint AS total_received,
      coalesce(sum(ct.paid_cents), 0)::bigint AS total_paid_to_agents,
      (coalesce(sum(ct.gross_commission_cents), 0) - coalesce(sum(ct.paid_cents), 0))::bigint AS total_pending
    ${CT_CANONICAL_JOIN}
    WHERE ${scope}
      AND ia.activity_type NOT IN ${EXCLUDED_ACTIVITY_TYPES}
      ${agentFilter}
  `)
  const summaryRow = (summaryResult as any[])[0]

  return {
    data,
    totalRows,
    summary: {
      agentCount: Number(summaryRow?.agent_count ?? 0),
      totalItems: Number(summaryRow?.total_items ?? 0),
      totalSalesCents: Number(summaryRow?.total_sales_cents ?? 0),
      totalGrossCommission: Number(summaryRow?.total_gross_commission ?? 0),
      totalReceived: Number(summaryRow?.total_received ?? 0),
      totalPaidToAgents: Number(summaryRow?.total_paid_to_agents ?? 0),
      totalPending: Number(summaryRow?.total_pending ?? 0),
    },
  }
}
