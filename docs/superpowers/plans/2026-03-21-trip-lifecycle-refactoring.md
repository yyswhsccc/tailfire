# Trip Lifecycle Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge the entire codebase to the canonical trip workflow model defined in `docs/TRIP_WORKFLOW.md` — renaming trip statuses, normalizing activity booking, building a lifecycle engine, and enforcing booking validation.

**Architecture:** 8 sequential branches, each deployed and Codex-reviewed independently. Phase 1-2 (vocabulary rename) is the foundation — every subsequent phase depends on it. No live data exists, so all migrations are clean replacements with no backfill.

**Tech Stack:** NestJS (API), Next.js (Admin), Drizzle ORM, PostgreSQL, BullMQ, EventEmitter2

**Spec:** `docs/superpowers/specs/2026-03-21-trip-lifecycle-refactoring-design.md`

---

## Branch 1: `feature/trip-lifecycle-phase-1-2`

### Task 1: Create DB migration for trip status enum rename

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_rename_trip_status_enum.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL**

```sql
-- Rename trip_status enum values
-- No data backfill needed (no live data in any environment)

-- Step 1: Add new values
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'travelling';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'travelled';

-- Step 2: Update default
ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'planning';

-- Step 3: Migrate any existing rows (safety net even though no live data)
UPDATE trips SET status = 'planning' WHERE status IN ('draft', 'quoted');
UPDATE trips SET status = 'active' WHERE status = 'booked';
UPDATE trips SET status = 'travelling' WHERE status = 'in_progress';
UPDATE trips SET status = 'travelled' WHERE status = 'completed';

-- Step 4: Update status_before_cancel references
UPDATE trips SET status_before_cancel = 'planning' WHERE status_before_cancel IN ('draft', 'quoted');
UPDATE trips SET status_before_cancel = 'active' WHERE status_before_cancel = 'booked';
UPDATE trips SET status_before_cancel = 'travelling' WHERE status_before_cancel = 'in_progress';
UPDATE trips SET status_before_cancel = 'travelled' WHERE status_before_cancel = 'completed';

-- Step 5: Recreate enum without old values
-- PostgreSQL doesn't support DROP VALUE, so we need to recreate
ALTER TABLE trips ALTER COLUMN status TYPE varchar(20);
DROP TYPE trip_status;
CREATE TYPE trip_status AS ENUM ('inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled');
ALTER TABLE trips ALTER COLUMN status TYPE trip_status USING status::trip_status;
ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'planning';
```

Note: The exact SQL may need adjustment for the `status_before_cancel` varchar column and the DB trigger. Read `20260318120000_fix_trip_status_trigger.sql` to understand the current trigger, then replace it in this migration.

- [ ] **Step 2: Register migration in `_journal.json`**

Add the new entry with the next sequential index.

- [ ] **Step 3: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration completes without errors.

- [ ] **Step 4: Verify enum values in psql**

Run: `source apps/api/.env && psql "$DATABASE_URL" -c "SELECT enum_range(NULL::trip_status)"`
Expected: `{inbound,planning,active,travelling,travelled,cancelled}`

- [ ] **Step 5: Commit**

```
git add packages/database/src/migrations/
git commit -m "feat(database): rename trip_status enum to canonical vocabulary

planning replaces draft+quoted, active replaces booked,
travelling replaces in_progress, travelled replaces completed"
```

---

### Task 2: Update Drizzle schema and shared types

**Files:**
- Modify: `packages/database/src/schema/trips.schema.ts`
- Modify: `packages/shared-types/src/api/trip-status-transitions.ts`
- Modify: `packages/shared-types/src/api/trips.types.ts`
- Modify: `packages/shared-types/src/api/common.types.ts`

- [ ] **Step 1: Update `tripStatusEnum` in trips.schema.ts**

