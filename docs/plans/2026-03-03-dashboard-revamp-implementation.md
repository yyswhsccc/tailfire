# Dashboard Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the minimal 4-card dashboard with a full-featured nexus showing KPIs, charts, trip widgets, tasks, payments, and a collapsible sidebar — with role-based views for agents and admins.

**Architecture:** Single `GET /dashboard/overview` API endpoint returns all widget data in one round-trip via parallel Drizzle queries. Frontend is a widget-based page with independent components. Recharts for bar charts with YoY + projection toggles. Collapsible sidebar with quick-create, calendar, and admin leaderboard.

**Tech Stack:** NestJS (API), Next.js (admin), Recharts (charts), Drizzle ORM (queries), React Query (data fetching), ShadCN/Radix UI (components), Zustand (sidebar state).

---

### Task 1: Install Recharts dependency

**Files:**
- Modify: `apps/admin/package.json`

**Step 1: Install recharts**

Run:
```bash
pnpm --filter @tailfire/admin add recharts
```

**Step 2: Verify installation**

Run:
```bash
pnpm --filter @tailfire/admin exec -- node -e "require('recharts'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(admin): add recharts dependency for dashboard charts"
```

---

### Task 2: Backend — Dashboard overview DTO and types

**Files:**
- Create: `apps/api/src/dashboard/dto/dashboard-overview.dto.ts`

**Step 1: Create the DTO file with query params validation and response interface**

```typescript
/**
 * Dashboard Overview DTO
 *
 * Query parameters and response types for GET /dashboard/overview
 */

import { IsEnum, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({ enum: ['mtd', 'ytd'], default: 'mtd' })
  @IsOptional()
  @IsEnum(['mtd', 'ytd'])
  period?: 'mtd' | 'ytd' = 'mtd'

  @ApiPropertyOptional({ default: new Date().getFullYear() })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  chartYear?: number = new Date().getFullYear()

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeYoy?: boolean = false
}

// -- Response Types --

export interface KpiMetrics {
  bookings: number
  salesVolumeCents: number
  commissionReceivedDollars: number
  bookingsTrend: number | null
  salesTrend: number | null
  commissionTrend: number | null
}

export interface TripSummary {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string
  travelerCount: number
  updatedAt: string
}

export interface TaskDueSummary {
  id: string
  title: string
  dueDate: string | null
  priority: string
  isOverdue: boolean
  daysOverdue: number
  linkedTripName: string | null
  linkedContactName: string | null
}

export interface PaymentDueSummary {
  id: string
  tripId: string
  tripName: string
  description: string
  expectedAmountCents: number
  paidAmountCents: number
  dueDate: string
  isOverdue: boolean
}

export interface MonthlySalesData {
  month: number
  label: string
  amountCents: number
  previousYearCents: number | null
}

export interface MonthlyCommissionData {
  month: number
  label: string
  amountDollars: number
  previousYearDollars: number | null
}

export interface ProjectionData {
  salesActualCents: number
  salesProjectedCents: number
  commissionActualDollars: number
  commissionProjectedDollars: number
  daysElapsed: number
  totalDaysInMonth: number
}

export interface AgentLeaderboardEntry {
  userId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  salesVolumeCents: number
  bookings: number
}

export interface DashboardOverview {
  personal: KpiMetrics
  agency: KpiMetrics | null
  recentTrips: TripSummary[]
  leavingSoon: TripSummary[]
  tasksDue: TaskDueSummary[]
  paymentsDue: PaymentDueSummary[]
  monthlySales: MonthlySalesData[]
  monthlyCommission: MonthlyCommissionData[]
  currentMonthProjection: ProjectionData
  agentLeaderboard: AgentLeaderboardEntry[] | null
}
```

**Step 2: Verify typecheck**

Run:
```bash
pnpm --filter @tailfire/api exec tsc --noEmit --pretty 2>&1 | grep -E "dashboard|error" | head -20
```
Expected: No errors from dashboard files (pre-existing api-credentials errors are OK)

**Step 3: Commit**

```bash
git add apps/api/src/dashboard/dto/dashboard-overview.dto.ts
git commit -m "feat(api): add dashboard overview DTO and response types"
```

---

