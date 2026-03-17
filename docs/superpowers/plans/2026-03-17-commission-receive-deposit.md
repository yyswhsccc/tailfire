# Commission Receive Deposit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a split-screen commission deposit receiving workflow where admins match supplier remittance line items against pending commission receivables, with auto-match, file attachment, and full audit trail.

**Architecture:** New DB migration (audit + accounting fields), new API endpoints (pending receivables query, deposit creation with items), new admin UI (split-screen with resizable panels, filterable receivables table, deposit builder with running balance, auto-match).

**Tech Stack:** NestJS (API), Drizzle ORM, Next.js 15, shadcn/ui, TanStack Query, react-resizable-panels

---

## Business Context

When a supplier (e.g., Transat) sends a commission remittance, the admin needs to:
1. Create a deposit record (document number, date, total, optional file attachment)
2. Match each line item from the remittance to a pending booking/activity in Tailfire
3. The system shows all pending receivables — admin filters by supplier, ref, date, passenger, amount
4. Auto-match: when filtered totals equal deposit total, one-click matches all
5. Finalize: locks the deposit, sets matched items to "received" (claimable by agents)

### Commission Calculation Reminder
```
Gross Commission (supplier pays)
  - Tax
  - Tech Fee (5% of net)
  = Distributable
  Agency keeps 40% | Agent portion 60% (split among collaborators)
```

Commissions become claimable by agents only after trip has departed (in_progress/completed).

---

## File Structure

### Database
| File | Action | Purpose |
|------|--------|---------|
| `packages/database/src/migrations/20260317130000_commission_receive_audit.sql` | Create | Add reconciliation + accounting fields |
| `packages/database/src/migrations/meta/_journal.json` | Modify | Register migration |
| `packages/database/src/schema/activity-pricing.schema.ts` | Modify | Add audit columns to commission_tracking |
| `packages/database/src/schema/commission-checks.schema.ts` | Modify | Add file, accounting, audit columns to commission_checks |

### API
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/financials/commission/commission.service.ts` | Modify | Add getPendingReceivables(), createDepositWithItems(), finalizeDeposit() |
| `apps/api/src/financials/commission/commission.controller.ts` | Modify | Add endpoints for receivables, deposit CRUD |
| `apps/api/src/financials/commission/commission.types.ts` | Modify | Add receivable + deposit DTOs |

### Shared Types
| File | Action | Purpose |
|------|--------|---------|
| `packages/shared-types/src/api/commission.types.ts` | Modify | Add receivable + deposit types for frontend |

### Frontend
| File | Action | Purpose |
|------|--------|---------|
| `apps/admin/src/app/commission/receive/page.tsx` | Create | Split-screen deposit receive page |
| `apps/admin/src/app/commission/receive/_components/deposit-header-form.tsx` | Create | Deposit header (doc#, date, total, supplier, file) |
| `apps/admin/src/app/commission/receive/_components/pending-receivables-table.tsx` | Create | Left panel: filterable pending receivables |
| `apps/admin/src/app/commission/receive/_components/deposit-builder.tsx` | Create | Right panel: matched items + running balance |
| `apps/admin/src/app/commission/receive/_components/match-item-dialog.tsx` | Create | Enter received amount + tax for a selected receivable |
| `apps/admin/src/app/commission/page.tsx` | Modify | Add "Receive Deposit" button linking to /commission/receive |
| `apps/admin/src/hooks/use-commission.ts` | Modify | Add hooks for receivables, deposit creation |

---

## Chunk 1: Database Migration

### Task 1: Add audit + accounting columns

**Files:**
- Create: `packages/database/src/migrations/20260317130000_commission_receive_audit.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`
- Modify: `packages/database/src/schema/activity-pricing.schema.ts` (commission_tracking)
- Modify: `packages/database/src/schema/commission-checks.schema.ts`

- [ ] **Step 1: Create migration**

```sql
-- Commission Receive: audit trail + accounting integration fields