Replace the enum values:
```typescript
export const tripStatusEnum = pgEnum('trip_status', [
  'inbound',
  'planning',
  'active',
  'travelling',
  'travelled',
  'cancelled',
])
```

Update the default on the `status` column:
```typescript
status: tripStatusEnum('status').default('planning').notNull(),
```

- [ ] **Step 2: Rewrite `trip-status-transitions.ts`**

Replace the entire `TripStatus` type:
```typescript
export type TripStatus = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'
```

Replace `TRIP_STATUS_TRANSITIONS`:
```typescript
export const TRIP_STATUS_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  inbound: ['planning', 'cancelled'],
  planning: ['inbound', 'cancelled'],
  active: ['planning', 'travelling', 'cancelled'],
  travelling: ['travelled', 'cancelled'],
  travelled: [],
  cancelled: ['planning'], // admin-only un-cancel
}
```

Update `DELETABLE_STATUSES`:
```typescript
export const DELETABLE_STATUSES: readonly TripStatus[] = ['inbound', 'planning'] as const
```

Update `formatStatusLabel`:
```typescript
const labels: Record<TripStatus, string> = {
  inbound: 'Inbound',
  planning: 'Planning',
  active: 'Active',
  travelling: 'Travelling',
  travelled: 'Travelled',
  cancelled: 'Cancelled',
}
```

Update `isTerminalStatus`:
```typescript
export function isTerminalStatus(status: TripStatus): boolean {
  return status === 'travelled' || status === 'cancelled'
}
```

Update `getDeleteErrorMessage` text to reference new status names.

- [ ] **Step 3: Update all status literals in `trips.types.ts`**

Search and replace all occurrences of the old status union types in DTOs:
- `'inbound' | 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled'`
- Replace with: `'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'`

This affects: `CreateTripDto`, `UpdateTripDto`, `TripFilterDto`, `BulkChangeStatusDto`.

- [ ] **Step 4: Update `common.types.ts` if it references trip status**

Check for status references and update accordingly.

- [ ] **Step 5: Run typecheck**