### Task 3: Backend — Dashboard overview service (KPIs + trends)

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.module.ts`

**Step 1: Extend dashboard.module.ts to import required services**

Add `TripAccessService` and `TaskAccessService` imports. The module needs access to these for scoped queries.

```typescript
import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { TripAccessService } from '../trips/trip-access.service'
import { TaskAccessService } from '../tasks/task-access.service'

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, TripAccessService, TaskAccessService],
})
export class DashboardModule {}
```

**Step 2: Add the `getOverview` method to `dashboard.service.ts`**

Keep the existing `getStats` method intact (backward compat). Add new method below it.

The service must:
1. Accept `auth: AuthContext`, `query: DashboardOverviewQueryDto`
2. Build scoped conditions (admin = agencyId only; agent = owned/shared/inbound trips)
3. Run all queries in parallel via `Promise.all()`
4. Compute trends by running same KPI queries for prior period
5. Return `DashboardOverview`

**Key implementation details:**

- **Personal trip scoping**: Use `TripAccessService.getAccessibleTripIds(auth)` — returns `'all'` for admin or `string[]` for agents.
- **KPI period**: For MTD: `>= startOfMonth(now())`. For YTD: `>= startOfYear(now())`.
- **Net sales**: `SUM(CASE WHEN transactionType = 'payment' THEN amountCents ELSE 0 END) - SUM(CASE WHEN transactionType = 'refund' THEN amountCents ELSE 0 END)`
- **Commission**: `SUM(commissionAmount::numeric)` from `commission_tracking` where `commissionStatus = 'received'`. Note: `commissionAmount` is `decimal(10,2)` in dollars.
- **Trend**: Run the same query for the prior equivalent period (prior month for MTD, prior year for YTD). Compute `((current - prior) / prior) * 100`. Return null if prior is zero.
- **Monthly charts**: Single query per chart using `date_trunc('month', created_at)` grouped by month, with `generate_series` for all 12 months. For YoY, add a WHERE for previous year in same query using UNION ALL or conditional aggregation.
- **Projection**: For current month: `projected = (actualSoFar / daysElapsed) * totalDaysInMonth`. Use `date_part('day', now())` for daysElapsed.
- **Tasks**: Use `TaskAccessService.buildAccessConditions(auth)` for WHERE clause. Filter `status = 'pending'`, sort overdue first then by dueDate.
- **Payments due**: Join `expected_payment_items` → `payment_schedule_config` → `activity_pricing` → trips. Filter `paidAmountCents < expectedAmountCents` and `status IN ('pending', 'partial', 'overdue')`.
- **Leaderboard** (admin only): Group `payment_transactions` by trip `ownerId` (joined through trips), filter by agencyId + period, order by net sales DESC, LIMIT 5. Join `user_profiles` for names.

This is a large service method. Organize as private helper methods:
- `private getKpiMetrics(agencyId, tripIds, startDate, endDate): Promise<KpiMetrics>`
- `private getRecentTrips(auth, tripIds): Promise<TripSummary[]>`
- `private getLeavingSoon(auth, tripIds): Promise<TripSummary[]>`
- `private getTasksDue(auth): Promise<TaskDueSummary[]>`
- `private getPaymentsDue(agencyId, tripIds): Promise<PaymentDueSummary[]>`
- `private getMonthlySales(agencyId, tripIds, year, includeYoy): Promise<MonthlySalesData[]>`
- `private getMonthlyCommission(agencyId, tripIds, year, includeYoy): Promise<MonthlyCommissionData[]>`
- `private getProjection(agencyId, tripIds): Promise<ProjectionData>`
- `private getAgentLeaderboard(agencyId, startDate, endDate): Promise<AgentLeaderboardEntry[]>`

**Step 3: Verify typecheck**

Run: `pnpm --filter @tailfire/api exec tsc --noEmit --pretty 2>&1 | grep "dashboard" | head -20`

**Step 4: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.module.ts
git commit -m "feat(api): implement dashboard overview service with KPIs, charts, widgets"
```

---

### Task 4: Backend — Dashboard overview controller endpoint

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`

**Step 1: Add the `getOverview` endpoint**

Below the existing `getStats` method, add:

```typescript
/**
 * GET /dashboard/overview
 * Returns comprehensive dashboard data for the current user
 */
