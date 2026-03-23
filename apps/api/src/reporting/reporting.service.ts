/**
 * Reporting Service — Central orchestrator for all 26 reports.
 *
 * Responsibilities:
 *   1. REPORT_CATALOG — static array of ReportDefinition objects
 *   2. getCatalog(auth) — role-filtered catalog
 *   3. runReport(slug, auth, query) — access control, scope resolution, dispatch
 *
 * Admin "My" scope logic:
 *   - admin + 'agency' → tripIds = 'all'
 *   - admin + 'my'     → query trips WHERE owner_id = auth.userId (because
 *     getAccessibleTripIds returns 'all' for admins, which is useless for "my")
 *   - agent             → tripIds = await tripAccess.getAccessibleTripIds(auth)
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { eq, and, isNull } from 'drizzle-orm'
import type { ReportDefinition, ReportCategory, ReportScope } from '@tailfire/shared-types'
import type { AuthContext } from '../auth/auth.types'
import { DatabaseService } from '../db/database.service'
import { TripAccessService } from '../trips/trip-access.service'
import { buildReportResponse } from './dto/report-response.dto'
import type { ReportQueryDto } from './dto/report-query.dto'

// Sales queries
import {
  queryBookedSales,
  queryDepartedSales,
  querySalesByAgent,
  querySalesByDestination,
  querySalesBySupplier,
  queryBookingPipeline,
} from './queries/sales.queries'
import type { SalesQueryOptions } from './queries/sales.queries'

// Financial queries
import {
  queryCommissionAging,
  queryCommissionReconciliation,
  queryPaymentSchedule,
  queryAgentCommissionStatement,
} from './queries/financial.queries'
import type { FinancialQueryOptions } from './queries/financial.queries'

// Operational queries
import { queryUpcomingDepartures } from './queries/operational.queries'
import type { OperationalQueryOptions } from './queries/operational.queries'

// Compliance queries
import { queryOntarioGrossSales } from './queries/compliance.queries'
import type { ComplianceQueryOptions } from './queries/compliance.queries'

// CRM queries
import {
  queryClientSpending,
  queryRepeatClients,
  queryDormantClients,
  queryPassportExpiry,
  queryUpcomingBirthdays,
  queryNewClients,
  queryClientCompleteness,
  queryTopClientsRevenue,
} from './queries/crm.queries'
import type { CrmQueryOptions } from './queries/crm.queries'

// Insurance queries
import {
  queryInsurancePenetration,
  queryInsuranceDeclines,
  queryInsuranceRevenue,
  queryInsuranceByPolicyType,
  queryInsuranceUnresolved,
} from './queries/insurance.queries'
import type { InsuranceQueryOptions } from './queries/insurance.queries'

// ============================================================================
// Report Catalog (26 reports)
// ============================================================================

function def(
  slug: string,
  name: string,
  description: string,
  category: ReportCategory,
  scope: ReportScope,
  supportsMyToggle: boolean,
): ReportDefinition {
  return { slug, name, description, category, scope, supportsMyToggle }
}

export const REPORT_CATALOG: ReportDefinition[] = [
  // ── Sales (7) ──────────────────────────────────────────────────────────
  def(
    'booked-sales',
    'Booked Sales',
    'Trips booked within the selected date range, with total revenue and activity counts.',
    'sales',
    'admin-and-agent',
    true,
  ),
  def(
    'departed-sales',
    'Departed Sales',
    'Trips departing within the selected date range, with total revenue and activity counts.',
    'sales',
    'admin-and-agent',
    true,
  ),
  def(
    'sales-by-agent',
    'Sales by Agent',
    'Booking count, total sales, and average booking value grouped by agent.',
    'sales',
    'admin-only',
    false,
  ),
  def(
    'sales-by-destination',
    'Sales by Destination',
    'Booking count and revenue grouped by destination and trip type.',
    'sales',
    'admin-and-agent',
    true,
  ),
  def(
    'booked-sales-by-supplier',
    'Booked Sales by Supplier',
    'Sales and commission grouped by supplier, filtered by booking date.',
    'sales',
    'admin-and-agent',
    true,
  ),
  def(
    'departed-sales-by-supplier',
    'Departed Sales by Supplier',
    'Sales and commission grouped by supplier, filtered by departure date.',
    'sales',
    'admin-and-agent',
    true,
  ),
  def(
    'booking-pipeline',
    'Booking Pipeline',
    'Current trip count and estimated value by trip status.',
    'sales',
    'admin-and-agent',
    true,
  ),

  // ── Financial (4) ─────────────────────────────────────────────────────
  def(
    'commission-aging',
    'Commission Aging',
    'Outstanding commissions on departed trips, bucketed by days since departure.',
    'financial',
    'admin-and-agent',
    false,
  ),
  def(
    'commission-reconciliation',
    'Commission Reconciliation',
    'Commission checks with matched/unmatched amounts for reconciliation.',
    'financial',
    'admin-only',
    false,
  ),
  def(
    'payment-schedule',
    'Payment Schedule',
    'Expected payment items with due dates, paid amounts, and overdue status.',
    'financial',
    'admin-and-agent',
    true,
  ),
  def(
    'agent-commission-statement',
    'Agent Commission Statement',
    'Per-activity commission detail: gross, received, paid to agent, pending.',
    'financial',
    'admin-and-agent',
    false,
  ),

  // ── Operational (1) ───────────────────────────────────────────────────
  def(
    'upcoming-departures',
    'Upcoming Departures',
    'Trips departing within N days, with payment status and traveler counts.',
    'operational',
    'admin-and-agent',
    true,
  ),

  // ── Compliance (1) ────────────────────────────────────────────────────
  def(
    'ontario-gross-sales',
    'Ontario Gross Sales (TICO)',
    'Monthly gross sales breakdown for TICO Form 1 regulatory reporting.',
    'compliance',
    'admin-only',
    false,
  ),

  // ── CRM (8) ───────────────────────────────────────────────────────────
  def(
    'client-spending',
    'Client Spending',
    'Per-client trip count, total spend, average trip value, and trip date range.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'repeat-clients',
    'Repeat Clients',
    'Clients with 2+ trips, including average days between trips.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'dormant-clients',
    'Dormant Clients',
    'Clients whose last trip ended more than N days ago.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'passport-expiry',
    'Passport Expiry',
    'Contacts with passports expiring within N days, linked to upcoming trips.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'upcoming-birthdays',
    'Upcoming Birthdays',
    'Contacts with birthdays in the next N days.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'new-clients',
    'New Clients',
    'Contacts created within the selected date range.',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'client-data-completeness',
    'Client Data Completeness',
    'Completeness scoring for contact records (email, phone, address, DOB, passport).',
    'crm',
    'admin-and-agent',
    true,
  ),
  def(
    'top-clients-revenue',
    'Top Clients by Revenue',
    'Clients ranked by total spend across all trips.',
    'crm',
    'admin-and-agent',
    true,
  ),

  // ── Insurance (5) ─────────────────────────────────────────────────────
  def(
    'insurance-penetration',
    'Insurance Penetration',
    'Monthly traveler insurance coverage rate: covered, declined, pending.',
    'insurance',
    'admin-and-agent',
    true,
  ),
  def(
    'insurance-declines',
    'Insurance Declines',
    'Travelers who declined insurance, with acknowledgement tracking.',
    'insurance',
    'admin-and-agent',
    true,
  ),
  def(
    'insurance-revenue',
    'Insurance Revenue',
    'Premium revenue grouped by provider and package.',
    'insurance',
    'admin-and-agent',
    true,
  ),
  def(
    'insurance-by-policy-type',
    'Insurance by Policy Type',
    'Package count, premiums, and traveler count grouped by policy type.',
    'insurance',
    'admin-and-agent',
    true,
  ),
  def(
    'insurance-unresolved',
    'Insurance Unresolved',
    'Travelers with pending insurance status on upcoming trips.',
    'insurance',
    'admin-and-agent',
    true,
  ),
]

// Lookup map for O(1) access
const CATALOG_MAP = new Map<string, ReportDefinition>(
  REPORT_CATALOG.map((r) => [r.slug, r]),
)

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly tripAccess: TripAccessService,
  ) {}

  // --------------------------------------------------------------------------
  // getCatalog
  // --------------------------------------------------------------------------

  getCatalog(auth: AuthContext): ReportDefinition[] {
    if (auth.role === 'admin') {
      return REPORT_CATALOG
    }
    // Agents only see admin-and-agent reports
    return REPORT_CATALOG.filter((r) => r.scope === 'admin-and-agent')
  }

  // --------------------------------------------------------------------------
  // runReport
  // --------------------------------------------------------------------------

  async runReport(slug: string, auth: AuthContext, query: ReportQueryDto) {
    // 1. Lookup report definition
    const report = CATALOG_MAP.get(slug)
    if (!report) {
      throw new NotFoundException(`Report "${slug}" not found`)
    }

    // 2. Scope check: admin-only reports reject agents
    if (report.scope === 'admin-only' && auth.role !== 'admin') {
      throw new ForbiddenException(`Report "${slug}" is restricted to administrators`)
    }

    // 3. Resolve viewScope
    const viewScope: 'my' | 'agency' =
      auth.role === 'admin' ? (query.viewScope ?? 'agency') : 'my'

    // 4. Resolve tripIds based on role + viewScope
    const tripIds = await this.resolveTripIds(auth, viewScope)

    // 5. Build common options from query DTO
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 50

    // 6. Dispatch to query builder
    const result = await this.dispatch(slug, auth.agencyId, tripIds, {
      startDate: query.startDate,
      endDate: query.endDate,
      page,
      pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      agentId: query.agentId,
      supplierName: query.supplierName,
      tripType: query.tripType,
      status: query.status,
      daysThreshold: query.daysThreshold,
    })

    // 7. Wrap in response envelope
    return buildReportResponse({
      slug: report.slug,
      name: report.name,
      dateRange: { startDate: query.startDate, endDate: query.endDate },
      viewScope,
      data: result.data,
      totalRows: result.totalRows,
      page,
      pageSize,
      summary: result.summary,
    })
  }

  // --------------------------------------------------------------------------
  // Private: Resolve trip IDs
  // --------------------------------------------------------------------------

  /**
   * Determine the set of trip IDs to scope queries to.
   *
   * - admin + 'agency' → 'all'
   * - admin + 'my'     → query trips where owner_id = auth.userId
   *   (getAccessibleTripIds returns 'all' for admins, which defeats "my" filtering)
   * - agent             → getAccessibleTripIds (owned + shared + inbound)
   */
  private async resolveTripIds(
    auth: AuthContext,
    viewScope: 'my' | 'agency',
  ): Promise<string[] | 'all'> {
    if (auth.role === 'admin') {
      if (viewScope === 'agency') {
        return 'all'
      }
      // Admin "My" scope: fetch trips owned by this admin user
      const ownedTrips = await this.db.client
        .select({ id: this.db.schema.trips.id })
        .from(this.db.schema.trips)
        .where(
          and(
            eq(this.db.schema.trips.ownerId, auth.userId),
            eq(this.db.schema.trips.agencyId, auth.agencyId),
            isNull(this.db.schema.trips.deletedAt),
          ),
        )
      return ownedTrips.map((t) => t.id)
    }

    // Agent: use standard access control
    return this.tripAccess.getAccessibleTripIds(auth)
  }

  // --------------------------------------------------------------------------
  // Private: Dispatch to query builder
  // --------------------------------------------------------------------------

  private async dispatch(
    slug: string,
    agencyId: string,
    tripIds: string[] | 'all',
    opts: {
      startDate: string
      endDate: string
      page: number
      pageSize: number
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
      agentId?: string
      supplierName?: string
      tripType?: string
      status?: string
      daysThreshold?: number
    },
  ): Promise<{ data: any[]; totalRows: number; summary?: Record<string, any> }> {
    const salesOpts: SalesQueryOptions = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      page: opts.page,
      pageSize: opts.pageSize,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
      agentId: opts.agentId,
      supplierName: opts.supplierName,
      tripType: opts.tripType,
      status: opts.status,
    }

    const financialOpts: FinancialQueryOptions = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      page: opts.page,
      pageSize: opts.pageSize,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
      agentId: opts.agentId,
    }

    const operationalOpts: OperationalQueryOptions = {
      daysThreshold: opts.daysThreshold,
      page: opts.page,
      pageSize: opts.pageSize,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
      agentId: opts.agentId,
    }

    const complianceOpts: ComplianceQueryOptions = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      page: opts.page,
      pageSize: opts.pageSize,
    }

    const crmOpts: CrmQueryOptions = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      daysThreshold: opts.daysThreshold,
      page: opts.page,
      pageSize: opts.pageSize,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
    }

    const insuranceOpts: InsuranceQueryOptions = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      daysThreshold: opts.daysThreshold,
      page: opts.page,
      pageSize: opts.pageSize,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
    }

    switch (slug) {
      // ── Sales ──────────────────────────────────────────────────────────
      case 'booked-sales':
        return queryBookedSales(this.db, agencyId, tripIds, salesOpts)

      case 'departed-sales':
        return queryDepartedSales(this.db, agencyId, tripIds, salesOpts)

      case 'sales-by-agent':
        return querySalesByAgent(this.db, agencyId, tripIds, salesOpts)

      case 'sales-by-destination':
        return querySalesByDestination(this.db, agencyId, tripIds, salesOpts)

      case 'booked-sales-by-supplier':
        return querySalesBySupplier(this.db, agencyId, tripIds, {
          ...salesOpts,
          variant: 'booked',
        })

      case 'departed-sales-by-supplier':
        return querySalesBySupplier(this.db, agencyId, tripIds, {
          ...salesOpts,
          variant: 'departed',
        })

      case 'booking-pipeline':
        return queryBookingPipeline(this.db, agencyId, tripIds, salesOpts)

      // ── Financial ─────────────────────────────────────────────────────
      case 'commission-aging':
        return queryCommissionAging(this.db, agencyId, tripIds, financialOpts)

      case 'commission-reconciliation':
        // Agency-wide only — no tripIds parameter
        return queryCommissionReconciliation(this.db, agencyId, financialOpts)

      case 'payment-schedule':
        return queryPaymentSchedule(this.db, agencyId, tripIds, financialOpts)

      case 'agent-commission-statement':
        return queryAgentCommissionStatement(this.db, agencyId, tripIds, financialOpts)

      // ── Operational ───────────────────────────────────────────────────
      case 'upcoming-departures':
        return queryUpcomingDepartures(this.db, agencyId, tripIds, operationalOpts)

      // ── Compliance ────────────────────────────────────────────────────
      case 'ontario-gross-sales':
        // Agency-wide only — no tripIds parameter
        return queryOntarioGrossSales(this.db, agencyId, complianceOpts)

      // ── CRM ───────────────────────────────────────────────────────────
      case 'client-spending':
        return queryClientSpending(this.db, agencyId, tripIds, crmOpts)

      case 'repeat-clients':
        return queryRepeatClients(this.db, agencyId, tripIds, crmOpts)

      case 'dormant-clients':
        return queryDormantClients(this.db, agencyId, tripIds, crmOpts)

      case 'passport-expiry':
        return queryPassportExpiry(this.db, agencyId, tripIds, crmOpts)

      case 'upcoming-birthdays':
        return queryUpcomingBirthdays(this.db, agencyId, tripIds, crmOpts)

      case 'new-clients':
        return queryNewClients(this.db, agencyId, tripIds, crmOpts)

      case 'client-data-completeness':
        return queryClientCompleteness(this.db, agencyId, tripIds, crmOpts)

      case 'top-clients-revenue':
        return queryTopClientsRevenue(this.db, agencyId, tripIds, crmOpts)

      // ── Insurance ─────────────────────────────────────────────────────
      case 'insurance-penetration':
        return queryInsurancePenetration(this.db, agencyId, tripIds, insuranceOpts)

      case 'insurance-declines':
        return queryInsuranceDeclines(this.db, agencyId, tripIds, insuranceOpts)

      case 'insurance-revenue':
        return queryInsuranceRevenue(this.db, agencyId, tripIds, insuranceOpts)

      case 'insurance-by-policy-type':
        return queryInsuranceByPolicyType(this.db, agencyId, tripIds, insuranceOpts)

      case 'insurance-unresolved':
        return queryInsuranceUnresolved(this.db, agencyId, tripIds, insuranceOpts)

      default:
        throw new NotFoundException(`No query builder for report "${slug}"`)
    }
  }
}
