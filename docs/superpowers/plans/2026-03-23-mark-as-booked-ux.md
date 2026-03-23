# Mark as Booked UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Mark as Booked" action prominent on every activity form, add booking controls to packages, cascade booking to child activities, and show validation errors inline with field navigation.

**Architecture:** A shared `BookingHeaderButton` component replaces the buried booking controls across all 9 activity forms. The API's `BookingValidationService` returns structured errors with field/tab mapping. Package booking cascades to children via `ActivityBookingsService`. Insurance task auto-created post-booking via `TasksService`.

**Tech Stack:** Next.js (Admin), NestJS (API), React Hook Form, Drizzle ORM, shadcn/ui, React Query

**Spec:** `docs/superpowers/specs/2026-03-23-mark-as-booked-ux-design.md`

---

## File Structure

### New Files
- `apps/admin/src/components/activities/booking-header-button.tsx` — Shared booking button + inline confirmation panel
- `apps/api/src/trips/dto/booking-validation-error.dto.ts` — Structured validation error type with field/tab mapping

### Modified Files (API)
- `apps/api/src/trips/booking-validation.service.ts` — Return structured errors with `field` + `tab`
- `apps/api/src/trips/activity-bookings.service.ts` — Package cascade logic + insurance task creation
- `apps/api/src/trips/activity-bookings.controller.ts` — Add `GET /bookings/activities/:activityId/validate` endpoint

### Modified Files (Admin — 9 activity forms)
- `apps/admin/src/app/trips/[id]/_components/package-form.tsx` — Add BookingHeaderButton (currently missing)
- `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` — Replace buried button with BookingHeaderButton in header
- `apps/admin/src/app/trips/[id]/_components/lodging-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/tour-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/custom-cruise-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/dining-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/options-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` — Same
- `apps/admin/src/app/trips/[id]/_components/port-info-form.tsx` — Same

### Modified Files (Admin — hooks/components)
- `apps/admin/src/hooks/use-activity-bookings.ts` — Add `useValidateBooking` hook + update cache invalidation
- `apps/admin/src/components/packages/packages-table.tsx` — Inline "Book" button per row replacing dropdown

---

## Task 1: Structured Validation Errors (API)

**Files:**
- Create: `apps/api/src/trips/dto/booking-validation-error.dto.ts`
- Modify: `apps/api/src/trips/booking-validation.service.ts`

- [ ] **Step 1: Create the structured error DTO**

Create `apps/api/src/trips/dto/booking-validation-error.dto.ts`:

```typescript
export interface BookingValidationError {
  message: string
  field: string
  tab: string
}

export interface BookingValidationResult {
  valid: boolean
  errors: BookingValidationError[]
}
```

- [ ] **Step 2: Update BookingValidationService to return structured errors**

In `apps/api/src/trips/booking-validation.service.ts`, replace every `errors.push('message')` with `errors.push({ message, field, tab })`.

Field-to-tab mapping:

| Check | field | tab |
|-------|-------|-----|
| Supplier | `supplier` | `pricing` |
| Booking date | `bookingDate` | `pricing` |
| Start date | `startDatetime` | `general` |
| End date | `endDatetime` | `general` |
| Travelers | `travelers` | `travelers` |
| Traveler first name | `traveler.firstName` | `travelers` |
| Traveler last name | `traveler.lastName` | `travelers` |
| Traveler DOB | `traveler.dateOfBirth` | `travelers` |
| Traveler address | `traveler.address` | `travelers` |
| Total price | `totalPriceCents` | `pricing` |
| Payment schedule | `paymentSchedule` | `pricing` |
| Expected payment items | `expectedPaymentItems` | `pricing` |
| Due date on items | `expectedPaymentDueDate` | `pricing` |
| Confirmation number | `confirmationNumber` | `pricing` |
| Passport number | `traveler.passportNumber` | `travelers` |
| Passport expiry | `traveler.passportExpiry` | `travelers` |
| Final payment date | `finalPaymentDate` | `pricing` |
| Non-refundable amount | `nonRefundableAmount` | `pricing` |

Update the return type from `{ valid: boolean, errors: string[] }` to `BookingValidationResult`.

Update `ActivityBookingsService.markAsBooked()` to pass structured errors in the BadRequestException.

- [ ] **Step 3: Update the DTO export**

Add the new type to `apps/api/src/trips/dto/index.ts` barrel export.

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): return structured booking validation errors with field/tab mapping"
```

---

## Task 2: Validate-Only Endpoint (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.controller.ts`
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Add validateBooking method to service**

