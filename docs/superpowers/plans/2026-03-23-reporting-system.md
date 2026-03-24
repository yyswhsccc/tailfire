# Reporting System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a curated report catalog with 26 named reports across 6 categories (Sales, Financial, Operational, Compliance, CRM, Insurance), role-scoped for admin and agent users, with interactive table views and landscape PDF/CSV export.

**Architecture:** NestJS ReportingModule on the API side with a single `ReportingService` that delegates to category-specific query builders. Each report is a named endpoint returning paginated JSON. A shared `ReportExportService` handles Handlebars-to-Puppeteer landscape PDF and CSV generation. The Next.js admin app gets a `/reporting` page with a report catalog, a shared `<ReportView>` component for all reports (date range picker, filters, table, export buttons), and per-report hooks. Dashboard gets 3 new KPI cards (Booked Sales, Departed Sales, Insurance Attach Rate).

**Tech Stack:** NestJS, Drizzle ORM (raw SQL for aggregations), Puppeteer + Handlebars (PDF), React + TanStack Query + Recharts (frontend), shadcn/ui components.

---

## Critical Schema Reference (MUST follow)

Before writing ANY raw SQL, verify column names against the Drizzle schema files. The TypeScript property name is NOT the DB column name.

### Canonical Join Chain: Trip -> Activity Pricing

The correct join from trips to activity pricing must handle BOTH day-bound and floating activities:

```sql
FROM activity_pricing ap
JOIN itinerary_activities ia ON ia.id = ap.activity_id
LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
```

**Why LEFT JOINs + COALESCE:** Activities connect to trips via two paths:
1. **Day-bound** (majority): `ia.itinerary_day_id -> itinerary_days -> itineraries -> trips`
2. **Floating packages**: `ia.trip_id` directly (no day/itinerary — `itinerary_day_id` is NULL)

Using INNER JOINs on the day chain would silently miss floating activities. Using `ia.trip_id` alone would miss day-bound activities. The `COALESCE(itin.trip_id, ia.trip_id)` pattern matches `trip-lifecycle.service.ts` (line 148-168).

Also exclude informational activity types: `AND ia.activity_type NOT IN ('port_info', 'tour_day')`

### Key Column Name Mappings

| TypeScript Property | DB Column Name | Table | Notes |
|---|---|---|---|
| `activityPricing.totalPriceCents` | `total_price_cents` | `activity_pricing` | |
| `activityPricing.supplier` | `supplier` | `activity_pricing` | NOT on itinerary_activities |
| `itineraryActivities.activityType` | `activity_type` | `itinerary_activities` | NOT "category" |
| `trips.primaryDestinationName` | `primary_destination_name` | `trips` | |
| `trips.statusAutoTransitionedAt` | `status_auto_transitioned_at` | `trips` | timestamptz |
| `trips.bookingDate` | `booking_date` | `trips` | date type — cast to ::timestamptz in COALESCE |
| `commissionTracking.grossCommissionCents` | `gross_commission_cents` | `commission_tracking` | |
| `commissionTracking.netCommissionCents` | `net_commission_cents` | `commission_tracking` | |
| `commissionTracking.receivedCents` | `received_cents` | `commission_tracking` | |
| `commissionTracking.paidCents` | `paid_cents` | `commission_tracking` | |
| `commissionTracking.activityPricingId` | `component_pricing_id` | `commission_tracking` | Legacy name in DB |

### Commission Join Chain

```sql
FROM commission_tracking ct
JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
JOIN itinerary_activities ia ON ia.id = ap.activity_id
LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
```

### Booked Date

Use `coalesce(t.booking_date::timestamptz, t.created_at)` as the "booked date" — NOT `status_auto_transitioned_at`. The `status_auto_transitioned_at` field gets updated on multiple lifecycle transitions (including demotion and travel), so it's unreliable as a booking timestamp. The dashboard service uses this same pattern.

### Admin "My Data" Scope

`TripAccessService.getAccessibleTripIds()` returns `'all'` for admins. To implement the "My Data" toggle for admin users, filter by `t.owner_id = auth.userId` directly — do NOT call getAccessibleTripIds. Match the existing dashboard pattern for personal KPIs (dashboard.service.ts line 154-157).

### CRM Reports — Sensitive Contact Data

CRM reports that expose passport numbers, DOB, or other sensitive fields (passport-expiry, upcoming-birthdays, client-data-completeness) must respect `ContactAccessService` sensitivity rules. Use `ContactAccessService` to verify access, or restrict these reports to admin-only. See `contacts.controller.ts` for the existing pattern.

### PDF Rendering Method

The existing `PuppeteerPdfService` exposes `renderHtmlToPdf(html: string, css?: string)` — NOT `generatePdf()`. The method takes HTML and optional CSS as separate parameters, not an options object.

### Drizzle Execute Return Pattern

Results from `db.client.execute(sql`...`)` return an array directly (NOT `{ rows: [...] }`):
```typescript
const result = await this.db.client.execute(sql`...`)
const value = (result as any[])[0]?.column_name
```

### Auth Decorator

Use `@GetAuthContext()` from `'../auth/decorators/auth-context.decorator'` — NOT `@CurrentUser()`.

### Safe SQL ID List (from dashboard.service.ts)

```typescript
private sqlIdList(ids: string[]): SQL {
  const params = ids.map((id, i) => i === 0 ? sql`${id}` : sql`, ${id}`)
  return sql`(${sql.join(params, sql.raw(''))})`
}
```

**NEVER** use string concatenation for SQL ID lists. Always use parameterized `sql` templates.

---

## File Structure

### API (`apps/api/src/reporting/`)

| File | Responsibility |
|------|---------------|
| `reporting.module.ts` | NestJS module, imports access services + render modules |
| `reporting.controller.ts` | REST endpoints for all reports + export |
| `reporting.service.ts` | Report orchestrator — delegates to query builders, handles scoping |
| `queries/sales.queries.ts` | Raw SQL builders for sales reports (1-7) |
| `queries/financial.queries.ts` | Raw SQL builders for financial reports (8-11) |
| `queries/operational.queries.ts` | Raw SQL builders for operational reports (12) |
| `queries/compliance.queries.ts` | Raw SQL builders for compliance reports (13) |
| `queries/crm.queries.ts` | Raw SQL builders for CRM reports (14-21) |
| `queries/insurance.queries.ts` | Raw SQL builders for insurance reports (22-26) |
| `dto/report-query.dto.ts` | Shared query DTOs (date range, pagination, filters) |
| `dto/report-response.dto.ts` | Response DTOs for each report |
| `export/report-export.service.ts` | PDF (landscape, Puppeteer) + CSV export |
| `export/templates/report-landscape.hbs` | Handlebars template for landscape PDF reports |

### Admin Frontend (`apps/admin/src/`)

| File | Responsibility |
|------|---------------|
| `app/reporting/page.tsx` | Report catalog page — grid of report cards by category |
| `app/reporting/[reportSlug]/page.tsx` | Dynamic report viewer page |
| `app/reporting/_components/report-catalog.tsx` | Grid of clickable report cards |
| `app/reporting/_components/report-view.tsx` | Shared report viewer: date picker, filters, table, export |
| `app/reporting/_components/date-range-picker.tsx` | Date range selector with presets (MTD, YTD, Q1-Q4, custom) |
| `app/reporting/_components/report-table.tsx` | Generic sortable/filterable data table |
| `app/reporting/_components/report-export-buttons.tsx` | PDF + CSV download buttons (uses fetch with auth) |
| `app/reporting/_components/report-filters.tsx` | Per-report filter controls (agent, supplier, status, etc.) |
| `hooks/use-reporting.ts` | React Query hooks for all report endpoints |
| `app/dashboard/_components/kpi-cards.tsx` | Modify: add Booked Sales, Departed Sales, Insurance Attach Rate |

### Shared Types (`packages/shared-types/src/api/`)

| File | Responsibility |
|------|---------------|
| `reporting.types.ts` | Report metadata, query params, response types shared between API and admin |

---

## Report Catalog Reference

| # | Slug | Category | Admin | Agent | Key Query Tables |
|---|------|----------|:-----:|:-----:|-----------------|
| 1 | `booked-sales` | Sales | All + My | My | trips, activity_pricing (via full join chain) |
| 2 | `departed-sales` | Sales | All + My | My | trips, activity_pricing (via full join chain) |
| 3 | `sales-by-agent` | Sales | All | - | trips, activity_pricing, user_profiles |
| 4 | `sales-by-destination` | Sales | All + My | My | trips (primary_destination_name), activity_pricing |
| 5 | `booked-sales-by-supplier` | Sales | All + My | My | activity_pricing (supplier column), commission_tracking |
| 6 | `departed-sales-by-supplier` | Sales | All + My | My | activity_pricing (supplier column), commission_tracking |
| 7 | `booking-pipeline` | Sales | All + My | My | trips (grouped by status) |
| 8 | `commission-aging` | Financial | All | My | commission_tracking, activity_pricing, trips |
| 9 | `commission-reconciliation` | Financial | All | - | commission_checks, commission_check_items |
| 10 | `payment-schedule` | Financial | All + My | My | expected_payment_items, payment_transactions |
| 11 | `agent-commission-statement` | Financial | All agents | My | commission_tracking, activity_pricing, user_profiles |
| 12 | `upcoming-departures` | Operational | All + My | My | trips, contacts, expected_payment_items |
| 13 | `ontario-gross-sales` | Compliance | All | - | activity_pricing, trips |
| 14 | `client-spending` | CRM | All | My | contacts, trips, activity_pricing |
| 15 | `repeat-clients` | CRM | All | My | contacts, trips |
| 16 | `dormant-clients` | CRM | All | My | contacts, trips |
| 17 | `passport-expiry` | CRM | All | My | contacts, trip_travelers, trips |
| 18 | `upcoming-birthdays` | CRM | All | My | contacts |
| 19 | `new-clients` | CRM | All | My | contacts |
| 20 | `client-data-completeness` | CRM | All | My | contacts |
| 21 | `top-clients-revenue` | CRM | All | My | contacts, trips, activity_pricing |
| 22 | `insurance-penetration` | Insurance | All | My | trip_traveler_insurance, trip_travelers |
| 23 | `insurance-declines` | Insurance | All | My | trip_traveler_insurance, trip_travelers |
| 24 | `insurance-revenue` | Insurance | All | My | trip_insurance_packages, activity_pricing |
| 25 | `insurance-by-policy-type` | Insurance | All | My | trip_insurance_packages, trip_traveler_insurance |
| 26 | `insurance-unresolved` | Insurance | All | My | trip_traveler_insurance, trips |

