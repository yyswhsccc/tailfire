# Mark as Booked — UX Overhaul Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Phase A — Core booking UX, package cascade, validation, insurance task

---

## Problem

The "Mark as Booked" button is buried in sub-tabs of activity forms, completely missing from the package form, and hidden in a dropdown menu on the bookings tab. Users create activities, set up pricing and payments, but never mark them as booked — leaving trips stuck in "planning" status.

## Goals

1. Make "Mark as Booked" prominent and accessible on every activity form
2. Add booking controls to the package form (currently missing)
3. Package booking cascades to all child activities
4. Validation failures navigate to the problem field with clear guidance
5. Auto-create insurance review task after booking

---

## Design

### 1. Mark as Booked Button — Form Header Placement

**All 9 activity form types** get a prominent button in the form header toolbar (next to Save):

- **Unbooked:** Gold outline button — `CalendarCheck` icon + "Mark as Booked"
- **Booked:** Green badge — "Booked — Mar 23, 2026" with dropdown for "Unbook"
- **Child of package:** Read-only badge — "Booked via Package" with link to parent (existing behavior, no change)

**Files to modify:**
- `apps/admin/src/app/trips/[id]/_components/package-form.tsx` — Add booking controls (currently has none)
- `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/lodging-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/tour-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/custom-cruise-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/dining-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/options-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` — Move button to header
- `apps/admin/src/app/trips/[id]/_components/port-info-form.tsx` — Move button to header

**Shared component:** Extract a new `BookingHeaderButton` component to avoid duplicating logic across 9 forms:
- `apps/admin/src/components/activities/booking-header-button.tsx`
- Props: `activityId`, `isBooked`, `bookingDate`, `isChildOfPackage`, `parentPackageId`, `onBooked`, `onUnbooked`
- Handles: click → validation → confirmation → API call → callback

### 2. Validation UX — Jump to Field + Toast

When "Mark as Booked" is clicked and validation fails:

**Step 1: API call** — `POST /activities/:id/book` runs the 12 Tier 1 checks. On failure, returns structured errors:

```typescript
// Current: plain string errors
{ message: "Activity does not meet booking requirements", errors: ["Supplier must be identified"] }

// New: structured errors with field mapping
{
  message: "Activity does not meet booking requirements",
  errors: [
    { message: "Supplier must be identified", field: "supplier", tab: "pricing" },
    { message: "Start date/time is required", field: "startDatetime", tab: "general" },
    { message: "Traveler 'Luc' is missing date of birth", field: "traveler.dateOfBirth", tab: "travelers" }
  ]
}
```

**Step 2: Jump to first error** — Frontend switches to the tab specified in `errors[0].tab` and scrolls to + highlights the field specified in `errors[0].field` with a red ring + label.

**Step 3: Toast remaining errors** — A persistent destructive toast lists all errors. Each item is clickable — clicking navigates to that error's tab + field.

**API changes:**
- `apps/api/src/trips/booking-validation.service.ts` — Add `field` and `tab` to each error
- Return type: `{ valid: boolean, errors: Array<{ message: string, field: string, tab: string }> }`

**Field-to-tab mapping:**

| Field | Tab |
|-------|-----|
| supplier | pricing |
| startDatetime, endDatetime | general |
| confirmationNumber | pricing |
| totalPriceCents | pricing |
| paymentSchedule, expectedPaymentItems, dueDate | pricing |
| nonRefundableAmount | pricing |
| finalPaymentDate | pricing |
| traveler.firstName, traveler.lastName, traveler.dateOfBirth, traveler.address | travelers |
| traveler.passportNumber, traveler.passportExpiry | travelers |

### 3. Inline Confirmation Panel

When all validation checks pass, a small panel slides in below the form header:

```
┌──────────────────────────────────────────────────┐
│ ✓ All checks passed. Confirm booking:            │
│                                                  │
│ ☑ I confirm all traveler passports are verified  │
│ Booking date: [2026-03-23]         [Confirm] [Cancel] │
└──────────────────────────────────────────────────┘
```

- Passport checkbox is required
- Booking date defaults to today, editable
- "Confirm" calls the API and completes the booking
- "Cancel" dismisses the panel