@Get('overview')
@ApiOperation({ summary: 'Get dashboard overview with KPIs, charts, and widgets' })
@ApiQuery({ name: 'period', enum: ['mtd', 'ytd'], required: false })
@ApiQuery({ name: 'chartYear', type: Number, required: false })
@ApiQuery({ name: 'includeYoy', type: Boolean, required: false })
async getOverview(
  @GetAuthContext() auth: AuthContext,
  @Query() query: DashboardOverviewQueryDto,
): Promise<DashboardOverview> {
  return this.dashboardService.getOverview(auth, query)
}
```

Add the necessary imports at the top:
```typescript
import { Query } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'
import { DashboardOverviewQueryDto, DashboardOverview } from './dto/dashboard-overview.dto'
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @tailfire/api exec tsc --noEmit --pretty 2>&1 | grep "dashboard" | head -20`

**Step 3: Test manually (if dev server running)**

```bash
curl -s http://localhost:3101/api/v1/dashboard/overview?period=mtd | jq '.personal'
```

**Step 4: Commit**

```bash
git add apps/api/src/dashboard/dashboard.controller.ts
git commit -m "feat(api): add GET /dashboard/overview endpoint"
```

---

### Task 5: Frontend — Dashboard hook and types

**Files:**
- Create: `apps/admin/src/hooks/use-dashboard.ts`

**Step 1: Create the hook with query key factory and React Query hook**

```typescript
/**
 * Dashboard Hook
 *
 * Fetches dashboard overview data with period/chart controls.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// -- Types (mirror backend response) --

export interface KpiMetrics {
  bookings: number
  salesVolumeCents: number
  commissionReceivedDollars: number
  bookingsTrend: number | null
  salesTrend: number | null
  commissionTrend: number | null
}

export interface TripSummary {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string
  travelerCount: number
  updatedAt: string
}

export interface TaskDueSummary {
  id: string
  title: string
  dueDate: string | null
  priority: string
  isOverdue: boolean
  daysOverdue: number
  linkedTripName: string | null
  linkedContactName: string | null
}

export interface PaymentDueSummary {
  id: string
  tripId: string
  tripName: string
  description: string
  expectedAmountCents: number
  paidAmountCents: number
  dueDate: string
  isOverdue: boolean
}

export interface MonthlySalesData {
  month: number
  label: string
  amountCents: number
  previousYearCents: number | null
}

export interface MonthlyCommissionData {
  month: number
  label: string
  amountDollars: number
  previousYearDollars: number | null
}

export interface ProjectionData {
  salesActualCents: number
  salesProjectedCents: number
  commissionActualDollars: number
  commissionProjectedDollars: number
  daysElapsed: number
  totalDaysInMonth: number
}

export interface AgentLeaderboardEntry {
  userId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  salesVolumeCents: number
  bookings: number
}

export interface DashboardOverview {
  personal: KpiMetrics
  agency: KpiMetrics | null
  recentTrips: TripSummary[]
  leavingSoon: TripSummary[]
  tasksDue: TaskDueSummary[]
  paymentsDue: PaymentDueSummary[]
  monthlySales: MonthlySalesData[]
  monthlyCommission: MonthlyCommissionData[]
  currentMonthProjection: ProjectionData
  agentLeaderboard: AgentLeaderboardEntry[] | null
}

// -- Query Keys --

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (period: string, chartYear: number, includeYoy: boolean) =>
    [...dashboardKeys.all, 'overview', { period, chartYear, includeYoy }] as const,
}

// -- Hook --

interface UseDashboardOverviewOptions {
  period?: 'mtd' | 'ytd'
  chartYear?: number
  includeYoy?: boolean
}

export function useDashboardOverview(options: UseDashboardOverviewOptions = {}) {
  const {
    period = 'mtd',
    chartYear = new Date().getFullYear(),
    includeYoy = false,
  } = options

  return useQuery({
    queryKey: dashboardKeys.overview(period, chartYear, includeYoy),
    queryFn: () => {
      const params = new URLSearchParams({
        period,
        chartYear: String(chartYear),
        includeYoy: String(includeYoy),
      })
      return api.get<DashboardOverview>(`/dashboard/overview?${params}`)
    },
    staleTime: 30_000, // 30 seconds — dashboard data doesn't need real-time
  })
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`
Expected: Zero errors

**Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-dashboard.ts
git commit -m "feat(admin): add useDashboardOverview hook with types"
```

---

### Task 6: Frontend — KPI Cards component

**Files:**
- Create: `apps/admin/src/app/dashboard/_components/kpi-cards.tsx`

**Step 1: Create the KPI cards component**

Three cards in a row showing Bookings, Sales Volume, Commission Received. Each card displays:
- Metric name (small text)
- Large formatted number
- Trend indicator (green up arrow / red down arrow + percentage)
- Period label

Use existing `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`.

Format currency with `Intl.NumberFormat`. Format commission (dollars) and sales (cents → dollars).

Trend indicator: if `trend > 0`, show green `+X%` with `TrendingUp` icon from lucide-react. If `trend < 0`, show red `X%` with `TrendingDown`. If null, show nothing.

Props: `{ metrics: KpiMetrics; periodLabel: string; variant?: 'personal' | 'agency' }`

When `variant === 'agency'`, add subtle "Agency-wide" label and different background tint.

**Step 2: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add apps/admin/src/app/dashboard/_components/kpi-cards.tsx
git commit -m "feat(admin): add KPI cards component with trend indicators"
```

---

### Task 7: Frontend — Trip card and trip card row components

**Files:**
- Create: `apps/admin/src/app/dashboard/_components/trip-card.tsx`
- Create: `apps/admin/src/app/dashboard/_components/trip-card-row.tsx`

**Step 1: Create trip-card.tsx**

A compact card showing: trip name, date range (formatted with date-fns `format`), traveler count with Users icon, status badge (colored by status). Clicking navigates to `/trips/${id}` via Next.js `Link`.

Use existing status badge colors from the trips list page patterns.

Props: `{ trip: TripSummary }`

**Step 2: Create trip-card-row.tsx**

Horizontal scrollable row of trip cards with a section header ("Jump Back In" or "Leaving Soon"), "View all" link, and optional "Create trip" action card at the end.

Props: `{ title: string; trips: TripSummary[]; viewAllHref: string; showCreateCard?: boolean }`

Use `overflow-x-auto` with `flex` layout. Snap scrolling with `scroll-snap-type: x mandatory`.

Empty state: centered text "No trips" with a "Create trip" button.

**Step 3: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add apps/admin/src/app/dashboard/_components/trip-card.tsx apps/admin/src/app/dashboard/_components/trip-card-row.tsx
git commit -m "feat(admin): add trip card and scrollable trip card row components"
```

---

### Task 8: Frontend — Tasks Due and Payments Due widgets

**Files:**
- Create: `apps/admin/src/app/dashboard/_components/tasks-due-widget.tsx`
- Create: `apps/admin/src/app/dashboard/_components/payments-due-widget.tsx`

**Step 1: Create tasks-due-widget.tsx**

Card with "Tasks Due" header and "View all" link to `/tasks?sort=dueDate`.

List of up to 5 tasks. Each row shows:
- Checkbox (uses existing `useCompleteTask()` mutation from `@/hooks/use-tasks`)
- Task title
- Linked trip/contact name (small muted text)
- Due date (formatted, right-aligned)
- Priority badge (colored: urgent=red, high=orange, medium=yellow, low=gray)
- Overdue badge: red "OVERDUE" + days count

When checkbox clicked, optimistic update: strikethrough + fade animation, then remove from list.

Props: `{ tasks: TaskDueSummary[] }`

Empty state: "All caught up!" with checkmark icon.

**Step 2: Create payments-due-widget.tsx**

Card with "Payments Due" header and "View all" link.

List of up to 5 payment items. Each row shows:
- Trip name (linked to `/trips/${tripId}`)
- Payment description
- Amount remaining: `(expectedAmountCents - paidAmountCents) / 100` formatted as currency
- Due date
- Overdue: red highlight if `isOverdue`

Props: `{ payments: PaymentDueSummary[] }`

Empty state: "No payments due" with check icon.

**Step 3: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add apps/admin/src/app/dashboard/_components/tasks-due-widget.tsx apps/admin/src/app/dashboard/_components/payments-due-widget.tsx
git commit -m "feat(admin): add tasks due and payments due dashboard widgets"
```

---

### Task 9: Frontend — Sales and Commission chart components

**Files:**
- Create: `apps/admin/src/app/dashboard/_components/sales-chart.tsx`
- Create: `apps/admin/src/app/dashboard/_components/commission-chart.tsx`

**Step 1: Create sales-chart.tsx**

Recharts `BarChart` with `ResponsiveContainer` wrapper.

**Controls** (above chart):
- Year selector: `<Select>` dropdown with years (current year, prev 2 years)
- YoY toggle: small button/switch that toggles `includeYoy`
- Projections toggle: small button/switch

**Chart structure**:
- X axis: month labels (Jan-Dec)
- Y axis: dollar amounts, formatted with `$X K` shorthand
- Current year bars: solid blue (`#2563eb`)
- Previous year bars (YoY): light gray (`#d1d5db`), semi-transparent
- Projection: current month bar uses a `<defs><pattern>` for diagonal stripes on the projected portion. Render as a stacked bar: solid actual + striped projected.
- Tooltip: custom formatter showing exact amounts

Props:
```typescript
{
  data: MonthlySalesData[]
  projection: ProjectionData
  year: number
  onYearChange: (year: number) => void
  includeYoy: boolean
  onYoyToggle: () => void
  showProjection: boolean
  onProjectionToggle: () => void
}
```

**Step 2: Create commission-chart.tsx**

Same component structure as sales-chart but:
- Data uses `amountDollars` (not cents)
- Y axis formats as dollars directly
- Colors: green (`#16a34a`) for commission bars

Props mirror sales-chart but with `MonthlyCommissionData[]`.

**Step 3: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add apps/admin/src/app/dashboard/_components/sales-chart.tsx apps/admin/src/app/dashboard/_components/commission-chart.tsx
git commit -m "feat(admin): add sales and commission bar charts with YoY and projection toggles"
```

---

### Task 10: Frontend — Collapsible sidebar components

**Files:**
- Create: `apps/admin/src/app/dashboard/_components/dashboard-sidebar.tsx`
- Create: `apps/admin/src/app/dashboard/_components/sidebar-quick-create.tsx`
- Create: `apps/admin/src/app/dashboard/_components/sidebar-mini-calendar.tsx`
- Create: `apps/admin/src/app/dashboard/_components/sidebar-today-tasks.tsx`
- Create: `apps/admin/src/app/dashboard/_components/sidebar-agent-leaderboard.tsx`

**Step 1: Create sidebar-quick-create.tsx**

Three buttons: "New Trip", "New Task", "New Contact". Each with icon (Plane, CheckSquare, UserPlus from lucide-react) and label. Clicking navigates via `router.push()`.

```typescript
const items = [
  { label: 'New Trip', href: '/trips/new', icon: Plane },
  { label: 'New Task', href: '/tasks', icon: CheckSquare },  // tasks page has create modal
  { label: 'New Contact', href: '/contacts/new', icon: UserPlus },
]
```

**Step 2: Create sidebar-mini-calendar.tsx**

7-day row showing current week (Sun-Sat). Today highlighted with accent circle. Uses `date-fns` for week calculation (`startOfWeek`, `addDays`, `format`, `isToday`).

**Step 3: Create sidebar-today-tasks.tsx**

Compact list of tasks due today (from `tasksDue` filtered by `dueDate === today`). Checkbox to complete inline (reuses `useCompleteTask()`). Empty: "All clear!"

Props: `{ tasks: TaskDueSummary[] }`

**Step 4: Create sidebar-agent-leaderboard.tsx**

Ranked list of top agents. Each row: rank number, avatar (or initials), name, sales amount formatted as currency. Admin-only component.

Props: `{ agents: AgentLeaderboardEntry[] }`

**Step 5: Create dashboard-sidebar.tsx**

Container that wraps all sidebar widgets. Accepts `isOpen` and `onToggle` props. When open: fixed-width right panel (280px). When closed: hidden. Transition with `transition-all duration-300`.

Renders: QuickCreate → MiniCalendar → TodayTasks → (admin only) AgentLeaderboard.

Store sidebar state in localStorage via a simple zustand store or direct `localStorage.getItem/setItem`.

**Step 6: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`

**Step 7: Commit**

```bash
git add apps/admin/src/app/dashboard/_components/dashboard-sidebar.tsx apps/admin/src/app/dashboard/_components/sidebar-quick-create.tsx apps/admin/src/app/dashboard/_components/sidebar-mini-calendar.tsx apps/admin/src/app/dashboard/_components/sidebar-today-tasks.tsx apps/admin/src/app/dashboard/_components/sidebar-agent-leaderboard.tsx
git commit -m "feat(admin): add collapsible dashboard sidebar with quick-create, calendar, tasks, leaderboard"
```

---

### Task 11: Frontend — Assemble the dashboard page

**Files:**
- Modify: `apps/admin/src/app/dashboard/page.tsx`

**Step 1: Rewrite dashboard page**

Replace the current minimal page with the full widget-based layout. This is the main orchestrator:

1. Use `useDashboardOverview()` hook with state for `period`, `chartYear`, `includeYoy`, `showProjection`
2. Use `useUser()` to get `isAdmin` and `claims.firstName`
3. Manage sidebar open/closed state (localStorage-backed)

**Layout structure** (pseudo-JSX):
```
<DashboardLayout>
  <div className="flex">
    {/* Main content area */}
    <div className={sidebarOpen ? 'flex-1 mr-4' : 'flex-1'}>
      {/* Header: Welcome + period toggle + sidebar toggle */}
      <header>
        <h2>Welcome back, {firstName}</h2>
        <PeriodToggle value={period} onChange={setPeriod} />
        <Button onClick={toggleSidebar} variant="ghost"><PanelRight /></Button>
      </header>

      {/* Personal KPI Cards */}
      <KpiCards metrics={data.personal} periodLabel={periodLabel} />

      {/* Admin KPI Row (admin only) */}
      {isAdmin && data.agency && (
        <KpiCards metrics={data.agency} periodLabel={periodLabel} variant="agency" />
      )}

      {/* Jump Back In */}
      <TripCardRow title="Jump Back In" trips={data.recentTrips} viewAllHref="/trips" />

      {/* Leaving Soon */}
      <TripCardRow title="Leaving Soon" trips={data.leavingSoon} viewAllHref="/trips" showCreateCard />

      {/* Tasks + Payments (two-column grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TasksDueWidget tasks={data.tasksDue} />
        <PaymentsDueWidget payments={data.paymentsDue} />
      </div>

      {/* Charts (two-column grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesChart data={data.monthlySales} projection={data.currentMonthProjection} ... />
        <CommissionChart data={data.monthlyCommission} projection={data.currentMonthProjection} ... />
      </div>
    </div>

    {/* Sidebar */}
    <DashboardSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} isAdmin={isAdmin}>
      <SidebarQuickCreate />
      <SidebarMiniCalendar />
      <SidebarTodayTasks tasks={todayTasks} />
      {isAdmin && <SidebarAgentLeaderboard agents={data.agentLeaderboard} />}
    </DashboardSidebar>
  </div>
