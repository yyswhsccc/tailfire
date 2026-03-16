# Trip Cancellation Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to cancel booked/in-progress trips via a confirmation dialog with required reason, blocking bypasses through generic update/bulk endpoints.

**Architecture:** Backend cancel endpoint already exists (`POST /trips/:id/cancel` → sets status, cancelledAt, cancellationReason, cancelledBy, cancels automation jobs, emits trip.cancelled event). This plan wires the frontend to call it via a confirmation dialog, enables the disabled cancel actions in card/table, and blocks the status-bypass in the update endpoint. No refund logic — payments are recorded only (processed at supplier). Service fees and insurance are non-refundable.

**Tech Stack:** NestJS (API), Next.js + shadcn/ui (Admin), TanStack Query (mutations), Zustand (n/a)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/admin/src/components/trips/cancel-trip-dialog.tsx` | Create | Confirmation dialog with reason field (shared by detail, card, table) |
| `apps/admin/src/app/trips/[id]/page.tsx` | Modify | Wire handleCancelTrip to open dialog |
| `apps/admin/src/hooks/use-trips.ts` | Modify | Add `useCancelTrip` mutation hook |
| `apps/admin/src/components/trips/trip-card.tsx` | Modify | Enable cancel action in dropdown |
| `apps/admin/src/components/trips/trips-data-table.tsx` | Modify | Enable cancel action in table dropdown |
| `apps/api/src/trips/trips.service.ts` | Modify | Block `cancelled` via generic update + enforce reason |
| `apps/api/src/automation/processors/client-care.processor.ts` | Modify | Skip payment reminders for cancelled trips |
| `apps/admin/src/components/trips/trips-bulk-actions.tsx` | Modify | Remove cancelled from bulk status dropdown |

---

## Chunk 1: API Guard + Frontend Hook

### Task 1: Block cancelled status via generic update/bulk

The `update()` method allows setting `status: 'cancelled'` directly, bypassing the dedicated cancel endpoint (which sets metadata + cancels jobs). Block this.

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts:522-535`

- [ ] **Step 1: Add guard in the update method's status transition block.**

In `trips.service.ts`, inside the `if (dto.status && dto.status !== existingTrip.status)` block (around line 523), add a check before the existing validation:

```typescript
// Block direct status change to 'cancelled' — must use POST /trips/:id/cancel
if (dto.status === 'cancelled') {
  throw new BadRequestException(
    'Cannot set status to cancelled via update. Use POST /trips/:id/cancel instead.'
  )
}
```

Insert this BEFORE the `canTransitionTripStatus` call.

- [ ] **Step 2: Add same guard in bulk status update.**

Find the `bulkUpdateStatus` method (around line 1030). Add the same check:

```typescript
if (newStatus === 'cancelled') {
  throw new BadRequestException(
    'Cannot set status to cancelled via bulk update. Cancel trips individually via POST /trips/:id/cancel.'
  )
}
```

- [ ] **Step 3: Typecheck.**

Run: `pnpm --filter @tailfire/api typecheck 2>&1 | grep 'error TS' | grep -v 'api-credentials\|portal-jwt'`
Expected: No new errors

- [ ] **Step 4: Commit.**

```
git add apps/api/src/trips/trips.service.ts
git commit -m "security: block cancelled status bypass via generic update/bulk endpoints"
```

---

### Task 2: Add useCancelTrip mutation hook

**Files:**
- Modify: `apps/admin/src/hooks/use-trips.ts`

- [ ] **Step 1: Add the mutation hook.**

Add after the existing `useDeleteTrip` or `useUpdateTrip` hook:

```typescript
export function useCancelTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripId, reason }: { tripId: string; reason: string }) =>
      api.post(`/trips/${tripId}/cancel`, { reason }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(variables.tripId) })
    },
  })
}
```

- [ ] **Step 2: Typecheck admin.**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Clean

- [ ] **Step 3: Commit.**

```
git add apps/admin/src/hooks/use-trips.ts
git commit -m "feat: add useCancelTrip mutation hook"
```

---

## Chunk 2: Cancel Dialog + Wiring

### Task 3: Create CancelTripDialog component

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/cancel-trip-dialog.tsx`

- [ ] **Step 1: Create the dialog component.**

```tsx
'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useCancelTrip } from '@/hooks/use-trips'

const REASON_PRESETS = [
  'Client requested cancellation',
  'Supplier unable to fulfill booking',
  'Travel advisory / force majeure',
  'Pricing or availability change',
]

interface CancelTripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  tripName: string
}