The existing `MarkActivityBookedModal` dialog is removed from all forms — replaced by this inline panel within `BookingHeaderButton`.

### 4. Package Booking Cascade

When a package is marked as booked:

**API changes in `ActivityBookingsService.markAsBooked()`:**

1. After setting the package's `bookingStatus = 'booked'`, query all child activities:
   ```sql
   SELECT id FROM itinerary_activities WHERE parent_activity_id = :packageId
   ```

2. Bulk-update all children to `bookingStatus = 'booked'`, same `bookingDate`

3. Trip lifecycle evaluates once (after all children are updated)

4. Return the count of cascaded children in the response

**Unbooking cascade:** `unmarkAsBooked()` does the reverse — sets all children back to `'unbooked'`.

**Validation:** Runs on the package only. Children inherit the booked status without individual validation since the package is the booking authority.

**Frontend:** `BookingHeaderButton` shows "Package booked — 3 child activities also marked as booked" in the success state.

### 5. Insurance Task Auto-Creation

**Post-booking hook in `ActivityBookingsService.markAsBooked()`:**

After successful booking:

1. **Check if trip has any existing open insurance task** (status != completed, title matches insurance pattern)

2. **If no open insurance task exists:**
   - If this is the first booked activity on the trip → Create task: "Review and initiate insurance coverage"
     - Assigned to trip owner (agent)
     - Priority: high
     - Due: booking date + 3 days
     - taskType: 'automated'
     - Linked to tripId

3. **If insurance is already sold/waived AND this is a new booking:**
   - Create task: "Review insurance coverage for new booking — [activity name]"
   - Assigned to trip owner
   - Priority: medium
   - Due: booking date + 3 days
   - taskType: 'automated'
   - Linked to tripId and activityId

**Insurance status check:** Query `trip_insurance_packages` and `trip_traveler_insurance` tables to determine if insurance exists on the trip.

### 6. Bookings Tab — Inline Action Button

**File:** `apps/admin/src/components/packages/packages-table.tsx`

Replace the dropdown "Mark as Booked" menu item with an inline button per row:

- **Unbooked row:** Small outline button — `CalendarCheck` icon. Clicking navigates to the activity's edit form (e.g., `/trips/:id/activities/:activityId/edit?type=package&tab=pricing`).
- **Booked row:** Green "Booked" badge (read-only).

The actual booking happens from the form — the table button is a navigation shortcut, not a bypass.

---

## Phase B — Documented for Future (NOT built this session)

### Insurance Automation Flow
- Email queued (not immediate) with token-based waiver link: `client.phoenixvoyages.ca/waiver/{token}`
- Token resolves to trip + traveler without login
- Client portal also shows the waiver form for logged-in travelers
- Agent can mark insurance status over the phone via the Trip Insurance tab

### Trip Tasks Tab
- Reuse existing task components (`task-form-dialog`, `task-card`, `task-list`, `task-filters`) filtered by `tripId`
- Full CRUD — create, edit, delete, complete tasks
- Tasks assignable to travelers, visible in client portal
- Task types: manual (agent-created), automated (system-created), system

### Trip Automation Tab
- Read-only dashboard of queued/completed BullMQ jobs for the trip
- Agent can pause/unpause and cancel automation flows
- Audit record created on cancel: "Agent X cancelled [job] at [timestamp]"
- Future: agent can edit automation flows

### Task Templates
- Per-agency configurable templates triggered by booking events
- Managed in Library/Communications/Automation settings
- Template variables: traveler name, trip name, dates, activity details

### Booking-Triggered Communications
- Confirmation emails to primary contact and travelers (queued, not immediate)
- Payment reminders based on due dates
- All via BullMQ queue system

### Client Portal Task Visibility
- Travelers see assigned tasks in their portal
- Upload documents (passport photos, etc.)
- Complete waiver forms
- Provide payment method

---

## Non-Goals (Phase A)

- No changes to the 12 Tier 1 validation checks themselves
- No new validation rules added
- No email sending
- No client portal changes
- No automation tab UI
- No task template system
- No changes to the existing booking validation modal in `packages-list.tsx` (will be replaced by the form header button navigating to the form instead)
