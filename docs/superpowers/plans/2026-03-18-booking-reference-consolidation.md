# Booking Reference Consolidation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `itinerary_activities.confirmation_number` as the single source of truth for supplier booking references (PNR, reservation #, booking #, confirmation #) across all activity types, remove redundant fields from `activity_pricing`, and fix the import process.

**Architecture:** Remove `activity_pricing.confirmation_number` and repurpose `activity_pricing.booking_reference` as a secondary/internal ref only (round-trip linking). All supplier-facing booking references flow through `itinerary_activities.confirmation_number`. Cruise imports sync `custom_cruise_details.booking_number` → `itinerary_activities.confirmation_number`. Commission queries read from `itinerary_activities` directly.

**Tech Stack:** NestJS (API), Drizzle ORM, PostgreSQL, Next.js (Admin)

---

## Business Context

Every booking with a supplier has a unique reference — could be a PNR (flights), reservation number (tours/cruises), booking number (packages), or confirmation number (hotels). This is the number an agent uses to locate and manage the booking with the supplier.

Currently this reference is stored inconsistently:
- `itinerary_activities.confirmation_number` — populated by TES import (617 rows) and manual entry
- `activity_pricing.confirmation_number` — NEVER populated (0 rows), redundant
- `activity_pricing.booking_reference` — used only by cruise import for round-trip linking
- `custom_cruise_details.booking_number` — cruise-specific, not synced to activity
- `custom_cruise_details.fusion_booking_ref` — Traveltek system ref (must preserve)

### Rules

1. `itinerary_activities.confirmation_number` = **single source of truth** for supplier booking reference
2. `custom_cruise_details.fusion_booking_ref` = Traveltek-specific ref (preserved, not touched)
3. `custom_cruise_details.booking_number` and `reservation_number` = cruise-specific refs that sync TO `itinerary_activities.confirmation_number`
4. `trips.reference_number` = agency's own invoice/reference number (FIT-2026-XXX) — most important internal identifier
5. `trips.external_reference` = TES system ID for cross-reference during import (retained)
6. `activity_pricing.confirmation_number` = to be removed (unused)
7. `activity_pricing.booking_reference` = retained for round-trip flight linking only (internal, not supplier-facing)

---

## File Structure

### Database
| File | Action | Purpose |
|------|--------|---------|
| `packages/database/src/migrations/20260319120000_consolidate_booking_refs.sql` | Create | Backfill + cleanup migration |
| `packages/database/src/migrations/meta/_journal.json` | Modify | Register migration |
| `packages/database/src/schema/activity-pricing.schema.ts` | Modify | Remove `confirmationNumber` column def |

### API
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/financials/commission/commission.service.ts` | Modify | Simplify receivables query to use `ia.confirmation_number` only |
| `apps/api/src/cruise-booking/services/import-booking.service.ts` | Modify | Sync booking_number → ia.confirmation_number on cruise import |
| `apps/api/src/trips/component-orchestration.service.ts` | Modify | Ensure all activity types write confirmation_number to ia |

### Admin UI
| File | Action | Purpose |
|------|--------|---------|
| `apps/admin/src/app/trips/[id]/_components/activity-form.tsx` | Modify | Rename label to "Supplier Booking Reference" for clarity |
| `apps/admin/src/app/commission/receive/_components/pending-receivables-table.tsx` | No change | Already reads from API response |

---

## Chunk 1: Database Migration

### Task 1: Backfill and cleanup migration

**Files:**
- Create: `packages/database/src/migrations/20260319120000_consolidate_booking_refs.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration**

```sql
-- Booking Reference Consolidation
-- Single source of truth: itinerary_activities.confirmation_number

-- 1. Backfill: Copy activity_pricing.confirmation_number → itinerary_activities.confirmation_number
--    (only where ia.confirmation_number is NULL and ap has a value)
UPDATE itinerary_activities ia
SET confirmation_number = ap.confirmation_number
FROM activity_pricing ap
WHERE ap.activity_id = ia.id
  AND ia.confirmation_number IS NULL
  AND ap.confirmation_number IS NOT NULL;

-- 2. Backfill: Copy custom_cruise_details.booking_number → itinerary_activities.confirmation_number
--    (only where ia.confirmation_number is NULL and cruise has a booking_number)
UPDATE itinerary_activities ia
SET confirmation_number = ccd.booking_number
FROM custom_cruise_details ccd
WHERE ccd.activity_id = ia.id
  AND ia.confirmation_number IS NULL
  AND ccd.booking_number IS NOT NULL;

-- 3. Drop the redundant column from activity_pricing
--    (confirmed 0 rows populated — safe to drop)
ALTER TABLE activity_pricing DROP COLUMN IF EXISTS confirmation_number;

-- 4. Add comment documenting the canonical field
COMMENT ON COLUMN itinerary_activities.confirmation_number IS
  'Supplier booking reference (PNR, reservation #, booking #, confirmation #). Single source of truth for locating bookings with suppliers.';
```