Run: `cd packages/shared-types && pnpm typecheck`
Expected: Type errors in downstream consumers (expected — we'll fix those next).

- [ ] **Step 6: Commit**

```
git add packages/database/src/schema/trips.schema.ts packages/shared-types/src/api/
git commit -m "feat(shared-types): update TripStatus type and transition rules to canonical vocabulary"
```

---

### Task 3: Update API DTOs and services

**Files:**
- Modify: `apps/api/src/trips/dto/create-trip.dto.ts`
- Modify: `apps/api/src/trips/dto/update-trip.dto.ts`
- Modify: `apps/api/src/trips/dto/trip-filter.dto.ts`
- Modify: `apps/api/src/trips/dto/bulk-trip-operations.dto.ts`
- Modify: `apps/api/src/trips/trips.service.ts`
- Modify: `apps/api/src/trips/trips.controller.ts`
- Modify: `apps/api/src/trips/trip-access.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/financials/commission/commission.service.ts`
- Modify: `apps/api/src/trips/payment-schedules.service.ts`
- Modify: `apps/api/src/trips/document-templates.service.ts`
- Modify: `apps/api/src/contacts/contacts.service.ts`
- Modify: `apps/api/src/activity-logs/activity-logs.service.ts`
- Modify: `apps/api/src/trips/portal.service.ts`
- Modify: `apps/api/src/trips/client-portal.service.ts`
- Modify: `apps/api/src/cruise-booking/services/booking-session.service.ts`

- [ ] **Step 1: Update API DTOs**

In each DTO file, replace old status string literals with new ones. Use grep to find all occurrences:
```bash
grep -rn "'draft'\|'quoted'\|'booked'\|'in_progress'\|'completed'" apps/api/src/trips/dto/
```

- [ ] **Step 2: Update `trips.service.ts`**

This is the largest file. Search for all hardcoded status references:
```bash
grep -n "'draft'\|'quoted'\|'booked'\|'in_progress'\|'completed'" apps/api/src/trips/trips.service.ts
```

Replace each occurrence. Key areas:
- Status transition validation
- Cancel/uncancel logic (`statusBeforeCancel` handling)
- Default status on create
- Status filters in queries

- [ ] **Step 3: Update remaining API services**

For each service file listed, grep for old status values and replace:
```bash
grep -rn "'draft'\|'quoted'\|'booked'\|'in_progress'\|'completed'" apps/api/src/
```

Key files:
- `dashboard.service.ts` — metric queries filter by status
- `commission.service.ts` — commission calculations
- `payment-schedules.service.ts` — payment logic
- `trip-access.service.ts` — access control

- [ ] **Step 4: Run typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: Clean (or only pre-existing errors unrelated to this change).

- [ ] **Step 5: Commit**

```
git add apps/api/src/
git commit -m "feat(api): update all trip status references to canonical vocabulary"
```

---

### Task 4: Rename event files and update automation

**Files:**
- Rename: `apps/api/src/trips/events/trip-booked.event.ts` -> `trip-active.event.ts`
- Rename: `apps/api/src/trips/events/trip-in-progress.event.ts` -> `trip-travelling.event.ts`
- Rename: `apps/api/src/trips/events/trip-completed.event.ts` -> `trip-travelled.event.ts`
- Modify: `apps/api/src/trips/events/index.ts`
- Modify: `apps/api/src/automation/automation.types.ts`
- Modify: `apps/api/src/automation/processors/trip-automation.processor.ts`
- Modify: `apps/api/src/automation/listeners/trip-lifecycle.listener.ts`
- Modify: `apps/api/src/automation/listeners/notification-events.listener.ts`
- Modify: `apps/api/src/automation/processors/client-care.processor.ts`
- Modify: `apps/api/src/automation/automation.service.ts`

- [ ] **Step 1: Rename event files**

```bash
cd apps/api/src/trips/events
git mv trip-booked.event.ts trip-active.event.ts
git mv trip-in-progress.event.ts trip-travelling.event.ts
git mv trip-completed.event.ts trip-travelled.event.ts
```

- [ ] **Step 2: Update event class names inside each file**

- `TripBookedEvent` -> `TripActiveEvent`
- `TripInProgressEvent` -> `TripTravellingEvent`
- `TripCompletedEvent` -> `TripTravelledEvent`

Update the event name strings:
- `'trip.booked'` -> `'trip.active'`
- `'trip.in_progress'` -> `'trip.travelling'`
- `'trip.completed'` -> `'trip.travelled'`

- [ ] **Step 3: Update `events/index.ts` barrel exports**

- [ ] **Step 4: Update `automation.types.ts`**

Replace event type references.

- [ ] **Step 5: Update automation processors and listeners**

In each file, replace:
- Event class imports (new filenames + class names)
- Event name string literals
- Status comparisons in processor logic

- [ ] **Step 6: Grep for any remaining old event references**

```bash
grep -rn "trip\.booked\|trip\.in_progress\|trip\.completed\|TripBookedEvent\|TripInProgressEvent\|TripCompletedEvent" apps/api/src/
```

Expected: No matches.

- [ ] **Step 7: Commit**

```
git add apps/api/src/trips/events/ apps/api/src/automation/
git commit -m "feat(api): rename trip events and automation to canonical vocabulary

trip.booked -> trip.active, trip.in_progress -> trip.travelling,
trip.completed -> trip.travelled"
```

---

### Task 5: Update admin frontend

**Files:**
- Modify: `apps/admin/src/lib/trip-status-constants.ts`
- Modify: `apps/admin/src/lib/validation/trip-validation.ts`
- Modify: `apps/admin/src/app/trips/_components/trip-form-dialog.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`
- Modify: `apps/admin/src/components/trips/trips-kanban.tsx`
- Modify: `apps/admin/src/components/trips/trips-filter-panel.tsx`
- Modify: `apps/admin/src/components/trips/trip-card.tsx`
- Modify: `apps/admin/src/app/trips/_components/trips-table.tsx`
- Modify: `apps/admin/src/hooks/use-trips.ts`
- Modify: `apps/admin/src/app/trips/_components/add-trip-to-group-dialog.tsx`
- Modify: `apps/admin/src/app/dashboard/_components/trip-card.tsx`

- [ ] **Step 1: Rewrite `trip-status-constants.ts`**

Replace the entire config to use the new 1:1 Kanban mapping:

```typescript
export type TripStatusVariant = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'
export type KanbanColumnId = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled'

export const TRIP_STATUS_CONFIG: Record<TripStatus, TripStatusConfig> = {
  inbound: { status: 'inbound', label: 'Inbound', variant: 'inbound', columnId: 'inbound' },
  planning: { status: 'planning', label: 'Planning', variant: 'planning', columnId: 'planning' },
  active: { status: 'active', label: 'Active', variant: 'active', columnId: 'active' },
  travelling: { status: 'travelling', label: 'Travelling', variant: 'travelling', columnId: 'travelling' },
  travelled: { status: 'travelled', label: 'Travelled', variant: 'travelled', columnId: 'travelled' },
  cancelled: { status: 'cancelled', label: 'Cancelled', variant: 'cancelled', columnId: undefined },
}

export const KANBAN_COLUMNS = [
  { id: 'inbound' as const, title: 'Inbound', statuses: ['inbound' as const] },
  { id: 'planning' as const, title: 'Planning', statuses: ['planning' as const] },
  { id: 'active' as const, title: 'Active', statuses: ['active' as const] },
  { id: 'travelling' as const, title: 'Travelling', statuses: ['travelling' as const] },
  { id: 'travelled' as const, title: 'Travelled', statuses: ['travelled' as const] },
] as const

export const COLUMN_TO_STATUS: Record<KanbanColumnId, TripStatus> = {
  inbound: 'inbound',
  planning: 'planning',
  active: 'active',
  travelling: 'travelling',
  travelled: 'travelled',
}
```

- [ ] **Step 2: Update all admin components**

Grep for old status values across the admin app:
```bash
grep -rn "'draft'\|'quoted'\|'booked'\|'in_progress'\|'completed'" apps/admin/src/
```

Replace in each file. Key considerations:
- `trip-form-dialog.tsx` — status dropdown options
- `trips-kanban.tsx` — column rendering and drag handlers
- `trips-filter-panel.tsx` — filter dropdown options
- `trip-overview.tsx` — status badge display
- `trip-card.tsx` — card badge variant

- [ ] **Step 3: Run typecheck**

Run: `cd apps/admin && pnpm typecheck`
Expected: Clean.

- [ ] **Step 4: Commit**

```
git add apps/admin/src/
git commit -m "feat(admin): update all trip status references to canonical vocabulary"
```

---

### Task 6: Update seed data and final grep

**Files:**
- Modify: `packages/database/src/seed.ts`

- [ ] **Step 1: Update seed data**

Replace all old status values in seed data with new vocabulary.

- [ ] **Step 2: Final comprehensive grep across entire repo**

```bash
grep -rn "'draft'\|'quoted'\|'booked'\|'in_progress'\|'completed'" \
  --include="*.ts" --include="*.tsx" \
  packages/ apps/ \
  | grep -v node_modules | grep -v .git | grep -v migrations/0
```

Expected: No matches outside of old migration files (which are immutable history).

- [ ] **Step 3: Start dev server and smoke test**

Run: `turbo dev` (in tmux pane 2)
Verify: Admin loads at localhost:3100, Kanban shows 5 columns, trip creation works.

- [ ] **Step 4: Commit and Codex review**

```
git add packages/database/src/seed.ts
git commit -m "feat(database): update seed data to canonical trip vocabulary"
```

Then run `/validate-with-codex` on the full branch diff.

---

## Branch 2: `feature/trip-lifecycle-phase-3`

### Task 7: Remove `declined` from itinerary status enum

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_remove_itinerary_declined.sql`
- Modify: `packages/database/src/schema/trips.schema.ts` — `itineraryStatusEnum`
- Modify: `packages/shared-types/src/api/trips.types.ts` — itinerary DTOs
- Modify: `apps/api/src/trips/dto/create-itinerary.dto.ts`
- Modify: `apps/api/src/trips/itineraries.service.ts`
- Modify: `apps/admin/src/hooks/use-itineraries.ts`
- Modify: `apps/admin/src/app/trips/[id]/_components/client-feedback-banner.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx`
- Modify: `apps/client/src/app/shared/trips/[token]/_components/ApprovalSection.tsx`

- [ ] **Step 1: Create migration to remove `declined`**

```sql
-- Remove 'declined' from itinerary_status enum
-- Update any rows (safety net)
UPDATE itineraries SET status = 'archived' WHERE status = 'declined';

ALTER TABLE itineraries ALTER COLUMN status TYPE varchar(20);
DROP TYPE itinerary_status;
CREATE TYPE itinerary_status AS ENUM ('draft', 'proposing', 'approved', 'archived');
ALTER TABLE itineraries ALTER COLUMN status TYPE itinerary_status USING status::itinerary_status;
ALTER TABLE itineraries ALTER COLUMN status SET DEFAULT 'draft';
```

- [ ] **Step 2: Update `itineraryStatusEnum` in `trips.schema.ts`**

Remove `'declined'` from the array.

- [ ] **Step 3: Remove `'declined'` from all DTO types**

Update `CreateItineraryDto`, `UpdateItineraryDto`, `ItineraryFilterDto` in `trips.types.ts`.

- [ ] **Step 4: Update `itineraries.service.ts`**

- Add single-approved enforcement: when one itinerary is approved, archive previously approved ones
- Remove any decline-specific logic

- [ ] **Step 5: Update admin components**

- `trip-itinerary.tsx` — remove "Decline" from action menu, ensure "Archive" is present
- `client-feedback-banner.tsx` — remove declined references
- `ApprovalSection.tsx` — remove decline action from client portal

- [ ] **Step 6: Run typecheck, grep for `declined`, smoke test**

```bash
grep -rn "'declined'" --include="*.ts" --include="*.tsx" packages/ apps/ | grep -v node_modules | grep -v migrations/0
```
Expected: No matches.

- [ ] **Step 7: Commit and Codex review**

```
git add .
git commit -m "feat: remove declined from itinerary status enum

Canonical set: draft, proposing, approved, archived.
Client decline is implicit — unselected itineraries are archived."
```

---

## Branch 3: `feature/trip-lifecycle-phase-4`

### Task 8: Enforce proposal versioning contract

**Files:**
- Modify: `apps/api/src/trips/itinerary-versions.service.ts`
- Modify: `apps/api/src/trips/itineraries.controller.ts`
- Modify: `apps/api/src/trips/trips.service.ts`

- [ ] **Step 1: Read current versioning implementation**

Read `itinerary-versions.service.ts`, `itineraries.controller.ts`, and the proposal comment/response code to understand what already exists.

- [ ] **Step 2: Add version binding to approval records**

Ensure approval stores `{ itineraryId, versionNumber }`. Check if this already exists.

- [ ] **Step 3: Enforce re-publish creates new version**

Verify that publishing an already-approved itinerary creates a new version number without overwriting the approved version's snapshot.

- [ ] **Step 4: Validate comments reference version**

Check `ProposalCommentDto` — it already has `versionNumber`. Ensure the API enforces it's set on create.

- [ ] **Step 5: Commit and Codex review**

```
git commit -m "feat(api): enforce proposal versioning contract

Approvals, comments, and activity responses must bind to a published version number."
```

---

## Branch 4: `feature/trip-lifecycle-phase-5`

### Task 9: Add new activity state columns and enums

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_activity_booking_normalization.sql`
- Modify: `packages/database/src/schema/activities.schema.ts`
- Modify: `packages/database/src/schema/activity-pricing.schema.ts`

- [ ] **Step 1: Create migration**

```sql
-- New enums
CREATE TYPE activity_proposal_status AS ENUM ('draft', 'proposing', 'approved', 'cancelled');
CREATE TYPE activity_booking_status AS ENUM ('unbooked', 'booked', 'cancelled');

-- Add new columns
ALTER TABLE itinerary_activities ADD COLUMN proposal_status activity_proposal_status NOT NULL DEFAULT 'draft';
ALTER TABLE itinerary_activities ADD COLUMN booking_status activity_booking_status NOT NULL DEFAULT 'unbooked';

-- Passport verification
ALTER TABLE itinerary_activities ADD COLUMN passport_verified boolean NOT NULL DEFAULT false;
ALTER TABLE itinerary_activities ADD COLUMN passport_verified_at timestamptz;
ALTER TABLE itinerary_activities ADD COLUMN passport_verified_by uuid;

-- Non-refundable amount
ALTER TABLE payment_schedule_config ADD COLUMN non_refundable_amount_cents integer;

-- Migrate existing data (safety net)
UPDATE itinerary_activities SET proposal_status = 'draft' WHERE status = 'proposed';
UPDATE itinerary_activities SET proposal_status = 'approved' WHERE status = 'confirmed';
UPDATE itinerary_activities SET proposal_status = 'cancelled' WHERE status = 'cancelled';
UPDATE itinerary_activities SET booking_status = 'booked' WHERE is_booked = true;

-- Drop old columns
ALTER TABLE itinerary_activities DROP COLUMN status;
ALTER TABLE itinerary_activities DROP COLUMN is_booked;

-- Drop old enum
DROP TYPE activity_status;
```

- [ ] **Step 2: Update Drizzle schema**

In `activities.schema.ts`:
- Add new enum definitions for `activityProposalStatusEnum` and `activityBookingStatusEnum`
- Replace `status` and `isBooked` columns with `proposalStatus` and `bookingStatus`
- Add passport verification columns
- Remove old `activityStatusEnum`

In `activity-pricing.schema.ts`:
- Add `nonRefundableAmountCents` to `paymentScheduleConfig`

- [ ] **Step 3: Run migration and verify**

- [ ] **Step 4: Commit**

```
git commit -m "feat(database): add proposalStatus + bookingStatus columns, remove legacy status + isBooked"
```

---

### Task 10: Update all activity status references across codebase

**Files:**
- Modify: All files referencing `activity.status`, `isBooked`, `activityStatusEnum`, `SharedActivityStatus`
- Key files: `activities.service.ts`, `activity-bookings.service.ts`, shared types, admin hooks, mark-as-booked modals

- [ ] **Step 1: Grep for all old references**

```bash
grep -rn "isBooked\|is_booked\|activityStatusEnum\|activity_status\|SharedActivityStatus\|'proposed'\|'confirmed'" \
  --include="*.ts" --include="*.tsx" packages/ apps/ | grep -v node_modules | grep -v migrations
```

- [ ] **Step 2: Update each file systematically**

Replace `status` references with `proposalStatus`, `isBooked` with `bookingStatus === 'booked'`.

- [ ] **Step 3: Update shared types**

`SharedActivityStatus` changes from `'proposed' | 'confirmed' | 'cancelled' | 'optional'` to use new enum values.

- [ ] **Step 4: Typecheck all packages**

Run: `turbo typecheck`

- [ ] **Step 5: Commit**

---

### Task 11: Build booking validation service

**Files:**
- Create: `apps/api/src/trips/booking-validation.service.ts`
- Modify: `apps/api/src/trips/activity-bookings.service.ts`
- Modify: `apps/api/src/trips/trips.module.ts`

- [ ] **Step 1: Create `BookingValidationService`**

A service with a `validateBooking(activityId: string)` method that checks all Tier 1 requirements:
- Supplier present
- Booking date set
- Departure < return dates
- At least 1 traveler assigned
- Traveler contact complete (DOB, name, address)
- Total price > 0
- Payment schedule defined with deposit + due dates
- Confirmation number present
- Passport valid + 6mo (or `passport_verified` checkbox checked)
- Final payment due before departure
- Non-refundable amount flagged when deposit is non-refundable

Returns `{ valid: boolean, errors: string[] }`.

- [ ] **Step 2: Wire into `activity-bookings.service.ts`**

Call `bookingValidation.validateBooking()` before setting `bookingStatus = 'booked'`. If validation fails, throw `BadRequestException` with the error list.

- [ ] **Step 3: Register in `trips.module.ts`**

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): add booking validation service with Tier 1 checks"
```

---

### Task 12: Update booking UI with validation + passport + non-refundable

**Files:**
- Modify: `apps/admin/src/components/activities/mark-activity-booked-modal.tsx`
- Modify: `apps/admin/src/components/packages/mark-as-booked-modal.tsx`
- Modify: `apps/admin/src/hooks/use-activity-bookings.ts`

- [ ] **Step 1: Add passport verification checkbox to booking modals**

- [ ] **Step 2: Add non-refundable amount field**

When `non_refundable_deposit` is checked, show `non_refundable_amount_cents` field pre-filled with deposit amount. Validate <= deposit.

- [ ] **Step 3: Display validation errors from API**

When the booking validation service returns errors, display them in the modal as a checklist of what's missing.

- [ ] **Step 4: Smoke test the booking flow**

- [ ] **Step 5: Commit and Codex review**

```
git commit -m "feat(admin): add passport verification and non-refundable amount to booking modals"
```

---

## Branch 5: `feature/trip-lifecycle-phase-6`

### Task 13: Create TripLifecycleService

**Files:**
- Create: `apps/api/src/trips/trip-lifecycle.service.ts`
- Modify: `apps/api/src/trips/trips.module.ts`
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Create `TripLifecycleService`**

Methods:
- `evaluateTripStage(tripId: string)` — counts valid bookings, promotes/demotes stage
- `onActivityBooked(activityId: string)` — called after booking validation passes
- `onBookingCancelled(activityId: string)` — called after booking is cancelled/deleted
- `scheduleTimedTransitions(tripId: string)` — schedules BullMQ jobs for date-driven transitions

Logic:
```typescript
async evaluateTripStage(tripId: string) {
  const trip = await this.getTrip(tripId)
  const bookedCount = await this.countValidBookings(tripId)

  if (trip.status === 'planning' && bookedCount > 0) {
    await this.transitionTo(tripId, 'active')
    await this.archiveNonApprovedItineraries(tripId)
    await this.scheduleTimedTransitions(tripId)
  }

  if (trip.status === 'active' && bookedCount === 0) {
    await this.transitionTo(tripId, 'planning')
    await this.cancelScheduledJobs(tripId)
  }
}
```

- [ ] **Step 2: Wire booking events to lifecycle service**

In `activity-bookings.service.ts`, after a successful booking:
```typescript
await this.tripLifecycleService.onActivityBooked(activityId)
```

After booking cancellation/deletion:
```typescript
await this.tripLifecycleService.onBookingCancelled(activityId)
```

- [ ] **Step 3: Wire date-driven transitions in automation**

Update `trip-automation.processor.ts` to use new event names and transition logic.

- [ ] **Step 4: Register in module**

- [ ] **Step 5: Commit and Codex review**

```
git commit -m "feat(api): add TripLifecycleService for system-driven stage transitions