In `ActivityBookingsService`, add a public method that runs validation without changing state:

```typescript
async validateBooking(activityId: string): Promise<BookingValidationResult> {
  return this.bookingValidationService.validateBooking(activityId)
}
```

- [ ] **Step 2: Add GET endpoint to controller**

Add `GET /bookings/activities/:activityId/validate` endpoint:

```typescript
@Get(':activityId/validate')
@ApiOperation({ summary: 'Validate booking requirements (dry run)' })
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

## Task 3: Package Booking Cascade (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Add cascade logic to markAsBooked**

After the existing `this.activitiesService.update()` call and before `this.tripLifecycleService.onActivityBooked()`, add:

```typescript
// Package cascade: if this is a package, book all children
let cascadedCount = 0
if (activity.activityType === 'package') {
  const children = await this.db.client
    .select({ id: this.db.schema.itineraryActivities.id })
    .from(this.db.schema.itineraryActivities)
    .where(eq(this.db.schema.itineraryActivities.parentActivityId, activityId))

  for (const child of children) {
    await this.activitiesService.update(
      child.id,
      { bookingStatus: 'booked', bookingDate },
      actorId,
      activity.tripId
    )
    cascadedCount++
  }
}
```

Add `cascadedCount` to the response DTO.

- [ ] **Step 2: Add cascade logic to unmarkAsBooked**

Same pattern — unbook all children when a package is unbooked:

```typescript
if (activity.activityType === 'package') {
  const children = await this.db.client
    .select({ id: this.db.schema.itineraryActivities.id })
    .from(this.db.schema.itineraryActivities)
    .where(eq(this.db.schema.itineraryActivities.parentActivityId, activityId))

  for (const child of children) {
    await this.activitiesService.update(
      child.id,
      { bookingStatus: 'unbooked', bookingDate: null },
      actorId,
      activity.tripId
    )
  }
}
```

- [ ] **Step 3: Add `cascadedCount` to ActivityBookingResponseDto**

In shared-types, add `cascadedCount?: number` to the response type.

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): cascade booking status to package child activities"
```

---

## Task 4: Insurance Task Auto-Creation (API)

**Files:**
- Modify: `apps/api/src/trips/activity-bookings.service.ts`

- [ ] **Step 1: Add insurance task creation after successful booking**

After the lifecycle evaluation in `markAsBooked()`, add:

```typescript
// Auto-create insurance review task
await this.createInsuranceTaskIfNeeded(activity.tripId, activityId, activity.name, bookingDate)
```

Implement the private method:

```typescript
private async createInsuranceTaskIfNeeded(
  tripId: string,
  activityId: string,
  activityName: string,
  bookingDate: string
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
    // Check if insurance already sold/waived — if so, create review task for new booking
    const insuranceExists = await this.db.client
      .select({ id: this.db.schema.tripInsurancePackages.id })
      .from(this.db.schema.tripInsurancePackages)
      .where(eq(this.db.schema.tripInsurancePackages.tripId, tripId))
      .limit(1)

    if (insuranceExists.length > 0) {
      // Insurance exists + new booking = review task
      const dueDate = new Date(bookingDate)
      dueDate.setDate(dueDate.getDate() + 3)

      await this.tasksService.create({
        title: `Review insurance coverage for new booking — ${activityName}`,
        tripId,
        activityId,
        priority: 'medium',
        taskType: 'automated',
        dueDate: dueDate.toISOString().split('T')[0],
      })
    }
    return // Open insurance task exists, don't create duplicate
  }

  // No open insurance task — create one
  const dueDate = new Date(bookingDate)
  dueDate.setDate(dueDate.getDate() + 3)

  // Get trip owner for assignment
  const [trip] = await this.db.client
    .select({ ownerId: this.db.schema.trips.ownerId })
    .from(this.db.schema.trips)
    .where(eq(this.db.schema.trips.id, tripId))
    .limit(1)

  await this.tasksService.create({
    title: 'Review and initiate insurance coverage',
    tripId,
    priority: 'high',
    taskType: 'automated',
    dueDate: dueDate.toISOString().split('T')[0],
    assigneeId: trip?.ownerId || undefined,
    assigneeType: 'user',
  })
}
```

- [ ] **Step 2: Inject TasksService into ActivityBookingsService**

Add `TasksService` to the constructor. Handle circular dependency with `forwardRef` if needed.