-- 1. Add audit fields to commission_checks (per-deposit)
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS reconciliation_date TIMESTAMPTZ;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS reconciled_by UUID;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS accounting_transaction_id VARCHAR(255);
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- 2. Add audit fields to commission_tracking (per-item)
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS reconciliation_date TIMESTAMPTZ;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS reconciled_by UUID;

-- 3. Index for pending receivables query (commission_status = 'pending' with supplier join)
CREATE INDEX IF NOT EXISTS idx_commission_tracking_status
  ON commission_tracking(commission_status)
  WHERE commission_status = 'pending';
```

- [ ] **Step 2: Register in _journal.json**

- [ ] **Step 3: Update Drizzle schemas** — add new columns to `commissionTracking` and `commissionChecks` table definitions.

- [ ] **Step 4: Run migration locally, typecheck, commit.**

---

## Chunk 2: API — Pending Receivables + Deposit CRUD

### Task 2: Add pending receivables query

This is the core query that powers the left panel. It returns all activities with expected commission that haven't been fully received yet.

**Files:** `apps/api/src/financials/commission/commission.service.ts`

- [ ] **Step 1: Add `getPendingReceivables(agencyId, filters)` method**

Query joins:
```
activity_pricing (has commissionTotalCents, confirmationNumber, bookingReference)
  → itinerary_activities (activity details, start date)
    → itinerary_days → itineraries → trips (trip name, startDate, ownerId)
      → trip_travelers → contacts (passenger names)
  → activity_suppliers → suppliers (supplier name, ID)
  → commission_tracking (current status: pending/received/null)
```

Returns for each receivable:
```typescript
interface PendingReceivableDto {
  activityPricingId: string
  confirmationNumber: string | null
  bookingReference: string | null
  supplierName: string | null
  supplierId: string | null
  tripName: string
  tripId: string
  tripStartDate: string | null
  activityStartDate: string | null
  activityName: string
  passengerNames: string[] // from trip_travelers → contacts
  expectedCommissionCents: number // activity_pricing.commissionTotalCents
  commissionStatus: 'pending' | 'received' | 'cancelled' | null
  reconciliationDate: string | null
  reconciledBy: string | null
  agentName: string | null // trip owner/collaborator name
}
```

Filters:
```typescript
interface PendingReceivablesFilterDto {
  supplierId?: string
  search?: string // searches confirmationNumber, bookingReference, passenger name, trip name
  departureDateFrom?: string
  departureDateTo?: string
  status?: 'pending' | 'all' // default 'pending', 'all' shows received too
  page?: number
  limit?: number
}
```

"Pending" means: `activity_pricing.commissionTotalCents > 0` AND (`commission_tracking` row is NULL OR `commissionStatus = 'pending'`).

When `status = 'all'`, include received items too (for duplicate checking / previously matched toggle).

- [ ] **Step 2: Commit.**

### Task 3: Add deposit creation + finalization endpoints

**Files:**
- `apps/api/src/financials/commission/commission.service.ts`
- `apps/api/src/financials/commission/commission.controller.ts`
- `apps/api/src/financials/commission/commission.types.ts`

- [ ] **Step 1: Add deposit creation types**

```typescript
interface CreateDepositDto {
  depositNumber: string
  depositDate: string // ISO date
  totalAmountCents: number
  supplierId?: string // optional preset
  notes?: string
  fileUrl?: string // uploaded file URL
  fileName?: string
}

interface AddDepositItemDto {
  activityPricingId: string // links to the matched receivable
  receivedCents: number // actual amount received
  taxCents?: number // tax included in commission
}

