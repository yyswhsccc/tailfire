# Booking Date Persistence & Mark-as-Booked Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix booking date persistence across all activity forms, fix the Mark-as-Booked header flow to use the form's booking date instead of hardcoding today, and add `bookingDate` to the component Zod schemas so typed activity routes don't strip it.

**Architecture:** The booking date field was added to the UI (PR #135) and the save payload (PR #142), but the Zod validation pipe on typed activity routes (`/activities/flights`, `/activities/lodging`, etc.) strips `bookingDate` because it's not in `baseUpdateComponentSchema`. Additionally, the `BookingHeaderButton` maintains its own transient date state instead of reading from the form's booking date prop. This plan fixes the schema, the header button, and the tour form mapper.

**Tech Stack:** NestJS, Zod, React Hook Form, Next.js, Drizzle ORM

---

### Task 1: Add `bookingDate` to component Zod schemas

This single change fixes persistence for 7 activity types (flight, lodging, dining, transportation, custom_cruise, options, port_info). Currently the Zod pipe at `zod-validation.pipe.ts:35` returns `result.data` which strips any fields not in the schema.

**Files:**
- Modify: `packages/shared-types/src/schemas/component-requests.schema.ts:93-136`

- [ ] **Step 1: Add `bookingDate` to `baseUpdateComponentSchema`**

In `packages/shared-types/src/schemas/component-requests.schema.ts`, add `bookingDate` to the base update schema after `confirmationNumber` (around line 110):

```typescript
// Inside baseUpdateComponentSchema z.object({...})
// After line 110: confirmationNumber: z.string().nullable().optional(),

// Booking
proposalStatus: activityProposalStatusSchema.optional(),
bookingStatus: activityBookingStatusSchema.optional(),
bookingDate: z.string().nullable().optional(),
```

**IMPORTANT:** The component schema has `status: activityStatusSchema.optional()` at line 111, but all forms send `proposalStatus` (not `status`). This means proposal status changes are silently stripped on typed routes. The fix: add `proposalStatus` as an alias alongside the existing `status` field. The API service at `activities.service.ts:810` reads `dto.proposalStatus`, so the Zod schema must pass it through under that name.

Also add `bookingDate` to `baseCreateComponentSchema` (around line 60) for consistency:

```typescript
// Inside baseCreateComponentSchema, after confirmationNumber
bookingDate: z.string().nullable().optional(),
```

- [ ] **Step 2: Verify the build**

Run: `pnpm --filter @tailfire/admin build`
Expected: Build succeeds — this is an additive schema change.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/schemas/component-requests.schema.ts
git commit -m "fix(types): add bookingDate to base component Zod schemas

The Zod validation pipe returns parsed data, stripping unknown fields.
All 7 typed activity routes (/activities/flights, /lodging, etc.) were
silently dropping bookingDate because it wasn't in baseUpdateComponentSchema."
```

---

### Task 2: Fix tour form — add `bookingDate` to `toTourApiPayload`

The tour form builds its payload through `toTourApiPayload` which doesn't include `bookingDate`. Unlike other forms where the field is spread directly into the payload object, the tour mapper explicitly constructs the return value.

**Files:**
- Modify: `apps/admin/src/lib/validation/tour-validation.ts:303-325`

- [ ] **Step 1: Add `bookingDate` pass-through to tour API payload mapper**

In `apps/admin/src/lib/validation/tour-validation.ts`, the `toTourApiPayload` function returns a manually constructed object. The form adds `bookingDate` to the spread payload at `tour-form.tsx:544`, but then `useCreateTour`/`useUpdateTour` hooks re-map through this function, dropping it.

Fix: the simplest approach is to NOT re-map in the hooks. But since that's a bigger change, instead add `bookingDate` to the return object:

```typescript
// At the end of the return object in toTourApiPayload, after commissionSplitPercentage:
commissionExpectedDate: data.commissionExpectedDate || null,
termsAndConditions: data.termsAndConditions || null,
cancellationPolicy: data.cancellationPolicy || null,
supplier: data.supplier || null,
bookingDate: (data as any).bookingDate || null,
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/validation/tour-validation.ts
git commit -m "fix(admin): include bookingDate in tour API payload mapper

toTourApiPayload constructed the return object manually without
bookingDate, causing useCreateTour/useUpdateTour to drop it."
```

---

### Task 3: Fix BookingHeaderButton to use form's booking date

The header button ignores the `bookingDate` prop from the form and resets its own inline date input to today on every validation attempt (line 168). It should initialize from the form's booking date and only default to today if no date is set.

**Files:**
- Modify: `apps/admin/src/components/activities/booking-header-button.tsx:168,205`

- [ ] **Step 1: Initialize booking date input from prop instead of today**

Change line 168 from:
```typescript
setBookingDateInput(new Date().toISOString().split('T')[0])
```
to:
```typescript
setBookingDateInput(bookingDate || new Date().toISOString().split('T')[0])
```

This uses the form's booking date if set, otherwise defaults to today.

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/activities/booking-header-button.tsx
git commit -m "fix(admin): BookingHeaderButton uses form's booking date

The header button was resetting its inline date to today on every
validation attempt, ignoring the bookingDate prop from the form."
```

---

### Task 4: Fix `onBooked` callbacks to use server response date

All 8 activity forms hardcode `new Date().toISOString().split('T')[0]` in their `onBooked` callback instead of using the booking date the server accepted. The `BookingHeaderButton` should pass the confirmed date back through `onBooked`.

**Files:**
- Modify: `apps/admin/src/components/activities/booking-header-button.tsx:62,213`
- Modify: All 8 form files (lodging, flight, transport, cruise, tour, dining, options, package)

- [ ] **Step 1: Pass booking date through `onBooked` callback**

In `booking-header-button.tsx`, change the `onBooked` prop type (line 62):
```typescript
onBooked?: (cascadedCount?: number, bookingDate?: string) => void
```

In `handleConfirm` (around line 213), pass the date:
```typescript
onBooked?.(response.cascadedCount, bookingDateInput)
```

- [ ] **Step 2: Update all 8 form `onBooked` callbacks**

In each form, update the `onBooked` callback to use the returned date instead of `new Date()`. The pattern is the same in all forms. Example for lodging-form.tsx:

Change:
```typescript
onBooked={() => {
  setActivityIsBooked(true)
  setActivityBookingDate(new Date().toISOString().split('T')[0] ?? null)
```
To:
```typescript
onBooked={(_cascadedCount, confirmedDate) => {
  setActivityIsBooked(true)
  setActivityBookingDate(confirmedDate || new Date().toISOString().split('T')[0])
```

Apply this pattern to all 8 files:
- `lodging-form.tsx`
- `flight-form.tsx`
- `transportation-form.tsx`
- `custom-cruise-form.tsx`
- `tour-form.tsx`
- `dining-form.tsx`
- `options-form.tsx`
- `package-form.tsx`

**Note:** `package-form.tsx` uses `setBookingDate` instead of `setActivityBookingDate`. `tour-form.tsx` also uses `setBookingDate`.

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/activities/booking-header-button.tsx \
  apps/admin/src/app/trips/\[id\]/_components/*-form.tsx
git commit -m "fix(admin): onBooked callbacks use confirmed date from server

BookingHeaderButton now passes the booking date through onBooked.
All 8 form callbacks use it instead of hardcoding new Date()."
```

---

### Task 5: Remove `BOOKING_DATE_MISSING` from booking validation

The current validation flow creates a catch-22: the booking date field exists in the form, but validation requires it to be saved BEFORE clicking "Mark as Booked". Since the "Mark as Booked" flow sends its own `bookingDate`, the server should accept it during the mark operation rather than requiring it to be pre-saved.

**Files:**
- Modify: `apps/api/src/trips/booking-validation.service.ts:44-46`

- [ ] **Step 1: Remove booking date check from validation**

In `booking-validation.service.ts`, the `BOOKING_DATE_MISSING` check (lines 44-46) should be removed because:
1. The mark-as-booked endpoint already sets the booking date during the mark operation
2. The booking date is now available in the form's BookingDetailsSection
3. Requiring it pre-saved creates a UX catch-22

Remove:
```typescript
// === Check 2: Booking date set ===
if (!activityData.booking_date) {
  errors.push({ message: 'Booking date is required', code: 'BOOKING_DATE_MISSING' })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/trips/booking-validation.service.ts
git commit -m "fix(api): remove BOOKING_DATE_MISSING from booking validation

The mark-as-booked endpoint already sets booking_date during the mark
operation. Requiring it pre-saved created a UX catch-22 where the form
field existed but validation failed before the user could save it."
```

---

### Task 6: Clean up dead fields in mark-as-booked DTO

The `MarkActivityBookedDto` exposes `passportVerified` and `nonRefundableAmountCents` but the service never applies them. The header always sends `passportVerified: true`. Clean this up to avoid confusion.

**Files:**
- Modify: `apps/api/src/trips/dto/activity-bookings.dto.ts`
- Modify: `apps/admin/src/components/activities/booking-header-button.tsx:205-210`

- [ ] **Step 1: Remove dead fields from DTO**

In `activity-bookings.dto.ts`, remove `passportVerified` and `nonRefundableAmountCents` from the mark DTO schema (they're accepted but never used).

- [ ] **Step 2: Remove `passportVerified: true` from header button**

In `booking-header-button.tsx` line 209, remove `passportVerified: true` from the `markBooked.mutateAsync` data.

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trips/dto/activity-bookings.dto.ts \
  apps/admin/src/components/activities/booking-header-button.tsx
git commit -m "chore: remove dead passportVerified/nonRefundableAmountCents from mark DTO

These fields were accepted by the DTO but never applied by the service.
The header always sent passportVerified: true which had no effect."
```

---

### Task 7: Final build verification and push to preview

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 2: Create PR and merge**

```bash
git push -u origin feature/booking-date-cleanup
gh pr create --base main --title "fix: booking date persistence, header button, and validation cleanup"
```

- [ ] **Step 3: Push to preview and verify**

Merge to preview branch and verify on tf-demo:
1. Open any activity → Booking tab → set booking date → reload → date persists
2. Click "Mark as Booked" → confirm → booking date shows the form's date, not today
3. Imported activities without booking date can still be marked as booked
