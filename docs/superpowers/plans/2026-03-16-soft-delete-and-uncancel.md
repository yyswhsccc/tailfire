# Soft-Delete + Admin Un-Cancel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert trip delete from hard to soft-delete (admin can restore), and allow admins to un-cancel trips (restore to previous status).

**Architecture:** Add `deleted_at`/`deleted_by` columns for soft-delete and `status_before_cancel` for un-cancel. Convert existing `.delete()` calls to flag updates. Add admin-only restore/un-cancel endpoints. Add "Deleted" filter and restore/un-cancel actions to admin UI.

**Tech Stack:** NestJS, Drizzle ORM, Next.js, shadcn/ui

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/database/src/migrations/20260316120000_soft_delete_and_uncancel.sql` | Create | Add deleted_at, deleted_by, status_before_cancel columns |
| `packages/database/src/migrations/meta/_journal.json` | Modify | Register new migration |
| `packages/database/src/schema/trips.schema.ts` | Modify | Add new columns to Drizzle schema |
| `apps/api/src/trips/trips.service.ts` | Modify | Convert delete to soft-delete, add restore + un-cancel methods |
| `apps/api/src/trips/trips.controller.ts` | Modify | Add restore + un-cancel endpoints |
| `packages/shared-types/src/api/trips.types.ts` | Modify | Add restore/un-cancel DTOs, add deleted fields to response |
| `packages/shared-types/src/api/trip-status-transitions.ts` | Modify | Allow cancelled → previous status for un-cancel |
| `apps/admin/src/hooks/use-trips.ts` | Modify | Add useRestoreTrip, useUncancelTrip hooks |
| `apps/admin/src/components/trips/trips-data-table.tsx` | Modify | Add Restore/Un-cancel actions, Deleted filter |
| `apps/admin/src/components/trips/trip-card.tsx` | Modify | Add Un-cancel action for admin |
| `apps/admin/src/app/trips/[id]/page.tsx` | Modify | Add Un-cancel button for admin on cancelled trips |

---

## Chunk 1: Database Migration + Schema

### Task 1: Create migration

**Files:**
- Create: `packages/database/src/migrations/20260316120000_soft_delete_and_uncancel.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration file.**

```sql
-- Soft-delete columns for trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Store previous status before cancellation (for un-cancel)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS status_before_cancel VARCHAR(20);

-- Index for efficient soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_trips_deleted_at ON trips(deleted_at) WHERE deleted_at IS NOT NULL;
```

- [ ] **Step 2: Add to _journal.json** — add entry with next sequential idx.

- [ ] **Step 3: Update Drizzle schema.**

In `packages/database/src/schema/trips.schema.ts`, add after `cancelledBy`:
```typescript
deletedAt: timestamp('deleted_at', { withTimezone: true }),
deletedBy: uuid('deleted_by'),
statusBeforeCancel: varchar('status_before_cancel', { length: 20 }),
```

- [ ] **Step 4: Run migration locally.**

Run: `cd apps/api && pnpm db:migrate`

- [ ] **Step 5: Commit.**

---

## Chunk 2: API — Soft-Delete + Restore + Un-Cancel

### Task 2: Convert delete to soft-delete

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`

- [ ] **Step 1: Update the `remove()` method (line ~816).**

Replace the `.delete()` call with a soft-delete update:
```typescript
// Was: await this.db.client.delete(this.db.schema.trips).where(and(...conditions))
// Now:
await this.db.client
  .update(this.db.schema.trips)
  .set({
    deletedAt: new Date(),
    deletedBy: ownerId || null,
    updatedAt: new Date(),
  })
  .where(and(...conditions))
```

- [ ] **Step 2: Update `bulkDelete()` similarly** — replace `.delete()` with soft-delete update.

- [ ] **Step 3: Update `findAll()` to exclude soft-deleted by default.**

Add a default filter in `findAll()` before other conditions:
```typescript
// Always exclude soft-deleted trips unless explicitly requested
if (!filters.includeDeleted) {
  conditions.push(isNull(this.db.schema.trips.deletedAt))
}
```

Add `isNull` to drizzle-orm imports if not already there.

- [ ] **Step 4: Update `findOne()` / detail to exclude soft-deleted** unless the caller is admin requesting deleted.

- [ ] **Step 5: Commit.**

---

### Task 3: Store previousStatus on cancel

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`

- [ ] **Step 1: In the `cancelTrip()` method, save the previous status.**

In the `.update().set()` call, add:
```typescript
statusBeforeCancel: existingTrip.status,
```

- [ ] **Step 2: Commit.**

---

### Task 4: Add restore and un-cancel endpoints

**Files:**
- Modify: `apps/api/src/trips/trips.controller.ts`
- Modify: `apps/api/src/trips/trips.service.ts`
- Modify: `packages/shared-types/src/api/trips.types.ts`

- [ ] **Step 1: Add restore endpoint (admin-only).**

Controller:
```typescript
@UseGuards(AdminGuard)
@Post(':id/restore')
async restoreTrip(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
): Promise<TripResponseDto> {
  return this.tripsService.restoreTrip(id, auth.userId)
}
```

