# Trip Tasks Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the EmptyState on the Trip Tasks tab with a lifecycle-phase-grouped task management view.

**Architecture:** New `TripTasks` component groups tasks by phase (pre-booking, pre-departure, during-travel, post-return). Phase is auto-inferred from due date vs trip dates, stored as nullable column. Reuses existing TaskCard and TaskFormDialog.

**Tech Stack:** Next.js, React, shadcn/ui, Drizzle ORM, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-24-trip-tasks-tab-design.md`

---

## File Structure

### New Files
- `packages/database/src/migrations/YYYYMMDDHHMMSS_add_task_phase.sql` — Migration
- `apps/admin/src/app/trips/[id]/_components/trip-tasks.tsx` — Main component
- `apps/admin/src/app/trips/[id]/_components/trip-tasks-phase-section.tsx` — Collapsible phase section

### Modified Files
- `packages/database/src/schema/tasks.schema.ts` — Add `phase` column
- `packages/database/src/migrations/meta/_journal.json` — Register migration
- `apps/api/src/tasks/dto/create-task.dto.ts` — Add `phase` field
- `apps/admin/src/app/tasks/_components/task-form-dialog.tsx` — Add `tripId` + `phase` props
- `apps/admin/src/app/trips/[id]/page.tsx` — Replace EmptyState with TripTasks

---

## Task 1: Database Migration — Add Phase Column

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_add_task_phase.sql`
- Modify: `packages/database/src/schema/tasks.schema.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration**

```sql
-- Add phase column to tasks table for lifecycle grouping
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase varchar(20);
```

- [ ] **Step 2: Update Drizzle schema**

In `packages/database/src/schema/tasks.schema.ts`, add to the table definition:
```typescript
phase: varchar('phase', { length: 20 }),
```

- [ ] **Step 3: Register in _journal.json**

Add the next sequential entry.

- [ ] **Step 4: Run migration locally**

```bash
cd apps/api && pnpm db:migrate
```

- [ ] **Step 5: Update DTOs**

In `apps/api/src/tasks/dto/create-task.dto.ts`, add:
```typescript
@IsOptional()
@IsEnum(['pre_booking', 'pre_departure', 'during_travel', 'post_return'])
phase?: 'pre_booking' | 'pre_departure' | 'during_travel' | 'post_return'
```

Add the same to the update DTO if it exists separately.

Ensure `TaskResponseDto` in shared-types includes `phase?: string | null`.

- [ ] **Step 6: Commit**

```
git commit -m "feat(database): add phase column to tasks table for lifecycle grouping"
```

---

## Task 2: Extend TaskFormDialog with tripId + phase

**Files:**
- Modify: `apps/admin/src/app/tasks/_components/task-form-dialog.tsx`

- [ ] **Step 1: Read the current TaskFormDialog**

Understand its props, form schema, and submit handler.

- [ ] **Step 2: Add tripId and phase props**

```typescript
interface TaskFormDialogProps {
  // ... existing props
  tripId?: string       // pre-fill trip association
  phase?: string        // pre-fill phase
}
```

- [ ] **Step 3: Add phase select to the form**

Add a select dropdown after the priority field:
```tsx
<div className="space-y-2">
  <Label>Phase</Label>
  <Select value={phase} onValueChange={setPhase}>
    <SelectTrigger>
      <SelectValue placeholder="Auto (inferred from due date)" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="auto">Auto (inferred from due date)</SelectItem>
      <SelectItem value="pre_booking">Pre-Booking</SelectItem>
      <SelectItem value="pre_departure">Pre-Departure</SelectItem>
      <SelectItem value="during_travel">During Travel</SelectItem>
      <SelectItem value="post_return">Post-Return</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 4: Include tripId and phase in submit**

In the form submit handler, include `tripId` and `phase` (if not "auto") in the API payload.

- [ ] **Step 5: Commit**

```
git commit -m "feat(admin): extend TaskFormDialog with tripId and phase props"
```