interface FinalizeDepositDto {
  items: AddDepositItemDto[]
  unreconciled?: { description: string; amountCents: number }[] // unmatched amounts
}
```

- [ ] **Step 2: Add `createDeposit()` method** — creates a `commission_check` with `checkType = 'received'`, `status = 'pending'`. Stores reconciliation audit fields.

- [ ] **Step 3: Add `finalizeDeposit(depositId, dto, actorId)` method:**

For each matched item:
1. Upsert `commission_tracking` row for the `activityPricingId`
2. Set `commissionStatus = 'received'`, `receivedCents`, `taxAmountCents`
3. Set `reconciliationDate = now`, `reconciledBy = actorId`
4. Create `commission_check_item` linking the check to the activity pricing

For unreconciled items:
1. Create `commission_check_item` with no `activityPricingId` link
2. Store description and amount

Set deposit status to `'accepted'`, set `reconciliationDate` and `reconciledBy` on the check.

- [ ] **Step 4: Add controller endpoints (all AdminGuard):**

```
GET  /commission/receivables          → getPendingReceivables (filterable)
POST /commission/deposits             → createDeposit (header only)
POST /commission/deposits/:id/finalize → finalizeDeposit (with matched items)
GET  /commission/deposits/:id         → getDepositDetail (with items)
```

- [ ] **Step 5: Add file upload support** — use existing StorageService pattern. Accept multipart form data or pre-signed URL approach (check how trip media upload works).

- [ ] **Step 6: Typecheck and commit.**

---

## Chunk 3: Shared Types + Hooks

### Task 4: Export new types + add hooks

**Files:**
- `packages/shared-types/src/api/commission.types.ts`
- `apps/admin/src/hooks/use-commission.ts`

- [ ] **Step 1: Add types** — `PendingReceivableDto`, `PendingReceivablesFilterDto`, `CreateDepositDto`, `FinalizeDepositDto` to shared types.

- [ ] **Step 2: Add hooks:**

```typescript
// Pending receivables (filterable, paginated)
export function usePendingReceivables(filter: PendingReceivablesFilterDto) { ... }