- [ ] **Step 3: Commit**

```
git commit -m "feat(api): auto-create insurance review task on booking"
```

---

## Task 5: Validate Booking Hook (Frontend)

**Files:**
- Modify: `apps/admin/src/hooks/use-activity-bookings.ts`

- [ ] **Step 1: Add useValidateBooking hook**

```typescript
export function useValidateBooking() {
  return useMutation({
    mutationFn: async (activityId: string) => {
      return api.get<BookingValidationResult>(`/bookings/activities/${activityId}/validate`)
    },
  })
}
```

Add the `BookingValidationResult` type (or import from shared-types):

```typescript
interface BookingValidationError {
  message: string
  field: string
  tab: string
}

interface BookingValidationResult {
  valid: boolean
  errors: BookingValidationError[]
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add useValidateBooking hook"
```

---

## Task 6: BookingHeaderButton Component (Frontend)

**Files:**
- Create: `apps/admin/src/components/activities/booking-header-button.tsx`

- [ ] **Step 1: Create the shared component**

Props:
```typescript
interface BookingHeaderButtonProps {
  activityId: string | null
  activityName: string
  isBooked: boolean
  bookingDate: string | null
  isChildOfPackage: boolean
  parentPackageId?: string | null
  tripId: string
  /** Callback to switch to a specific tab in the parent form */
  onNavigateToTab?: (tab: string) => void
  /** Callback to highlight/focus a field */
  onHighlightField?: (field: string) => void
  /** Called after successful booking */
  onBooked?: () => void
  /** Called after successful unbooking */
  onUnbooked?: () => void
}
```

Component behavior:

**Unbooked state:**
- Gold outline button: `CalendarCheck` icon + "Mark as Booked"
- Click → calls `GET /bookings/activities/:id/validate`
- If errors: jump to first error tab (via `onNavigateToTab`), highlight field (via `onHighlightField`), toast all errors with clickable items
- If valid: show inline confirmation panel (passport checkbox + booking date)
- Confirm → calls `POST /bookings/activities/:id/mark`
- Success → green badge, toast, call `onBooked()`

**Booked state:**
- Green badge: "Booked — Mar 23, 2026"
- Dropdown with "Unbook" option
- Unbook → calls `POST /bookings/activities/:id/unmark`, calls `onUnbooked()`

**Child of package state:**
- Read-only badge: "Booked via Package" or "Unbooked — managed by package"
- Link to parent package form

**Not yet saved state (activityId is null):**
- Disabled button: "Save first to book"

- [ ] **Step 2: Implement the inline confirmation panel**

A collapsible panel that slides in below the header when validation passes:

```tsx
{showConfirmation && (
  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-4">
    <Check className="h-5 w-5 text-green-600" />
    <span className="text-sm">All checks passed.</span>
    <div className="flex items-center gap-2">
      <Checkbox
        id="passport-verified"
        checked={passportVerified}
        onCheckedChange={setPassportVerified}
      />
      <Label htmlFor="passport-verified" className="text-sm">
        Passports verified
      </Label>
    </div>
    <Input
      type="date"
      value={bookingDate}
      onChange={(e) => setBookingDate(e.target.value)}
      className="w-40 h-8"
    />
    <Button size="sm" onClick={handleConfirm} disabled={!passportVerified || isPending}>
      Confirm Booking
    </Button>
    <Button size="sm" variant="ghost" onClick={() => setShowConfirmation(false)}>
      Cancel
    </Button>
  </div>
)}
```

- [ ] **Step 3: Implement the validation error toast with navigation**

Use the existing `useToast` with a custom description containing clickable error items:

```tsx
toast({
  title: `${errors.length} booking requirement${errors.length > 1 ? 's' : ''} not met`,
  description: errors.map(e => e.message).join('; '),
  variant: 'destructive',
  duration: 10000, // persistent enough to read
})

// Navigate to first error
if (errors[0]) {
  onNavigateToTab?.(errors[0].tab)
  onHighlightField?.(errors[0].field)
}
```

- [ ] **Step 4: Commit**

```
git commit -m "feat(admin): create BookingHeaderButton shared component"
```

---

