/**
 * Dashboard Service
 *
 * Aggregates statistics for the dashboard overview.
 * Provides both the legacy getStats() method and the new getOverview() method.
 */

import { Injectable } from '@nestjs/common'
import { eq, and, sql, inArray, desc, asc, type SQL } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripAccessService } from '../trips/trip-access.service'
import { TaskAccessService } from '../tasks/task-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  DashboardOverviewQueryDto,
  DashboardOverview,
  KpiMetrics,
  SalesKpiMetrics,
  InsuranceKpiMetrics,
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

/** Raw values for the new sales KPIs */
interface RawSalesKpi {
  bookedSalesCents: number
  departedSalesCents: number
}

/** Raw values for insurance attach rate */
interface RawInsuranceKpi {
  totalTravelers: number
  coveredTravelers: number
  attachRate: number
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
   * Get dashboard statistics for an agency.
   * For agents (non-admin), scopes trips to accessible trips, contacts to owned only.
   */
  async getStats(auth: AuthContext): Promise<DashboardStats> {
    const { agencyId } = auth
    const isAdmin = auth.role === 'admin'

    // For agents, scope to accessible trips only
    let tripFilter: SQL = eq(this.db.schema.trips.agencyId, agencyId)
    let contactFilter: SQL = eq(this.db.schema.contacts.agencyId, agencyId)
    // Revenue: suppress for agents (no trip_id on payment_transactions for scoping).
    // Agents use getOverview() which has proper per-agent KPI scoping.
    const showRevenue = isAdmin

    if (!isAdmin) {
      const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
      if (accessibleTripIds !== 'all') {
        if (accessibleTripIds.length === 0) {
          return { totalTrips: 0, activeTrips: 0, totalContacts: 0, totalRevenue: 0 }
        }
        tripFilter = and(
          eq(this.db.schema.trips.agencyId, agencyId),
          inArray(this.db.schema.trips.id, accessibleTripIds),
        )!
        // Contacts: scope to owned contacts only for agents
        contactFilter = and(
          eq(this.db.schema.contacts.agencyId, agencyId),
          eq(this.db.schema.contacts.ownerId, auth.userId),
        )!
        // Revenue suppressed for agents (showRevenue = false)
      }
    }

    const [tripsResult, contactsResult, revenueResult] = await Promise.all([
      // Get trip counts
      this.db.client
        .select({
          totalTrips: sql<number>`count(*)::int`,
          activeTrips: sql<number>`count(*) filter (where ${this.db.schema.trips.status} in ('active', 'travelling'))::int`,
        })
        .from(this.db.schema.trips)
        .where(tripFilter),

      // Get contact count
      this.db.client
        .select({
          totalContacts: sql<number>`count(*)::int`,
        })
        .from(this.db.schema.contacts)
        .where(contactFilter),

      // Get total revenue — admin only (agent revenue is in getOverview KPIs)
      showRevenue
        ? this.db.client
            .select({
              totalRevenue: sql<number>`coalesce(sum(${this.db.schema.paymentTransactions.amountCents}), 0)::int`,
            })
            .from(this.db.schema.paymentTransactions)
            .where(
              and(
                eq(this.db.schema.paymentTransactions.agencyId, agencyId),
                eq(this.db.schema.paymentTransactions.transactionType, 'payment'),
              ),
            )
        : Promise.resolve([{ totalRevenue: 0 }]),
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
    const view = query.view || 'all'

    // For admin personal KPIs, scope to trips they own (not all agency trips)
    let personalTripIds: string[] | 'all' = tripIds
    if (isAdmin) {
      const ownedResult = await this.db.client.execute(sql`
        SELECT id FROM trips WHERE agency_id = ${auth.agencyId} AND owner_id = ${auth.userId}
      `)
      personalTripIds = (ownedResult as any[]).map((r: any) => r.id)
    }

    // Determine which trip scope to use for charts/widgets based on view
    // personal = user's own trips only, agency = all agency trips, all = all agency trips (default)
    const widgetTripIds = (isAdmin && view === 'personal') ? personalTripIds : tripIds

    // Calculate date ranges
    const now = new Date()
    const { startDate, endDate, priorStartDate, priorEndDate } = this.getDateRanges(query.period || 'mtd', now)

    // Determine which KPI queries to run based on view
    const needsPersonal = view === 'personal' || view === 'all'
    const needsAgency = isAdmin && (view === 'agency' || view === 'all')

    // Run all queries in parallel
    const [
      personalCurrent, personalPrior,
      agencyCurrent, agencyPrior,
      recentTrips, leavingSoon,
      tasksDue, paymentsDue,
      monthlySales, monthlyCommission,
      projection, leaderboard,
      // New KPIs
      personalSalesCurrent, personalSalesPrior,
      agencySalesCurrent, agencySalesPrior,
      personalInsuranceCurrent, personalInsurancePrior,
      agencyInsuranceCurrent, agencyInsurancePrior,
    ] = await Promise.all([
      // Personal KPIs (scoped to user's own trips)
      needsPersonal ? this.getKpiMetrics(auth.agencyId, personalTripIds, startDate, endDate) : Promise.resolve(null),
      needsPersonal ? this.getKpiMetrics(auth.agencyId, personalTripIds, priorStartDate, priorEndDate) : Promise.resolve(null),
      // Agency KPIs (admin only, all agency trips)
      needsAgency ? this.getKpiMetrics(auth.agencyId, 'all', startDate, endDate) : Promise.resolve(null),
      needsAgency ? this.getKpiMetrics(auth.agencyId, 'all', priorStartDate, priorEndDate) : Promise.resolve(null),
      // Widgets — scoped based on view
      this.getRecentTrips(auth, widgetTripIds),
      this.getLeavingSoon(auth, widgetTripIds),
      this.getTasksDue(auth),
      this.getPaymentsDue(auth.agencyId, widgetTripIds),
      this.getMonthlySales(auth.agencyId, widgetTripIds, query.chartYear || now.getFullYear(), query.includeYoy || false),
      this.getMonthlyCommission(auth.agencyId, widgetTripIds, query.chartYear || now.getFullYear(), query.includeYoy || false),
      this.getProjection(auth.agencyId, widgetTripIds),
      needsAgency ? this.getAgentLeaderboard(auth.agencyId, startDate, endDate) : Promise.resolve(null),
      // New KPIs — Booked Sales & Departed Sales (personal)
      needsPersonal ? this.getSalesKpi(auth.agencyId, personalTripIds, startDate, endDate) : Promise.resolve(null),
      needsPersonal ? this.getSalesKpi(auth.agencyId, personalTripIds, priorStartDate, priorEndDate) : Promise.resolve(null),
      // New KPIs — Booked Sales & Departed Sales (agency, admin only)
      needsAgency ? this.getSalesKpi(auth.agencyId, 'all', startDate, endDate) : Promise.resolve(null),
      needsAgency ? this.getSalesKpi(auth.agencyId, 'all', priorStartDate, priorEndDate) : Promise.resolve(null),
      // New KPIs — Insurance Attach Rate (personal)
      needsPersonal ? this.getInsuranceKpi(auth.agencyId, personalTripIds, startDate, endDate) : Promise.resolve(null),
      needsPersonal ? this.getInsuranceKpi(auth.agencyId, personalTripIds, priorStartDate, priorEndDate) : Promise.resolve(null),
      // New KPIs — Insurance Attach Rate (agency, admin only)
      needsAgency ? this.getInsuranceKpi(auth.agencyId, 'all', startDate, endDate) : Promise.resolve(null),
      needsAgency ? this.getInsuranceKpi(auth.agencyId, 'all', priorStartDate, priorEndDate) : Promise.resolve(null),
    ])

    const emptyKpi: KpiMetrics = { bookings: 0, salesVolumeCents: 0, commissionReceivedDollars: 0, bookingsTrend: null, salesTrend: null, commissionTrend: null }
    const emptySalesKpi: SalesKpiMetrics = { bookedSalesCents: 0, departedSalesCents: 0, bookedSalesTrend: null, departedSalesTrend: null }
    const emptyInsuranceKpi: InsuranceKpiMetrics = { totalTravelers: 0, coveredTravelers: 0, attachRate: 0, attachRateTrend: null }

    return {
      personal: personalCurrent && personalPrior
        ? this.computeKpiWithTrends(personalCurrent, personalPrior)
        : emptyKpi,
      agency: agencyCurrent && agencyPrior
        ? this.computeKpiWithTrends(agencyCurrent, agencyPrior)
        : null,
      personalSalesKpi: personalSalesCurrent && personalSalesPrior
        ? this.computeSalesKpiWithTrends(personalSalesCurrent, personalSalesPrior)
        : emptySalesKpi,
      agencySalesKpi: agencySalesCurrent && agencySalesPrior
        ? this.computeSalesKpiWithTrends(agencySalesCurrent, agencySalesPrior)
        : null,
      personalInsuranceKpi: personalInsuranceCurrent && personalInsurancePrior
        ? this.computeInsuranceKpiWithTrends(personalInsuranceCurrent, personalInsurancePrior)
        : emptyInsuranceKpi,
      agencyInsuranceKpi: agencyInsuranceCurrent && agencyInsurancePrior
        ? this.computeInsuranceKpiWithTrends(agencyInsuranceCurrent, agencyInsurancePrior)
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

  private getDateRanges(period: 'mtd' | 'ytd' | 'lifetime', now: Date): DateRange {
    if (period === 'lifetime') {
      const startDate = new Date(2000, 0, 1) // Far enough back to capture all data
      const endDate = now

      // No meaningful prior period — use empty range so trends return null
      const emptyDate = new Date(1999, 0, 1)
      return { startDate, endDate, priorStartDate: emptyDate, priorEndDate: emptyDate }
    }

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

  /** Build a parameterized SQL list from an array of IDs — safe from SQL injection */
  private sqlIdList(ids: string[]): SQL {
    const params = ids.map((id, i) => i === 0 ? sql`${id}` : sql`, ${id}`)
    return sql`(${sql.join(params, sql.raw(''))})`
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
        : sql`t.agency_id = ${agencyId} AND t.id IN ${this.sqlIdList(tripIds)}`

    // Bookings count — uses booking_date (actual booking date) with created_at fallback
    const bookingsResult = await this.db.client.execute(sql`
      SELECT count(*)::int AS bookings
      FROM trips t
      WHERE ${tripFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
        AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
    `)
    const bookings = (bookingsResult as any)[0]?.bookings ?? 0

    // Sales volume — sum of activity_pricing.total_price_cents for trips booked in the period.
    // Uses activity_pricing directly (not payment_transactions) so sales appear even before
    // payment schedules/transactions are created.
    let netSalesCents = 0
    if (tripIds === 'all') {
      const salesResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(ap.total_price_cents), 0)::bigint AS net_sales
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND t.status IN ('active', 'travelling', 'travelled')
          AND coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
          AND coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
      `)
      netSalesCents = Number((salesResult as any)[0]?.net_sales ?? 0)
    } else if (tripIds.length > 0) {
      const tripIdList = this.sqlIdList(tripIds)
      const salesResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(ap.total_price_cents), 0)::bigint AS net_sales
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND t.status IN ('active', 'travelling', 'travelled')
          AND coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
          AND coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
          AND t.id IN ${tripIdList}
      `)
      netSalesCents = Number((salesResult as any)[0]?.net_sales ?? 0)
    }

    // Commission received — uses check_date (actual date received) not created_at
    let commissionDollars = 0
    if (tripIds === 'all') {
      const commResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(cc.check_amount_cents) / 100.0, 0)::float AS commission
        FROM commission_checks cc
        WHERE cc.agency_id = ${agencyId}
          AND cc.check_type = 'received'
          AND cc.status = 'accepted'
          AND cc.check_date >= ${startIso}::date
          AND cc.check_date <= ${endIso}::date
      `)
      commissionDollars = Number((commResult as any)[0]?.commission ?? 0)
    } else if (tripIds.length > 0) {
      const tripIdList = this.sqlIdList(tripIds)
      const commResult = await this.db.client.execute(sql`
        SELECT coalesce(sum(cci.received_cents) / 100.0, 0)::float AS commission
        FROM commission_check_items cci
        JOIN commission_checks cc ON cc.id = cci.check_id
        JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND cc.check_type = 'received'
          AND cc.status = 'accepted'
          AND cc.check_date >= ${startIso}::date
          AND cc.check_date <= ${endIso}::date
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
      : sql`t.agency_id = ${auth.agencyId} AND t.id IN ${this.sqlIdList(tripIds as string[])}`

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
      : sql`t.agency_id = ${auth.agencyId} AND t.id IN ${this.sqlIdList(tripIds as string[])}`

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
        AND t.status IN ('active', 'travelling')
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
      : sql`epi.agency_id = ${agencyId} AND t.id IN ${this.sqlIdList(tripIds)}`

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
    let result: any[]
    if (tripIds === 'all') {
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at))::int AS month,
          coalesce(sum(ap.total_price_cents), 0)::bigint AS net_sales
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND t.status IN ('active', 'travelling', 'travelled')
          AND extract(year FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at)) = ${year}
        GROUP BY extract(month FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at))
      `) as any[]
    } else if (tripIds.length === 0) {
      return new Map()
    } else {
      const tripIdList = this.sqlIdList(tripIds)
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at))::int AS month,
          coalesce(sum(ap.total_price_cents), 0)::bigint AS net_sales
        FROM activity_pricing ap
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND t.status IN ('active', 'travelling', 'travelled')
          AND extract(year FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at)) = ${year}
          AND t.id IN ${tripIdList}
        GROUP BY extract(month FROM coalesce(ia.booking_date, t.booking_date::timestamptz, t.created_at))
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
          extract(month FROM cc.check_date)::int AS month,
          coalesce(sum(cc.check_amount_cents) / 100.0, 0)::float AS commission
        FROM commission_checks cc
        WHERE cc.agency_id = ${agencyId}
          AND cc.check_type = 'received'
          AND cc.status = 'accepted'
          AND extract(year FROM cc.check_date) = ${year}
        GROUP BY extract(month FROM cc.check_date)
      `) as any[]
    } else if (tripIds.length === 0) {
      return new Map()
    } else {
      const tripIdList = this.sqlIdList(tripIds)
      result = await this.db.client.execute(sql`
        SELECT
          extract(month FROM cc.check_date)::int AS month,
          coalesce(sum(cci.received_cents) / 100.0, 0)::float AS commission
        FROM commission_check_items cci
        JOIN commission_checks cc ON cc.id = cci.check_id
        JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
        JOIN itinerary_activities ia ON ia.id = ap.activity_id
        JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
        JOIN itineraries itin ON itin.id = iday.itinerary_id
        JOIN trips t ON t.id = itin.trip_id
        WHERE ap.agency_id = ${agencyId}
          AND cc.check_type = 'received'
          AND cc.status = 'accepted'
          AND extract(year FROM cc.check_date) = ${year}
          AND t.id IN ${tripIdList}
        GROUP BY extract(month FROM cc.check_date)
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
          AND t.status IN ('active', 'travelling', 'travelled')
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

  // ===================================================================
  // Booked Sales & Departed Sales KPIs
  // ===================================================================

  /**
   * Get booked sales (by booking date) and departed sales (by trip start date)
   * for a given date range.
   */
  private async getSalesKpi(
    agencyId: string,
    tripIds: string[] | 'all',
    startDate: Date,
    endDate: Date,
  ): Promise<RawSalesKpi> {
    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()

    const tripFilter = tripIds === 'all'
      ? sql`t.agency_id = ${agencyId}`
      : tripIds.length === 0
        ? sql`false`
        : sql`t.agency_id = ${agencyId} AND t.id IN ${this.sqlIdList(tripIds)}`

    // Booked Sales — SUM of activity_pricing.total_price_cents
    // where trip booking date falls in period
    const bookedResult = await this.db.client.execute(sql`
      SELECT coalesce(sum(ap.total_price_cents), 0)::bigint AS total
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
      JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
      WHERE ${tripFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND ia.booking_status = 'booked'
        AND ia.activity_type NOT IN ('port_info', 'tour_day')
        AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
        AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
    `)
    const bookedSalesCents = Number((bookedResult as any)[0]?.total ?? 0)

    // Departed Sales — SUM of activity_pricing.total_price_cents
    // where trip start_date falls in period
    const departedResult = await this.db.client.execute(sql`
      SELECT coalesce(sum(ap.total_price_cents), 0)::bigint AS total
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
      JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
      WHERE ${tripFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND ia.booking_status = 'booked'
        AND ia.activity_type NOT IN ('port_info', 'tour_day')
        AND t.start_date >= ${startIso}::date
        AND t.start_date <= ${endIso}::date
    `)
    const departedSalesCents = Number((departedResult as any)[0]?.total ?? 0)

    return { bookedSalesCents, departedSalesCents }
  }

  private computeSalesKpiWithTrends(current: RawSalesKpi, prior: RawSalesKpi): SalesKpiMetrics {
    return {
      bookedSalesCents: current.bookedSalesCents,
      departedSalesCents: current.departedSalesCents,
      bookedSalesTrend: this.computeTrend(current.bookedSalesCents, prior.bookedSalesCents),
      departedSalesTrend: this.computeTrend(current.departedSalesCents, prior.departedSalesCents),
    }
  }

  // ===================================================================
  // Insurance Attach Rate KPI
  // ===================================================================

  /**
   * Get insurance attach rate for trips booked in the period.
   * Rate = (covered travelers / total travelers) * 100
   * Covered = status IN ('selected_package', 'has_own_insurance')
   */
  private async getInsuranceKpi(
    agencyId: string,
    tripIds: string[] | 'all',
    startDate: Date,
    endDate: Date,
  ): Promise<RawInsuranceKpi> {
    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()

    const tripFilter = tripIds === 'all'
      ? sql`t.agency_id = ${agencyId}`
      : tripIds.length === 0
        ? sql`false`
        : sql`t.agency_id = ${agencyId} AND t.id IN ${this.sqlIdList(tripIds)}`

    // Total travelers on trips booked in period
    const totalResult = await this.db.client.execute(sql`
      SELECT count(*)::int AS total
      FROM trip_travelers tt
      JOIN trips t ON t.id = tt.trip_id
      WHERE ${tripFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
        AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
    `)
    const totalTravelers = Number((totalResult as any)[0]?.total ?? 0)

    // Covered travelers (selected_package or has_own_insurance)
    const coveredResult = await this.db.client.execute(sql`
      SELECT count(*)::int AS covered
      FROM trip_traveler_insurance tti
      JOIN trip_travelers tt ON tt.id = tti.trip_traveler_id
      JOIN trips t ON t.id = tt.trip_id
      WHERE ${tripFilter}
        AND tti.status IN ('selected_package', 'has_own_insurance')
        AND t.status IN ('active', 'travelling', 'travelled')
        AND coalesce(t.booking_date::timestamptz, t.created_at) >= ${startIso}::timestamptz
        AND coalesce(t.booking_date::timestamptz, t.created_at) <= ${endIso}::timestamptz
    `)
    const coveredTravelers = Number((coveredResult as any)[0]?.covered ?? 0)

    const attachRate = totalTravelers > 0
      ? Math.round((coveredTravelers / totalTravelers) * 10000) / 100 // 2 decimal places
      : 0

    return { totalTravelers, coveredTravelers, attachRate }
  }

  private computeInsuranceKpiWithTrends(current: RawInsuranceKpi, prior: RawInsuranceKpi): InsuranceKpiMetrics {
    return {
      totalTravelers: current.totalTravelers,
      coveredTravelers: current.coveredTravelers,
      attachRate: current.attachRate,
      attachRateTrend: this.computeTrend(current.attachRate, prior.attachRate),
    }
  }
}