export function CancelTripDialog({
  open,
  onOpenChange,
  tripId,
  tripName,
}: CancelTripDialogProps) {
  const [reason, setReason] = useState('')
  const cancelTrip = useCancelTrip()
  const { toast } = useToast()

  const handleCancel = async () => {
    if (!reason.trim()) return

    try {
      await cancelTrip.mutateAsync({ tripId, reason: reason.trim() })
      toast({
        title: 'Trip cancelled',
        description: `"${tripName}" has been cancelled.`,
      })
      onOpenChange(false)
      setReason('')
    } catch (error: any) {
      toast({
        title: 'Failed to cancel trip',
        description: error?.message || 'An error occurred.',
        variant: 'destructive',
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Trip</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel <strong>&ldquo;{tripName}&rdquo;</strong>? This action cannot be undone. Payments recorded against this trip will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="cancel-reason">Cancellation Reason</Label>
          <div className="flex flex-wrap gap-2">
            {REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  reason === preset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            id="cancel-reason"
            placeholder="Enter or select a cancellation reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason('')}>
            Keep Trip
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={!reason.trim() || cancelTrip.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelTrip.isPending ? 'Cancelling...' : 'Cancel Trip'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Clean

- [ ] **Step 3: Commit.**

```
git add apps/admin/src/app/trips/[id]/_components/cancel-trip-dialog.tsx
git commit -m "feat: create CancelTripDialog with reason presets"
```

---

### Task 4: Wire cancel dialog into trip detail page

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Add state and import.**

Add import at top:
```typescript
import { CancelTripDialog } from './_components/cancel-trip-dialog'
```

Add state near other dialog states (around the `showDeleteDialog` state):
```typescript
const [showCancelDialog, setShowCancelDialog] = useState(false)
```

- [ ] **Step 2: Replace the handleCancelTrip placeholder.**

Replace the existing `handleCancelTrip` function:
```typescript
const handleCancelTrip = () => {
  setShowCancelDialog(true)
}
```

- [ ] **Step 3: Render the dialog.**

Add after the existing delete dialog or at the end of the JSX return:
```tsx
{trip && (
  <CancelTripDialog
    open={showCancelDialog}
    onOpenChange={setShowCancelDialog}
    tripId={trip.id}
    tripName={trip.name}
  />
)}
```

- [ ] **Step 4: Typecheck and commit.**

```
git add apps/admin/src/app/trips/[id]/page.tsx
git commit -m "feat: wire CancelTripDialog into trip detail page"
```

---

### Task 5: Enable cancel action in trip card and data table

**Files:**
- Modify: `apps/admin/src/components/trips/trip-card.tsx`
- Modify: `apps/admin/src/components/trips/trips-data-table.tsx`

- [ ] **Step 1: Update trip-card.tsx.**

The cancel dropdown item is currently disabled. Changes:
1. Import `CancelTripDialog` and `useState`
2. Add `showCancelDialog` state
3. Remove `disabled` from the DropdownMenuItem
4. Add `onClick={() => setShowCancelDialog(true)}`
5. Render `<CancelTripDialog>` at end of component
6. Only show cancel item when trip status allows cancellation (booked, in_progress) — use `canTransitionTripStatus(trip.status, 'cancelled')` from `@tailfire/shared-types`

- [ ] **Step 2: Update trips-data-table.tsx.**

Same pattern as trip-card. The cancel item is in the table row dropdown. Since each row needs its own dialog state, track `cancelTrip: { id: string, name: string } | null` state:
1. Add state: `const [cancelTrip, setCancelTrip] = useState<{ id: string; name: string } | null>(null)`
2. Remove `disabled` from DropdownMenuItem
3. Add `onClick={() => setCancelTrip({ id: trip.id, name: trip.name })}`
4. Render one `<CancelTripDialog>` at the bottom, controlled by `cancelTrip` state
5. Only show cancel item when status allows it

- [ ] **Step 3: Typecheck and commit.**

```
git add apps/admin/src/components/trips/trip-card.tsx apps/admin/src/components/trips/trips-data-table.tsx
git commit -m "feat: enable cancel action in trip card and table dropdowns"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Block cancelled bypass in update/bulk | `trips.service.ts` |
| 2 | Add `useCancelTrip` hook | `use-trips.ts` |
| 3 | Create CancelTripDialog | New component |
| 4 | Wire into trip detail page | `page.tsx` |
| 5 | Enable card/table cancel actions | `trip-card.tsx`, `trips-data-table.tsx` |

**Estimated: ~30 minutes**

After implementation: typecheck both apps, commit, push to main, sync preview.
