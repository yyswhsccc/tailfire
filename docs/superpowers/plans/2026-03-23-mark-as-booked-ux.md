# Mark as Booked UX Overhaul — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Mark as Booked" action prominent on every activity form, add booking controls to packages, cascade booking to child activities, and show validation errors inline with field navigation.

**Architecture:** A shared `BookingHeaderButton` component replaces the buried booking controls across all 9 activity forms. The API's `BookingValidationService` returns structured errors with error codes. The frontend maps error codes to form-specific tab/field locations. Package booking leverages the existing cascade in `ActivitiesService.update()`. Insurance task auto-created post-booking via `TasksService`.

**Tech Stack:** Next.js (Admin), NestJS (API), React Hook Form, Drizzle ORM, shadcn/ui, React Query

**Spec:** `docs/superpowers/specs/2026-03-23-mark-as-booked-ux-design.md`

**Codex Review:** v1 plan had 7 issues identified by Codex. All addressed in v2:
1. Package cascade: use existing `ActivitiesService.update()` cascade (line 867), don't duplicate
2. Validate-then-confirm: split validation into "check everything except booking-time inputs" + "confirm with booking-time inputs"
3. Insurance task: fix DTO shape — `taskType: 'automatic'`, `assigneeUserId`, pass `agencyId` + `userId`
4. Tab mapping: return stable error codes from backend, map to tabs per form type client-side
5. Field highlighting: add `data-field` anchors to shared pricing components
6. Shared-types: add `BookingValidationError`/`Result` types, update `ApiError` parser
7. Stale references: align to actual current UI (no dropdown to replace, correct tab values)

---

## Tab Map (actual values from each form)

| Form | Booking/Pricing Tab Value | Start/End Fields Tab |
|------|--------------------------|---------------------|
| flight | `booking` | `general` |
| lodging | `booking` | `general` |
| tour | `booking` | `general` |
| custom-cruise | `pricing` | `general` |
| dining | `pricing` | `general` |
| options | `pricing` | `general` |
| transportation | `pricing` | `general` |
| port-info | `pricing` | `general` |
| package | `booking` | `general` |

---

## Task 1: Structured Validation Errors (API)

**Files:**
- Modify: `packages/shared-types/src/api/activity-bookings.types.ts`
- Modify: `apps/api/src/trips/booking-validation.service.ts`
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Add structured error types to shared-types**

In `packages/shared-types/src/api/activity-bookings.types.ts`, add:

```typescript
export interface BookingValidationError {
  message: string
  code: string  // stable error code, e.g. 'SUPPLIER_MISSING', 'TRAVELER_DOB_MISSING'
}

export interface BookingValidationResult {
  valid: boolean
  errors: BookingValidationError[]
}
```

Error codes (stable, form-agnostic):

| Code | Message Template |
|------|-----------------|
| `SUPPLIER_MISSING` | Supplier must be identified |
| `START_DATE_MISSING` | Start date/time is required |
| `END_DATE_MISSING` | End date/time is required |
| `DATE_ORDER_INVALID` | Start must be before end |
| `NO_TRAVELERS` | At least one traveler must be assigned |
| `TRAVELER_FIRST_NAME` | Traveler "{name}" missing first name |
| `TRAVELER_LAST_NAME` | Traveler "{name}" missing last name |
| `TRAVELER_DOB` | Traveler "{name}" missing date of birth |
| `TRAVELER_ADDRESS` | Traveler "{name}" missing address |
| `PRICE_MISSING` | Total price must be greater than zero |
| `PAYMENT_SCHEDULE_MISSING` | Payment schedule must be defined |
| `PAYMENT_ITEMS_MISSING` | Expected payment items must exist |
| `PAYMENT_DUE_DATE_MISSING` | Payment item must have a due date |
| `CONFIRMATION_NUMBER_MISSING` | Confirmation number is required |
| `PASSPORT_NUMBER_MISSING` | Traveler "{name}" missing passport number |
| `PASSPORT_EXPIRY_MISSING` | Traveler "{name}" missing passport expiry |
| `PASSPORT_EXPIRY_TOO_SOON` | Traveler "{name}" passport expires too soon |
| `FINAL_PAYMENT_AFTER_DEPARTURE` | Final payment must be before departure |
| `NON_REFUNDABLE_NOT_SET` | Non-refundable amount not set |
| `NON_REFUNDABLE_EXCEEDS_DEPOSIT` | Non-refundable exceeds deposit |

