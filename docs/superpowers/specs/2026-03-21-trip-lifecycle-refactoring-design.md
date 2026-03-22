# Trip Lifecycle Refactoring Design

Date: 2026-03-21
Status: Approved
Scope: All 9 phases — full convergence to canonical trip workflow model

## Context

The codebase uses legacy trip status values (`draft`, `quoted`, `booked`, `in_progress`, `completed`) while the documented target model in `docs/TRIP_WORKFLOW.md` defines a new canonical vocabulary. Itinerary workflows still expose a `declined` status. Activity booking uses `status` + `isBooked` instead of explicit proposal/booking lifecycle fields. There is NO live data in any database (dev, preview, or prod).

This spec aligns the entire codebase to the canonical workflow defined in `TRIP_WORKFLOW.md`.

## Delivery Strategy

Sequential phase branches, each with its own Codex review before commit:

1. Phases 1-2: Trip stage vocabulary + DB enum rename
2. Phase 3: Itinerary lifecycle cleanup
3. Phase 4: Proposal versioning contract
4. Phase 5: Activity booking normalization
5. Phase 6: Trip lifecycle engine
6. Phase 7: Payments & service fees alignment
7. Phase 8: Admin & client surface follow-through
8. Phase 9: Tests & docs cleanup

---

## Phase 1-2: Trip Stage Vocabulary

### DB Enum Rename

Single migration replaces `trip_status` enum values. No backfill needed (no live data).

| Old Value | New Value | Notes |
|---|---|---|
| `draft` | `planning` | Merges with `quoted` |
| `quoted` | `planning` | Merges with `draft` |
| `booked` | `active` | |
| `in_progress` | `travelling` | |
| `completed` | `travelled` | |
| `inbound` | `inbound` | No change |
| `cancelled` | `cancelled` | No change |

### Transition Rules

| From | Allowed To |
|---|---|
| `inbound` | `planning`, `cancelled` |
| `planning` | `inbound`, `cancelled` |
| `active` | `planning` (system-driven: all bookings removed), `travelling`, `cancelled` |
| `travelling` | `travelled`, `cancelled` |
| `travelled` | *(terminal)* |
| `cancelled` | `planning` (admin-only un-cancel) |

Key rules:

- `inbound <-> planning` is free movement at agent discretion
- NO manual promotion to `active` — system-driven only (first validated booking triggers it)
- `active -> planning` is automatic when all bookings are removed
- `cancelled -> planning` is admin-only un-cancel (existing feature)
- `travelled` is fully terminal
- `active` is EARNED by having valid bookings, not set manually

### Kanban Columns (1:1 mapping)

| Column | Stage |
|---|---|
| Inbound | `inbound` |
| Planning | `planning` |
| Active | `active` |
| Travelling | `travelling` |
| Travelled | `travelled` |

### Deletable Statuses

`inbound`, `planning` only.

### Touchpoints

**Shared types & database:**
- `packages/database/src/schema/trips.schema.ts` — `tripStatusEnum`
- `packages/database/src/migrations/` — new migration SQL
- `packages/shared-types/src/api/trip-status-transitions.ts` — `TripStatus` type, transition map, all helpers
- `packages/shared-types/src/api/trips.types.ts` — all DTOs with status literals
- `packages/shared-types/src/api/common.types.ts` — status references
- `packages/database/src/seed.ts` — seed data

**API DTOs:**
- `apps/api/src/trips/dto/trip-filter.dto.ts`
- `apps/api/src/trips/dto/bulk-trip-operations.dto.ts`
- `apps/api/src/trips/dto/create-trip.dto.ts`
- `apps/api/src/trips/dto/update-trip.dto.ts`

**API Services:**
- `apps/api/src/trips/trips.service.ts`
- `apps/api/src/trips/trip-access.service.ts`
- `apps/api/src/dashboard/dashboard.service.ts`
- `apps/api/src/financials/commission.service.ts`
- `apps/api/src/trips/payment-schedules.service.ts`
- `apps/api/src/trips/document-templates.service.ts`
- `apps/api/src/contacts/contacts.service.ts`
- `apps/api/src/activity-logs/activity-logs.service.ts`
- `apps/api/src/trips/portal.service.ts`
- `apps/api/src/trips/client-portal.service.ts`
- `apps/api/src/cruise-booking/services/booking-session.service.ts`
- `apps/api/src/trips/trips.controller.ts`

