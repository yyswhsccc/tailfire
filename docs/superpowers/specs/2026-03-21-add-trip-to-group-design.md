# Issue #46: Create or Add Trip to Group — Design Spec

## Problem

The group detail page (`/trips/groups/[groupId]`) shows a "Trips" section listing trips in the group, but has no buttons to add existing trips or create new trips within the group. The backend API fully supports both operations — this is a frontend-only gap with minor backend and hook extensions.

## Solution

Two action buttons in the "Trips" section header, plus a new search dialog and targeted extensions to `TripFormDialog` and the trip list API.

---

## 1. TripFormDialog Extension

**File:** `apps/admin/src/app/trips/_components/trip-form-dialog.tsx`

Add three optional props:

- `initialValues?: Partial<TripFormValues>` — pre-fill form fields in create mode (merged with defaults, applied after reset)
- `redirectOnCreate?: boolean` (default: `true`) — when `false`, skip `router.push` after creation
- `onCreated?: (trip: TripResponseDto) => void` — callback after successful creation

**Behavior changes in create mode:**
- If `initialValues` includes `tripGroupId`, also set `tripType` to `'group'` so the group field renders
- On create success: if `redirectOnCreate` is `false`, call `onCreated(newTrip)` and close dialog instead of redirecting
- No changes to edit mode

## 2. "New Trip" Button

**File:** `apps/admin/src/app/trips/groups/[groupId]/page.tsx`

Add a "New Trip" button in the Trips section header. Opens `TripFormDialog` with:

```ts
initialValues={{
  tripGroupId: group.id,
  tripType: 'group',
  startDate: group.startDate && group.endDate ? group.startDate : undefined,
  endDate: group.startDate && group.endDate ? group.endDate : undefined,
}}
redirectOnCreate={false}
onCreated={(trip) => {
  // Invalidate group queries to refresh the trips list
  queryClient.invalidateQueries({ queryKey: tripGroupKeys.trips(groupId) })
  queryClient.invalidateQueries({ queryKey: tripGroupKeys.summary(groupId) })
  queryClient.invalidateQueries({ queryKey: tripGroupKeys.travelers(groupId) })
  toast({ title: 'Trip created', description: `${trip.name} added to group.` })
}}
```

Only pre-fill dates when **both** `startDate` and `endDate` exist on the group.

## 3. "Add Existing" Button + Search Dialog

**New file:** `apps/admin/src/app/trips/groups/[groupId]/_components/add-trip-to-group-dialog.tsx`

### UI

A modal dialog with:

- **Search input** — filters trips by name via `useTrips({ search, limit: 20 })`
- **Checkbox:** "Include trips already in a group" (default: unchecked)
  - When unchecked: API filters to `ungrouped: true` (see §4)
  - When checked: fetches all trips; grouped trips show a badge with their current group name
- **Trip rows** — each shows: trip name, trip number, dates, status badge, and (if grouped) current group name
  - Group name resolved via a `useTripGroups()` lookup map
- **Multi-select checkboxes** — user selects one or more trips
- **Submit button** — "Add N Trip(s) to Group"
  - If any selected trips are already in another group, show a single batch confirmation dialog: "N trip(s) will be moved from their current group. Continue?"
  - On confirm, calls `useAddTripsToGroup()` with all selected trip IDs
  - On success, invalidate group queries + close dialog + toast

### Hooks used

- `useTrips({ search, limit: 20, ungrouped })` — search trips
- `useTripGroups()` — resolve group names for badge display
- `useAddTripsToGroup()` — submit selected trips

## 4. Backend: Add `ungrouped` Filter

**Files:**
- `packages/shared-types/src/api/trips.types.ts` — add `ungrouped?: boolean` to `TripFilterDto`
- `apps/api/src/trips/dto/trip-filter.dto.ts` — add `@IsOptional() @IsBoolean() ungrouped?: boolean`
- `apps/api/src/trips/trips.service.ts` — in `findAll()`, when `filters.ungrouped === true`, add `WHERE trip_group_id IS NULL`
- `apps/admin/src/hooks/use-trips.ts` — pass `ungrouped` through to the API query params

## 5. Query Invalidation

After adding trips or creating a new trip from the group page, invalidate:

- `tripGroupKeys.trips(groupId)` — refresh the trips list
- `tripGroupKeys.summary(groupId)` — refresh financial summary
- `tripGroupKeys.travelers(groupId)` — refresh travelers
- `tripKeys.all` — refresh main trip lists (kanban, table views)

`useAddTripsToGroup()` already invalidates `tripGroupKeys.trips` and `tripKeys.all`. Verify it also invalidates `summary` and `travelers`; if not, add those.

## 6. UI Placement

In the group detail page's Trips section:

```
┌─────────────────────────────────────────────┐
│ Trips (3)                 [Add Existing] [+] │
├─────────────────────────────────────────────┤
│ Trip card 1                                  │
│ Trip card 2                                  │
│ Trip card 3                                  │
└─────────────────────────────────────────────┘
```

- "Add Existing" — ghost/outline button with `ListPlus` icon
- "+" (New Trip) — primary button with `Plus` icon
- Both visible whether the list is empty or populated

## Files Changed

| File | Change |
|------|--------|
| `apps/admin/src/app/trips/_components/trip-form-dialog.tsx` | Add `initialValues`, `redirectOnCreate`, `onCreated` props |
| `apps/admin/src/app/trips/groups/[groupId]/page.tsx` | Add two buttons to Trips section header |
| `apps/admin/src/app/trips/groups/[groupId]/_components/add-trip-to-group-dialog.tsx` | **New** — search & multi-select dialog |
| `packages/shared-types/src/api/trips.types.ts` | Add `ungrouped?: boolean` to filter DTO |
| `apps/api/src/trips/dto/trip-filter.dto.ts` | Add `ungrouped` field |
| `apps/api/src/trips/trips.service.ts` | Add `ungrouped` filter in `findAll()` |
| `apps/admin/src/hooks/use-trips.ts` | Pass `ungrouped` to API params |

## Out of Scope

- Drag-and-drop reordering of trips within a group
- Bulk trip creation (e.g., "create 5 trips at once")
- Group-level trip templates