- [ ] **Step 2: Update BookingValidationService**

Replace every `errors.push('message')` with `errors.push({ message, code })`. The return type changes from `{ valid: boolean, errors: string[] }` to `BookingValidationResult`.

**Important:** Do NOT include `booking_date` check (Check 2) or passport verification in the validate-only endpoint — these are confirmed at booking time by the user.

- [ ] **Step 3: Update ActivityBookingsService.markAsBooked error format**

Change the `BadRequestException` to pass structured errors:

```typescript
throw new BadRequestException({
  message: 'Activity does not meet booking requirements',
  errors: validation.errors, // Array of { message, code }
})
```

- [ ] **Step 4: Rebuild shared-types**

```bash
cd packages/shared-types && pnpm build
```

- [ ] **Step 5: Commit**

```
git commit -m "feat(api): structured booking validation errors with stable codes"
```

---

## Task 2: Validate-Only Endpoint (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.controller.ts`
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Add public validateBooking method to service**

```typescript
async validateBooking(activityId: string): Promise<BookingValidationResult> {
  return this.bookingValidationService.validateBooking(activityId)
}
```

- [ ] **Step 2: Add GET endpoint to controller**

```typescript
@Get(':activityId/validate')
@ApiOperation({ summary: 'Validate booking requirements (dry run — does not change state)' })
async validateBooking(
  @GetAuthContext() auth: AuthContext,
  @Param('activityId', ParseUUIDPipe) activityId: string
): Promise<BookingValidationResult> {
  await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, false)
  return this.activityBookingsService.validateBooking(activityId)
}
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(api): add booking validation dry-run endpoint"
```

---

## Task 3: Package Cascade — Use Existing Logic (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

The cascade already exists in `ActivitiesService.update()` at line 867. When `bookingStatus` is set to `'booked'` on a package, it automatically cascades to all non-cancelled children. No new cascade code is needed.

- [ ] **Step 1: Add cascadedCount to the response**

After calling `this.activitiesService.update()`, query the count of affected children:

```typescript
let cascadedCount = 0
if (activity.activityType === 'package') {
  const children = await this.db.client
    .select({ count: sql`count(*)::int` })
    .from(this.db.schema.itineraryActivities)
    .where(
      and(
        eq(this.db.schema.itineraryActivities.parentActivityId, activityId),
        eq(this.db.schema.itineraryActivities.bookingStatus, 'booked')
      )
    )
  cascadedCount = children[0]?.count ?? 0
}
```

Add `cascadedCount` to the response.

- [ ] **Step 2: Update ActivityBookingResponseDto in shared-types**

Add `cascadedCount?: number` to the response type.

- [ ] **Step 3: Rebuild shared-types and commit**

```
git commit -m "feat(api): expose cascadedCount in booking response for packages"
```

---

## Task 4: Insurance Task Auto-Creation (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.service.ts`
- Modify: `apps/api/src/trips/trips.module.ts` (if TasksModule not already imported)

- [ ] **Step 1: Inject TasksService**

Add `TasksService` to `ActivityBookingsService` constructor. Check `trips.module.ts` — if `TasksModule` is not in imports, add it with `forwardRef` if needed.

- [ ] **Step 2: Add insurance task creation method**