## Task 7: Add BookingHeaderButton to Package Form

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/package-form.tsx`

- [ ] **Step 1: Import and add state**

Import `BookingHeaderButton`. Add state for `bookingStatus` and `bookingDate` from the activity data. Add a `setActiveTab` callback for tab navigation.

- [ ] **Step 2: Add BookingHeaderButton to the header area**

Place it in the header section after the auto-save indicator. Pass `onNavigateToTab` that calls the form's tab setter, and `onHighlightField` that focuses the matching input.

- [ ] **Step 3: Remove old booking section from packages-list if present**

The `MarkAsBookedModal` import in package-form is not present (it was never added). No removal needed.

- [ ] **Step 4: Commit**

```
git commit -m "feat(admin): add booking controls to package form"
```

---

## Task 8: Replace Buried Button in Activity Forms (8 forms)

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/flight-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/lodging-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/tour-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/custom-cruise-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/dining-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/options-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/port-info-form.tsx`

For each form:

- [ ] **Step 1: Import BookingHeaderButton**

- [ ] **Step 2: Add BookingHeaderButton to the form header**

Place it in the header `<div>` (the section at ~line 946 in custom-cruise-form pattern — the area with title, travelers, status, auto-save). Add it after the auto-save indicator.

Wire `onNavigateToTab` to the form's tab state setter (e.g., `setActiveTab`). Wire `onHighlightField` to scroll + focus the field by `data-field` attribute.

- [ ] **Step 3: Remove the old booking section**

Remove the `{/* Booking Status Section */}` card and the `MarkActivityBookedModal` from the bottom of the form. Keep the `ChildOfPackageBookingSection` for package children — `BookingHeaderButton` handles this case with `isChildOfPackage` prop.

- [ ] **Step 4: Remove unused imports**

Remove `MarkActivityBookedModal`, `BookingStatusBadge`, `showBookingModal` state, `handleMarkAsBooked` handler, and related code that's replaced by `BookingHeaderButton`.

- [ ] **Step 5: Commit per form (or batch 2-3 similar forms)**

```
git commit -m "feat(admin): move booking button to form header — flight + lodging"
git commit -m "feat(admin): move booking button to form header — tour + cruise"
git commit -m "feat(admin): move booking button to form header — dining + options"
git commit -m "feat(admin): move booking button to form header — transportation + port-info"
```

---

## Task 9: Bookings Tab Inline Button

**Files:**
- Modify: `apps/admin/src/components/packages/packages-table.tsx`

- [ ] **Step 1: Add inline Book button to unbooked rows**

Replace the dropdown "Mark as Booked" menu item with an inline button in the row actions:

For unbooked activities:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => router.push(`/trips/${tripId}/activities/${activityId}/edit?type=${activityType}&tab=pricing`)}
>
  <CalendarCheck className="h-3 w-3 mr-1" />
  Book
</Button>
```

For booked activities:
```tsx
<Badge variant="outline" className="border-green-500 text-green-700">
  <Check className="h-3 w-3 mr-1" />
  Booked
</Badge>
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): inline Book button on bookings tab table rows"
```

---

## Task 10: Field Highlighting Support

**Files:**
- Modify: All 9 activity forms (add `data-field` attributes to key inputs)

- [ ] **Step 1: Add `data-field` attributes to inputs across forms**

Each form needs `data-field="fieldName"` on the relevant inputs so `BookingHeaderButton` can scroll to them. Example:

```tsx
<Input data-field="supplier" value={supplier} ... />
<Input data-field="confirmationNumber" value={confirmationNumber} ... />
<DatePicker data-field="startDatetime" ... />
```

The `onHighlightField` callback in `BookingHeaderButton` does:
```typescript
const el = document.querySelector(`[data-field="${field}"]`)
if (el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-red-500')
  setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 5000)
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add data-field attributes for booking validation highlighting"
```

---

## Task 11: Cleanup and Integration Test

- [ ] **Step 1: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -E "booking|activity-bookings|package-form"
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -E "booking|package-form"
```

Expected: No new errors.

- [ ] **Step 2: Manual integration test**

1. Open any activity form → verify "Mark as Booked" button is in the header
2. Click it with missing fields → verify it navigates to the correct tab and highlights the field
3. Fill all required fields → verify confirmation panel appears
4. Confirm → verify activity is booked, trip promotes if first booking
5. Open a package form → verify button is present
6. Book the package → verify children are also booked
7. Check Trip Tasks → verify insurance review task was created
8. Open bookings tab → verify inline "Book" button on unbooked rows

- [ ] **Step 3: Final commit**

```
git commit -m "chore: cleanup booking UX overhaul"
```

- [ ] **Step 4: Push to preview**

```bash
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