---

## Task 3: TripTasksPhaseSection Component

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/trip-tasks-phase-section.tsx`

- [ ] **Step 1: Create the collapsible phase section**

Props:
```typescript
interface TripTasksPhaseSectionProps {
  phase: string          // 'pre_booking' | 'pre_departure' | 'during_travel' | 'post_return'
  label: string          // 'Pre-Booking' | etc.
  tasks: TaskResponseDto[]
  defaultOpen?: boolean
  onEditTask: (task: TaskResponseDto) => void
  onCompleteTask: (taskId: string) => void
}
```

Renders:
- Collapsible header with phase label, pending count badge, chevron toggle
- TaskCard for each task (pending first sorted by dueDate, completed at bottom muted)
- Empty state text when no tasks in phase

Use shadcn `Collapsible` component.

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add TripTasksPhaseSection collapsible component"
```

---

## Task 4: TripTasks Main Component

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/trip-tasks.tsx`

- [ ] **Step 1: Create the main component**

```typescript
interface TripTasksProps {
  trip: TripWithDetailsResponseDto
}
```

This component:
1. Fetches tasks via `useTasks({ tripId: trip.id })` (or whatever the existing hook is — check `apps/admin/src/hooks/`)
2. Groups tasks by phase using `inferPhase()` utility
3. Renders 4 `TripTasksPhaseSection` components
4. Has "+ New Task" button that opens TaskFormDialog with `tripId` pre-filled
5. Has edit handler that opens TaskFormDialog with existing task data

Phase inference utility (inline or separate):
```typescript
function inferPhase(
  taskPhase: string | null,
  dueDate: string | null,
  tripStartDate: string | null,
  tripEndDate: string | null,
): string {
  if (taskPhase) return taskPhase // explicit override
  if (!dueDate) return 'post_return'
  const due = new Date(dueDate)
  if (tripStartDate && due < new Date(tripStartDate)) return 'pre_departure'
  if (tripStartDate && tripEndDate && due >= new Date(tripStartDate) && due <= new Date(tripEndDate)) return 'during_travel'
  return 'post_return'
}
```

Phase labels:
```typescript
const PHASES = [
  { id: 'pre_booking', label: 'Pre-Booking' },
  { id: 'pre_departure', label: 'Pre-Departure' },
  { id: 'during_travel', label: 'During Travel' },
  { id: 'post_return', label: 'Post-Return' },
]
```

- [ ] **Step 2: Check existing task hooks**

Read `apps/admin/src/hooks/` for any `useTasks` hook. If none exists, create a simple React Query hook:
```typescript
const { data: tasks } = useQuery({
  queryKey: ['tasks', { tripId: trip.id }],
  queryFn: () => api.get(`/tasks?tripId=${trip.id}`),
})
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add TripTasks component with lifecycle phase grouping"
```

---

## Task 5: Wire Into Trip Detail Page

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Import TripTasks**

```typescript
import { TripTasks } from './_components/trip-tasks'
```

- [ ] **Step 2: Replace EmptyState**

Change:
```typescript
case 'tasks':
  // falls through to EmptyState
```

To:
```typescript
case 'tasks':
  return <TripTasks trip={trip} />
```

Make sure `tasks` no longer falls through to the EmptyState block.

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): wire TripTasks into trip detail page, replacing EmptyState"
```

---

## Task 6: Integration Test + Push

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -E "task|phase" | head -5
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -E "task|trip-tasks" | head -5
```

- [ ] **Step 2: Manual test**

1. Open a trip → click Tasks tab → verify phase sections render
2. Click "+ New Task" → verify dialog opens with tripId pre-filled
3. Create a task with due date before trip start → verify it appears in Pre-Departure
4. Create a task with no due date → verify it appears in Post-Return
5. Complete a task → verify it moves to bottom of its section, muted
6. Set explicit phase → verify it stays in that phase regardless of due date

- [ ] **Step 3: Push**

```bash
git push origin main
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