Service method:
```typescript
async restoreTrip(id: string, actorId: string): Promise<TripResponseDto> {
  const [trip] = await this.db.client
    .select()
    .from(this.db.schema.trips)
    .where(eq(this.db.schema.trips.id, id))
    .limit(1)

  if (!trip) throw new NotFoundException(`Trip with ID ${id} not found`)
  if (!trip.deletedAt) throw new BadRequestException('Trip is not deleted')

  const [restored] = await this.db.client
    .update(this.db.schema.trips)
    .set({
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(this.db.schema.trips.id, id))
    .returning()

  this.eventEmitter.emit('audit.updated', {
    entityType: 'trip',
    entityId: id,
    action: 'restored',
    actorId,
    changes: { restored: true },
  })

  return this.mapToResponseDto(restored)
}
```

- [ ] **Step 2: Add un-cancel endpoint (admin-only).**

Controller:
```typescript
@UseGuards(AdminGuard)
@Post(':id/uncancel')
async uncancelTrip(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
): Promise<TripResponseDto> {
  return this.tripsService.uncancelTrip(id, auth.userId)
}
```

Service method:
```typescript
async uncancelTrip(id: string, actorId: string): Promise<TripResponseDto> {
  const [trip] = await this.db.client
    .select()
    .from(this.db.schema.trips)
    .where(eq(this.db.schema.trips.id, id))
    .limit(1)

  if (!trip) throw new NotFoundException(`Trip with ID ${id} not found`)
  if (trip.status !== 'cancelled') throw new BadRequestException('Trip is not cancelled')

  const restoreStatus = trip.statusBeforeCancel || 'draft'

  const [restored] = await this.db.client
    .update(this.db.schema.trips)
    .set({
      status: restoreStatus,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
      statusBeforeCancel: null,
      lastStatusChangeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(this.db.schema.trips.id, id))
    .returning()

  // Re-schedule automation jobs if trip has dates
  if (restored.startDate && restored.endDate) {
    await this.scheduleStatusTransitions(
      restored.id,
      restored.startDate,
      restored.endDate,
      restored.timezone || 'America/Toronto',
      restoreStatus,
    )
  }

  this.eventEmitter.emit('audit.updated', {
    entityType: 'trip',
    entityId: id,
    action: 'status_changed',
    actorId,
    changes: { status: restoreStatus, previousStatus: 'cancelled', uncancelled: true },
  })

  return this.mapToResponseDto(restored)
}
```

- [ ] **Step 3: Add AdminGuard import** if not already present in controller.

- [ ] **Step 4: Update shared types** — add `deletedAt`, `deletedBy`, `statusBeforeCancel` to trip response DTO if not already there.

- [ ] **Step 5: Typecheck and commit.**

---

## Chunk 3: Frontend — Admin Actions

### Task 5: Add mutation hooks

**Files:**
- Modify: `apps/admin/src/hooks/use-trips.ts`

- [ ] **Step 1: Add useRestoreTrip and useUncancelTrip hooks.**

```typescript
export function useRestoreTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
    },
  })
}

export function useUncancelTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/uncancel`),
    onSuccess: (_data, tripId) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) })
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
    },
  })
}
```

- [ ] **Step 2: Commit.**

---

### Task 6: Add Un-cancel to trip detail page

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Add Un-cancel button for admins on cancelled trips.**

When `trip.status === 'cancelled'` and user is admin, show an "Un-cancel Trip" button in the header area (near the existing Cancel button). Use `useUncancelTrip` hook. Show a simple confirmation toast, no dialog needed.

```tsx
const uncancelTrip = useUncancelTrip()
const { user } = useAuth() // or however auth context is accessed

// In the header actions area, when trip is cancelled:
{trip.status === 'cancelled' && user?.role === 'admin' && (
  <Button
    variant="outline"
    onClick={async () => {
      await uncancelTrip.mutateAsync(trip.id)
      toast({ title: 'Trip restored', description: `Status set back to ${trip.statusBeforeCancel || 'draft'}.` })
    }}
    disabled={uncancelTrip.isPending}
  >
    {uncancelTrip.isPending ? 'Restoring...' : 'Un-cancel Trip'}
  </Button>
)}
```

- [ ] **Step 2: Commit.**

---

### Task 7: Add Restore/Un-cancel to table and card dropdowns

**Files:**
- Modify: `apps/admin/src/components/trips/trips-data-table.tsx`
- Modify: `apps/admin/src/components/trips/trip-card.tsx`

- [ ] **Step 1: In data table, add Un-cancel action for cancelled trips (admin only).**

When `trip.status === 'cancelled'` and user is admin, show "Un-cancel" in the dropdown. Use `useUncancelTrip`.

- [ ] **Step 2: In data table, add Restore action for deleted trips (admin only).**

When trip has `deletedAt` and user is admin, show "Restore" action. Use `useRestoreTrip`. This only appears in the "Deleted" filter view.

- [ ] **Step 3: Same for trip card.**

- [ ] **Step 4: Add "Deleted" as a filter option in the Status filter** so admins can view soft-deleted trips. This requires passing `includeDeleted: true` to the API when the filter is active.

- [ ] **Step 5: Typecheck and commit.**

---

## Summary

| Task | What | Admin Only? |
|------|------|-------------|
| 1 | Migration: deleted_at, deleted_by, status_before_cancel | N/A |
| 2 | Convert hard delete to soft-delete | No (all users) |
| 3 | Store previousStatus on cancel | No (automatic) |
| 4 | Restore + un-cancel endpoints | Yes (AdminGuard) |
| 5 | Mutation hooks | N/A |
| 6 | Un-cancel button on trip detail | Yes (admin check) |
| 7 | Table/card actions + Deleted filter | Yes (admin check) |

**Estimated: ~60 minutes**
