# Traveler Guardrails Design

**Date:** 2026-03-02
**Status:** Approved
**Validated by:** Codex (found critical gap in trip creation path)

## Problem

A trip can go through the entire lifecycle (created -> published -> client approved -> booked -> traveling -> completed) with zero travelers. There are no guardrails at any layer -- database, API, or frontend.

Discovered during e2e browser testing of the full trip lifecycle.

## Design

### Enforcement Points (API)

#### 1. Block advanced statuses on trip creation

**File:** `apps/api/src/trips/trips.service.ts` (`create()` ~line 100)

Reject `status` of `booked`, `in_progress`, or `completed` on trip creation. Trips must start as `inbound`, `draft`, or `quoted`.

**Rationale:** Since travelers can't exist before a trip is created, allowing `booked` on create bypasses all traveler checks. Found by Codex during plan validation.

#### 2. Require travelers to publish

**File:** `apps/api/src/trips/trips.service.ts` (`publishTrip()` ~line 1449)

Before generating the share token, query `trip_travelers` count. If 0, throw `BadRequestException`.

This covers both `publishTrip()` and `publishTripSnapshot()` (which calls `publishTrip()` internally).

#### 3. Require travelers to transition to booked

**File:** `apps/api/src/trips/trips.service.ts` (`update()` ~line 507)

After validating the status transition graph, if transitioning TO `booked`, query `trip_travelers` count. If 0, throw `BadRequestException`.

#### 4. Require travelers for bulk status change to booked

**File:** `apps/api/src/trips/trips.service.ts` (`bulkChangeStatus()` ~line 962)

Same check as #3 but for the bulk endpoint.

### Helper Method

```typescript
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

### Frontend Changes

#### Warning banner on trip overview

**File:** `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`

Show amber warning when trip has 0 travelers AND status is `draft` or `quoted`:
"This trip has no travelers. Add travelers before publishing or booking."

#### Remove advanced statuses from create form

**File:** `apps/admin/src/app/trips/_components/trip-form-dialog.tsx`

Remove `booked`, `in_progress`, `completed` from the status dropdown. Only show `draft`, `inbound`, `quoted`.

## What We're NOT Doing

- No DB-level constraint (too rigid for the workflow)
- No disabled Publish/Preview buttons (API is the safety net)
- No traveler check on itinerary status changes to `proposing` (agents need flexibility while building)

## Files Summary

| File | Action |
|------|--------|
| `apps/api/src/trips/trips.service.ts` | Add `assertHasTravelers()` helper + 4 enforcement points |
| `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx` | Add warning banner |
| `apps/admin/src/app/trips/_components/trip-form-dialog.tsx` | Remove advanced statuses from create dropdown |

## Verification

1. `pnpm --filter @tailfire/api typecheck` -- no new errors
2. `pnpm --filter @tailfire/admin typecheck` -- no new errors
3. Try to publish a trip with 0 travelers -- should get 400 error
4. Try to set trip to Booked with 0 travelers -- should get 400 error
5. Try to create trip with status=booked -- should get 400 error
6. Add a traveler, then publish -- should succeed
7. Warning banner shows on trip detail when 0 travelers
8. Trip create form only shows draft/inbound/quoted statuses