**API Events (rename files + classes):**
- `trip-booked.event.ts` -> `trip-active.event.ts`
- `trip-in-progress.event.ts` -> `trip-travelling.event.ts`
- `trip-completed.event.ts` -> `trip-travelled.event.ts`

**API Automation:**
- `apps/api/src/automation/processors/trip-automation.processor.ts`
- `apps/api/src/automation/listeners/trip-lifecycle.listener.ts`
- `apps/api/src/automation/listeners/notification-events.listener.ts`
- `apps/api/src/automation/automation.types.ts`

**DB Migrations with status references:**
- Migration 0009 — DB trigger for status transition enforcement
- `20260211000001_add_trip_status_tracking.sql`
- `20260316120000_soft_delete_and_uncancel.sql`
- `20260318120000_fix_trip_status_trigger.sql`

**Admin frontend:**
- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/lib/validation/trip-validation.ts`
- `apps/admin/src/app/trips/[id]/_components/trip-form-dialog.tsx`
- `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`
- `apps/admin/src/app/trips/_components/trips-bulk-actions.tsx`
- `apps/admin/src/app/trips/_components/trips-filter-panel.tsx`
- `apps/admin/src/app/trips/_components/trips-kanban.tsx`
- `apps/admin/src/app/trips/_components/trips-table.tsx`
- `apps/admin/src/app/trips/_components/trip-card.tsx`
- `apps/admin/src/hooks/use-trips.ts`
- `apps/admin/src/app/trips/_components/add-trip-to-group-dialog.tsx`

---

## Phase 3: Itinerary Lifecycle Cleanup

### Remove `declined` from itinerary status enum

Canonical set: `draft`, `proposing`, `approved`, `archived`.

Migration drops `declined` from `itinerary_status` enum. No backfill needed.

### Rules

- Only one itinerary per trip can be `Approved`
- When one itinerary becomes `Approved`, previously approved itineraries move to `Archived`
- When a trip reaches `Active`, all non-`Approved` itineraries auto-archive
- Agents can manually archive any itinerary from the itinerary action menu at any time
- Client decline is implicit — if an itinerary is not approved, it can be archived

### Touchpoints

- `packages/database/src/schema/trips.schema.ts` — `itineraryStatusEnum`
- `packages/shared-types/src/api/trips.types.ts` — `CreateItineraryDto`, `UpdateItineraryDto`, `ItineraryFilterDto`
- `apps/api/src/trips/dto/create-itinerary.dto.ts`
- `apps/api/src/trips/itineraries.service.ts`
- `apps/api/src/trips/trips.service.ts`
- `apps/admin/src/hooks/use-itineraries.ts`
- `apps/admin/src/app/trips/[id]/_components/client-feedback-banner.tsx`
- `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx`
- `apps/client/src/app/shared/trips/[token]/_components/ApprovalSection.tsx`
- `packages/shared-types/src/api/common.types.ts`

---

## Phase 4: Proposal Versioning Contract

### Core rule

Client-facing actions (comments, selections, approvals, activity responses) must always bind to `{ tripId, itineraryId, versionNumber }`.

### Enforcement

- Approval records must store the `versionNumber` the client actually approved
- Comments and activity responses must reference `versionNumber`
- Re-publishing creates a new version — does not overwrite an approved version
- Admin preview uses live draft data; client share pages use published snapshot

### Touchpoints

- `apps/api/src/trips/itinerary-versions.service.ts`
- `apps/api/src/trips/itineraries.controller.ts`
- `apps/api/src/trips/trips.service.ts`
- `packages/trip-proposal-ui/`
- `apps/client/src/app/shared/trips/[token]/`

This phase is contract enforcement on existing infrastructure, not new schema.

---

## Phase 5: Activity Booking Normalization

### Schema migration: replace `status` + `isBooked`

| Old | New |
|---|---|
| `status` (proposed, confirmed, cancelled, optional) | `proposalStatus` (draft, proposing, approved, cancelled) |
| `isBooked` (boolean) | `bookingStatus` (unbooked, booked, cancelled) |

New enum types: `activity_proposal_status`, `activity_booking_status`.

Add new columns, drop old. No live data = clean swap.

### New schema fields

| Table | Column | Type | Purpose |
|---|---|---|---|
| `itinerary_activities` | `proposal_status` | enum | Client/proposal lifecycle |
| `itinerary_activities` | `booking_status` | enum | Supplier fulfillment lifecycle |
| `itinerary_activities` | `passport_verified` | boolean (default false) | Agent checkbox |
| `itinerary_activities` | `passport_verified_at` | timestamptz | Audit |
| `itinerary_activities` | `passport_verified_by` | uuid | Audit |
| `payment_schedule_config` | `non_refundable_amount_cents` | integer | TICO-required non-refundable amount |

Drop: `itinerary_activities.status`, `itinerary_activities.is_booked`.

### Booking Validation Contract

Hard gate to set `bookingStatus = booked`:

| Check | Source | Gate |
|---|---|---|
| Supplier identified | `activity_pricing.supplier` | Hard |
| Booking date set | `itinerary_activities.booking_date` | Hard |
| Departure date < Return date | `start_datetime` < `end_datetime` | Hard |
| >= 1 traveler on trip AND assigned to activity | `activity_travelers` join | Hard |
| Traveler contact complete (DOB, full name, address) | `contacts` table | Hard |
| Activity total price > 0 | `activity_pricing.total_price_cents` | Hard |
| Payment schedule defined | `payment_schedule_config` exists | Hard |
| Deposit + due dates present | `expected_payment_items` | Hard |
| Supplier confirmation number | `itinerary_activities.confirmation_number` | Hard |
| Passport valid + expiry > 6mo after return | `contacts` passport fields | Soft (checkbox override via `passport_verified`) |
| Final payment due before departure (30+ days) | `expected_payment_items.due_date` vs `start_datetime` | Hard |
| Non-refundable amount flagged | `payment_schedule_config.non_refundable_amount_cents` | Hard (when `non_refundable_deposit = true`) |

### Non-refundable UX

1. Agent adds deposit payment and sets deposit amount (e.g., $2,000)
2. Agent checks `non_refundable_deposit` flag
3. `non_refundable_amount_cents` field appears, pre-filled with deposit amount ($2,000)
4. Agent can adjust downward (e.g., $500)
5. Validation: `non_refundable_amount_cents` <= deposit amount
6. Trip-Order document displays: "Deposit: $2,000 (includes $500 non-refundable)"
7. The non-refundable amount is always INCLUSIVE in the deposit, never additive

### Package rules

- Package parent is the booking authority
- Child activities inherit `bookingStatus` from parent — cannot be booked independently
- Informational types (`port_info`, `tour_day`) excluded from booking progress calculations

### Touchpoints

- `packages/database/src/schema/activities.schema.ts` — new enums + columns, drop old
- `packages/database/src/schema/activity-pricing.schema.ts` — add `non_refundable_amount_cents` to `payment_schedule_config`
- `apps/api/src/trips/activity-bookings.service.ts` — booking validation service
- `apps/api/src/trips/activities.service.ts` — booking flow
- `apps/admin/src/hooks/use-activity-bookings.ts`
- `apps/admin/src/hooks/use-bookings.ts`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx` — validation UI + passport checkbox + non-refundable field
- `apps/admin/src/components/activities/mark-activity-booked-modal.tsx`
- `apps/admin/src/lib/validation/` — booking validation rules
- `packages/shared-types/src/schemas/activity.schema.ts`
- All shared types referencing `SharedActivityStatus`, `activityStatusEnum`