Active is derived from bookings. Date-driven transitions for
travelling and travelled."
```

---

## Branch 6: `feature/trip-lifecycle-phase-7`

### Task 14: Align payments and service fees

**Files:**
- Modify: `apps/api/src/trips/payment-schedules.service.ts`
- Modify: `apps/api/src/trips/traveler-bookings.service.ts`
- Modify: `apps/api/src/financials/service-fees.service.ts`
- Modify: `apps/admin/src/hooks/use-service-fees.ts`
- Modify: `apps/admin/src/hooks/use-booking-status.ts`

- [ ] **Step 1: Ensure package and standalone booking use same payment affordances**

Read both booking paths and verify consistency. Fix any divergence.

- [ ] **Step 2: Verify non-refundable amount displays on Trip-Order**

Check `document-templates.service.ts` — ensure the Trip-Order template renders "Deposit: $X (includes $Y non-refundable)".

- [ ] **Step 3: Commit and Codex review**

---

## Branch 7: `feature/trip-lifecycle-phase-8`

### Task 15: Admin and client surface follow-through

**Files:**
- Modify: Trip form, Kanban, filter panel, table, card components
- Modify: Client portal components

- [ ] **Step 1: Ensure trip form only allows manual status for Inbound/Planning**

In `trip-form-dialog.tsx`, the status dropdown should only show `Inbound` and `Planning`. Active/Travelling/Travelled are system-driven and shown as read-only badges.

- [ ] **Step 2: Verify Kanban drag restrictions**

Agents should only be able to drag between Inbound and Planning columns. Dragging to Active/Travelling/Travelled is not allowed (system-driven).

- [ ] **Step 3: Update client portal labels**

Ensure proposal labels don't imply approval = booking. Update `ApprovalSection.tsx` to remove decline action (already done in Phase 3, verify).

- [ ] **Step 4: Commit and Codex review**

---

## Branch 8: `feature/trip-lifecycle-phase-9`

### Task 16: Tests

**Files:**
- Create: `apps/api/src/trips/__tests__/trip-lifecycle.service.spec.ts`
- Create: `apps/api/src/trips/__tests__/booking-validation.service.spec.ts`

- [ ] **Step 1: Write lifecycle engine tests**

Test cases:
- First booking promotes Planning -> Active
- All bookings removed demotes Active -> Planning
- Package children don't count as independent bookings
- Informational types excluded from booking count
- Date-driven Active -> Travelling -> Travelled

- [ ] **Step 2: Write booking validation tests**

Test each Tier 1 check individually:
- Missing supplier -> validation fails
- Missing confirmation number -> validation fails
- No traveler assigned -> validation fails
- Passport expired -> validation fails (unless checkbox override)
- Non-refundable amount > deposit -> validation fails

- [ ] **Step 3: Run all tests**

Run: `cd apps/api && pnpm test`

- [ ] **Step 4: Commit**

---

### Task 17: Update documentation

**Files:**
- Modify: `docs/TRIP_WORKFLOW.md`
- Modify: `docs/TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md`
- Modify: `docs/REPOSITORY_REVIEW_ISSUES.md`
- Modify: `docs/AUTOMATION.md`

- [ ] **Step 1: Mark TRIP_WORKFLOW.md status note as resolved**

Remove or update the "Status note as of 2026-03-21" section that says the codebase still uses legacy values.

- [ ] **Step 2: Mark implementation plan phases as complete**

- [ ] **Step 3: Resolve addressed items in REPOSITORY_REVIEW_ISSUES.md**

Strike through or remove issues that are now resolved by this refactoring.

- [ ] **Step 4: Update AUTOMATION.md**

Update event names to canonical vocabulary.

- [ ] **Step 5: Final commit**

```
git commit -m "docs: update all documentation to reflect completed trip lifecycle refactoring"
```