- [ ] **Step 2: Register in _journal.json** — add entry at next idx with tag `20260319120000_consolidate_booking_refs`, `breakpoints: false`

- [ ] **Step 3: Update Drizzle schema** — remove `confirmationNumber` from `activityPricing` in `packages/database/src/schema/activity-pricing.schema.ts`

- [ ] **Step 4: Fix all TypeScript/SQL references** — search codebase for `activityPricing.confirmationNumber` or `activity_pricing.confirmation_number` and update/remove. **ALL known locations (from Codex audit):**
  - `commission.service.ts:958` — search filter references `ap.confirmation_number`
  - `commission.service.ts:981` — COALESCE in receivables data query
  - `commission.service.ts:1276,1280` — deposit detail query reads `ap.confirmation_number`
  - `activities.service.ts:2005,2105` — activities list enrichment uses Drizzle schema field
  - `component-orchestration.service.ts` — check if it writes to ap.confirmationNumber
  - Any DTOs/types referencing the field

- [ ] **Step 5: Run migration locally, typecheck, commit.**

---

## Chunk 2: Simplify Commission Query

### Task 2: Update receivables query to use ia.confirmation_number directly

**Files:** `apps/api/src/financials/commission/commission.service.ts`

- [ ] **Step 1: Simplify the SELECT**

Change:
```sql
COALESCE(ap.confirmation_number, ia.confirmation_number) AS confirmation_number,
```
To:
```sql
ia.confirmation_number,
```

(ap.confirmation_number no longer exists after migration)

- [ ] **Step 2: Verify search filter** — already includes `ia.confirmation_number ILIKE` (added earlier). Remove `ap.confirmation_number ILIKE` from search if still present.

- [ ] **Step 3: Test locally** — `source apps/api/.env && psql "$DATABASE_URL" -c "\d activity_pricing"` should NOT show confirmation_number.

- [ ] **Step 4: Commit.**

---

## Chunk 3: Fix Cruise Import

### Task 3: Sync booking_number to itinerary_activities.confirmation_number during cruise import

**Files:** `apps/api/src/cruise-booking/services/import-booking.service.ts`

- [ ] **Step 1: Find where the cruise activity is created** — in `confirmImport()` method, after the activity and custom_cruise_details are created.

- [ ] **Step 2: After creating custom_cruise_details, update the activity's confirmation_number**

```typescript
// Sync supplier booking reference to the canonical field
if (cruiseDetails.bookingNumber) {
  await tx
    .update(schema.itineraryActivities)
    .set({ confirmationNumber: cruiseDetails.bookingNumber })
    .where(eq(schema.itineraryActivities.id, activityId))
}
```

This ensures cruise imports populate `itinerary_activities.confirmation_number` going forward.

- [ ] **Step 3: Verify fusion_booking_ref is NOT touched** — it stays on `custom_cruise_details` only. It's the Traveltek system identifier, not the supplier booking reference.

- [ ] **Step 4: Commit.**

---

## Chunk 4: Fix Component Orchestration

### Task 4: Ensure all activity creation paths write confirmation_number consistently

**Files:** `apps/api/src/trips/component-orchestration.service.ts`

- [ ] **Step 1: Audit all create methods** — check each component type's create method:
  - `createFlightComponent()`
  - `createLodgingComponent()`
  - `createTourComponent()`
  - `createCustomCruise()`
  - `createTransportation()`
  - `createDining()`
  - `createOptions()`
  - `createPackage()`
  - `createInsurance()`

Ensure each one writes `dto.confirmationNumber` → `itinerary_activities.confirmation_number` during INSERT.

- [ ] **Step 2: Remove any writes to `activity_pricing.confirmationNumber`** — this field no longer exists. If the orchestration service sets it, remove those lines.