---

## Phase 6: Trip Lifecycle Engine

### Central principle

Trip stage is derived from booking state + dates. Not manually set (except `inbound <-> planning`).

### Lifecycle rules

| Trigger | Action |
|---|---|
| First activity passes booking validation -> `bookingStatus = booked` | Trip `planning -> active` |
| All booked activities cancelled/deleted on Active trip | Trip `active -> planning` |
| Trip start date reached (Active trip) | Trip `active -> travelling` |
| Trip end date passed (Travelling trip) | Trip `travelling -> travelled` |
| Trip reaches Active | Auto-archive all non-Approved itineraries |

### Implementation

A `TripLifecycleService` that:

1. Listens to booking events (activity booked, booking cancelled, booking deleted)
2. Counts valid bookings on the trip
3. Promotes/demotes trip stage accordingly
4. Fires domain events that automations listen to

### Automation event renames

- `trip.booked` -> `trip.active`
- `trip.in_progress` -> `trip.travelling`
- `trip.completed` -> `trip.travelled`

### Date-driven transitions

Uses existing BullMQ automation system:

- When trip becomes `Active`: schedule `active -> travelling` job for `startDate`
- When trip becomes `Travelling`: schedule `travelling -> travelled` job for `endDate`
- If trip demotes back to `Planning`: cancel scheduled jobs

