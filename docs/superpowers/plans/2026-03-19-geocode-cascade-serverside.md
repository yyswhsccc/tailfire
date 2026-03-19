# Server-Side Geocode Cascade Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move day location geocode cascade to server-side so every activity create/update/delete automatically updates itinerary_day start/end locations. No client coordination required. Geocoding failures report to Sentry, never fail silently.

**Architecture:** New `DayLocationService` called by activity lifecycle hooks (create/update/delete). Recalculates day start/end locations from activities on the day, then cascades forward to subsequent days. Replaces client-side cascade-preview/apply flow for automatic updates.

**Tech Stack:** NestJS (API), Drizzle ORM, EventEmitter2, Sentry, Google Places API, Aerodatabox API

---

## Business Rules

### Which activities set day locations
| Activity Type | Day Start | Day End | Source |
|--------------|-----------|---------|--------|
| Flight | Departure airport (last day only) | Arrival airport | `flight_segments.arrival_airport_*` or geocode IATA code |
| Lodging | — | Hotel address/coordinates | `lodging_details.address` + geocode, or `itinerary_activities.coordinates` |
| Cruise port_info | Port location | Port location | `port_info_details.coordinates` or geocode port name from `catalog.cruise_ports` |

### Priority for determining a day's end location
1. **Last activity on the day** with a resolvable location (flight arrival, hotel, port)
2. **First activity on the day** (fallback)
3. **Previous day's end location** (cascade forward)
4. **First activity on the entire itinerary** (ultimate fallback)

### Day start location
- Inherits from **previous day's end location** (you wake up where you went to sleep)
- Exception: Day 1 start = first flight's departure airport (trip origin)

### Cascade propagation
- When a day's end location changes, propagate to the **next day's start** location
- Continue cascading forward until hitting a day that:
  - Has `startLocationOverride = true` (user locked it)
  - Already has a start location set from its own activities (not inherited)
- When an activity is **deleted**, recalculate the day from remaining activities, then re-cascade

### Error handling
- Geocoding failures: **save the activity anyway**, log error to Sentry with full context (activity ID, location attempted, error reason)
- NEVER fail silently — all `catch` blocks must `Sentry.captureException()` or rethrow
- Day location set to `null` if geocoding fails (not lat: 0, lng: 0)

---

## File Structure

### API — New
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/trips/day-location.service.ts` | Create | Core service: recalculate + cascade |

### API — Modify
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/trips/component-orchestration.service.ts` | Modify | Call DayLocationService after activity create/update |
| `apps/api/src/trips/activities.service.ts` | Modify | Call DayLocationService after activity delete |
| `apps/api/src/trips/geolocation-cascade.service.ts` | Keep | Existing cascade logic — refactor into DayLocationService or delegate |
| `apps/api/src/trips/geocoding.service.ts` | Modify | Add Sentry error reporting on failures, never return lat:0/lng:0 |
| `apps/api/src/trips/trips.module.ts` | Modify | Register DayLocationService |

### Admin — Modify
| File | Action | Purpose |
|------|--------|---------|
| `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` | Modify | Remove client-side cascade calls (server handles it) |
| `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` | Modify | Remove client-side cascade calls |

---

## Chunk 1: DayLocationService

### Task 1: Create the core service

**File:** `apps/api/src/trips/day-location.service.ts`

The service exposes one main method: `recalculateFromDay(itineraryId, dayId)`

- [ ] **Step 1: Create the service skeleton**

```typescript
@Injectable()
export class DayLocationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly geocodingService: GeocodingService,
  ) {}

  /**
   * Recalculate day locations starting from the given day, then cascade forward.
   * Called after any activity create/update/delete on that day.
   */
  async recalculateFromDay(itineraryId: string, dayId: string): Promise<void>
}
```

- [ ] **Step 2: Implement `recalculateFromDay`**

Logic:
1. Fetch ALL days for the itinerary (ordered by day_number)
2. Fetch ALL location-relevant activities for the itinerary (flights, lodging, port_info) with their coordinates
3. For each day, compute:
   - `endLocation`: from last location-bearing activity on that day
   - `startLocation`: from previous day's endLocation (or first flight departure for Day 1)
