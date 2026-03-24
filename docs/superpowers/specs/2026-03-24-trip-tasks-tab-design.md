# Trip Tasks Tab — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Trip-focused task management tab with lifecycle phase grouping

---

## Problem

The Trip Tasks tab shows "This feature is in development" (EmptyState). Auto-created tasks (e.g., insurance review) exist in the database but agents can't see or manage them from the trip. The global `/tasks` page exists but doesn't provide trip-focused context — agents need to see what needs to happen at each stage of the trip lifecycle.

## Goals

1. Agents can see all tasks for a trip organized by lifecycle phase
2. Tasks are grouped: Pre-Booking → Pre-Departure → During Travel → Post-Return
3. Phase is auto-inferred from due date vs trip dates, overridable by agent
4. Agents can create, edit, complete, and delete tasks from the trip context
5. Reuse existing TaskCard and TaskFormDialog components

---

## Design

### 1. Layout — Vertical Sections by Phase

Four collapsible sections, each showing tasks for that lifecycle phase:

- **Pre-Booking** — Tasks before any activity is booked (collect info, verify passports, review pricing)
- **Pre-Departure** — Tasks after booking but before travel (final payments, send documents, insurance)
- **During Travel** — Tasks while travelers are on the trip (check-ins, emergency contacts)
- **Post-Return** — Tasks after travel (follow-up, feedback, commission reconciliation)

Each section header shows: phase name, task count (pending only), collapse toggle.

Completed tasks render muted at the bottom of their phase section.

"+ New Task" button at top-right opens TaskFormDialog pre-filled with `tripId`.

### 2. Phase Field

**Database:** Add `phase` column to `tasks` table.

```sql
ALTER TABLE tasks ADD COLUMN phase varchar(20);
```

Valid values: `pre_booking`, `pre_departure`, `during_travel`, `post_return`. Nullable — null means auto-infer.

**Drizzle schema:** Add to `tasks.schema.ts`:
```typescript
phase: varchar('phase', { length: 20 }),
```

**DTOs:** Add `phase` to `CreateTaskDto`, `UpdateTaskDto`, and `TaskResponseDto`.

### 3. Phase Auto-Inference

When `phase` is null, infer from `dueDate` vs trip dates:

```typescript
function inferPhase(
  dueDate: string | null,
  tripStartDate: string | null,
  tripEndDate: string | null,
  firstBookingDate: string | null,
): string {
  if (!dueDate) return 'post_return' // no due date = eventual follow-up

  const due = new Date(dueDate)

  // If there's a first booking date and due is before it
  if (firstBookingDate && due < new Date(firstBookingDate)) {
    return 'pre_booking'
  }

  // Before trip starts
  if (tripStartDate && due < new Date(tripStartDate)) {
    return 'pre_departure'
  }

  // During trip
  if (tripStartDate && tripEndDate && due >= new Date(tripStartDate) && due <= new Date(tripEndDate)) {
    return 'during_travel'
  }

  // After trip
  return 'post_return'
}
```

**When trip dates change:** Phase is NOT recalculated retroactively. If an agent explicitly set a phase, it stays. Auto-inferred phases are recalculated on read (since phase=null means "infer").

### 4. Component Structure

**New files:**
- `apps/admin/src/app/trips/[id]/_components/trip-tasks.tsx` — Main component
- `apps/admin/src/app/trips/[id]/_components/trip-tasks-phase-section.tsx` — Collapsible phase section

**Reused components:**
- `TaskCard` from `apps/admin/src/app/tasks/_components/task-card.tsx`
- `TaskFormDialog` from `apps/admin/src/app/tasks/_components/task-form-dialog.tsx` (extended with `tripId` + `phase`)

### 5. TripTasks Component

```
Props: { trip: TripWithDetailsResponseDto }

State:
- tasks (from API: GET /tasks?tripId=xxx)
- collapsedPhases (Set of collapsed phase ids)

Render:
1. Header: "Tasks" + count badge + "+ New Task" button
2. For each phase: TripTasksPhaseSection
   - Infer phase for each task (use task.phase || inferPhase())
   - Group tasks by phase
   - Sort: pending first (by due date), then completed
3. TaskFormDialog for create/edit (pre-filled with tripId, phase)
```

### 6. TaskFormDialog Extension

Add optional props:
- `tripId?: string` — pre-fill the trip association
- `phase?: string` — pre-fill the phase (shown as a select dropdown)

The form already has `tripId` in the API DTO. The dialog just needs to pass it through on submit. Add a phase select (Pre-Booking / Pre-Departure / During Travel / Post-Return / Auto) to the form.

### 7. Trip Detail Page Integration

In `apps/admin/src/app/trips/[id]/page.tsx`, replace:
```typescript
case 'tasks':
  return <EmptyState ... />
```
with:
```typescript
case 'tasks':
  return <TripTasks trip={trip} />
```

---

## Migration

```sql
-- Add phase column to tasks table
ALTER TABLE tasks ADD COLUMN phase varchar(20);

-- No backfill needed — null means auto-infer
```

Register in `_journal.json` as next sequential entry.

---

## Non-Goals (v1)

- No drag-drop between phases
- No task templates (future — Library/Automation)
- No bulk task creation from booking events (already handled by insurance task auto-creation)
- No task notifications to travelers (future — Client Portal)
- No recurring tasks
