/**
 * Dashboard Service
 *
 * Aggregates statistics for the dashboard overview.
 * Provides both the legacy getStats() method and the new getOverview() method.
 */

import { Injectable } from '@nestjs/common'
import { eq, and, sql, inArray, desc, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripAccessService } from '../trips/trip-access.service'
import { TaskAccessService } from '../tasks/task-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  DashboardOverviewQueryDto,
  DashboardOverview,
  KpiMetrics,
  TripSummary,
  TaskDueSummary,
  PaymentDueSummary,
  MonthlySalesData,
  MonthlyCommissionData,
  ProjectionData,
  AgentLeaderboardEntry,
} from './dto/dashboard-overview.dto'

export interface DashboardStats {
  totalTrips: number
  activeTrips: number
  totalContacts: number
  totalRevenue: number
}

/** Raw KPI values before trends are computed */
interface RawKpiMetrics {
  bookings: number
  salesVolumeCents: number
  commissionReceivedDollars: number
}

/** Date range for a period */
interface DateRange {
  startDate: Date
  endDate: Date
  priorStartDate: Date
  priorEndDate: Date
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tripAccessService: TripAccessService,
    private readonly taskAccessService: TaskAccessService,
  ) {}

  // ===================================================================
  // Legacy method - kept for backward compatibility
  // ===================================================================

  /**
   * Get dashboard statistics for an agency
   */
  async getStats(agencyId: string): Promise<DashboardStats> {
    const [tripsResult, contactsResult, revenueResult] = await Promise.all([
      // Get trip counts
      this.db.client
        .select({
          totalTrips: sql<number>`count(*)::int`,
          activeTrips: sql<number>`count(*) filter (where ${this.db.schema.trips.status} in ('booked', 'in_progress'))::int`,
        })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.agencyId, agencyId)),

      // Get contact count
      this.db.client
        .select({
          totalContacts: sql<number>`count(*)::int`,
        })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.agencyId, agencyId)),

      // Get total revenue from payment transactions (payments only, not refunds)
      this.db.client
        .select({
          totalRevenue: sql<number>`coalesce(sum(${this.db.schema.paymentTransactions.amountCents}), 0)::int`,
        })
        .from(this.db.schema.paymentTransactions)
        .where(
          and(
            eq(this.db.schema.paymentTransactions.agencyId, agencyId),
            eq(this.db.schema.paymentTransactions.transactionType, 'payment'),
          ),
        ),
    ])

    return {
      totalTrips: tripsResult[0]?.totalTrips || 0,
      activeTrips: tripsResult[0]?.activeTrips || 0,
      totalContacts: contactsResult[0]?.totalContacts || 0,
      // Convert cents to dollars
      totalRevenue: (revenueResult[0]?.totalRevenue || 0) / 100,
    }
  }

  // ===================================================================
  // New overview method
  // ===================================================================

  /**
   * Get full dashboard overview with KPIs, trends, charts, and widgets
   */
  async getOverview(auth: AuthContext, query: DashboardOverviewQueryDto): Promise<DashboardOverview> {
    const tripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    const isAdmin = auth.role === 'admin'

    // For admin personal KPIs, scope to trips they own (not all agency trips)
    let personalTripIds: string[] | 'all' = tripIds
    if (isAdmin) {
      const ownedResult = await this.db.client.execute(sql`
        SELECT id FROM trips WHERE agency_id = ${auth.agencyId} AND owner_id = ${auth.userId}
      `)
      personalTripIds = (ownedResult as any[]).map((r: any) => r.id)
    }

    // Calculate date ranges
    const now = new Date()
    const { startDate, endDate, priorStartDate, priorEndDate } = this.getDateRanges(query.period || 'mtd', now)

    // Run all queries in parallel
    const [
      personalCurrent, personalPrior,
      agencyCurrent, agencyPrior,
      recentTrips, leavingSoon,
      tasksDue, paymentsDue,
      monthlySales, monthlyCommission,
      projection, leaderboard,
    ] = await Promise.all([
      // Personal KPIs (scoped to user's own trips)
      this.getKpiMetrics(auth.agencyId, personalTripIds, startDate, endDate),
      this.getKpiMetrics(auth.agencyId, personalTripIds, priorStartDate, priorEndDate),
      // Agency KPIs (admin only, all agency trips)
      isAdmin ? this.getKpiMetrics(auth.agencyId, 'all', startDate, endDate) : Promise.resolve(null),
      isAdmin ? this.getKpiMetrics(auth.agencyId, 'all', priorStartDate, priorEndDate) : Promise.resolve(null),
      // Widgets
      this.getRecentTrips(auth, tripIds),
      this.getLeavingSoon(auth, tripIds),
      this.getTasksDue(auth),
      this.getPaymentsDue(auth.agencyId, tripIds),
      this.getMonthlySales(auth.agencyId, tripIds, query.chartYear || now.getFullYear(), query.includeYoy || false),
      this.getMonthlyCommission(auth.agencyId, tripIds, query.chartYear || now.getFullYear(), query.includeYoy || false),
      this.getProjection(auth.agencyId, tripIds),
      isAdmin ? this.getAgentLeaderboard(auth.agencyId, startDate, endDate) : Promise.resolve(null),
    ])

    return {
      personal: this.computeKpiWithTrends(personalCurrent, personalPrior),
      agency: isAdmin && agencyCurrent && agencyPrior
        ? this.computeKpiWithTrends(agencyCurrent, agencyPrior)
        : null,
      recentTrips,
      leavingSoon,
      tasksDue,
      paymentsDue,
      monthlySales,
      monthlyCommission,
      currentMonthProjection: projection,
      agentLeaderboard: leaderboard,
    }
  }

  // ===================================================================
  // Date range helpers
  // ===================================================================

  private getDateRanges(period: 'mtd' | 'ytd', now: Date): DateRange {
    if (period === 'ytd') {
      const startDate = new Date(now.getFullYear(), 0, 1) // Jan 1 of current year
      const endDate = now

      const priorStartDate = new Date(now.getFullYear() - 1, 0, 1) // Jan 1 of last year
      const priorEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()) // Same day last year

      return { startDate, endDate, priorStartDate, priorEndDate }
    }

    // MTD (default)
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1) // First day of current month
    const endDate = now

    // Prior = previous month (same day count)
    const priorStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    // End of previous month
    const priorEndDate = new Date(now.getFullYear(), now.getMonth(), 0) // Day 0 = last day of prev month

    return { startDate, endDate, priorStartDate, priorEndDate }
  }

  // ===================================================================
  // KPI Metrics
  // ===================================================================

  /**
   * Get raw KPI metrics for a date range.
   * tripIds = 'all' means filter by agencyId only (admin view).
   * tripIds = string[] means filter by specific trip IDs (agent view).
   */
  private async getKpiMetrics(
    agencyId: string,
    tripIds: string[] | 'all',
    startDate: Date,
    endDate: Date,
  ): Promise<RawKpiMetrics> {
    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()

    // Build trip filter for bookings
    const tripFilter = tripIds === 'all'
      ? sql`t.agency_id = ${agencyId}`
      : tripIds.length === 0
        ? sql`false`
        : sql`t.agency_id = ${agencyId} AND t.id IN ${sql.raw(`('${tripIds.join("','")}')`)}`

    // Bookings count
    const bookingsResult = await this.db.client.execute(sql`
      SELECT count(*)::int AS bookings
      FROM trips t
      WHERE ${tripFilter}
        AND t.status IN ('booked', 'in_progress', 'completed')
        AND t.created_at >= ${startIso}::timestamptz
        AND t.created_at <= ${endIso}::timestamptz
    `)
    const bookings = (bookingsResult as any)[0]?.bookings ?? 0

    // Net sales (payments - refunds) from payment_transactions
    // For agents with specific trip IDs, use subquery through the join chain
    let netSalesCents = 0
    if (tripIds === 'all') {
      const salesResult = await this.db.client.execute(sql`
        SELECT coalesce(
          sum(CASE WHEN pt.transaction_type = 'payment' THEN pt.amount_cents ELSE 0 END) -
          sum(CASE WHEN pt.transaction_type = 'refund' THEN pt.amount_cents ELSE 0 END),
          0
        )::bigint AS net_sales
        FROM payment_transactions pt
        WHERE pt.agency_id = ${agencyId}
          AND pt.transaction_date >= ${startIso}::timestamptz
          AND pt.transaction_date <= ${endIso}::timestamptz
      `)
      netSalesCents = Number((salesResult as any)[0]?.net_sales ?? 0)
    } else if (tripIds.length > 0) {
      // Agent view: filter through the join chain to trip IDs
      const tripIdList = sql.raw(`('${tripIds.join("','")}')`)
      const salesResult = await this.db.client.execute(sql`
        SELECT coalesce(
          sum(CASE WHEN pt.transaction_type = 'payment' THEN pt.amount_cents ELSE 0 END) -
          sum(CASE WHEN pt.transaction_type = 'refund' THEN pt.amount_cents ELSE 0 END),
          0
        )::bigint AS net_sales
        FROM payment_transactions pt
        WHERE pt.agency_id = ${agencyId}
          AND pt.transaction_date >= ${startIso}::timestamptz
          AND pt.transaction_date <= ${endIso}::timestamptz
          AND pt.expected_payment_item_id IN (
            SELECT epi.id FROM expected_payment_items epi
            JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
            JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
            JOIN itinerary_activities ia ON ia.id = ap.activity_id
            JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
            JOIN itineraries itin ON itin.id = iday.itinerary_id
            JOIN trips t ON t.id = itin.trip_id
            WHERE t.id IN ${tripIdList}
          )
      `)
      netSalesCents = Number((salesResult as any)[0]?.net_sales ?? 0)
    }

    // Commission received
    let commissionDollars = 0
    if (tripIds === 'all') {
      const commResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(ct.commission_amount::numeric), 0)::float AS commission
        FROM commission_tracking ct
        JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
        WHERE ap.agency_id = ${agencyId}
          AND ct.commission_status = 'received'
          AND ct.created_at >= ${startIso}::timestamptz
          AND ct.created_at <= ${endIso}::timestamptz
      `)
      commissionDollars = Number((commResult as any)[0]?.commission ?? 0)
    } else if (tripIds.length > 0) {
      const tripIdList = sql.raw(`('${tripIds.join("','")}')`)
      const commResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(ct.commission_amount::numeric), 0)::float AS commission
        FROM commission_tracking ct
        JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND ct.commission_status = 'received'
          AND ct.created_at >= ${startIso}::timestamptz
          AND ct.created_at <= ${endIso}::timestamptz
          AND t.id IN ${tripIdList}
      `)
      commissionDollars = Number((commResult as any)[0]?.commission ?? 0)
    }

    return {
      bookings,
      salesVolumeCents: netSalesCents,
      commissionReceivedDollars: commissionDollars,
    }
  }

  // ===================================================================
  // Trend computation
  // ===================================================================

  private computeKpiWithTrends(current: RawKpiMetrics, prior: RawKpiMetrics): KpiMetrics {
    return {
      bookings: current.bookings,
      salesVolumeCents: current.salesVolumeCents,
      commissionReceivedDollars: current.commissionReceivedDollars,
      bookingsTrend: this.computeTrend(current.bookings, prior.bookings),
      salesTrend: this.computeTrend(current.salesVolumeCents, prior.salesVolumeCents),
      commissionTrend: this.computeTrend(current.commissionReceivedDollars, prior.commissionReceivedDollars),
    }
  }

  private computeTrend(current: number, prior: number): number | null {
    if (prior === 0) return null
    return Math.round(((current - prior) / prior) * 10000) / 100 // 2 decimal places
  }

  // ===================================================================
  // Recent Trips widget
  // ===================================================================

  private async getRecentTrips(auth: AuthContext, tripIds: string[] | 'all'): Promise<TripSummary[]> {
    const isAdmin = auth.role === 'admin'

    if (!isAdmin && Array.isArray(tripIds) && tripIds.length === 0) {
      return []
    }

    const tripFilter = isAdmin
      ? sql`t.agency_id = ${auth.agencyId}`
      : sql`t.agency_id = ${auth.agencyId} AND t.id IN ${sql.raw(`('${(tripIds as string[]).join("','")}')`)}`

    const result = await this.db.client.execute(sql`
      SELECT
        t.id,
        t.name,
        t.start_date,
        t.end_date,
        t.status,
        t.updated_at,
        (SELECT count(*)::int FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
      FROM trips t
      WHERE ${tripFilter}
      ORDER BY t.updated_at DESC
      LIMIT 4
    `)

    return (result as any[]).map((row: any) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date ? String(row.start_date) : null,
      endDate: row.end_date ? String(row.end_date) : null,
      status: row.status,
      travelerCount: Number(row.traveler_count ?? 0),
      updatedAt: String(row.updated_at),
    }))
  }

  // ===================================================================
  // Leaving Soon widget
  // ===================================================================

  private async getLeavingSoon(auth: AuthContext, tripIds: string[] | 'all'): Promise<TripSummary[]> {
    const isAdmin = auth.role === 'admin'

    if (!isAdmin && Array.isArray(tripIds) && tripIds.length === 0) {
      return []
    }

    const tripFilter = isAdmin
      ? sql`t.agency_id = ${auth.agencyId}`
      : sql`t.agency_id = ${auth.agencyId} AND t.id IN ${sql.raw(`('${(tripIds as string[]).join("','")}')`)}`

    const result = await this.db.client.execute(sql`
      SELECT
        t.id,
        t.name,
        t.start_date,
        t.end_date,
        t.status,
        t.updated_at,
        (SELECT count(*)::int FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
      FROM trips t
      WHERE ${tripFilter}
        AND t.start_date >= CURRENT_DATE
        AND t.start_date <= CURRENT_DATE + INTERVAL '30 days'
        AND t.status IN ('booked', 'in_progress')
      ORDER BY t.start_date ASC
      LIMIT 4
    `)

    return (result as any[]).map((row: any) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date ? String(row.start_date) : null,
      endDate: row.end_date ? String(row.end_date) : null,
      status: row.status,
      travelerCount: Number(row.traveler_count ?? 0),
      updatedAt: String(row.updated_at),
    }))
  }

  // ===================================================================
  // Tasks Due widget
  // ===================================================================

  private async getTasksDue(auth: AuthContext): Promise<TaskDueSummary[]> {
    const accessCondition = this.taskAccessService.buildAccessConditions(auth)

    const result = await this.db.client
      .select({
        id: this.db.schema.tasks.id,
        title: this.db.schema.tasks.title,
        dueDate: this.db.schema.tasks.dueDate,
        priority: this.db.schema.tasks.priority,
        isOverdue: sql<boolean>`CASE WHEN ${this.db.schema.tasks.dueDate} IS NOT NULL AND ${this.db.schema.tasks.dueDate}::date < CURRENT_DATE THEN true ELSE false END`,
        daysOverdue: sql<number>`CASE WHEN ${this.db.schema.tasks.dueDate} IS NOT NULL AND ${this.db.schema.tasks.dueDate}::date < CURRENT_DATE THEN (CURRENT_DATE - ${this.db.schema.tasks.dueDate}::date)::int ELSE 0 END`,
        linkedTripName: sql<string | null>`trips.name`,
        linkedContactName: sql<string | null>`CASE WHEN contacts.first_name IS NOT NULL THEN contacts.first_name || ' ' || coalesce(contacts.last_name, '') ELSE NULL END`,
      })
      .from(this.db.schema.tasks)
      .leftJoin(this.db.schema.trips, eq(this.db.schema.tasks.tripId, this.db.schema.trips.id))
      .leftJoin(this.db.schema.contacts, eq(this.db.schema.tasks.contactId, this.db.schema.contacts.id))
      .where(
        and(
          accessCondition,
          inArray(this.db.schema.tasks.status, ['pending', 'in_progress']),
          eq(this.db.schema.tasks.isDeleted, false),
          sql`${this.db.schema.tasks.dueDate} IS NOT NULL`,
        ),
      )
      .orderBy(
        // Overdue first
        desc(sql`CASE WHEN ${this.db.schema.tasks.dueDate} IS NOT NULL AND ${this.db.schema.tasks.dueDate}::date < CURRENT_DATE THEN 1 ELSE 0 END`),
        // Then by due date ascending
        asc(sql`${this.db.schema.tasks.dueDate}`),
      )
      .limit(5)

    return result.map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.dueDate ? String(row.dueDate) : null,
      priority: row.priority,
      isOverdue: row.isOverdue,
      daysOverdue: row.daysOverdue,
      linkedTripName: row.linkedTripName ? String(row.linkedTripName).trim() : null,
      linkedContactName: row.linkedContactName ? String(row.linkedContactName).trim() : null,
    }))
  }

  // ===================================================================
  // Payments Due widget
  // ===================================================================

  private async getPaymentsDue(agencyId: string, tripIds: string[] | 'all'): Promise<PaymentDueSummary[]> {
    if (Array.isArray(tripIds) && tripIds.length === 0) {
      return []
    }

    const tripFilter = tripIds === 'all'
      ? sql`epi.agency_id = ${agencyId}`
      : sql`epi.agency_id = ${agencyId} AND t.id IN ${sql.raw(`('${tripIds.join("','")}')`)}`

    const result = await this.db.client.execute(sql`
      SELECT
        epi.id,
        t.id AS trip_id,
        t.name AS trip_name,
        epi.payment_name AS description,
        epi.expected_amount_cents,
        epi.paid_amount_cents,
        epi.due_date,
        CASE WHEN epi.due_date IS NOT NULL AND epi.due_date::date < CURRENT_DATE THEN true ELSE false END AS is_overdue
      FROM expected_payment_items epi
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      JOIN itineraries itin ON itin.id = iday.itinerary_id
      JOIN trips t ON t.id = itin.trip_id
      WHERE ${tripFilter}
        AND epi.paid_amount_cents < epi.expected_amount_cents
        AND epi.status IN ('pending', 'partial', 'overdue')
      ORDER BY
        CASE WHEN epi.due_date IS NOT NULL AND epi.due_date::date < CURRENT_DATE THEN 0 ELSE 1 END,
        epi.due_date ASC NULLS LAST
      LIMIT 5
    `)

    return (result as any[]).map((row: any) => ({
      id: row.id,
      tripId: row.trip_id,
      tripName: row.trip_name || '',
      description: row.description || '',
      expectedAmountCents: Number(row.expected_amount_cents ?? 0),
      paidAmountCents: Number(row.paid_amount_cents ?? 0),
      dueDate: row.due_date ? String(row.due_date) : '',
      isOverdue: row.is_overdue === true || row.is_overdue === 't',
    }))
  }

  // ===================================================================
  // Monthly Sales chart
  // ===================================================================

  private async getMonthlySales(
    agencyId: string,
    tripIds: string[] | 'all',
    year: number,
    includeYoy: boolean,
  ): Promise<MonthlySalesData[]> {
    const currentYear = await this.getMonthlySalesForYear(agencyId, tripIds, year)
    let previousYear: Map<number, number> | null = null

    if (includeYoy) {
      previousYear = await this.getMonthlySalesForYear(agencyId, tripIds, year - 1)
    }

    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i]!,
      amountCents: currentYear.get(i + 1) ?? 0,
      previousYearCents: previousYear ? (previousYear.get(i + 1) ?? 0) : null,
    }))
  }

  private async getMonthlySalesForYear(
    agencyId: string,
    tripIds: string[] | 'all',
    year: number,
  ): Promise<Map<number, number>> {
    const startDate = `${year}-01-01`

    let result: any[]
    if (tripIds === 'all') {
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM pt.transaction_date)::int AS month,
          coalesce(
            sum(CASE WHEN pt.transaction_type = 'payment' THEN pt.amount_cents ELSE 0 END) -
            sum(CASE WHEN pt.transaction_type = 'refund' THEN pt.amount_cents ELSE 0 END),
            0
          )::bigint AS net_sales
        FROM payment_transactions pt
        WHERE pt.agency_id = ${agencyId}
          AND pt.transaction_date >= ${startDate}::date
          AND pt.transaction_date < ${`${year + 1}-01-01`}::date
        GROUP BY extract(month FROM pt.transaction_date)
      `) as any[]
    } else if (tripIds.length === 0) {
      return new Map()
    } else {
      const tripIdList = sql.raw(`('${tripIds.join("','")}')`)
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM pt.transaction_date)::int AS month,
          coalesce(
            sum(CASE WHEN pt.transaction_type = 'payment' THEN pt.amount_cents ELSE 0 END) -
            sum(CASE WHEN pt.transaction_type = 'refund' THEN pt.amount_cents ELSE 0 END),
            0
          )::bigint AS net_sales
        FROM payment_transactions pt
        WHERE pt.agency_id = ${agencyId}
          AND pt.transaction_date >= ${startDate}::date
          AND pt.transaction_date < ${`${year + 1}-01-01`}::date
          AND pt.expected_payment_item_id IN (
            SELECT epi.id FROM expected_payment_items epi
            JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
            JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
            JOIN itinerary_activities ia ON ia.id = ap.activity_id
            JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
            JOIN itineraries itin ON itin.id = iday.itinerary_id
            JOIN trips t ON t.id = itin.trip_id
            WHERE t.id IN ${tripIdList}
          )
        GROUP BY extract(month FROM pt.transaction_date)
      `) as any[]
    }

    const map = new Map<number, number>()
    for (const row of result) {
      map.set(Number(row.month), Number(row.net_sales))
    }
    return map
  }

  // ===================================================================
  // Monthly Commission chart
  // ===================================================================

  private async getMonthlyCommission(
    agencyId: string,
    tripIds: string[] | 'all',
    year: number,
    includeYoy: boolean,
  ): Promise<MonthlyCommissionData[]> {
    const currentYear = await this.getMonthlyCommissionForYear(agencyId, tripIds, year)
    let previousYear: Map<number, number> | null = null

    if (includeYoy) {
      previousYear = await this.getMonthlyCommissionForYear(agencyId, tripIds, year - 1)
    }

    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i]!,
      amountDollars: currentYear.get(i + 1) ?? 0,
      previousYearDollars: previousYear ? (previousYear.get(i + 1) ?? 0) : null,
    }))
  }

  private async getMonthlyCommissionForYear(
    agencyId: string,
    tripIds: string[] | 'all',
    year: number,
  ): Promise<Map<number, number>> {
    let result: any[]
    if (tripIds === 'all') {
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM ct.created_at)::int AS month,
          coalesce(sum(ct.commission_amount::numeric), 0)::float AS commission
        FROM commission_tracking ct
        JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
        WHERE ap.agency_id = ${agencyId}
          AND ct.commission_status = 'received'
          AND extract(year FROM ct.created_at) = ${year}
        GROUP BY extract(month FROM ct.created_at)
      `) as any[]
    } else if (tripIds.length === 0) {
      return new Map()
    } else {
      const tripIdList = sql.raw(`('${tripIds.join("','")}')`)
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM ct.created_at)::int AS month,
          coalesce(sum(ct.commission_amount::numeric), 0)::float AS commission
        FROM commission_tracking ct
        JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND ct.commission_status = 'received'
          AND extract(year FROM ct.created_at) = ${year}
          AND t.id IN ${tripIdList}
        GROUP BY extract(month FROM ct.created_at)
      `) as any[]
    }

    const map = new Map<number, number>()
    for (const row of result) {
      map.set(Number(row.month), Number(row.commission))
    }
    return map
  }

  // ===================================================================
  // Current Month Projection
  // ===================================================================

  private async getProjection(agencyId: string, tripIds: string[] | 'all'): Promise<ProjectionData> {
    // Get current month's actual sales and commission
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const salesMap = await this.getMonthlySalesForYear(agencyId, tripIds, currentYear)
    const commMap = await this.getMonthlyCommissionForYear(agencyId, tripIds, currentYear)

    const salesActualCents = salesMap.get(currentMonth) ?? 0
    const commissionActualDollars = commMap.get(currentMonth) ?? 0

    // Compute projection
    const daysElapsed = now.getDate()
    const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate() // Last day of current month

    let salesProjectedCents = salesActualCents
    let commissionProjectedDollars = commissionActualDollars

    if (daysElapsed > 0) {
      salesProjectedCents = Math.round((salesActualCents / daysElapsed) * totalDaysInMonth)
      commissionProjectedDollars = Math.round(((commissionActualDollars / daysElapsed) * totalDaysInMonth) * 100) / 100
    }

    return {
      salesActualCents,
      salesProjectedCents,
      commissionActualDollars,
      commissionProjectedDollars,
      daysElapsed,
      totalDaysInMonth,
    }
  }

  // ===================================================================
  // Agent Leaderboard (admin only)
  // ===================================================================

  private async getAgentLeaderboard(
    agencyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AgentLeaderboardEntry[]> {
    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()

    const result = await this.db.client.execute(sql`
      WITH agent_sales AS (
        SELECT
          t.owner_id AS user_id,
          coalesce(
            sum(CASE WHEN pt.transaction_type = 'payment' THEN pt.amount_cents ELSE 0 END) -
            sum(CASE WHEN pt.transaction_type = 'refund' THEN pt.amount_cents ELSE 0 END),
            0
          )::bigint AS sales_volume_cents
        FROM payment_transactions pt
        JOIN expected_payment_items epi ON epi.id = pt.expected_payment_item_id
        JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
        JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE pt.agency_id = ${agencyId}
          AND pt.transaction_date >= ${startIso}::timestamptz
          AND pt.transaction_date <= ${endIso}::timestamptz
          AND t.owner_id IS NOT NULL
        GROUP BY t.owner_id
      ),
      agent_bookings AS (
        SELECT
          t.owner_id AS user_id,
          count(DISTINCT t.id)::int AS bookings
        FROM trips t
        WHERE t.agency_id = ${agencyId}
          AND t.status IN ('booked', 'in_progress', 'completed')
          AND t.created_at >= ${startIso}::timestamptz
          AND t.created_at <= ${endIso}::timestamptz
          AND t.owner_id IS NOT NULL
        GROUP BY t.owner_id
      )
      SELECT
        up.id AS user_id,
        up.first_name,
        up.last_name,
        up.avatar_url,
        coalesce(asales.sales_volume_cents, 0)::bigint AS sales_volume_cents,
        coalesce(ab.bookings, 0)::int AS bookings
      FROM user_profiles up
      LEFT JOIN agent_sales asales ON asales.user_id = up.id
      LEFT JOIN agent_bookings ab ON ab.user_id = up.id
      WHERE up.agency_id = ${agencyId}
        AND (asales.sales_volume_cents > 0 OR ab.bookings > 0)
      ORDER BY coalesce(asales.sales_volume_cents, 0) DESC
      LIMIT 5
    `)

    return (result as any[]).map((row: any) => ({
      userId: row.user_id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatarUrl: row.avatar_url || null,
      salesVolumeCents: Number(row.sales_volume_cents ?? 0),
      bookings: Number(row.bookings ?? 0),
    }))
  }
}