### Editing Active trips

Fully allowed. Booking changes trigger re-evaluation:

- Updated payment schedule -> new reminders queued
- Initial "trip active" notification does not re-fire
- New bookings on already-Active trip: trip stays Active, automations re-evaluate

### Touchpoints

- NEW: `apps/api/src/trips/trip-lifecycle.service.ts` (central engine)
- `apps/api/src/automation/processors/trip-automation.processor.ts`
- `apps/api/src/automation/listeners/trip-lifecycle.listener.ts`
- `apps/api/src/automation/automation.service.ts`
- `apps/api/src/automation/automation.types.ts`
- `apps/api/src/automation/processors/client-care.processor.ts`
- Renamed event files from Phase 1-2

---

## Phase 7: Payments & Service Fees Alignment

### Core rule

Booking capture must produce a payment schedule. Service fees remain a separate trip-level workflow.

### When an activity is marked booked

1. Payment schedule config must already exist (part of booking validation from Phase 5)
2. Expected payment items must have due dates
3. Non-refundable amounts flagged where applicable
4. Trip-Order document can render: deposit, non-refundable portion, balance, due dates

### Consistency requirements

- Package booking and standalone booking expose the same payment-status affordances
- Manual service-fee payment handling aligned with existing Stripe invoice/refund endpoints
- Booking validation contract from Phase 5 enforced consistently across both paths

### Touchpoints

- `apps/api/src/trips/payment-schedules.controller.ts`
- `apps/api/src/trips/payment-schedules.service.ts`
- `apps/api/src/trips/traveler-bookings.service.ts`
- `apps/api/src/financials/service-fees.controller.ts`
- `apps/api/src/financials/service-fees.service.ts`
- `apps/api/src/financials/stripe-invoice.controller.ts`
- `apps/admin/src/hooks/use-service-fees.ts`
- `apps/admin/src/hooks/use-booking-status.ts`

---

## Phase 8: Admin & Client Surface Follow-Through

### Admin UI

- Kanban columns: clean 1:1 mapping (from Phase 1-2)
- Trip stage badge reflects new vocabulary
- Filter panel: new status options
- Bulk actions: new status values
- Trip form: status dropdown shows only manually-settable stages (`Inbound`, `Planning`)
- `Active`, `Travelling`, `Travelled` shown as read-only badges (system-driven)
- Itinerary action menu: "Archive" option available, no "Decline" option

### Client portal

- Proposal labels do not imply approval = booking
- Share page shows itinerary status accurately
- Approval flow records version number

### Trip-Order document

- Non-refundable amounts displayed per TICO requirement: "Deposit: $X,XXX (includes $Y non-refundable)"
- Booking status reflected accurately with new vocabulary

### Touchpoints

- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/app/trips/` (all trip page components)
- `apps/client/src/app/shared/trips/[token]/`
- `packages/trip-proposal-ui/`

---

## Phase 9: Tests & Docs Cleanup

### Test coverage

- Itinerary approval leaves trip in `Planning`
- First booked package moves trip to `Active`
- First booked standalone activity moves trip to `Active`
- All bookings removed demotes `Active -> Planning`
- Package children cannot be booked directly
- Informational types excluded from booking progress
- `Active -> Travelling -> Travelled` date automation
- Proposal comments/approvals tied to published version
- Booking validation contract enforcement (each check individually)
- Non-refundable amount <= deposit validation
- Passport verification checkbox override
- Un-cancel restores to `Planning`

### Docs to update

- `docs/TRIP_WORKFLOW.md` — mark as implemented
- `docs/TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md` — mark phases complete
- `docs/REPOSITORY_REVIEW_ISSUES.md` — resolve addressed items
- `docs/AUTOMATION.md` — new event names
- `packages/database/src/seed.ts` — updated to new vocabulary

---

## Compliance Notes

### TICO Requirements

- Non-refundable amounts must be clearly disclosed on the Trip-Order document
- The `non_refundable_amount_cents` field on `payment_schedule_config` supports this requirement
- Display format: "Deposit: $2,000 (includes $500 non-refundable)"

### Booking Validation Tiers

- **Tier 1 (implemented in this spec):** Hard gates for booking validation — all checks listed in Phase 5
- **Tier 2 (future session):** Compliance checks with soft warnings that become hard deadlines — insurance waiver, document delivery, and other compliance items. These will be designed as a compliance status dashboard with deadline-driven notifications.