</DashboardLayout>
```

Handle loading state with skeleton cards/spinners. Handle error state with error card + retry button.

**Step 2: Verify typecheck**

Run: `pnpm --filter @tailfire/admin typecheck 2>&1 | tail -5`
Expected: Zero errors

**Step 3: Visual verification (if dev server running)**

Navigate to `http://localhost:3100/dashboard` and verify:
- KPI cards render with data
- Charts render with bars
- Sidebar opens/closes
- Trip card rows scroll horizontally
- Tasks show with overdue badges
- Admin-only sections visible for admin user

**Step 4: Commit**

```bash
git add apps/admin/src/app/dashboard/page.tsx
git commit -m "feat(admin): assemble full dashboard page with all widgets and sidebar"
```

---

### Task 12: Responsive polish and mobile support

**Files:**
- Modify: `apps/admin/src/app/dashboard/page.tsx`
- Modify: `apps/admin/src/app/dashboard/_components/dashboard-sidebar.tsx`

**Step 1: Add responsive breakpoints**

- KPI cards: `grid-cols-1 sm:grid-cols-3`
- Charts: `grid-cols-1 lg:grid-cols-2`
- Tasks/Payments: `grid-cols-1 lg:grid-cols-2`
- Sidebar: On tablet (< 1280px), default to collapsed. On mobile (< 768px), render as a sheet/drawer overlay using Radix `Sheet` component from `@/components/ui/sheet`.

**Step 2: Test at different viewport sizes**

Resize browser to:
- 1440px (desktop with sidebar)
- 1024px (tablet, sidebar collapsed)
- 375px (mobile, sidebar as drawer)

**Step 3: Commit**

```bash
git add apps/admin/src/app/dashboard/page.tsx apps/admin/src/app/dashboard/_components/dashboard-sidebar.tsx
git commit -m "feat(admin): add responsive layout and mobile sidebar drawer"
```

---

### Task 13: Final typecheck and integration verification

**Files:** None (verification only)

**Step 1: Run full admin typecheck**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Zero errors

**Step 2: Run API typecheck**

Run: `pnpm --filter @tailfire/api exec tsc --noEmit --pretty 2>&1 | grep -c "error TS"`
Expected: Same count as before (pre-existing errors only, no new ones)

**Step 3: Verify the old /dashboard/stats endpoint still works**

```bash
curl -s http://localhost:3101/api/v1/dashboard/stats | jq '.'
```
Expected: Still returns `{ totalTrips, activeTrips, totalContacts, totalRevenue }`

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(admin): polish dashboard types and fix any typecheck issues"
```