- [ ] **Step 3: For update methods** — ensure `dto.confirmationNumber` updates `itinerary_activities.confirmation_number`, not `activity_pricing`.

- [ ] **Step 4: Typecheck and commit.**

---

## Chunk 5: UI Clarity

### Task 5: Rename form label and add tooltip

**Files:** `apps/admin/src/app/trips/[id]/_components/activity-form.tsx`

- [ ] **Step 1: Update the label** — change "Booking reference" placeholder to be clearer:

```tsx
<Label htmlFor="confirmationNumber">Supplier Booking Ref</Label>
<Input
  {...register('confirmationNumber')}
  placeholder="PNR, reservation #, booking #..."
/>
```

- [ ] **Step 2: Commit.**

---

## Chunk 6: Sync Manual Cruise Booking Number

### Task 7: Keep ia.confirmation_number in sync when cruise booking_number changes

**Files:**
- `apps/api/src/trips/custom-cruise-details.service.ts`

The import flow (Task 3) only handles the import path. Manual cruise create/update also writes `booking_number` to `custom_cruise_details` but doesn't sync to `itinerary_activities.confirmation_number`.

- [ ] **Step 1: In create method** (custom-cruise-details.service.ts:~109) — after inserting custom_cruise_details, if `bookingNumber` is provided, update `itinerary_activities.confirmation_number`:

```typescript
if (dto.bookingNumber) {
  await this.db.client
    .update(this.db.schema.itineraryActivities)
    .set({ confirmationNumber: dto.bookingNumber })
    .where(eq(this.db.schema.itineraryActivities.id, activityId))
}
```

- [ ] **Step 2: In update method** (~line 196) — same sync when bookingNumber changes.

- [ ] **Step 3: Commit.**

---

## Chunk 7: TES Import Fix (Future)

### Task 6: Document TES import requirements for booking references

**NOTE:** The TES import script (`scripts/migration/extract-travelesolutions.ts`) does not currently exist in the codebase. When it's built/rebuilt, it MUST:

- [ ] **Step 1: Document the mapping** — add to this plan file:

TES field → Tailfire field:
- TES `ReservationNumber` → `itinerary_activities.confirmation_number`
- TES `BookingId` → `trips.external_reference` (already done)
- TES trip reference → `trips.reference_number` (agency invoice #, most important)
- TES `GroupId` (if present) → `trips.trip_group_id` (link to trip_groups)

- [ ] **Step 2: Verify trip_groups handling** — when importing grouped TES trips:
  1. Create or find `trip_group` by TES GroupId
  2. Set `trips.trip_group_id` on each trip in the group
  3. Each trip's activities get their own `confirmation_number` from TES reservation data

---

## Summary

| Task | What | Chunk | Order |
|------|------|-------|-------|
| 2 | Simplify commission receivables + deposit detail queries | API | 1st |
| 4 | Fix component orchestration + activities.service writes | API | 2nd |
| 3 | Fix cruise import to sync booking_number → ia | API | 3rd |
| 7 | Sync manual cruise create/update booking_number → ia | API | 4th |
| 5 | Rename UI form label | UI | 5th |
| 1 | Migration: backfill + drop ap.confirmation_number | DB | LAST |
| 6 | Document TES import requirements | Docs | anytime |

**Estimated: 7 tasks, ~2 hours**

**Dependencies — CRITICAL ORDERING:**
- Tasks 2-4 (code changes) must run FIRST — remove all references to `ap.confirmation_number`
- Task 1 (DB migration) runs LAST — drops the column only after no code references it
- Task 5 is independent
- Task 6 is documentation only
- Task 7 is independent (cruise sync for manual flows)

**Key principle:** After this work, any code that needs the supplier's booking reference reads `itinerary_activities.confirmation_number` — one field, one table, one source of truth.

---

## Data Integrity Notes

- `activity_pricing.confirmation_number` has **0 populated rows** — safe to drop
- `activity_pricing.booking_reference` is **retained** — used for round-trip flight linking (internal, not supplier-facing)
- `custom_cruise_details.fusion_booking_ref` is **retained** — Traveltek system identifier
- `custom_cruise_details.booking_number` and `reservation_number` are **retained** — cruise-specific fields that supplement the canonical `ia.confirmation_number`
