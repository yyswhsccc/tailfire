# Traveler Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent trips from being published or booked without at least one traveler, and block creating trips in advanced statuses that bypass the workflow.

**Architecture:** Add a reusable `assertHasTravelers()` helper to `TripsService` that queries `trip_travelers` count and throws `BadRequestException` if 0. Call it at publish time and when transitioning to `booked`. Also block creating trips directly as `booked`/`in_progress`/`completed`. Frontend gets a warning banner and restricted create form.

**Tech Stack:** NestJS (API), Drizzle ORM, Next.js/React (Admin), Tailwind CSS

**Design doc:** `docs/plans/2026-03-02-traveler-guardrails-design.md`

---

### Task 1: Add `assertHasTravelers` helper method

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`

**Step 1: Add the helper method**

Add this private method to the `TripsService` class, right before the `publishTrip()` method (before line 1449):

```typescript
  /**
   * Assert that a trip has at least one traveler.
   * Throws BadRequestException if not.
   */
  private async assertHasTravelers(tripId: string, action: string): Promise<void> {
    const result = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))
    const count = Number(result[0]?.count ?? 0)
    if (count === 0) {
      throw new BadRequestException(
        `Cannot ${action} without at least one traveler. Add travelers first.`
      )
    }
  }
```

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/api typecheck`
Expected: No new errors (only pre-existing api-credentials/portal-jwt errors)

**Step 3: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat(api): add assertHasTravelers helper to TripsService"
```

---

### Task 2: Block creating trips in advanced statuses

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts:100`

**Step 1: Add status validation to `create()` method**

In `TripsService.create()`, after line 100 (`const status = dto.status || 'draft'`), add:

```typescript
    // Validate: trips cannot be created in advanced statuses
    // They must go through the workflow (draft/quoted → booked via status transition)
    const ALLOWED_CREATE_STATUSES = ['inbound', 'draft', 'quoted']
    if (!ALLOWED_CREATE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Trips cannot be created with status "${status}". Use draft, inbound, or quoted, then transition through the workflow.`
      )
    }
```

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/api typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat(api): block creating trips in booked/in_progress/completed status"
```

---

### Task 3: Require travelers to publish a trip

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts:1449-1453`

**Step 1: Add traveler check to `publishTrip()`**

In `TripsService.publishTrip()`, after the early return check on line 1452 (`if (trip.isPublished && trip.shareToken) return trip`), add:

```typescript
    // Require at least one traveler to publish
    await this.assertHasTravelers(id, 'publish a trip')
```

So the method now reads:
```typescript
  async publishTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const trip = await this.findOne(id)
    if (trip.isPublished && trip.shareToken) {
      return trip
    }

    // Require at least one traveler to publish
    await this.assertHasTravelers(id, 'publish a trip')

    const shareToken = trip.shareToken || crypto.randomBytes(32).toString('hex')
    // ... rest unchanged
```

Note: `publishTripSnapshot()` calls `publishTrip()` internally, so it inherits this check automatically.

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/api typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat(api): require travelers before publishing a trip"
```

---

### Task 4: Require travelers to transition to booked

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts:507`

**Step 1: Add traveler check to `update()` status transition block**

In `TripsService.update()`, after the inbound→owner validation block (after line 507, after the closing `}` of the `if (existingTrip.status === 'inbound' ...)` block), add:

```typescript
      // Validate: transitioning to 'booked' requires at least one traveler
      if (dto.status === 'booked') {
        await this.assertHasTravelers(id, 'set trip to Booked')
      }
```

So the status transition block now reads:
```typescript
    if (dto.status && dto.status !== existingTrip.status) {
      const isValid = canTransitionTripStatus(...)
      if (!isValid) { throw ... }

      // Validate: when transitioning FROM inbound, must have an owner
      if (existingTrip.status === 'inbound' && dto.status !== 'inbound') { ... }

      // Validate: transitioning to 'booked' requires at least one traveler
      if (dto.status === 'booked') {
        await this.assertHasTravelers(id, 'set trip to Booked')
      }
    }
```

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/api typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat(api): require travelers before transitioning trip to booked"
```

---

### Task 5: Require travelers for bulk status change to booked

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts:1027-1029`

**Step 1: Add traveler check to `bulkChangeStatus()`**

In `TripsService.bulkChangeStatus()`, after the status transition validation block (after line 1027, after the `failed.push` / `continue` for invalid transitions), add:

```typescript
      // Validate: transitioning to 'booked' requires at least one traveler
      if (newStatus === 'booked') {
        try {
          await this.assertHasTravelers(tripId, 'set trip to Booked')
        } catch {
          failed.push({ id: tripId, reason: 'Cannot set trip to Booked without at least one traveler' })
          continue
        }
      }
```

Note: In the bulk method, we catch and push to the `failed` array instead of throwing, to allow other trips in the batch to proceed.

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/api typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat(api): require travelers in bulk status change to booked"
```

---

### Task 6: Add warning banner to trip overview

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx:4,84`

**Step 1: Add AlertTriangle import**

On line 4, add `AlertTriangle` to the lucide-react import:

```typescript
import { Calendar, MapPin, User, Users, Plus, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'
```

**Step 2: Add warning banner**

After line 84 (`<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">`), before the Main Content comment, add:

```tsx
      {/* Traveler Warning Banner */}
      {!loadingTravelers && travelers.length === 0 && ['draft', 'quoted'].includes(trip.status) && (
        <div className="lg:col-span-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>This trip has no travelers. Add travelers before publishing or booking.</span>
          <Button variant="link" size="sm" className="ml-auto text-amber-800 underline p-0 h-auto" onClick={handleAddTravelers}>
            Add Travelers
          </Button>
        </div>
      )}
```

**Step 3: Run typecheck**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Zero errors

**Step 4: Commit**

```bash
git add 'apps/admin/src/app/trips/[id]/_components/trip-overview.tsx'
git commit -m "feat(admin): show warning banner when trip has no travelers"
```

---

### Task 7: Remove advanced statuses from trip create form

**Files:**
- Modify: `apps/admin/src/app/trips/_components/trip-form-dialog.tsx:490-493`

**Step 1: Remove booked and in_progress from dropdown**

Replace lines 490-493:

```tsx
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
```

With:

```tsx
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
```

**Step 2: Run typecheck**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Zero errors

**Step 3: Commit**

```bash
git add apps/admin/src/app/trips/_components/trip-form-dialog.tsx
git commit -m "feat(admin): restrict trip create form to draft/quoted statuses"
```

---

### Task 8: Verify all changes

**Step 1: Run full typecheck for both packages**

Run: `pnpm --filter @tailfire/api typecheck && pnpm --filter @tailfire/admin typecheck`
Expected: No new errors

**Step 2: Manual verification in browser**

1. Navigate to trip with no travelers -> warning banner visible
2. Try to publish trip with no travelers -> 400 error
3. Try to set trip to Booked with no travelers -> 400 error
4. Open create trip dialog -> only Draft and Quoted in dropdown
5. Add a traveler -> warning banner disappears
6. Publish trip -> succeeds

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
