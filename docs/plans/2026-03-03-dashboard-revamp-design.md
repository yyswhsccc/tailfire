# Dashboard Revamp Design

> **Validated by Codex** — 3 blocking corrections applied, 5 important corrections incorporated.

## Goal

Transform the dashboard from a basic 4-stat-card placeholder into the **nexus** of the application — a command center where agents see the pulse of their business and take action quickly. Supports both agent (personal) and admin (agency-wide) views with shared core + admin extras.

## Architecture

Widget-based architecture where each dashboard section is an independent component. A single `GET /dashboard/overview` API endpoint returns all data in one round-trip for fast loading. Role-based rendering: agents see personal widgets; admins see the same personal view plus agency-wide KPI row and agent leaderboard. Collapsible right sidebar provides quick actions, mini calendar, and contextual shortcuts. Extensible for future widgets (Leads, Emails, etc.).

**Security**: All data scoping is enforced **server-side** using existing `TripAccessService` and `TaskAccessService` rules. Frontend role checks are cosmetic only — the API never returns data the user shouldn't see.

## Tech Stack

- **Charting**: Recharts (composable React charts, ~45KB gzipped) — **must be added to admin package.json**
- **Frontend**: Next.js client component, React Query, ShadCN UI cards
- **Backend**: NestJS endpoint with Drizzle ORM aggregation queries
- **State**: localStorage for sidebar collapse state and period toggle preference
- **Caching**: None initially. Add lightweight cache (30-60s TTL, keyed by `agencyId:userId:role:period:year`) only if p95 latency degrades after launch.

---

## Layout