---

## Task 1: Shared Types and DTOs

**Files:**
- Create: `packages/shared-types/src/api/reporting.types.ts`
- Modify: `packages/shared-types/src/api/index.ts`

- [ ] **Step 1: Create reporting types**

```typescript
// packages/shared-types/src/api/reporting.types.ts

// === Report Metadata ===

export type ReportCategory = 'sales' | 'financial' | 'operational' | 'compliance' | 'crm' | 'insurance'

export type ReportScope = 'admin-only' | 'admin-and-agent'

export interface ReportDefinition {
  slug: string
  name: string
  description: string
  category: ReportCategory
  scope: ReportScope
  supportsMyToggle: boolean
}

// === Query Parameters ===

export interface ReportDateRange {
  startDate: string  // ISO date YYYY-MM-DD
  endDate: string
}

export type DatePreset = 'mtd' | 'ytd' | 'last-month' | 'last-quarter' | 'q1' | 'q2' | 'q3' | 'q4' | 'last-year' | 'custom'

export interface ReportQueryParams {
  startDate: string
  endDate: string
  viewScope?: 'my' | 'agency'
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, string>
}

// === Response Envelope ===

export interface ReportResponse<T> {
  reportSlug: string
  reportName: string
  generatedAt: string
  dateRange: ReportDateRange
  viewScope: 'my' | 'agency'
  totalRows: number
  page: number
  pageSize: number
  data: T[]
  summary?: Record<string, number | string>
}

// === Per-Report Row Types ===

export interface BookedSalesRow {
  tripId: string
  tripName: string
  referenceNumber: string | null
  agentName: string
  clientName: string
  bookedDate: string
  departureDate: string | null
  totalPriceCents: number
  currency: string
  activityCount: number
  travelerCount: number
}

export interface DepartedSalesRow {
  tripId: string
  tripName: string
  referenceNumber: string | null
  agentName: string
  clientName: string
  departureDate: string
  returnDate: string | null
  totalPriceCents: number
  currency: string
  activityCount: number
  travelerCount: number
}

export interface SalesByAgentRow {
  agentId: string
  agentName: string
  bookingCount: number
  totalSalesCents: number
  avgBookingValueCents: number
  currency: string
}

export interface SalesByDestinationRow {
  destination: string
  tripType: string
  bookingCount: number
  totalSalesCents: number
  travelerCount: number
  currency: string
}

export interface SalesBySupplierRow {
  supplierName: string
  activityType: string
  activityCount: number
  totalSalesCents: number
  commissionCents: number
  currency: string
}

export interface BookingPipelineRow {
  status: string
  tripCount: number
  totalEstimatedCents: number
  currency: string
}

export interface CommissionAgingRow {
  activityId: string
  activityName: string
  supplierName: string
  tripName: string
  agentName: string
  expectedCents: number
  receivedCents: number
  outstandingCents: number
  departureDate: string
  daysSinceDeparture: number
  agingBucket: '0-30' | '31-60' | '61-90' | '90+'
  currency: string
}

export interface CommissionReconciliationRow {
  checkId: string
  checkNumber: string | null
  supplierName: string
  checkDate: string
  checkAmountCents: number
  matchedAmountCents: number
  unmatchedAmountCents: number
  itemCount: number
  status: string
  currency: string
}

export interface PaymentScheduleRow {
  tripId: string
  tripName: string
  clientName: string
  agentName: string
  itemLabel: string
  dueDate: string
  amountCents: number
  paidCents: number
  remainingCents: number
  status: string
  daysUntilDue: number
  currency: string
}

export interface AgentCommissionStatementRow {
  activityId: string
  activityName: string
  tripName: string
  supplierName: string
  departureDate: string | null
  totalSalesCents: number
  commissionRate: number | null
  grossCommissionCents: number
  receivedCents: number
  paidToAgentCents: number
  pendingCents: number
  currency: string
}

export interface UpcomingDeparturesRow {
  tripId: string
  tripName: string
  clientName: string
  agentName: string
  departureDate: string
  returnDate: string | null
  travelerCount: number
  status: string
  paymentStatus: 'paid' | 'partial' | 'unpaid'
  outstandingCents: number
  documentsComplete: boolean
  daysUntilDeparture: number
  currency: string
}

export interface OntarioGrossSalesRow {
  month: string
  bookingCount: number
  totalSalesCents: number
  serviceFeesCents: number
  grossSalesCents: number
  currency: string
}

export interface ClientSpendingRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  avgTripValueCents: number
  lastTripDate: string | null
  firstTripDate: string | null
  currency: string
}

export interface RepeatClientRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  firstTripDate: string
  lastTripDate: string
  avgDaysBetweenTrips: number | null
  currency: string
}

export interface DormantClientRow {
  contactId: string
  clientName: string
  email: string | null
  phone: string | null
  agentName: string | null
  lastTripDate: string
  daysSinceLastTrip: number
  lifetimeSpendCents: number
  tripCount: number
  currency: string
}

export interface PassportExpiryRow {
  contactId: string
  travelerName: string
  passportNumber: string | null
  passportExpiry: string
  daysUntilExpiry: number
  nationality: string | null
  upcomingTripName: string | null
  upcomingTripDate: string | null
}

export interface UpcomingBirthdayRow {
  contactId: string
  clientName: string
  email: string | null
  phone: string | null
  birthDate: string
  daysUntilBirthday: number
  agentName: string | null
  age: number
}

export interface NewClientsRow {
  contactId: string
  clientName: string
  email: string | null
  createdAt: string
  agentName: string | null
  hasTrip: boolean
  firstTripDate: string | null
}

export interface ClientCompletenessRow {
  contactId: string
  clientName: string
  hasEmail: boolean
  hasPhone: boolean
  hasAddress: boolean
  hasDob: boolean
  hasPassport: boolean
  completenessScore: number
  missingFields: string[]
}

export interface TopClientsRevenueRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  avgTripValueCents: number
  lastTripDate: string | null
  currency: string
}

export interface InsurancePenetrationRow {
  period: string
  totalTravelers: number
  coveredTravelers: number
  ownInsuranceTravelers: number
  declinedTravelers: number
  pendingTravelers: number
  penetrationRate: number
}

export interface InsuranceDeclineRow {
  tripId: string
  tripName: string
  travelerName: string
  departureDate: string | null
  declinedAt: string | null
  acknowledgedAt: string | null
  declinedReason: string | null
  isAcknowledged: boolean
}

export interface InsuranceRevenueRow {
  providerName: string
  packageName: string
  policyType: string
  packageCount: number
  totalPremiumCents: number
  totalCoverageCents: number
  travelerCount: number
  currency: string
}

export interface InsuranceByPolicyTypeRow {
  policyType: string
  packageCount: number
  travelerCount: number
  totalPremiumCents: number
  avgPremiumCents: number
  penetrationRate: number
  currency: string
}

export interface InsuranceUnresolvedRow {
  tripId: string
  tripName: string
  travelerName: string
  departureDate: string | null
  daysUntilDeparture: number | null
  status: string
  agentName: string | null
}
```

- [ ] **Step 2: Export from shared-types index**

Add to `packages/shared-types/src/api/index.ts`:

```typescript
export * from './reporting.types'
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/api/reporting.types.ts packages/shared-types/src/api/index.ts
git commit -m "$(cat <<'EOF'
feat(shared-types): add reporting system type definitions

26 report row types, query params, response envelope, and report
metadata types shared between API and admin frontend.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: API Report Query DTOs

**Files:**
- Create: `apps/api/src/reporting/dto/report-query.dto.ts`
- Create: `apps/api/src/reporting/dto/report-response.dto.ts`

- [ ] **Step 1: Create query DTO with validation**

```typescript
// apps/api/src/reporting/dto/report-query.dto.ts
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'

export class ReportQueryDto {
  @IsDateString()
  startDate: string

  @IsDateString()
  endDate: string

  @IsOptional()
  @IsEnum(['my', 'agency'])
  viewScope?: 'my' | 'agency' = 'agency'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50

  @IsOptional()
  @IsString()
  sortBy?: string

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc'

  @IsOptional()
  @IsString()
  agentId?: string

  @IsOptional()
  @IsString()
  supplierName?: string

  @IsOptional()
  @IsString()
  tripType?: string

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  daysThreshold?: number
}