// Deposit CRUD
export function useCreateDeposit() { ... } // POST /commission/deposits
export function useFinalizeDeposit() { ... } // POST /commission/deposits/:id/finalize
export function useDepositDetail(id: string | null) { ... } // GET /commission/deposits/:id
```

- [ ] **Step 3: Commit.**

---

## Chunk 4: Split-Screen UI

### Task 5: Deposit header form

**Files:** `apps/admin/src/app/commission/receive/_components/deposit-header-form.tsx`

- [ ] **Step 1: Create form component**

Fields:
- Deposit Number (required, text input)
- Deposit Date (required, date picker)
- Total Amount (required, currency input — stored as cents)
- Supplier (optional, select from suppliers list)
- Notes (optional, textarea)
- File Upload (optional, drag-and-drop or click to upload PDF)

On submit: calls `useCreateDeposit()`, returns deposit ID for subsequent operations.

- [ ] **Step 2: Commit.**

### Task 6: Pending receivables table (left panel)

**Files:** `apps/admin/src/app/commission/receive/_components/pending-receivables-table.tsx`

- [ ] **Step 1: Create filterable table**

Filters bar at top:
- Supplier dropdown (from useSuppliers hook)
- Search input (ref, passenger, trip name — debounced)
- Departure date range (from/to date pickers)
- Status toggle: "Pending" (default) / "All" (show received too)

Table columns:
- Booking Ref (confirmationNumber)
- Secondary Ref (bookingReference)
- Passenger (names joined)
- Trip
- Departure (trip startDate or activity date)
- Expected ($)
- Status (pending/received badge)
- Action (select/match button)

Row click → opens match dialog OR directly adds to deposit builder.

- [ ] **Step 2: Auto-match indicator** — when sum of visible filtered rows equals deposit total, show prominent "Auto-Match All (X items = $Y)" button.

- [ ] **Step 3: Commit.**

### Task 7: Deposit builder (right panel)

**Files:** `apps/admin/src/app/commission/receive/_components/deposit-builder.tsx`

- [ ] **Step 1: Create deposit builder panel**

Shows:
- Deposit header summary (doc#, date, total)
- List of matched items (added from left panel)
  - Each shows: Ref, Passenger, Expected, Received, Tax, net difference
  - Remove button (moves back to left panel)
- Running balance bar: "Matched: $X / Total: $Y — Remaining: $Z"
  - Color-coded: green when balanced, yellow when partial, red when over
- "Add Unreconciled" button — opens inline form for description + amount
- "Finalize Deposit" button — disabled until at least 1 item matched

- [ ] **Step 2: Commit.**

### Task 8: Match item dialog

**Files:** `apps/admin/src/app/commission/receive/_components/match-item-dialog.tsx`

- [ ] **Step 1: Create dialog** — opens when admin clicks a receivable row

Shows:
- Receivable details (ref, trip, passenger, expected commission)
- Received Amount input (pre-filled with expected)
- Tax Amount input (default 0)
- Confirm button → adds to deposit builder

- [ ] **Step 2: Commit.**

### Task 9: Split-screen page assembly

**Files:**
- `apps/admin/src/app/commission/receive/page.tsx` (create)
- `apps/admin/src/app/commission/page.tsx` (modify — add button)

- [ ] **Step 1: Create the receive page**

Layout:
1. Top: Deposit header form (collapsible after creation)
2. Below: Split screen using `react-resizable-panels` (or CSS flexbox with drag handle)
   - Left: Pending receivables table
   - Right: Deposit builder with running balance
   - Resizable divider between panels
   - Right panel collapsible

State management:
- `depositId` — created deposit ID (null until header submitted)
- `matchedItems` — array of items moved from left to right
- `filters` — receivables filter state

Flow:
1. Admin fills header → submit → creates deposit → shows split screen
2. Admin filters left panel → clicks rows → enters received amount → items move to right
3. Auto-match button appears when filtered total = deposit total
4. Admin clicks "Finalize Deposit" → API call → redirect to commission page

- [ ] **Step 2: Add "Receive Deposit" button to commission page**

On the main `/commission` page, add a button (admin only):
```tsx
{isAdmin && (
  <Button asChild>
    <Link href="/commission/receive">
      <Plus className="mr-2 h-4 w-4" />
      Receive Deposit
    </Link>
  </Button>
)}
```

- [ ] **Step 3: Install react-resizable-panels** (if not already available — check if the codebase uses an alternative for split views).

- [ ] **Step 4: Typecheck both apps, commit and push.**

---

## Chunk 5: Unreconciled Report

### Task 10: Add unreconciled view to commission page

**Files:** `apps/admin/src/app/commission/page.tsx`

- [ ] **Step 1: Add "Unreconciled" tab** to the existing commission page tabs

Shows all deposit items that have no `activityPricingId` link (unmatched amounts). Columns: Deposit #, Date, Supplier, Description, Amount, Actions (match later).

- [ ] **Step 2: Commit and push.**

---

## Summary

| Task | What | Chunk |
|------|------|-------|
| 1 | Migration: audit + accounting columns | DB |
| 2 | Pending receivables query | API |
| 3 | Deposit creation + finalization endpoints | API |
| 4 | Shared types + hooks | Types |
| 5 | Deposit header form | UI |
| 6 | Pending receivables table (left panel) | UI |
| 7 | Deposit builder (right panel) | UI |
| 8 | Match item dialog | UI |
| 9 | Split-screen page assembly | UI |
| 10 | Unreconciled report tab | UI |

**Estimated: 10 tasks across 5 chunks, ~3 hours**

**Dependencies:**
- Chunk 1 (DB) must run first
- Chunk 2 (API) depends on Chunk 1
- Chunk 3 (Types/Hooks) depends on Chunk 2
- Chunks 4-5 (UI) depend on Chunk 3
- Tasks within each chunk can be parallelized

**Key data flow:**
```
Pending receivables (activity_pricing with commissionTotalCents > 0, status pending)
  ↓ Admin filters + selects
Deposit builder (matched items with received amounts)
  ↓ Finalize
commission_tracking rows updated (status → received, audit fields set)
commission_check + check_items created (deposit record)
  ↓ Trip departs
Agent can claim commission
```