Hybrid layout with collapsible right sidebar. Main content ~75% width when sidebar open, 100% when collapsed.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Welcome back, {firstName}           [MTD | YTD]    [sidebar toggle ≡]  │
├─────────────────────────────────────────────────────┬────────────────────┤
│                                                     │ Quick Create       │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────┐  │  ▶ New Trip        │
│  │Bookings │  │ Sales Volume │  │ Commission   │  │  ▶ New Task        │
│  │  12     │  │ $45,200      │  │ $3,800       │  │  ▶ New Contact     │
│  └─────────┘  └──────────────┘  └──────────────┘  │                    │
│                                                     │ This Week          │
│  ═══ ADMIN ONLY ═══════════════════════════════     │ Su Mo Tu We Th Fr │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────┐  │  1  2 [3] 4  5  6 │
│  │Agency   │  │Agency Sales  │  │Agency Comm.  │  │                    │
│  │Bookings │  │ $120,000     │  │ $9,500       │  │ Today's Tasks      │
│  └─────────┘  └──────────────┘  └──────────────┘  │ • Follow up call   │
│                                                     │ • Send docs        │
│  Jump Back In                          View all →  │                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │                    │
│  │ Trip A   │ │ Trip B   │ │ Trip C   │           │                    │
│  │ dates    │ │ dates    │ │ dates    │           │                    │
│  └──────────┘ └──────────┘ └──────────┘           │                    │
│                                                     │                    │
│  Leaving Soon                          View all →  │                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │                    │
│  │ Trip X   │ │ Trip Y   │ │+ Create  │           │                    │
│  └──────────┘ └──────────┘ └──────────┘           │                    │
│                                                     │                    │
│  ┌─── Tasks Due ────────┐ ┌─── Payments Due ───┐  │                    │
│  │ • Task 1    OVERDUE  │ │ • Payment A  Sep 4 │  │                    │
│  │ • Task 2    Mar 5    │ │ • Payment B  Mar 10│  │                    │
│  │ View all →           │ │ View all →         │  │                    │
│  └──────────────────────┘ └────────────────────┘  │                    │
│                                                     │                    │
│  ┌─── Sales Chart ──────┐ ┌─── Commission ─────┐  │ ADMIN ONLY         │
│  │ [2026 ▼] [YoY][Proj] │ │ [2026 ▼] [YoY][Proj]│ │ Agent Leaderboard  │
│  │ ██ ████ ██           │ │ ██ ███ █           │  │ 1. Sarah  $25K     │
│  │ Jan-Dec bar chart    │ │ Jan-Dec bar chart  │  │ 2. Mike   $18K     │
│  └──────────────────────┘ └────────────────────┘  │ 3. Alex   $12K     │
│                                                     │                    │
└─────────────────────────────────────────────────────┴────────────────────┘
```

When sidebar is collapsed, all main content stretches to full width. Sidebar state persists in localStorage.

On mobile (< 768px), sidebar is hidden by default and opens as a sheet/drawer overlay.

---

## Widget Specifications

### 1. KPI Cards (All Users)

Three cards in a row with MTD/YTD toggle at page header level:

| Card | Data Source | Calculation |
|------|------------|-------------|
| **Bookings** | `trips` table | Count of trips where `createdAt` falls within period. Scoped to user's accessible trips (via `ownerId = userId` OR user in `trip_collaborators`). |
| **Sales Volume** | `payment_transactions` table | **Net sales** = SUM(`amountCents`) WHERE `transactionType = 'payment'` MINUS SUM(`amountCents`) WHERE `transactionType = 'refund'`. Period filtered by `createdAt`. Scoped via trip ownership → activity pricing → payment transactions. |
| **Commission Received** | `commission_tracking` table | SUM(`commissionAmount`) WHERE `commissionStatus = 'received'`. **Note: `commissionAmount` is decimal dollars, NOT cents.** Scoped via activity pricing → trip ownership. |

Each card shows:
- Large number (formatted with currency/locale)
- Period label ("Month to date" or "Year to date")
- Subtle trend indicator vs prior equivalent period (e.g., "+12% vs last month")

### 2. Admin KPI Row (Admin Only)

Same 3 metrics but **agency-wide** (no userId filter, only agencyId). Appears below the personal KPI row with a subtle visual separator. Shows the same MTD/YTD toggle.

### 3. Jump Back In

- Shows last 4 trips the user recently modified (by `trips.updatedAt` descending, scoped to user's accessible trips via TripAccessService)
- Horizontal scrollable card row
- Each card shows: trip name, date range, traveler count icon, status badge, menu (...)
- "View all" link goes to `/trips`
- Clicking a card navigates to `/trips/{id}`

### 4. Leaving Soon

- Trips with `startDate` within next 30 days, sorted by soonest departure
- Scoped to user's accessible trips (same TripAccessService rules)
- Same card format as "Jump Back In"
- Last card slot shows "+ Create trip" action card
- If no upcoming trips, shows empty state with CTA

### 5. Tasks Due

- Top 5 tasks sorted: overdue first (by how overdue), then upcoming by due date
- **Scoped server-side via TaskAccessService** (non-admins see only own tasks)
- Each row: checkbox (complete), task title, linked trip/contact name, due date, priority badge
- Overdue items get red "OVERDUE" badge with days count
- "View all" link goes to `/tasks?sort=dueDate`
- Completing a task triggers optimistic update (checkbox → strikethrough → fade out)

### 6. Payments Due

- **Source: `expected_payment_items` table** (NOT `payment_schedule_config`)
- Top 5 upcoming items where `paidAmountCents < expectedAmountCents`
- Each row: trip name, payment description, amount remaining, due date
- Overdue payments highlighted in red
- "View all" link goes to `/trips` (filtered)
- Scoped via trip ownership (join through activity pricing → trips)

### 7. Sales Chart

Monthly bar chart using Recharts `BarChart`:

**Controls**: Year selector dropdown + two toggle buttons (YoY, Projections)

**Base view**: 12 bars (Jan-Dec) showing monthly **net** sales volume (payments - refunds) for selected year. Current month highlighted. Data from single grouped SQL query (not per-month loops).

**YoY toggle (ON)**: Overlays previous year's data as semi-transparent bars behind current year. Legend distinguishes "2026" (solid blue) vs "2025" (light gray).

**Projections toggle (ON)**: For the current incomplete month only, the bar splits:
- **Solid segment**: Actual net revenue collected so far this month
- **Striped/dashed segment**: Projected remainder based on daily run rate

Projection formula: `projected = (actualSoFar / daysElapsed) * totalDaysInMonth`

**Timezone-aware**: Use agency timezone (or user's configured timezone from `userProfiles.timezone`) for day boundaries. Label projection clearly as "Estimated".

Both toggles work independently and can be combined.

**Tooltip**: Hover shows exact dollar amount. With YoY on, shows both years. With projection on, shows "Actual: $X / Projected: $Y (est.)".

### 8. Commission Chart

Same treatment as Sales Chart (YoY + Projections toggles), but sourced from `commission_tracking` data. **Note: amounts are in decimal dollars** (not cents), so conversion is needed for consistent frontend formatting.

### 9. Collapsible Sidebar

**Quick Create** section:
- Three buttons: "New Trip" → `/trips/new`, "New Task" → `/tasks` (with create modal), "New Contact" → `/contacts/new`
- Each button has an icon + label, hover highlight

**This Week** mini calendar:
- 7-day row (Sun-Sat) showing current week
- Today highlighted with accent circle
- Reuse patterns from existing `use-calendar.ts` hook and `calendar-navbar-popover.tsx`

**Today's Tasks**:
- Compact list of tasks due today (max 5)
- Checkbox to complete inline
- If none, shows "All clear!" empty state

**Agent Leaderboard (Admin Only)**:
- Top 5 agents ranked by sales volume in current period (matches MTD/YTD toggle)
- Each row: rank, agent name/avatar, sales amount
- Sourced from `payment_transactions` grouped by trip `ownerId`, joined with `user_profiles`
- Links to future agent performance page (or no-op for now)

---

## Backend API

### Endpoint: `GET /dashboard/overview`

**Query Parameters** (validated via DTO with class-validator):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `'mtd' \| 'ytd'` | `'mtd'` | Time period for KPI calculations |
| `chartYear` | `number` | current year | Year for sales/commission chart data |
| `includeYoy` | `boolean` | `false` | Include previous year chart data |

**Response Type**:
```typescript
interface DashboardOverview {
  // Personal KPIs
  personal: {
    bookings: number
    salesVolumeCents: number          // net: payments - refunds
    commissionReceivedDollars: number // commission_tracking uses decimal dollars
    // Trend vs prior period (percentage change)
    bookingsTrend: number | null      // e.g., 12.5 = +12.5%
    salesTrend: number | null
    commissionTrend: number | null
  }