4. Only write to days where:
   - The computed location differs from current
   - The field is NOT override-locked
5. Start from the affected day and cascade forward

- [ ] **Step 3: Implement `resolveActivityLocation`**

For each activity type, extract coordinates:
- **Flight**: Look up arrival airport coords from `flight_segments` → if null, geocode the IATA code via `geocodingService`
- **Lodging**: Use `itinerary_activities.coordinates` → if null, geocode `lodging_details.address` via `geocodingService`
- **Port_info**: Use `itinerary_activities.coordinates` → if null, geocode `itinerary_activities.location` via `geocodingService` (checks `catalog.cruise_ports` first)

If geocoding fails: log to Sentry with context, return null (don't store lat:0/lng:0)

- [ ] **Step 4: Write to itinerary_days**

Bulk update all affected days in a single transaction:
```typescript
await this.db.client.transaction(async (tx) => {
  for (const update of dayUpdates) {
    await tx.update(schema.itineraryDays)
      .set({
        startLocationName: update.startName,
        startLocationLat: update.startLat,
        startLocationLng: update.startLng,
        endLocationName: update.endName,
        endLocationLat: update.endLat,
        endLocationLng: update.endLng,
      })
      .where(eq(schema.itineraryDays.id, update.dayId))
  }
})
```

- [ ] **Step 5: Commit.**

---

## Chunk 2: Geocoding Error Reporting

### Task 2: Fix geocoding service to report failures to Sentry

**File:** `apps/api/src/trips/geocoding.service.ts`

- [ ] **Step 1: Audit all catch blocks** — find any that swallow errors silently

- [ ] **Step 2: Add Sentry reporting**

```typescript
import * as Sentry from '@sentry/nestjs'

// In every catch block:
catch (error) {
  Sentry.captureException(error, {
    tags: { service: 'geocoding', source: 'airport' },
    extra: { query, airportCode, activityId },
  })
  return null // Don't return { lat: 0, lng: 0 }
}
```

- [ ] **Step 3: Ensure zero coordinates are NEVER returned** — search for `lat: 0` or `lng: 0` patterns and replace with `null`

- [ ] **Step 4: Commit.**

---

## Chunk 3: Wire into Activity Lifecycle

### Task 3: Trigger cascade on activity create/update

**File:** `apps/api/src/trips/component-orchestration.service.ts`

- [ ] **Step 1: Inject DayLocationService**

- [ ] **Step 2: After every activity create/update** for flights, lodging, and cruise port_info — call:

```typescript
// Non-blocking — don't fail the activity save if cascade fails
try {
  await this.dayLocationService.recalculateFromDay(itineraryId, dayId)
} catch (error) {
  Sentry.captureException(error, {
    tags: { service: 'day-location', trigger: 'activity-save' },
    extra: { activityId, dayId, itineraryId },
  })
}
```

- [ ] **Step 3: Commit.**

### Task 4: Trigger cascade on ALL activity delete paths

Delete operations happen via `component-orchestration.service.ts` delete methods AND `activities.controller.ts` endpoints.

**File:** `apps/api/src/trips/component-orchestration.service.ts`

- [ ] **Step 1: Add recalculate call to ALL delete methods:**
  - `deleteFlightComponent` (~line 499)
  - `deleteLodgingComponent` (~line 748)
  - `deleteTourComponent` (~line 1043)
  - `deleteTransportation` (~line 1441)
  - `deleteDining` (~line 1978)
  - `deleteCustomCruise` (~line 2267)
  - `deletePortInfo` (~line 2435)

Each must capture the `itineraryId` and `dayId` BEFORE deleting, then call:
```typescript
await this.dayLocationService.recalculateFromDay(itineraryId, dayId)
```

**File:** `apps/api/src/trips/activities.controller.ts`

- [ ] **Step 2: Check the generic delete endpoints** (~lines 603, 667, 795, 923) — if these bypass orchestration, they also need the cascade trigger.

- [ ] **Step 3: Commit.**

---

## Chunk 4: Remove Client-Side Cascade from Forms

### Task 5: Clean up flight form

**File:** `apps/admin/src/app/trips/[id]/_components/flight-form.tsx`

- [ ] **Step 1: Remove the cascade-preview/apply calls** (lines ~987-1008) — the server now handles this automatically.

- [ ] **Step 2: Remove cascade state variables and imports** (CascadeConfirmationDialog, useCascadePreview, useCascadeApply)

- [ ] **Step 3: Keep the CascadeConfirmationDialog for the day-edit-modal** (manual override flow) — only remove from flight-form.

- [ ] **Step 4: Commit.**

### Task 6: Clean up transportation form

**File:** `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx`

- [ ] **Step 1: Same as Task 5** — remove client-side cascade calls.

- [ ] **Step 2: Commit.**

---

## Chunk 5: Cruise Port Schedule Integration

### Task 7: Trigger cascade after cruise port schedule generation

**File:** `apps/api/src/trips/component-orchestration.service.ts`

- [ ] **Step 1: At the end of `generateCruisePortSchedule`**, after all port_info activities are created:

```typescript
// Cascade day locations from first port day
const firstPortDayId = itineraryDays[0]?.id
if (firstPortDayId) {
  await this.dayLocationService.recalculateFromDay(itineraryId, firstPortDayId)
}
```

- [ ] **Step 2: Commit.**

---

## Summary

| Task | What | Order |
|------|------|-------|
| 1 | Create DayLocationService (core logic) | 1st |
| 2 | Fix geocoding to report to Sentry, no zero coords | 2nd |
| 3 | Wire into activity create/update | 3rd |
| 4 | Wire into activity delete | 4th |
| 5 | Remove client-side cascade from flight form | 5th |
| 6 | Remove client-side cascade from transportation form | 6th |
| 7 | Wire into cruise port schedule generation | 7th |

**Estimated: 7 tasks, ~3 hours**

**Dependencies:**
- Task 1 must be first (everything depends on it)
- Task 2 should be early (geocoding fix)
- Tasks 3-7 depend on Task 1
- Tasks 5-6 can run after Task 3 (frontend cleanup after server handles it)

---

## Concurrency: Itinerary-Level Serialization

To prevent race conditions when two activities are saved simultaneously on the same itinerary, use a PostgreSQL advisory lock keyed by itinerary ID:

```typescript
async recalculateFromDay(itineraryId: string, dayId: string): Promise<void> {
  // Advisory lock prevents concurrent cascade on same itinerary
  const lockKey = hashStringToInt(itineraryId) // Convert UUID to int for pg_advisory_lock
  await this.db.client.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`)
  // ... recalculation logic inside the same transaction
}
```

This ensures only one cascade runs at a time per itinerary. The lock is released when the transaction commits. Other saves on different itineraries are unaffected.

---

## Key Design Decisions

1. **Server-side, not client-side** — cascade runs automatically on the API, no client coordination needed. Supports future MCP server and API-only trip management.

2. **Non-blocking on activity saves** — if cascade fails, the activity still saves. Failure logged to Sentry.

3. **No lat:0/lng:0** — geocoding returns null on failure, never zero coordinates. Days with null locations show "no location" in UI (honest, not misleading).

4. **Override locks respected** — user-locked locations (`startLocationOverride`/`endLocationOverride`) are never overwritten by cascade.

5. **Cascade stops at populated days** — if a day already has a location from its own activities, cascade from a previous day won't overwrite it.

6. **Delete triggers recalculation** — removing a hotel doesn't leave stale location data. Day reverts to next best source.

---

## Future Considerations (Out of Scope)

- **Silent failure audit** — systematic scan of all `try/catch` blocks across API for silent error swallowing. Separate task.
- **Batch geocoding** — for TES import, geocode all activities in parallel rather than sequentially.
- **Cruise port geocoding enrichment** — populate `catalog.cruise_ports` with coordinates for all ports.
- **Day-edit-modal cascade** — keep the manual cascade-preview/apply flow for when users manually set day locations. This plan only removes automatic cascade from activity forms.