export class ExportReportDto extends ReportQueryDto {
  @IsEnum(['pdf', 'csv'])
  format: 'pdf' | 'csv'
}
```

- [ ] **Step 2: Create response DTO builder**

```typescript
// apps/api/src/reporting/dto/report-response.dto.ts
import { ReportResponse, ReportDateRange } from '@tailfire/shared-types'

export function buildReportResponse<T>(params: {
  slug: string
  name: string
  dateRange: ReportDateRange
  viewScope: 'my' | 'agency'
  data: T[]
  totalRows: number
  page: number
  pageSize: number
  summary?: Record<string, number | string>
}): ReportResponse<T> {
  return {
    reportSlug: params.slug,
    reportName: params.name,
    generatedAt: new Date().toISOString(),
    dateRange: params.dateRange,
    viewScope: params.viewScope,
    totalRows: params.totalRows,
    page: params.page,
    pageSize: params.pageSize,
    data: params.data,
    summary: params.summary,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/reporting/dto/
git commit -m "$(cat <<'EOF'
feat(api): add reporting query and response DTOs

Validated query DTO with date range, pagination, sorting, and
report-specific filters. Response envelope builder for consistent
report output.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Sales Query Builders

**Files:**
- Create: `apps/api/src/reporting/queries/sales.queries.ts`

- [ ] **Step 1: Create sales query builders**

Each function takes `(db, agencyId, tripIds, options)` and returns `{ data, totalRows, summary }`.

```typescript
// apps/api/src/reporting/queries/sales.queries.ts
import { sql, SQL } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'

/** Build a parameterized SQL list from an array of IDs — safe from SQL injection.
 *  Copied from dashboard.service.ts pattern. */
export function sqlIdList(ids: string[]): SQL {
  const params = ids.map((id, i) => i === 0 ? sql`${id}` : sql`, ${id}`)
  return sql`(${sql.join(params, sql.raw(''))})`
}

/** Build trip scope filter using parameterized SQL */
function tripScopeFilter(tripIds: string[] | 'all', agencyId: string): SQL {
  if (tripIds === 'all') return sql`t.agency_id = ${agencyId}`
  if (tripIds.length === 0) return sql`FALSE`
  return sql`t.agency_id = ${agencyId} AND t.id IN ${sqlIdList(tripIds)}`
}

export interface SalesQueryOptions {
  startDate: string
  endDate: string
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  agentId?: string
  supplierName?: string
  tripType?: string
}

/**
 * Report 1: Booked Sales
 * Trips that transitioned to 'active' (booking confirmed) within the date range.
 * Uses booking_date as the "booked date" (cast to timestamptz).
 * Falls back to created_at. Does NOT use status_auto_transitioned_at
 * (it updates on multiple lifecycle transitions, not just booking).
 *
 * IMPORTANT: Uses the canonical 4-table join chain:
 * activity_pricing -> itinerary_activities -> itinerary_days -> itineraries -> trips
 */
export async function queryBookedSales(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
) {
  const { startDate, endDate, page, pageSize, sortOrder = 'desc', agentId } = options
  const offset = (page - 1) * pageSize
  const scopeFilter = tripScopeFilter(tripIds, agencyId)
  const agentFilter = agentId ? sql`AND t.owner_id = ${agentId}` : sql``

  const result = await db.client.execute(sql`
    WITH booked_trips AS (
      SELECT
        t.id AS trip_id,
        t.name AS trip_name,
        t.reference_number,
        coalesce(t.booking_date::timestamptz, t.created_at) AS booked_date,
        t.start_date AS departure_date,
        coalesce(up.first_name || ' ' || up.last_name, 'Unassigned') AS agent_name,
        coalesce(c.first_name || ' ' || c.last_name, 'No Contact') AS client_name,
        t.currency,
        (SELECT count(*) FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
      FROM trips t
      LEFT JOIN user_profiles up ON up.id = t.owner_id
      LEFT JOIN contacts c ON c.id = t.primary_contact_id
      WHERE ${scopeFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND coalesce(t.booking_date::timestamptz, t.created_at)
            BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
        ${agentFilter}
    ),
    activity_totals AS (
      SELECT
        itin.trip_id,
        coalesce(sum(ap.total_price_cents), 0) AS total_price_cents,
        count(ia.id) AS activity_count
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
      WHERE itin.trip_id IN (SELECT trip_id FROM booked_trips)
        AND ia.booking_status = 'booked'
      GROUP BY itin.trip_id
    )
    SELECT
      bt.trip_id AS "tripId",
      bt.trip_name AS "tripName",
      bt.reference_number AS "referenceNumber",
      bt.agent_name AS "agentName",
      bt.client_name AS "clientName",
      bt.booked_date::text AS "bookedDate",
      bt.departure_date::text AS "departureDate",
      coalesce(at2.total_price_cents, 0)::int AS "totalPriceCents",
      bt.currency,
      coalesce(at2.activity_count, 0)::int AS "activityCount",
      bt.traveler_count::int AS "travelerCount",
      count(*) OVER() AS "totalRows"
    FROM booked_trips bt
    LEFT JOIN activity_totals at2 ON at2.trip_id = bt.trip_id
    ORDER BY bt.booked_date ${sql.raw(sortOrder)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)

  const rows = result as any[]
  const totalRows = rows.length > 0 ? Number(rows[0].totalRows) : 0

  // Summary: total sales across all pages
  const summaryResult = await db.client.execute(sql`
    SELECT
      coalesce(sum(ap.total_price_cents), 0)::bigint AS "totalSalesCents",
      count(DISTINCT itin.trip_id)::int AS "totalBookings"
    FROM activity_pricing ap
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    WHERE ${scopeFilter}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND coalesce(t.booking_date::timestamptz, t.created_at)
          BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
      ${agentFilter}
  `)

  return {
    data: rows.map(r => ({
      tripId: r.tripId,
      tripName: r.tripName,
      referenceNumber: r.referenceNumber,
      agentName: r.agentName,
      clientName: r.clientName,
      bookedDate: r.bookedDate,
      departureDate: r.departureDate,
      totalPriceCents: r.totalPriceCents,
      currency: r.currency,
      activityCount: r.activityCount,
      travelerCount: r.travelerCount,
    })),
    totalRows,
    summary: {
      totalSalesCents: Number((summaryResult as any[])[0]?.totalSalesCents ?? 0),
      totalBookings: Number((summaryResult as any[])[0]?.totalBookings ?? 0),
    },
  }
}

/**
 * Report 2: Departed Sales
 * Trips where start_date falls within the date range.
 * Same canonical join chain.
 */
export async function queryDepartedSales(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
) {
  const { startDate, endDate, page, pageSize, sortOrder = 'desc', agentId } = options
  const offset = (page - 1) * pageSize
  const scopeFilter = tripScopeFilter(tripIds, agencyId)
  const agentFilter = agentId ? sql`AND t.owner_id = ${agentId}` : sql``

  const result = await db.client.execute(sql`
    WITH departed_trips AS (
      SELECT
        t.id AS trip_id,
        t.name AS trip_name,
        t.reference_number,
        t.start_date AS departure_date,
        t.end_date AS return_date,
        coalesce(up.first_name || ' ' || up.last_name, 'Unassigned') AS agent_name,
        coalesce(c.first_name || ' ' || c.last_name, 'No Contact') AS client_name,
        t.currency,
        (SELECT count(*) FROM trip_travelers tt WHERE tt.trip_id = t.id) AS traveler_count
      FROM trips t
      LEFT JOIN user_profiles up ON up.id = t.owner_id
      LEFT JOIN contacts c ON c.id = t.primary_contact_id
      WHERE ${scopeFilter}
        AND t.status IN ('active', 'travelling', 'travelled')
        AND t.start_date BETWEEN ${startDate}::date AND ${endDate}::date
        ${agentFilter}
    ),
    activity_totals AS (
      SELECT
        itin.trip_id,
        coalesce(sum(ap.total_price_cents), 0) AS total_price_cents,
        count(ia.id) AS activity_count
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries itin ON itin.id = iday.itinerary_id
      WHERE itin.trip_id IN (SELECT trip_id FROM departed_trips)
        AND ia.booking_status = 'booked'
      GROUP BY itin.trip_id
    )
    SELECT
      dt.trip_id AS "tripId",
      dt.trip_name AS "tripName",
      dt.reference_number AS "referenceNumber",
      dt.agent_name AS "agentName",
      dt.client_name AS "clientName",
      dt.departure_date::text AS "departureDate",
      dt.return_date::text AS "returnDate",
      coalesce(at2.total_price_cents, 0)::int AS "totalPriceCents",
      dt.currency,
      coalesce(at2.activity_count, 0)::int AS "activityCount",
      dt.traveler_count::int AS "travelerCount",
      count(*) OVER() AS "totalRows"
    FROM departed_trips dt
    LEFT JOIN activity_totals at2 ON at2.trip_id = dt.trip_id
    ORDER BY dt.departure_date ${sql.raw(sortOrder)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)

  const rows = result as any[]
  const totalRows = rows.length > 0 ? Number(rows[0].totalRows) : 0

  const summaryResult = await db.client.execute(sql`
    SELECT
      coalesce(sum(ap.total_price_cents), 0)::bigint AS "totalSalesCents",
      count(DISTINCT itin.trip_id)::int AS "totalTrips"
    FROM activity_pricing ap
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    WHERE ${scopeFilter}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND t.start_date BETWEEN ${startDate}::date AND ${endDate}::date
      ${agentFilter}
  `)

  return {
    data: rows.map(r => ({
      tripId: r.tripId,
      tripName: r.tripName,
      referenceNumber: r.referenceNumber,
      agentName: r.agentName,
      clientName: r.clientName,
      departureDate: r.departureDate,
      returnDate: r.returnDate,
      totalPriceCents: r.totalPriceCents,
      currency: r.currency,
      activityCount: r.activityCount,
      travelerCount: r.travelerCount,
    })),
    totalRows,
    summary: {
      totalSalesCents: Number((summaryResult as any[])[0]?.totalSalesCents ?? 0),
      totalTrips: Number((summaryResult as any[])[0]?.totalTrips ?? 0),
    },
  }
}

/**
 * Report 3: Sales by Agent (Admin-only)
 */
export async function querySalesByAgent(
  db: DatabaseService,
  agencyId: string,
  options: SalesQueryOptions,
) {
  const { startDate, endDate, page, pageSize, sortOrder = 'desc' } = options
  const offset = (page - 1) * pageSize

  const result = await db.client.execute(sql`
    SELECT
      t.owner_id AS "agentId",
      coalesce(up.first_name || ' ' || up.last_name, 'Unassigned') AS "agentName",
      count(DISTINCT t.id)::int AS "bookingCount",
      coalesce(sum(ap.total_price_cents), 0)::bigint AS "totalSalesCents",
      CASE WHEN count(DISTINCT t.id) > 0
        THEN (coalesce(sum(ap.total_price_cents), 0) / count(DISTINCT t.id))::int
        ELSE 0
      END AS "avgBookingValueCents",
      'CAD' AS currency,
      count(*) OVER() AS "totalRows"
    FROM activity_pricing ap
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    LEFT JOIN user_profiles up ON up.id = t.owner_id
    WHERE t.agency_id = ${agencyId}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND coalesce(t.booking_date::timestamptz, t.created_at)
          BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
    GROUP BY t.owner_id, up.first_name, up.last_name
    ORDER BY "totalSalesCents" ${sql.raw(sortOrder)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)

  const rows = result as any[]
  return {
    data: rows.map(r => ({
      agentId: r.agentId,
      agentName: r.agentName,
      bookingCount: Number(r.bookingCount),
      totalSalesCents: Number(r.totalSalesCents),
      avgBookingValueCents: Number(r.avgBookingValueCents),
      currency: r.currency,
    })),
    totalRows: rows.length > 0 ? Number(rows[0].totalRows) : 0,
  }
}

/**
 * Report 4: Sales by Destination/Type
 * Uses trips.primary_destination_name (NOT itinerary_activities.destination which doesn't exist)
 */
export async function querySalesByDestination(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions,
) {
  const { startDate, endDate, page, pageSize, sortOrder = 'desc', tripType } = options
  const offset = (page - 1) * pageSize
  const scopeFilter = tripScopeFilter(tripIds, agencyId)
  const typeFilter = tripType ? sql`AND t.trip_type = ${tripType}` : sql``

  const result = await db.client.execute(sql`
    SELECT
      coalesce(t.primary_destination_name, 'Unknown') AS destination,
      coalesce(t.trip_type, 'custom') AS "tripType",
      count(DISTINCT t.id)::int AS "bookingCount",
      coalesce(sum(ap.total_price_cents), 0)::bigint AS "totalSalesCents",
      (SELECT count(*) FROM trip_travelers tt
       WHERE tt.trip_id = ANY(ARRAY_AGG(DISTINCT t.id)))::int AS "travelerCount",
      'CAD' AS currency,
      count(*) OVER() AS "totalRows"
    FROM activity_pricing ap
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    WHERE ${scopeFilter}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      AND coalesce(t.booking_date::timestamptz, t.created_at)
          BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
      ${typeFilter}
    GROUP BY t.primary_destination_name, t.trip_type
    ORDER BY "totalSalesCents" ${sql.raw(sortOrder)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)

  const rows = result as any[]
  return {
    data: rows.map(r => ({
      destination: r.destination,
      tripType: r.tripType,
      bookingCount: Number(r.bookingCount),
      totalSalesCents: Number(r.totalSalesCents),
      travelerCount: Number(r.travelerCount),
      currency: r.currency,
    })),
    totalRows: rows.length > 0 ? Number(rows[0].totalRows) : 0,
  }
}

/**
 * Reports 5 & 6: Sales by Supplier (Booked and Departed variants)
 * Supplier is on activity_pricing.supplier (NOT itinerary_activities)
 * Commission from commission_tracking via component_pricing_id
 */
export async function querySalesBySupplier(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
  options: SalesQueryOptions & { variant: 'booked' | 'departed' },
) {
  const { startDate, endDate, page, pageSize, sortOrder = 'desc', variant, supplierName } = options
  const offset = (page - 1) * pageSize
  const scopeFilter = tripScopeFilter(tripIds, agencyId)
  const supplierFilter = supplierName ? sql`AND ap.supplier ILIKE ${'%' + supplierName + '%'}` : sql``

  const dateFilter = variant === 'booked'
    ? sql`AND coalesce(t.booking_date::timestamptz, t.created_at) BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz`
    : sql`AND t.start_date BETWEEN ${startDate}::date AND ${endDate}::date`

  const result = await db.client.execute(sql`
    SELECT
      coalesce(ap.supplier, 'Unknown') AS "supplierName",
      ia.activity_type AS "activityType",
      count(ia.id)::int AS "activityCount",
      coalesce(sum(ap.total_price_cents), 0)::bigint AS "totalSalesCents",
      coalesce(sum(ct.gross_commission_cents), 0)::bigint AS "commissionCents",
      'CAD' AS currency,
      count(*) OVER() AS "totalRows"
    FROM activity_pricing ap
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
    JOIN itineraries itin ON itin.id = iday.itinerary_id
    JOIN trips t ON t.id = COALESCE(itin.trip_id, ia.trip_id)
    LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
    WHERE ${scopeFilter}
      AND t.status IN ('active', 'travelling', 'travelled')
      AND ia.booking_status = 'booked'
      ${dateFilter}
      ${supplierFilter}
    GROUP BY ap.supplier, ia.activity_type
    ORDER BY "totalSalesCents" ${sql.raw(sortOrder)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)

  const rows = result as any[]
  return {
    data: rows.map(r => ({
      supplierName: r.supplierName,
      activityType: r.activityType,
      activityCount: Number(r.activityCount),
      totalSalesCents: Number(r.totalSalesCents),
      commissionCents: Number(r.commissionCents),
      currency: r.currency,
    })),
    totalRows: rows.length > 0 ? Number(rows[0].totalRows) : 0,
  }
}

/**
 * Report 7: Booking Pipeline (trips grouped by status)
 */
export async function queryBookingPipeline(
  db: DatabaseService,
  agencyId: string,
  tripIds: string[] | 'all',
) {
  const scopeFilter = tripScopeFilter(tripIds, agencyId)

  const result = await db.client.execute(sql`
    SELECT
      t.status,
      count(t.id)::int AS "tripCount",
      coalesce(sum(t.estimated_total_cost * 100), 0)::bigint AS "totalEstimatedCents",
      'CAD' AS currency
    FROM trips t
    WHERE ${scopeFilter}
      AND t.status NOT IN ('cancelled')
    GROUP BY t.status
    ORDER BY CASE t.status
      WHEN 'inbound' THEN 1
      WHEN 'planning' THEN 2
      WHEN 'active' THEN 3
      WHEN 'travelling' THEN 4
      WHEN 'travelled' THEN 5
    END
  `)

  const rows = result as any[]
  return {
    data: rows.map(r => ({
      status: r.status,
      tripCount: Number(r.tripCount),
      totalEstimatedCents: Number(r.totalEstimatedCents),
      currency: r.currency,
    })),
    totalRows: rows.length,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/reporting/queries/sales.queries.ts
git commit -m "$(cat <<'EOF'
feat(api): add sales report query builders

7 sales queries using canonical 4-table join chain, parameterized
SQL ID lists, and correct column names (ap.supplier, ia.activity_type,
t.primary_destination_name).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Financial Query Builders

**Files:**
- Create: `apps/api/src/reporting/queries/financial.queries.ts`

**IMPORTANT:** Before writing any SQL, verify every column name against these schema files:
- `packages/database/src/schema/activity-pricing.schema.ts` — `commission_tracking` (uses `component_pricing_id` FK to `activity_pricing.id`), `expected_payment_items`, `payment_schedule_config`
- `packages/database/src/schema/financials.schema.ts` — `commission_checks`, `commission_check_items` (uses `activity_pricing_id` FK), `payment_transactions`

- [ ] **Step 1: Create financial query builders**

Build 4 query functions following the same patterns as Task 3 (import `sqlIdList`, `tripScopeFilter` from sales.queries.ts):

1. `queryCommissionAging()` — Join `commission_tracking` via `component_pricing_id -> activity_pricing.id`, then through the 4-table chain to trips. Calculate `daysSinceDeparture = CURRENT_DATE - t.start_date`. Bucket into 0-30, 31-60, 61-90, 90+. Filter to trips with status IN ('travelling', 'travelled') where `ct.gross_commission_cents > ct.received_cents`. Use `ap.supplier` for supplier name.

2. `queryCommissionReconciliation()` — Admin-only. Query `commission_checks` joined to `commission_check_items`. Show `check_amount_cents` vs sum of `cci.received_cents`. Calculate `unmatchedAmountCents = check_amount_cents - SUM(cci.received_cents)`.

3. `queryPaymentSchedule()` — Query `expected_payment_items` joined to trips and contacts. Calculate `daysUntilDue = due_date - CURRENT_DATE`. Show paid vs remaining from `payment_transactions`.

4. `queryAgentCommissionStatement()` — Per-agent commission detail via `commission_tracking -> activity_pricing -> (4-table chain) -> trips`. Show `gross_commission_cents`, `received_cents`, `paid_cents`. Filter by `agentId` (trips.owner_id). Use `ap.supplier` for supplier name.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/reporting/queries/financial.queries.ts
git commit -m "$(cat <<'EOF'
feat(api): add financial report query builders

Commission aging (via commission_tracking), reconciliation,
payment schedule, and agent commission statement queries.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CRM, Operational, Compliance, and Insurance Query Builders

**Files:**
- Create: `apps/api/src/reporting/queries/operational.queries.ts`
- Create: `apps/api/src/reporting/queries/compliance.queries.ts`
- Create: `apps/api/src/reporting/queries/crm.queries.ts`
- Create: `apps/api/src/reporting/queries/insurance.queries.ts`

**IMPORTANT:** Before writing any SQL, verify column names against:
- `packages/database/src/schema/contacts.schema.ts` — email, phone, address fields, `date_of_birth`, passport fields
- `packages/database/src/schema/trips.schema.ts` — `trip_travelers` table, passport columns
- `packages/database/src/schema/insurance.schema.ts` — `trip_insurance_packages`, `trip_traveler_insurance`
- `packages/database/src/schema/activity-pricing.schema.ts` — `expected_payment_items`, `service_fees`

- [ ] **Step 1: Create operational query builder**

`queryUpcomingDepartures()` — Trips departing in next N days (default 30, configurable via `daysThreshold`). Include payment status (paid/partial/unpaid derived from expected_payment_items vs payment_transactions), traveler count. Use `tripScopeFilter` from sales.queries.ts.

- [ ] **Step 2: Create compliance query builder**

`queryOntarioGrossSales()` — Admin-only. Monthly breakdown of gross sales for TICO Form 1. SUM of `activity_pricing.total_price_cents` via canonical join chain grouped by month within date range. Include service fees from `service_fees` table. Include annual summary row.

- [ ] **Step 3: Create CRM query builders**

8 functions following the same pattern. Import `sqlIdList`, `tripScopeFilter` from sales.queries.ts.

1. `queryClientSpending()` — Per-contact aggregate: trip count, total spend, avg trip value, first/last trip dates. Join: contacts -> trip_travelers -> trips -> (canonical chain) -> activity_pricing.

2. `queryRepeatClients()` — Contacts with 2+ trips. Calculate avg days between trips.

3. `queryDormantClients()` — Contacts where last trip's end_date > N days ago (default 365, via `daysThreshold`). Include lifetime spend.

4. `queryPassportExpiry()` — Check `contacts` table for passport expiry fields. Filter to within N days of today. Join to upcoming trips via trip_travelers.

5. `queryUpcomingBirthdays()` — Contacts with `date_of_birth`. Calculate days until next birthday (handle year wrap). Filter to next N days.

6. `queryNewClients()` — Contacts created within date range. Show whether they have a trip via LEFT JOIN trip_travelers.

7. `queryClientCompleteness()` — Score each contact: email (20pts), phone (20pts), address (20pts), DOB (20pts), passport (20pts). Use CASE expressions.

8. `queryTopClientsRevenue()` — Top N contacts by total spend via canonical join chain. Sort by revenue desc.

- [ ] **Step 4: Create insurance query builders**

5 functions:

1. `queryInsurancePenetration()` — Monthly: total travelers from `trip_travelers` vs covered (`trip_traveler_insurance.status IN ('selected_package', 'has_own_insurance')`) vs declined vs pending. Rate = covered / total * 100.

2. `queryInsuranceDeclines()` — Travelers with `trip_traveler_insurance.status = 'declined'`. Include `acknowledged_at` for compliance. Flag if NOT acknowledged.

3. `queryInsuranceRevenue()` — Group by `trip_insurance_packages.provider_name`, `package_name`. SUM `premium_cents`. Count travelers via `trip_traveler_insurance`.

4. `queryInsuranceByPolicyType()` — Group by `trip_insurance_packages.policy_type` enum. Count packages, travelers, SUM premiums.

5. `queryInsuranceUnresolved()` — Travelers with `trip_traveler_insurance.status = 'pending'` on trips departing within 90 days. Sort by departure date asc.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reporting/queries/
git commit -m "$(cat <<'EOF'
feat(api): add operational, compliance, CRM, and insurance query builders

Upcoming departures, Ontario gross sales, 8 CRM reports, and
5 insurance reports. All use canonical join chains and verified
column names.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Report Export Service (PDF + CSV)

**Files:**
- Create: `apps/api/src/reporting/export/report-export.service.ts`
- Create: `apps/api/src/reporting/export/templates/report-landscape.hbs`

- [ ] **Step 1: Create the Handlebars template**

Landscape layout, data-focused with power header/footer:

```handlebars
{{!-- apps/api/src/reporting/export/templates/report-landscape.hbs --}}
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: letter landscape;
      margin: 0.4in 0.5in 0.6in 0.5in;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 9px;
      color: #1a1a1a;
      line-height: 1.4;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .report-header-left h1 {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .report-header-left .subtitle {
      font-size: 10px;
      color: #666;
      margin-top: 2px;
    }
    .report-header-right {
      text-align: right;
      font-size: 8px;
      color: #666;
    }
    .report-header-right .company { font-weight: 600; color: #1a1a1a; font-size: 9px; }
    .summary-bar {
      display: flex;
      gap: 24px;
      background: #f8f8f8;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .summary-item .label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
    .summary-item .value { font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #f0f0f0;
      border-bottom: 1px solid #ccc;
      padding: 4px 6px;
      text-align: left;
      font-size: 7.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #555;
      font-weight: 600;
    }
    thead th.right { text-align: right; }
    tbody td {
      padding: 3px 6px;
      border-bottom: 1px solid #eee;
      font-size: 8.5px;
    }
    tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.mono { font-family: 'Courier New', monospace; font-size: 8px; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr:last-child td { border-bottom: 1px solid #ccc; }
    tfoot td {
      padding: 5px 6px;
      font-weight: 700;
      font-size: 9px;
      border-top: 2px solid #1a1a1a;
    }
    tfoot td.right { text-align: right; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-header-left">
      <h1>{{reportName}}</h1>
      <div class="subtitle">{{dateRangeLabel}} &middot; {{viewScopeLabel}}</div>
    </div>
    <div class="report-header-right">
      <div class="company">{{companyName}}</div>
      {{#if ticoRegistration}}<div>TICO Reg. {{ticoRegistration}}</div>{{/if}}
      <div>Generated {{generatedAt}}</div>
    </div>
  </div>

  {{#if summaryItems}}
  <div class="summary-bar">
    {{#each summaryItems}}
    <div class="summary-item">
      <div class="label">{{this.label}}</div>
      <div class="value">{{this.value}}</div>
    </div>
    {{/each}}
  </div>
  {{/if}}

  <table>
    <thead>
      <tr>
        {{#each columns}}
        <th class="{{#if this.align}}{{this.align}}{{/if}}">{{this.header}}</th>
        {{/each}}
      </tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr>
        {{#each ../columns}}
        <td class="{{#if this.align}}{{this.align}}{{/if}} {{#if this.mono}}mono{{/if}}">
          {{lookup ../this this.key}}
        </td>
        {{/each}}
      </tr>
      {{/each}}
    </tbody>
    {{#if footerRow}}
    <tfoot>
      <tr>
        {{#each columns}}
        <td class="{{#if this.align}}{{this.align}}{{/if}}">
          {{lookup ../footerRow this.key}}
        </td>
        {{/each}}
      </tr>
    </tfoot>
    {{/if}}
  </table>
</body>
</html>
```

**Note:** Page numbers are handled by Puppeteer's `headerTemplate`/`footerTemplate` options, not by Handlebars variables. The export service should set `displayHeaderFooter: true` with a footer template containing page counters.

- [ ] **Step 2: Create the export service**

```typescript
// apps/api/src/reporting/export/report-export.service.ts
import { Injectable } from '@nestjs/common'
import { PuppeteerPdfService } from '../../document-render/puppeteer-pdf.service'
import * as Handlebars from 'handlebars'

interface ReportColumn {
  key: string
  header: string
  align?: 'right'
  mono?: boolean
}

interface ExportContext {
  reportName: string
  dateRangeLabel: string
  viewScopeLabel: string
  companyName: string
  ticoRegistration?: string
  generatedAt: string
  columns: ReportColumn[]
  rows: Record<string, string>[]
  summaryItems?: { label: string; value: string }[]
  footerRow?: Record<string, string>
}

@Injectable()
export class ReportExportService {
  constructor(
    private readonly puppeteer: PuppeteerPdfService,
  ) {}

  async generatePdf(context: ExportContext): Promise<Buffer> {
    // Compile template inline — avoids nest-cli asset packaging issues
    // The template is defined in report-landscape.hbs but inlined here at build time
    const template = Handlebars.compile(REPORT_TEMPLATE)
    const html = template(context)

    // PuppeteerPdfService exposes renderHtmlToPdf(html, css?) — NOT generatePdf
    return this.puppeteer.renderHtmlToPdf(html)
  }

  generateCsv(columns: ReportColumn[], rows: Record<string, string | number>[]): string {
    const header = columns.map(c => `"${c.header}"`).join(',')
    const body = rows.map(row =>
      columns.map(c => {
        const val = row[c.key]
        if (val === null || val === undefined) return ''
        if (typeof val === 'number') return val.toString()
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(','),
    ).join('\n')
    return `${header}\n${body}`
  }
}

/**
 * Inline template constant — avoids fs.readFileSync + nest-cli asset config.
 * The .hbs file in export/templates/ is the source of truth for design iteration;
 * copy changes here after modifying the .hbs file.
 */
const REPORT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* ... (full CSS from report-landscape.hbs — see Task 6 Step 1) ... */
  </style>
</head>
<body>
  {{!-- ... (full Handlebars from report-landscape.hbs) ... --}}
</body>
</html>`
```

**IMPORTANT:** The implementing agent should:
1. Write the full `.hbs` file first (Task 6 Step 1) for design iteration
2. Copy the final HTML/CSS into the `REPORT_TEMPLATE` constant above
3. This avoids needing `nest-cli.json` asset config changes (current SWC builder doesn't copy non-TS files to dist)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/reporting/export/
git commit -m "$(cat <<'EOF'
feat(api): add report export service with landscape PDF and CSV

Handlebars template for data-focused landscape PDFs with Puppeteer
page numbering footer. CSV generator with proper escaping.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Reporting Service (Orchestrator)

**Files:**
- Create: `apps/api/src/reporting/reporting.service.ts`

- [ ] **Step 1: Create the reporting service**

The service orchestrates: resolves slug -> checks access -> determines scope -> calls query builder -> wraps in response envelope.

```typescript
// apps/api/src/reporting/reporting.service.ts
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripAccessService } from '../trips/trip-access.service'
import { AuthContext } from '../auth/auth.types'
import { ReportQueryDto } from './dto/report-query.dto'
import { buildReportResponse } from './dto/report-response.dto'
import { ReportDefinition, ReportResponse } from '@tailfire/shared-types'
import * as salesQueries from './queries/sales.queries'
import * as financialQueries from './queries/financial.queries'
import * as operationalQueries from './queries/operational.queries'
import * as complianceQueries from './queries/compliance.queries'
import * as crmQueries from './queries/crm.queries'
import * as insuranceQueries from './queries/insurance.queries'

export const REPORT_CATALOG: ReportDefinition[] = [
  // Sales
  { slug: 'booked-sales', name: 'Booked Sales', description: 'Trips with confirmed bookings in period', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'departed-sales', name: 'Departed Sales', description: 'Trips departing within period', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'sales-by-agent', name: 'Sales by Agent', description: 'Booking volume and revenue per agent', category: 'sales', scope: 'admin-only', supportsMyToggle: false },
  { slug: 'sales-by-destination', name: 'Sales by Destination', description: 'Revenue by destination and trip type', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'booked-sales-by-supplier', name: 'Booked Sales by Supplier', description: 'Supplier breakdown for booked trips', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'departed-sales-by-supplier', name: 'Departed Sales by Supplier', description: 'Supplier breakdown for departed trips', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'booking-pipeline', name: 'Booking Pipeline', description: 'Trips by lifecycle status', category: 'sales', scope: 'admin-and-agent', supportsMyToggle: true },
  // Financial
  { slug: 'commission-aging', name: 'Commission Receivable Aging', description: 'Outstanding commissions by aging bucket', category: 'financial', scope: 'admin-and-agent', supportsMyToggle: false },
  { slug: 'commission-reconciliation', name: 'Commission Reconciliation', description: 'Expected vs received commission checks', category: 'financial', scope: 'admin-only', supportsMyToggle: false },
  { slug: 'payment-schedule', name: 'Payment Schedule', description: 'Upcoming deposits and final payments', category: 'financial', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'agent-commission-statement', name: 'Agent Commission Statement', description: 'Per-agent commission breakdown', category: 'financial', scope: 'admin-and-agent', supportsMyToggle: false },
  // Operational
  { slug: 'upcoming-departures', name: 'Upcoming Departures', description: 'Trips departing soon with status overview', category: 'operational', scope: 'admin-and-agent', supportsMyToggle: true },
  // Compliance
  { slug: 'ontario-gross-sales', name: 'Ontario Gross Sales', description: 'Monthly gross sales for TICO Form 1', category: 'compliance', scope: 'admin-only', supportsMyToggle: false },
  // CRM
  { slug: 'client-spending', name: 'Client Spending Summary', description: 'Per-client spend and trip history', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'repeat-clients', name: 'Repeat Client Analysis', description: 'Clients with 2+ bookings', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'dormant-clients', name: 'Dormant Clients', description: 'Clients with no recent activity', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'passport-expiry', name: 'Passport Expiry Alert', description: 'Travelers with expiring passports', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'upcoming-birthdays', name: 'Upcoming Birthdays', description: 'Client birthdays in upcoming days', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'new-clients', name: 'New Clients Acquired', description: 'New contacts added in period', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'client-data-completeness', name: 'Client Data Completeness', description: 'Contact data quality scores', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'top-clients-revenue', name: 'Top Clients by Revenue', description: 'Highest-spending clients', category: 'crm', scope: 'admin-and-agent', supportsMyToggle: true },
  // Insurance
  { slug: 'insurance-penetration', name: 'Insurance Penetration Rate', description: 'Coverage rate by period', category: 'insurance', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'insurance-declines', name: 'Insurance Decline Tracking', description: 'Travelers who declined with compliance status', category: 'insurance', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'insurance-revenue', name: 'Insurance Revenue', description: 'Premium revenue by provider and package', category: 'insurance', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'insurance-by-policy-type', name: 'Insurance by Policy Type', description: 'Breakdown by policy type', category: 'insurance', scope: 'admin-and-agent', supportsMyToggle: true },
  { slug: 'insurance-unresolved', name: 'Unresolved Insurance', description: 'Pending insurance on upcoming trips', category: 'insurance', scope: 'admin-and-agent', supportsMyToggle: true },
]

@Injectable()
export class ReportingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tripAccess: TripAccessService,
  ) {}

  getCatalog(auth: AuthContext): ReportDefinition[] {
    if (auth.role === 'admin') return REPORT_CATALOG
    return REPORT_CATALOG.filter(r => r.scope === 'admin-and-agent')
  }

  async runReport(slug: string, auth: AuthContext, query: ReportQueryDto): Promise<ReportResponse<any>> {
    const definition = REPORT_CATALOG.find(r => r.slug === slug)
    if (!definition) throw new NotFoundException(`Report '${slug}' not found`)

    if (definition.scope === 'admin-only' && auth.role !== 'admin') {
      throw new ForbiddenException('This report is admin-only')
    }

    const viewScope = auth.role === 'admin' ? (query.viewScope || 'agency') : 'my'

    // Determine trip scope based on role + viewScope
    let tripIds: string[] | 'all'
    if (auth.role === 'admin' && viewScope === 'agency') {
      tripIds = 'all'
    } else if (auth.role === 'admin' && viewScope === 'my') {
      // Admin "My Data" — filter by owner_id directly (getAccessibleTripIds returns 'all' for admins)
      const ownedResult = await this.db.client.execute(sql`
        SELECT id FROM trips WHERE agency_id = ${auth.agencyId} AND owner_id = ${auth.userId}
      `)
      tripIds = (ownedResult as any[]).map((r: any) => r.id)
    } else {
      // Agent — scoped to accessible trips
      tripIds = await this.tripAccess.getAccessibleTripIds(auth)
    }

    const options = {
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page || 1,
      pageSize: query.pageSize || 50,
      sortBy: query.sortBy,
      sortOrder: (query.sortOrder || 'desc') as 'asc' | 'desc',
      agentId: query.agentId,
      supplierName: query.supplierName,
      tripType: query.tripType,
      status: query.status,
      daysThreshold: query.daysThreshold,
    }

    const result = await this.dispatch(slug, auth.agencyId, tripIds, options)

    return buildReportResponse({
      slug,
      name: definition.name,
      dateRange: { startDate: query.startDate, endDate: query.endDate },
      viewScope,
      data: result.data,
      totalRows: result.totalRows,
      page: options.page,
      pageSize: options.pageSize,
      summary: result.summary,
    })
  }

  private async dispatch(
    slug: string,
    agencyId: string,
    tripIds: string[] | 'all',
    options: any,
  ): Promise<{ data: any[]; totalRows: number; summary?: Record<string, any> }> {
    switch (slug) {
      case 'booked-sales': return salesQueries.queryBookedSales(this.db, agencyId, tripIds, options)
      case 'departed-sales': return salesQueries.queryDepartedSales(this.db, agencyId, tripIds, options)
      case 'sales-by-agent': return salesQueries.querySalesByAgent(this.db, agencyId, options)
      case 'sales-by-destination': return salesQueries.querySalesByDestination(this.db, agencyId, tripIds, options)
      case 'booked-sales-by-supplier': return salesQueries.querySalesBySupplier(this.db, agencyId, tripIds, { ...options, variant: 'booked' })
      case 'departed-sales-by-supplier': return salesQueries.querySalesBySupplier(this.db, agencyId, tripIds, { ...options, variant: 'departed' })
      case 'booking-pipeline': return salesQueries.queryBookingPipeline(this.db, agencyId, tripIds)
      case 'commission-aging': return financialQueries.queryCommissionAging(this.db, agencyId, tripIds, options)
      case 'commission-reconciliation': return financialQueries.queryCommissionReconciliation(this.db, agencyId, options)
      case 'payment-schedule': return financialQueries.queryPaymentSchedule(this.db, agencyId, tripIds, options)
      case 'agent-commission-statement': return financialQueries.queryAgentCommissionStatement(this.db, agencyId, tripIds, options)
      case 'upcoming-departures': return operationalQueries.queryUpcomingDepartures(this.db, agencyId, tripIds, options)
      case 'ontario-gross-sales': return complianceQueries.queryOntarioGrossSales(this.db, agencyId, options)
      case 'client-spending': return crmQueries.queryClientSpending(this.db, agencyId, tripIds, options)
      case 'repeat-clients': return crmQueries.queryRepeatClients(this.db, agencyId, tripIds, options)
      case 'dormant-clients': return crmQueries.queryDormantClients(this.db, agencyId, tripIds, options)
      case 'passport-expiry': return crmQueries.queryPassportExpiry(this.db, agencyId, tripIds, options)
      case 'upcoming-birthdays': return crmQueries.queryUpcomingBirthdays(this.db, agencyId, tripIds, options)
      case 'new-clients': return crmQueries.queryNewClients(this.db, agencyId, tripIds, options)
      case 'client-data-completeness': return crmQueries.queryClientCompleteness(this.db, agencyId, tripIds, options)
      case 'top-clients-revenue': return crmQueries.queryTopClientsRevenue(this.db, agencyId, tripIds, options)
      case 'insurance-penetration': return insuranceQueries.queryInsurancePenetration(this.db, agencyId, tripIds, options)
      case 'insurance-declines': return insuranceQueries.queryInsuranceDeclines(this.db, agencyId, tripIds, options)
      case 'insurance-revenue': return insuranceQueries.queryInsuranceRevenue(this.db, agencyId, tripIds, options)
      case 'insurance-by-policy-type': return insuranceQueries.queryInsuranceByPolicyType(this.db, agencyId, tripIds, options)
      case 'insurance-unresolved': return insuranceQueries.queryInsuranceUnresolved(this.db, agencyId, tripIds, options)
      default: throw new NotFoundException(`No query builder for report '${slug}'`)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/reporting/reporting.service.ts
git commit -m "$(cat <<'EOF'
feat(api): add reporting service orchestrator

Central report catalog (26 reports), role-based access control,
view scope toggling (my/agency), and dispatch to query builders.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Reporting Controller and Module

**Files:**
- Create: `apps/api/src/reporting/reporting.controller.ts`
- Create: `apps/api/src/reporting/reporting.module.ts`
- Modify: `apps/api/src/app.module.ts` — add ReportingModule to imports

- [ ] **Step 1: Create the controller**

```typescript
// apps/api/src/reporting/reporting.controller.ts
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { AuthContext } from '../auth/auth.types'
import { ReportingService } from './reporting.service'
import { ReportExportService } from './export/report-export.service'
import { ReportQueryDto, ExportReportDto } from './dto/report-query.dto'

@Controller('reporting')
@UseGuards(JwtAuthGuard)
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly exportService: ReportExportService,
  ) {}

  @Get('catalog')
  getCatalog(@GetAuthContext() auth: AuthContext) {
    return this.reporting.getCatalog(auth)
  }

  @Get(':slug')
  runReport(
    @Param('slug') slug: string,
    @GetAuthContext() auth: AuthContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reporting.runReport(slug, auth, query)
  }

  @Get(':slug/export')
  async exportReport(
    @Param('slug') slug: string,
    @GetAuthContext() auth: AuthContext,
    @Query() query: ExportReportDto,
    @Res() res: Response,
  ) {
    const fullQuery = { ...query, page: 1, pageSize: 10000 }
    const report = await this.reporting.runReport(slug, auth, fullQuery)

    if (query.format === 'csv') {
      const columns = this.getColumnsForReport(slug)
      const csv = this.exportService.generateCsv(columns, report.data)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-${query.startDate}-to-${query.endDate}.csv"`)
      return res.send(csv)
    }

    const columns = this.getColumnsForReport(slug)
    const context = this.buildPdfContext(report, columns)
    const pdf = await this.exportService.generatePdf(context)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${query.startDate}-to-${query.endDate}.pdf"`)
    return res.send(pdf)
  }

  /** Column definitions per report — add for each report during implementation */
  private getColumnsForReport(slug: string): { key: string; header: string; align?: 'right'; mono?: boolean }[] {
    const columnMap: Record<string, any[]> = {
      'booked-sales': [
        { key: 'tripName', header: 'Trip' },
        { key: 'referenceNumber', header: 'Ref #', mono: true },
        { key: 'agentName', header: 'Agent' },
        { key: 'clientName', header: 'Client' },
        { key: 'bookedDate', header: 'Booked' },
        { key: 'departureDate', header: 'Departure' },
        { key: 'travelerCount', header: 'Pax', align: 'right' },
        { key: 'activityCount', header: 'Items', align: 'right' },
        { key: 'totalPriceCents', header: 'Total', align: 'right' },
      ],
      // Implementing agent: add column defs for remaining 25 reports
    }
    return columnMap[slug] || []
  }

  private buildPdfContext(report: any, columns: any[]) {
    const rows = report.data.map((row: any) => {
      const formatted: Record<string, string> = {}
      for (const col of columns) {
        const val = row[col.key]
        if (col.key.includes('Cents') || col.key.includes('Price')) {
          const dollars = typeof val === 'number' ? val / 100 : 0
          formatted[col.key] = `$${dollars.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`
        } else {
          formatted[col.key] = val?.toString() ?? ''
        }
      }
      return formatted
    })

    return {
      reportName: report.reportName,
      dateRangeLabel: `${report.dateRange.startDate} to ${report.dateRange.endDate}`,
      viewScopeLabel: report.viewScope === 'agency' ? 'Agency-Wide' : 'My Data',
      companyName: 'Phoenix Voyages', // TODO: pull from agency settings
      ticoRegistration: '',           // TODO: pull from agency settings
      generatedAt: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
      columns,
      rows,
      summaryItems: report.summary ? Object.entries(report.summary).map(([key, value]) => ({
        label: key.replace(/([A-Z])/g, ' $1').replace(/Cents$/, '').trim(),
        value: typeof value === 'number' && key.includes('Cents')
          ? `$${(value / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`
          : String(value),
      })) : undefined,
    }
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
// apps/api/src/reporting/reporting.module.ts
import { Module, forwardRef } from '@nestjs/common'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'
import { ReportExportService } from './export/report-export.service'
import { TripsModule } from '../trips/trips.module'
import { DocumentRenderModule } from '../document-render/document-render.module'

@Module({
  imports: [
    forwardRef(() => TripsModule),      // Provides TripAccessService, TripGroupAccessService
    DocumentRenderModule,               // Provides PuppeteerPdfService
  ],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportExportService,
  ],
})
export class ReportingModule {}
```

**Note:** Use `forwardRef(() => TripsModule)` if there's a circular dependency. Check if TripsModule exports TripAccessService — if not, you may need to add it to TripsModule's exports array.

- [ ] **Step 3: Register module in app.module.ts**

Add `ReportingModule` to the imports array in `apps/api/src/app.module.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/reporting/ apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): add reporting controller and module

REST endpoints: GET /reporting/catalog, GET /reporting/:slug,
GET /reporting/:slug/export. Uses @GetAuthContext() decorator,
imports TripsModule, DocumentRenderModule, DocumentTemplatesModule.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Dashboard KPI Additions (Booked Sales, Departed Sales, Insurance Attach Rate)

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dto/dashboard-overview.dto.ts` — add new KPI fields to response type
- Modify: `apps/admin/src/hooks/use-dashboard.ts` — update TypeScript types for new KPI fields
- Modify: `apps/admin/src/app/dashboard/_components/kpi-cards.tsx`

- [ ] **Step 1: Add 3 new KPI queries to dashboard service**

In `dashboard.service.ts`, add methods following existing patterns (especially the `getMonthlySalesForYear` join chain):

1. `getBookedSalesKpi(agencyId, startIso, endIso, tripIds)` — SUM of `activity_pricing.total_price_cents` for trips that reached `active` within the period. Use the canonical join chain. Date filter: `coalesce(t.booking_date::timestamptz, t.created_at) BETWEEN ...`

2. `getDepartedSalesKpi(agencyId, startIso, endIso, tripIds)` — SUM of `activity_pricing.total_price_cents` for trips with `t.start_date BETWEEN ...`. Same canonical join chain.

3. `getInsuranceAttachRate(agencyId, startIso, endIso, tripIds)` — COUNT travelers with `trip_traveler_insurance.status IN ('selected_package', 'has_own_insurance')` / COUNT total travelers on trips in period * 100.

Add these to the `getOverview()` method's `Promise.all()` block. Include prior-period versions for trend calculation using `computeTrend()`.

- [ ] **Step 2: Add KPI cards to dashboard frontend**

In `kpi-cards.tsx`, add 3 new cards after existing ones:
- **Booked Sales**: dollar amount with trend badge, links to `/reporting/booked-sales`
- **Departed Sales**: dollar amount with trend badge, links to `/reporting/departed-sales`
- **Insurance Attach Rate**: percentage with trend badge, links to `/reporting/insurance-penetration`

Follow the exact pattern of existing KPI cards.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/admin/src/app/dashboard/_components/kpi-cards.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add Booked Sales, Departed Sales, and Insurance
Attach Rate KPI cards

Three new dashboard metrics with period trends and links to
detailed reports.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend Report Catalog Page

**Files:**
- Modify: `apps/admin/src/app/reporting/page.tsx` (replace placeholder)
- Create: `apps/admin/src/app/reporting/_components/report-catalog.tsx`

- [ ] **Step 1: Create the report catalog component**

Grid of cards grouped by category. Each card shows report name, description, and category badge. Clicking navigates to `/reporting/[slug]`. Admin-only reports get an "Admin" badge.

Use: shadcn Card, Badge, lucide-react icons (TrendingUp, DollarSign, MapPin, Shield, Users, HeartPulse for each category).

Follow the existing layout import pattern: `import { DashboardLayout } from '@/components/layout'`

- [ ] **Step 2: Replace the reporting page placeholder**

Replace the existing placeholder with the catalog. Use `useReportCatalog()` hook from Task 11. Show loading spinner during fetch.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/reporting/
git commit -m "$(cat <<'EOF'
feat(admin): replace reporting placeholder with report catalog

Grid of report cards grouped by category (Sales, Financial,
Operational, Compliance, CRM, Insurance).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend Report Hooks

**Files:**
- Create: `apps/admin/src/hooks/use-reporting.ts`

- [ ] **Step 1: Create reporting hooks**

```typescript
// apps/admin/src/hooks/use-reporting.ts
import { useQuery } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ReportDefinition, ReportResponse, ReportQueryParams } from '@tailfire/shared-types'

export const reportingKeys = {
  all: ['reporting'] as const,
  catalog: () => [...reportingKeys.all, 'catalog'] as const,
  report: (slug: string, params: ReportQueryParams) =>
    [...reportingKeys.all, slug, params] as const,
}

export function useReportCatalog() {
  return useQuery({
    queryKey: reportingKeys.catalog(),
    queryFn: () => api.get<ReportDefinition[]>('/reporting/catalog'),
    staleTime: 5 * 60_000,
  })
}

export function useReport<T = any>(slug: string, params: ReportQueryParams) {
  const searchParams = new URLSearchParams()
  searchParams.set('startDate', params.startDate)
  searchParams.set('endDate', params.endDate)
  if (params.viewScope) searchParams.set('viewScope', params.viewScope)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params.sortBy) searchParams.set('sortBy', params.sortBy)
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder)
  if (params.filters) {
    Object.entries(params.filters).forEach(([k, v]) => {
      if (v) searchParams.set(k, v)
    })
  }

  return useQuery({
    queryKey: reportingKeys.report(slug, params),
    queryFn: () => api.get<ReportResponse<T>>(`/reporting/${slug}?${searchParams}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: !!params.startDate && !!params.endDate,
  })
}

/**
 * Download a report export (PDF or CSV).
 * Uses fetch with auth headers — cannot use simple <a href> because API requires Bearer token.
 */
export async function downloadReportExport(
  slug: string,
  params: ReportQueryParams,
  format: 'pdf' | 'csv',
) {
  const searchParams = new URLSearchParams()
  searchParams.set('startDate', params.startDate)
  searchParams.set('endDate', params.endDate)
  searchParams.set('format', format)
  if (params.viewScope) searchParams.set('viewScope', params.viewScope)
  if (params.filters) {
    Object.entries(params.filters).forEach(([k, v]) => {
      if (v) searchParams.set(k, v)
    })
  }

  // api.getRaw() does not exist — use fetch with the auth token directly
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const response = await fetch(`${baseUrl}/reporting/${slug}/export?${searchParams}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${params.startDate}-to-${params.endDate}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Note:** `api.getRaw()` must return a raw `Response` object (not parsed JSON). If the api client doesn't have this method, add it — or use `fetch()` directly with the auth token from the api client's auth header.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-reporting.ts
git commit -m "$(cat <<'EOF'
feat(admin): add reporting React Query hooks

useReportCatalog, useReport (generic typed), and authenticated
download function for PDF/CSV exports.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Frontend Report Viewer (Shared Components)

**Files:**
- Create: `apps/admin/src/app/reporting/_components/date-range-picker.tsx`
- Create: `apps/admin/src/app/reporting/_components/report-table.tsx`
- Create: `apps/admin/src/app/reporting/_components/report-export-buttons.tsx`
- Create: `apps/admin/src/app/reporting/_components/report-filters.tsx`
- Create: `apps/admin/src/app/reporting/_components/report-view.tsx`
- Create: `apps/admin/src/app/reporting/[reportSlug]/page.tsx`

- [ ] **Step 1: Create date range picker with presets**

Use shadcn `Calendar` + `Popover`. Presets: MTD, YTD, Last Month, Last Quarter, Q1-Q4, Last Year, Custom. State: `{ startDate, endDate, preset }`. Changing preset auto-calculates dates.

- [ ] **Step 2: Create report table component**

Generic sortable table using shadcn `Table`. Props: `columns`, `data`, `sortBy`, `sortOrder`, `onSort`. Clickable headers for sorting. Auto-format cents→dollars for columns containing "Cents" or "Price" in the key.

- [ ] **Step 3: Create export buttons**

Two buttons (PDF, CSV). Call `downloadReportExport()` from Task 11 with current params. Show loading spinner while downloading. Uses authenticated fetch (no simple `<a>` links).

- [ ] **Step 4: Create report filters component**

Render filter controls based on report slug:
- Sales reports: agent dropdown (admin only), trip type dropdown
- Supplier reports: supplier name search input
- CRM reports: days threshold input (for dormant, passport, birthdays)
- Others: minimal or no filters

- [ ] **Step 5: Create the report view orchestrator**

Composes: date range picker + filters + view scope toggle (My/Agency for admins) + report table + pagination + export buttons. Manages all state and passes to `useReport()` hook.

- [ ] **Step 6: Create the dynamic report page**

```tsx
// apps/admin/src/app/reporting/[reportSlug]/page.tsx
'use client'

import { use } from 'react'
import { DashboardLayout } from '@/components/layout'
import { ReportView } from '../_components/report-view'

export default function ReportPage({ params }: { params: Promise<{ reportSlug: string }> }) {
  const { reportSlug } = use(params)

  return (
    <DashboardLayout>
      <ReportView slug={reportSlug} />
    </DashboardLayout>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/reporting/
git commit -m "$(cat <<'EOF'
feat(admin): add shared report viewer components

Date range picker with presets, sortable table, authenticated
export buttons, dynamic filters, and report view orchestrator.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Wire Up Column Definitions for All 26 Reports

**Files:**
- Modify: `apps/api/src/reporting/reporting.controller.ts` — complete `getColumnsForReport()` switch

- [ ] **Step 1: Add column definitions for all 26 reports**

Fill in the `columnMap` for every slug. Financial columns (cents) → `align: 'right'`. Reference numbers, IDs → `mono: true`. Count columns → `align: 'right'`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/reporting/reporting.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): add column definitions for all 26 reports

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Integration Testing

**Files:**
- Create: `apps/api/src/reporting/__tests__/reporting.service.spec.ts`

- [ ] **Step 1: Write integration tests**

Key test cases:
1. Admin gets 26 reports in catalog, agent gets filtered list
2. Agent requesting admin-only report → ForbiddenException
3. Booked sales with known date range → verify response envelope structure
4. Admin with `viewScope=my` → only own trips
5. Pagination: verify page/pageSize/totalRows
6. Export PDF → verify Buffer with PDF header bytes (`%PDF-`)
7. Export CSV → verify header row matches column definitions
8. Invalid slug → NotFoundException

Run: `cd apps/api && pnpm jest --testPathPattern=reporting`

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/reporting/__tests__/
git commit -m "$(cat <<'EOF'
test(api): add reporting service integration tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Verify End-to-End

- [ ] **Step 1: Start dev server**

```bash
turbo dev
```

- [ ] **Step 2: Verify API endpoints**

```bash
TOKEN=$(curl -s http://localhost:3101/api/v1/auth/login -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@phoenixvoyages.ca","password":"Phoenix2026!"}' | jq -r '.access_token')

# List catalog
curl -s http://localhost:3101/api/v1/reporting/catalog \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | .slug'

# Run a report
curl -s "http://localhost:3101/api/v1/reporting/booked-sales?startDate=2026-01-01&endDate=2026-03-31&viewScope=agency" \
  -H "Authorization: Bearer $TOKEN" | jq '.totalRows, .summary'

# CSV export
curl -s "http://localhost:3101/api/v1/reporting/booked-sales/export?startDate=2026-01-01&endDate=2026-03-31&format=csv" \
  -H "Authorization: Bearer $TOKEN" > /tmp/test-report.csv && head -5 /tmp/test-report.csv

# PDF export
curl -s "http://localhost:3101/api/v1/reporting/booked-sales/export?startDate=2026-01-01&endDate=2026-03-31&format=pdf" \
  -H "Authorization: Bearer $TOKEN" > /tmp/test-report.pdf && file /tmp/test-report.pdf
```

- [ ] **Step 3: Verify frontend**

Open http://localhost:3100/reporting — should show report catalog with 6 categories. Click "Booked Sales" — should show report viewer with date picker, table, export buttons. Toggle My/Agency scope. Download PDF and CSV.

- [ ] **Step 4: Verify dashboard KPIs**

Open http://localhost:3100/dashboard — should show 6 KPI cards. Toggle MTD/YTD/All.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address issues found during reporting E2E verification

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