  // Agency KPIs (admin only, null for agents)
  agency: {
    bookings: number
    salesVolumeCents: number
    commissionReceivedDollars: number
    bookingsTrend: number | null
    salesTrend: number | null
    commissionTrend: number | null
  } | null

  // Trip widgets
  recentTrips: {
    id: string
    name: string
    startDate: string | null
    endDate: string | null
    status: string
    travelerCount: number
    updatedAt: string
  }[]

  leavingSoon: {
    id: string
    name: string
    startDate: string
    endDate: string | null
    status: string
    travelerCount: number
  }[]

  // Task widget
  tasksDue: {
    id: string
    title: string
    dueDate: string | null
    priority: string
    isOverdue: boolean
    daysOverdue: number
    linkedTripName: string | null
    linkedContactName: string | null
  }[]

  // Payments widget (from expected_payment_items)
  paymentsDue: {
    id: string
    tripId: string
    tripName: string
    description: string
    expectedAmountCents: number
    paidAmountCents: number
    dueDate: string
    isOverdue: boolean
  }[]

  // Chart data (12 months for selected year, single grouped SQL per chart)
  monthlySales: {
    month: number        // 1-12
    label: string        // "Jan", "Feb", etc.
    amountCents: number  // net (payments - refunds)
    previousYearCents: number | null  // only if includeYoy=true
  }[]

  monthlyCommission: {
    month: number
    label: string
    amountDollars: number   // commission_tracking uses decimal dollars
    previousYearDollars: number | null
  }[]

  // Projection data (current month only, timezone-aware)
  currentMonthProjection: {
    salesActualCents: number
    salesProjectedCents: number
    commissionActualDollars: number
    commissionProjectedDollars: number
    daysElapsed: number
    totalDaysInMonth: number
  }