```typescript
private async createInsuranceTaskIfNeeded(
  tripId: string,
  activityId: string,
  activityName: string,
  bookingDate: string,
  agencyId: string,
  userId: string,
): Promise<void> {
  // Check for existing open insurance task on this trip
  const existingTask = await this.db.client
    .select({ id: this.db.schema.tasks.id })
    .from(this.db.schema.tasks)
    .where(and(
      eq(this.db.schema.tasks.tripId, tripId),
      sql`title ILIKE '%insurance%'`,
      sql`status != 'completed'`,
      eq(this.db.schema.tasks.isDeleted, false),
    ))
    .limit(1)

  if (existingTask.length > 0) {
    // Check if insurance already exists on trip — create review task for new booking
    const insuranceExists = await this.db.client
      .select({ id: this.db.schema.tripInsurancePackages.id })
      .from(this.db.schema.tripInsurancePackages)
      .where(eq(this.db.schema.tripInsurancePackages.tripId, tripId))
      .limit(1)

    if (insuranceExists.length > 0) {
      const dueDate = new Date(bookingDate)
      dueDate.setDate(dueDate.getDate() + 3)

      await this.tasksService.create({
        title: `Review insurance coverage for new booking — ${activityName}`,
        tripId,
        activityId,
        priority: 'medium',
        taskType: 'automatic',
        dueDate: dueDate.toISOString().split('T')[0],
      }, agencyId, userId)
    }
    return
  }

  // No open insurance task — create one
  const dueDate = new Date(bookingDate)
  dueDate.setDate(dueDate.getDate() + 3)

  const [trip] = await this.db.client
    .select({ ownerId: this.db.schema.trips.ownerId })
    .from(this.db.schema.trips)
    .where(eq(this.db.schema.trips.id, tripId))
    .limit(1)

  await this.tasksService.create({
    title: 'Review and initiate insurance coverage',
    tripId,
    priority: 'high',
    taskType: 'automatic',
    dueDate: dueDate.toISOString().split('T')[0],
    assigneeUserId: trip?.ownerId || userId,
    assigneeType: 'user',
  }, agencyId, userId)
}
```

- [ ] **Step 3: Call from markAsBooked**

After the lifecycle evaluation, add:

```typescript
// Resolve agencyId for task creation
const [tripData] = await this.db.client
  .select({ agencyId: this.db.schema.trips.agencyId })
  .from(this.db.schema.trips)
  .where(eq(this.db.schema.trips.id, activity.tripId))
  .limit(1)

if (tripData) {
  await this.createInsuranceTaskIfNeeded(
    activity.tripId, activityId, activity.name, bookingDate,
    tripData.agencyId, actorId || ''
  )
}
```

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): auto-create insurance review task on booking"
```

---

## Task 5: Frontend Hooks + Error Parsing (Admin)

**Files:**
- Modify: `apps/admin/src/hooks/use-activity-bookings.ts`
- Modify: `apps/admin/src/lib/api.ts` (update ApiError to parse structured errors)

- [ ] **Step 1: Update ApiError to handle structured booking errors**

In `apps/admin/src/lib/api.ts`, update the error normalization to preserve structured error arrays. When the response body has `errors` as an array of objects (not strings), keep them as-is:

```typescript
// In the error handler, check for structured errors
if (Array.isArray(body.errors) && body.errors[0]?.code) {
  error.structuredErrors = body.errors // Array<{ message, code }>
}
```

- [ ] **Step 2: Add useValidateBooking hook**

```typescript
export function useValidateBooking() {
  return useMutation({
    mutationFn: async (activityId: string) => {
      return api.get<BookingValidationResult>(`/bookings/activities/${activityId}/validate`)
    },
  })
}
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add useValidateBooking hook and structured error support"
```

---

## Task 6: BookingHeaderButton Component (Admin)

**Files:**
- Create: `apps/admin/src/components/activities/booking-header-button.tsx`

- [ ] **Step 1: Create the component**

Props:
```typescript
interface BookingHeaderButtonProps {
  activityId: string | null
  activityName: string
  activityType: string // used to determine tab mapping
  isBooked: boolean
  bookingDate: string | null
  isChildOfPackage: boolean
  parentPackageId?: string | null
  parentPackageName?: string | null
  tripId: string
  /** Callback to switch to a specific tab in the parent form */
  onNavigateToTab?: (tab: string) => void
  /** Called after successful booking */
  onBooked?: (cascadedCount?: number) => void
  /** Called after successful unbooking */
  onUnbooked?: () => void
}
```

**Error code → tab mapping (client-side, per form type):**

```typescript
const TAB_MAP: Record<string, Record<string, string>> = {
  // Forms with "booking" tab for pricing/supplier
  flight:        { SUPPLIER_MISSING: 'booking', PRICE_MISSING: 'booking', PAYMENT_SCHEDULE_MISSING: 'booking', CONFIRMATION_NUMBER_MISSING: 'booking', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  lodging:       { SUPPLIER_MISSING: 'booking', PRICE_MISSING: 'booking', PAYMENT_SCHEDULE_MISSING: 'booking', CONFIRMATION_NUMBER_MISSING: 'booking', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  tour:          { SUPPLIER_MISSING: 'booking', PRICE_MISSING: 'booking', PAYMENT_SCHEDULE_MISSING: 'booking', CONFIRMATION_NUMBER_MISSING: 'booking', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  package:       { SUPPLIER_MISSING: 'booking', PRICE_MISSING: 'booking', PAYMENT_SCHEDULE_MISSING: 'booking', CONFIRMATION_NUMBER_MISSING: 'booking', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  // Forms with "pricing" tab
  custom_cruise: { SUPPLIER_MISSING: 'pricing', PRICE_MISSING: 'pricing', PAYMENT_SCHEDULE_MISSING: 'pricing', CONFIRMATION_NUMBER_MISSING: 'pricing', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  dining:        { SUPPLIER_MISSING: 'pricing', PRICE_MISSING: 'pricing', PAYMENT_SCHEDULE_MISSING: 'pricing', CONFIRMATION_NUMBER_MISSING: 'pricing', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  options:       { SUPPLIER_MISSING: 'pricing', PRICE_MISSING: 'pricing', PAYMENT_SCHEDULE_MISSING: 'pricing', CONFIRMATION_NUMBER_MISSING: 'pricing', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  transportation:{ SUPPLIER_MISSING: 'pricing', PRICE_MISSING: 'pricing', PAYMENT_SCHEDULE_MISSING: 'pricing', CONFIRMATION_NUMBER_MISSING: 'pricing', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
  port_info:     { SUPPLIER_MISSING: 'pricing', PRICE_MISSING: 'pricing', PAYMENT_SCHEDULE_MISSING: 'pricing', CONFIRMATION_NUMBER_MISSING: 'pricing', START_DATE_MISSING: 'general', END_DATE_MISSING: 'general', NO_TRAVELERS: 'general' },
}
// Traveler errors always go to 'general' tab (travelers section is on general)
// Fallback: 'general'
```

**Error code → data-field mapping:**

```typescript
const FIELD_MAP: Record<string, string> = {
  SUPPLIER_MISSING: 'supplier',
  START_DATE_MISSING: 'startDatetime',
  END_DATE_MISSING: 'endDatetime',
  PRICE_MISSING: 'totalPrice',
  CONFIRMATION_NUMBER_MISSING: 'confirmationNumber',
  PAYMENT_SCHEDULE_MISSING: 'paymentSchedule',
  NO_TRAVELERS: 'travelers',
  // Traveler-specific errors don't map to a single field
}
```

- [ ] **Step 2: Component states**

**Unbooked:** Gold outline button — "Mark as Booked"
- Click → `GET /bookings/activities/:id/validate`
- Errors → navigate first error's tab, highlight field, toast all errors
- Valid → show inline confirmation panel

**Inline confirmation panel:**
```tsx
<div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
  <div className="flex items-center gap-4 flex-wrap">
    <div className="flex items-center gap-2">
      <Check className="h-4 w-4 text-green-600" />
      <span className="text-sm font-medium">All checks passed</span>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox checked={passportVerified} onCheckedChange={setPassportVerified} />
      <Label className="text-sm">Passports verified</Label>
    </div>
    <Input type="date" value={bookingDate} onChange={...} className="w-40 h-8" />
    <Button size="sm" onClick={handleConfirm} disabled={!passportVerified}>Confirm</Button>
    <Button size="sm" variant="ghost" onClick={dismiss}>Cancel</Button>
  </div>
</div>
```

**Booked:** Green badge "Booked — Mar 23, 2026" with dropdown → Unbook

**Child of package:** Read-only badge with link to parent

**Not saved:** Disabled "Save first to book"

- [ ] **Step 3: Field highlighting helper**

```typescript
function highlightField(fieldId: string) {
  const el = document.querySelector(`[data-field="${fieldId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-red-500')
    setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 5000)
  }
}
```

- [ ] **Step 4: Commit**

```
git commit -m "feat(admin): create BookingHeaderButton shared component"
```

---

## Task 7: Add data-field Anchors to Shared Pricing Components

**Files:**
- Modify: `apps/admin/src/components/pricing/booking-details-section.tsx`
- Modify: `apps/admin/src/components/pricing/pricing-section.tsx`
- Modify: `apps/admin/src/components/suppliers/supplier-combobox.tsx`

- [ ] **Step 1: Add data-field to booking-details-section**

Add `data-field="confirmationNumber"` to the confirmation number input.

- [ ] **Step 2: Add data-field to pricing-section**

Add `data-field="totalPrice"` to the total price input, `data-field="paymentSchedule"` to the payment schedule section container.

- [ ] **Step 3: Add data-field support to SupplierCombobox**

Add an optional `data-field` prop that passes through to the trigger element:

```typescript
interface SupplierComboboxProps {
  // ... existing
  'data-field'?: string
}
```

- [ ] **Step 4: Commit**

```
git commit -m "feat(admin): add data-field anchors to shared pricing components"
```

---

## Task 8: Add BookingHeaderButton to Package Form

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/package-form.tsx`

- [ ] **Step 1: Import BookingHeaderButton and add it to form header**

The package form header is simpler than other forms. Add `BookingHeaderButton` after the title/status area. Wire `onNavigateToTab` to the form's tab setter. Pass `activityType="package"`.

- [ ] **Step 2: Add data-field attributes to key inputs in package form**

Add `data-field="supplier"`, `data-field="startDatetime"`, `data-field="confirmationNumber"` to the relevant inputs.

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add booking controls to package form"
```

---

## Task 9: Replace Buried Button in 8 Activity Forms

**Files:** All 8 non-package activity forms.

For each form:

- [ ] **Step 1: Import BookingHeaderButton, add to form header**

Place after the auto-save indicator in the header `<div>`. Wire `onNavigateToTab` to the form's `setActiveTab`. Pass the correct `activityType`.

- [ ] **Step 2: Remove the old Booking Status Section**

Remove the `{/* Booking Status Section */}` card from the bottom of the form, the `MarkActivityBookedModal`, `BookingStatusBadge` imports, `showBookingModal` state, and related handler code.

Keep `ChildOfPackageBookingSection` for package children — `BookingHeaderButton` handles this via `isChildOfPackage` prop.

- [ ] **Step 3: Add data-field attributes to key inputs**

Add `data-field="startDatetime"`, `data-field="endDatetime"` to the date fields in the general tab. Pricing fields already get anchors from the shared components (Task 7).

- [ ] **Step 4: Commit in batches**

```
git commit -m "feat(admin): booking header button — flight + lodging + tour"
git commit -m "feat(admin): booking header button — cruise + dining + options"
git commit -m "feat(admin): booking header button — transportation + port-info"
```

---

## Task 10: Bookings Tab — Inline Book Button

**Files:**
- Modify: `apps/admin/src/components/packages/packages-table.tsx`

- [ ] **Step 1: Add inline button to rows**

The packages table currently has Edit/Delete in the row actions. Add an inline "Book" button for unbooked activities:

```tsx
{row.bookingStatus !== 'booked' && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => router.push(
      `/trips/${tripId}/activities/${row.id}/edit?type=${row.activityType}&tab=${
        ['flight','lodging','tour','package'].includes(row.activityType) ? 'booking' : 'pricing'
      }`
    )}
  >
    <CalendarCheck className="h-3 w-3 mr-1" />
    Book
  </Button>
)}
{row.bookingStatus === 'booked' && (
  <Badge variant="outline" className="border-green-500 text-green-700 gap-1">
    <Check className="h-3 w-3" />
    Booked
  </Badge>
)}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): inline Book button on bookings tab table rows"
```

---

## Task 11: Integration Test + Cleanup

- [ ] **Step 1: TypeScript compile check**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -E "booking|activity-bookings|package-form"
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -E "booking|package-form"
```

Expected: No new errors.

- [ ] **Step 2: Manual integration test**

1. Open any activity form → verify "Mark as Booked" button in header
2. Click with missing fields → verify tab navigation + field highlight + toast
3. Fill all fields → verify confirmation panel appears
4. Confirm → verify booked state, trip lifecycle promotes
5. Open package form → verify booking button present
6. Book package → verify children cascaded, `cascadedCount` shown
7. Check tasks → verify insurance review task created
8. Open bookings tab → verify inline Book/Booked per row

- [ ] **Step 3: Commit and push**

```bash
git push origin main
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