  // Agent leaderboard (admin only, null for agents)
  agentLeaderboard: {
    userId: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    salesVolumeCents: number
    bookings: number
  }[] | null
}
```

### Backward Compatibility

Keep existing `GET /dashboard/stats` endpoint untouched. New `GET /dashboard/overview` is additive. The old endpoint can be deprecated later.

### Query Strategy

All queries run in parallel via `Promise.all()` for maximum speed. Each query is set-based with proper indexes — no per-entity loops.

**Scoping approach**: Build one access-scoped condition per request:
- **Admin**: `WHERE agencyId = :agencyId` (agency-wide)
- **Agent**: `WHERE (ownerId = :userId OR tripId IN (SELECT tripId FROM trip_collaborators WHERE userId = :userId))` for trips; `WHERE ownerId = :userId` for tasks (via TaskAccessService rules)

1. **Personal KPIs**: Aggregate trips/payments/commission filtered by `ownerId = userId` or via `trip_collaborators.userId`
2. **Agency KPIs** (admin only): Same aggregates without userId filter, just agencyId
3. **Trend calculation**: Run the same KPI query for the previous equivalent period (prior month for MTD, prior year for YTD) and compute percentage change
4. **Recent trips**: `SELECT ... FROM trips WHERE accessible ORDER BY updatedAt DESC LIMIT 4`
5. **Leaving soon**: `SELECT ... FROM trips WHERE accessible AND startDate BETWEEN now() AND now() + 30 days ORDER BY startDate ASC LIMIT 4`
6. **Tasks due**: `SELECT ... FROM tasks WHERE ownerId = userId AND status = 'pending' ORDER BY (dueDate < now()) DESC, dueDate ASC LIMIT 5`
7. **Payments due**: Join `expected_payment_items` → `payment_schedule_config` → `activity_pricing` → trips, filter `paidAmountCents < expectedAmountCents`, order by due date, LIMIT 5
8. **Monthly sales**: Group `payment_transactions` by `date_trunc('month', createdAt)` for selected year, single query with conditional SUM for net (payments - refunds), optional UNION/join for previous year
9. **Monthly commission**: Group `commission_tracking` by month for selected year, single grouped query
10. **Agent leaderboard** (admin only): Group `payment_transactions` by trip `ownerId` (joined through trips), order by net sales desc, LIMIT 5. Join `user_profiles` for names/avatars.

### Metric Definitions

| Metric | Formula | Source Table |
|--------|---------|-------------|
| **Bookings** | COUNT(trips) in period | `trips.createdAt` |
| **Net Sales** | SUM(payments) - SUM(refunds) | `payment_transactions` (type='payment' minus type='refund') |
| **Commission Received** | SUM(commissionAmount) where status='received' | `commission_tracking` (decimal dollars) |
| **Payments Due** | Items where paidAmountCents < expectedAmountCents | `expected_payment_items` |

---

## Frontend Component Structure

```
app/dashboard/page.tsx                    (main page, fetches data, manages state)
app/dashboard/_components/
  kpi-cards.tsx                           (3 KPI cards with trend indicators)
  admin-kpi-row.tsx                       (agency-wide KPIs, admin only)
  trip-card.tsx                           (reusable trip card for Jump Back In / Leaving Soon)
  trip-card-row.tsx                       (horizontal scrollable row of trip cards)
  tasks-due-widget.tsx                    (task list with checkboxes)
  payments-due-widget.tsx                 (payment list with due dates)
  sales-chart.tsx                         (Recharts bar chart with YoY + projections)
  commission-chart.tsx                    (same chart format for commission)
  dashboard-sidebar.tsx                   (collapsible sidebar container)
  sidebar-quick-create.tsx               (3 create buttons)
  sidebar-mini-calendar.tsx              (7-day week view)
  sidebar-today-tasks.tsx                (compact today's task list)
  sidebar-agent-leaderboard.tsx          (admin-only ranked agent list)
```

---

## Data Scoping Rules

| Role | Personal KPIs | Agency KPIs | Recent Trips | Tasks | Leaderboard |
|------|--------------|-------------|--------------|-------|-------------|
| `user` (agent) | Own trips only | Hidden | Own trips | Own tasks | Hidden |
| `admin` | Own trips | All agency trips | Own trips | Own tasks | All agents |

"Own trips" = trips where `ownerId = userId` OR user appears in `trip_collaborators`.

**All scoping is enforced server-side.** The API never returns data the caller shouldn't see. Frontend conditional rendering is cosmetic only.

---

## Extensibility

Adding a new widget later (e.g., Leads, Emails):
1. Add a new data section to the `DashboardOverview` response
2. Create a new widget component in `_components/`
3. Render it conditionally in the main page layout
4. No architectural changes needed

### Future KPI Candidates (deferred)
- **Quote-to-book conversion rate**: COUNT(booked) / COUNT(quoted) trips
- **Cancellation rate**: COUNT(cancelled) / COUNT(total) trips
- **Overdue payment aging buckets**: 0-30 days, 30-60 days, 60+ days

---

## Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| Desktop (>= 1280px) | Full layout with sidebar open by default |
| Tablet (768-1279px) | Sidebar collapsed by default, main content full width |
| Mobile (< 768px) | Single column, sidebar as sheet/drawer, trip cards stack vertically |

KPI cards: 3 columns on desktop/tablet, stack to 1 column on mobile.
Chart pair: 2 columns on desktop, stack on tablet/mobile.
Trip card rows: Horizontal scroll on all sizes.

---

## Codex Review Notes

**Blocking corrections applied:**
1. Payments Due uses `expected_payment_items` (not `payment_schedule_config`)
2. Trip ownership uses `ownerId` (not `createdBy` which may be null)
3. All data scoping enforced server-side via existing access services

**Important corrections applied:**
1. `payment_transactions.transactionType` includes `'adjustment'` — net sales = payments - refunds only
2. `commission_tracking.commissionAmount` is decimal dollars, not cents
3. Agent leaderboard uses trip `ownerId` grouping (not solely `trip_collaborators`)
4. Recharts must be added to admin `package.json`
5. Existing `/dashboard/stats` kept for backward compatibility
