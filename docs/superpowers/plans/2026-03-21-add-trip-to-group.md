# Add/Create Trip in Group — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "New Trip" and "Add Existing" buttons to the group detail page so users can create new trips within a group or add existing trips to it.

**Architecture:** Frontend-only feature with a minor backend filter extension. Extends `TripFormDialog` with `initialValues`/`redirectOnCreate`/`onCreated` props. New `AddTripToGroupDialog` component for searching and multi-selecting existing trips. Backend gets an `ungrouped` boolean filter on the trip list endpoint.

**Tech Stack:** Next.js (App Router), React Hook Form, TanStack Query, shadcn/ui, NestJS (Drizzle ORM)

**Spec:** `docs/superpowers/specs/2026-03-21-add-trip-to-group-design.md`

---

### Task 1: Backend — Add `ungrouped` filter to trip list API

**Files:**
- Modify: `packages/shared-types/src/api/trips.types.ts:256` (TripFilterDto interface)
- Modify: `apps/api/src/trips/dto/trip-filter.dto.ts:82` (after tripGroupId field)
- Modify: `apps/api/src/trips/trips.service.ts:338` (after tripGroupId filter block)

- [ ] **Step 1: Add `ungrouped` to shared TripFilterDto**

In `packages/shared-types/src/api/trips.types.ts`, add after `tripGroupId?: string` (line 273):

```typescript
  ungrouped?: boolean // Filter to trips not in any group
```

- [ ] **Step 2: Add `ungrouped` to API TripFilterDto**

In `apps/api/src/trips/dto/trip-filter.dto.ts`, add after the `tripGroupId` field (after line 84):

```typescript
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ungrouped?: boolean
```

- [ ] **Step 3: Apply `ungrouped` filter in trips.service.ts**

In `apps/api/src/trips/trips.service.ts`, add after the `tripGroupId` filter block (after line 340):

```typescript
    // Ungrouped filter — trips not in any group
    if (filters.ungrouped) {
      conditions.push(isNull(this.db.schema.trips.tripGroupId))
    }
```

Ensure `isNull` is imported from `drizzle-orm` (check existing imports at the top of the file).

- [ ] **Step 4: Pass `ungrouped` through in useTrips hook**

In `apps/admin/src/hooks/use-trips.ts`, add `ungrouped` to the `buildQueryString` call inside `useTrips()` (around line 43-54):

```typescript
      const query = buildQueryString({
        // ... existing fields ...
        ungrouped: filters.ungrouped,
      })
```

- [ ] **Step 5: Verify with curl**

```bash
# Should return only ungrouped trips
curl -s http://localhost:3101/api/v1/trips?ungrouped=true -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# Should return all trips (no filter)
curl -s http://localhost:3101/api/v1/trips -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/api/trips.types.ts apps/api/src/trips/dto/trip-filter.dto.ts apps/api/src/trips/trips.service.ts apps/admin/src/hooks/use-trips.ts
git commit -m "feat(api): add ungrouped filter to trip list endpoint

Allows filtering trips that are not assigned to any group.
Used by the add-trip-to-group dialog.

refs #46"
```

---

### Task 2: Extend TripFormDialog with initialValues, redirectOnCreate, onCreated

**Files:**
- Modify: `apps/admin/src/app/trips/_components/trip-form-dialog.tsx:80-92` (props), `:128-144` (reset effect), `:160-213` (create success)

- [ ] **Step 1: Add new props to interface**

In `apps/admin/src/app/trips/_components/trip-form-dialog.tsx`, update the `TripFormDialogProps` interface (line 80):

```typescript
interface TripFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  trip?: TripResponseDto
  /** Pre-fill form fields in create mode (merged with defaults) */
  initialValues?: Partial<TripFormValues>
  /** When false, skip router.push after creation (default: true) */
  redirectOnCreate?: boolean
  /** Callback after successful trip creation */
  onCreated?: (trip: TripResponseDto) => void
}
```

- [ ] **Step 2: Destructure new props**

Update the function signature (line 87):

```typescript
export function TripFormDialog({
  open,
  onOpenChange,
  mode,
  trip,
  initialValues,
  redirectOnCreate = true,
  onCreated,
}: TripFormDialogProps) {
```

- [ ] **Step 3: Apply initialValues in reset effect**

Update the create-mode reset in the `useEffect` (line 139-141). Replace:

```typescript
      } else if (mode === 'create') {
        form.reset(toTripDefaults())
        setSelectedTagIds([])
      }
```

With:

```typescript
      } else if (mode === 'create') {
        const defaults = toTripDefaults()
        form.reset(initialValues ? { ...defaults, ...initialValues } : defaults)
        setSelectedTagIds([])
      }
```

- [ ] **Step 4: Update create success handler**

In the `onSubmit` function, after the tags block (around line 203-213), replace the redirect block:

```typescript
        startLoading('trip-navigation', 'Opening your new trip...')
        toast({
          title: 'Trip created',
          description: 'Redirecting to your new trip...',
        })
        onOpenChange(false)
        form.reset(toTripDefaults())
        setCoverPhoto(null)
        setSelectedTagIds([])
        // Navigate to the new trip's detail page
        router.push(`/trips/${newTrip.id}`)
```

With:

```typescript
        onOpenChange(false)
        form.reset(toTripDefaults())
        setCoverPhoto(null)
        setSelectedTagIds([])

        if (redirectOnCreate) {
          startLoading('trip-navigation', 'Opening your new trip...')
          toast({
            title: 'Trip created',
            description: 'Redirecting to your new trip...',
          })
          router.push(`/trips/${newTrip.id}`)
        } else {
          onCreated?.(newTrip)
        }
```

- [ ] **Step 5: Verify existing TripFormDialog callers still work**

Check that all existing callers pass no new props (they'll get defaults):

```bash
grep -rn 'TripFormDialog' apps/admin/src/ --include='*.tsx' | grep -v '_components/trip-form-dialog.tsx'
```

All existing callers should work unchanged because `initialValues` defaults to `undefined`, `redirectOnCreate` defaults to `true`, and `onCreated` defaults to `undefined`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/trips/_components/trip-form-dialog.tsx
git commit -m "feat(admin): extend TripFormDialog with initialValues, redirectOnCreate, onCreated

Allows callers to pre-fill form fields, suppress redirect after create,
and receive a callback with the new trip. All props are optional with
backwards-compatible defaults.

refs #46"
```

---

### Task 3: Create AddTripToGroupDialog component

**Files:**
- Create: `apps/admin/src/app/trips/groups/[groupId]/_components/add-trip-to-group-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `apps/admin/src/app/trips/groups/[groupId]/_components/add-trip-to-group-dialog.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Loader2, Search, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useTrips, useAddTripsToGroup, useTripGroups } from '@/hooks/use-trips'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/use-debounce'

interface AddTripToGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  /** Trip IDs already in this group (to exclude from results) */
  existingTripIds: string[]
}

export function AddTripToGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  existingTripIds,
}: AddTripToGroupDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const addTrips = useAddTripsToGroup()

  const [search, setSearch] = useState('')
  const [includeGrouped, setIncludeGrouped] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Fetch trips — ungrouped only unless checkbox is checked
  const { data: tripsData, isLoading } = useTrips({
    search: debouncedSearch || undefined,
    limit: 20,
    ungrouped: includeGrouped ? undefined : true,
  })

  // Fetch all groups for name resolution
  const { data: groups = [] } = useTripGroups()
  const groupMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      map.set(g.id, g.name)
    }
    return map
  }, [groups])

  // Filter out trips already in this group
  const availableTrips = useMemo(() => {
    if (!tripsData?.data) return []
    return tripsData.data.filter((t) => !existingTripIds.includes(t.id))
  }, [tripsData?.data, existingTripIds])

  // Check if any selected trips are in another group
  const selectedGroupedTrips = useMemo(() => {
    return availableTrips.filter(
      (t) => selectedIds.has(t.id) && t.tripGroupId && t.tripGroupId !== groupId
    )
  }, [availableTrips, selectedIds, groupId])

  const toggleSelection = (tripId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tripId)) {
        next.delete(tripId)
      } else {
        next.add(tripId)
      }
      return next
    })
  }

  const handleSubmit = () => {
    if (selectedIds.size === 0) return
    // If any selected trips are in another group, confirm first
    if (selectedGroupedTrips.length > 0) {
      setShowConfirm(true)
    } else {
      executeAdd()
    }
  }

  const executeAdd = async () => {
    setShowConfirm(false)
    try {
      await addTrips.mutateAsync({
        groupId,
        tripIds: Array.from(selectedIds),
      })
      toast({
        title: 'Trips added',
        description: `${selectedIds.size} trip(s) added to ${groupName}.`,
      })
      // Reset and close
      setSelectedIds(new Set())
      setSearch('')
      setIncludeGrouped(false)
      onOpenChange(false)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add trips to group. Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedIds(new Set())
      setSearch('')
      setIncludeGrouped(false)
    }
    onOpenChange(isOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add Trips to Group</DialogTitle>
            <DialogDescription>
              Search and select trips to add to {groupName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search trips by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Include grouped checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-grouped"
                checked={includeGrouped}
                onCheckedChange={(checked) => setIncludeGrouped(checked === true)}
              />
              <label htmlFor="include-grouped" className="text-sm text-muted-foreground cursor-pointer">
                Include trips already in a group
              </label>
            </div>

            {/* Trip list */}
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && availableTrips.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {search ? 'No matching trips found.' : 'No ungrouped trips available.'}
                </p>
              )}
              {availableTrips.map((trip) => {
                const isSelected = selectedIds.has(trip.id)
                const inOtherGroup = trip.tripGroupId && trip.tripGroupId !== groupId
                const otherGroupName = inOtherGroup ? groupMap.get(trip.tripGroupId!) : null
                return (
                  <label
                    key={trip.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                      isSelected ? 'bg-accent/30' : ''
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(trip.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{trip.name}</span>
                        {trip.tripNumber && (
                          <span className="text-xs text-muted-foreground">{trip.tripNumber}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {trip.startDate && (
                          <span className="text-xs text-muted-foreground">
                            {trip.startDate}{trip.endDate ? ` – ${trip.endDate}` : ''}
                          </span>
                        )}
                        {trip.status && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {trip.status}
                          </Badge>
                        )}
                        {inOtherGroup && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {otherGroupName || 'Another group'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedIds.size === 0 || addTrips.isPending}
            >
              {addTrips.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
              ) : (
                `Add ${selectedIds.size || ''} Trip${selectedIds.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassignment confirmation */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move trips between groups?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGroupedTrips.length} trip(s) will be moved from their current group to {groupName}.
              This cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeAdd}>
              Move & Add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/trips/groups/\[groupId\]/_components/add-trip-to-group-dialog.tsx
git commit -m "feat(admin): add AddTripToGroupDialog component

Search-based dialog for adding existing trips to a group.
Supports multi-select, ungrouped filter, and batch reassignment
confirmation for trips already in another group.

refs #46"
```

---

### Task 4: Wire buttons into group detail page

**Files:**
- Modify: `apps/admin/src/app/trips/groups/[groupId]/page.tsx:370-423` (Trips section)

- [ ] **Step 1: Add imports at the top of the page**

In `apps/admin/src/app/trips/groups/[groupId]/page.tsx`, add imports:

```typescript
import { Plus, ListPlus } from 'lucide-react'
import { TripFormDialog } from '../../_components/trip-form-dialog'
import { AddTripToGroupDialog } from './_components/add-trip-to-group-dialog'
```

Check if `Plus` and `ListPlus` are already imported; if so, just add the missing ones.

- [ ] **Step 2: Add dialog state variables**

Inside the component function, add state (near the other state declarations):

```typescript
const [showAddTripsDialog, setShowAddTripsDialog] = useState(false)
const [showCreateTripDialog, setShowCreateTripDialog] = useState(false)
```

- [ ] **Step 3: Add the onCreated handler**

Add a handler for when a new trip is created from the group page:

```typescript
const handleTripCreated = (newTrip: TripResponseDto) => {
  queryClient.invalidateQueries({ queryKey: ['tripGroups'] })
  toast({
    title: 'Trip created',
    description: `${newTrip.name} has been added to this group.`,
  })
}
```

Ensure `TripResponseDto` is imported from `@tailfire/shared-types/api`. Check if `useQueryClient` and `queryClient` are already available; if not, add `const queryClient = useQueryClient()`.

- [ ] **Step 4: Update the Trips section header**

Replace the Trips section header (lines 372-375):

```tsx
                <h2 className="text-lg font-semibold text-ash-900 mb-4">
                  Trips ({trips?.length ?? 0})
                </h2>
```

With:

```tsx
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-ash-900">
                    Trips ({trips?.length ?? 0})
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddTripsDialog(true)}
                    >
                      <ListPlus className="h-4 w-4 mr-1" />
                      Add Existing
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowCreateTripDialog(true)}
                      className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      New Trip
                    </Button>
                  </div>
                </div>
```

- [ ] **Step 5: Add dialog components before the closing tags**

Add the dialog components inside the component return, before the closing `</>` or final `</div>`. Place them near the existing `AlertDialog` for cancel (around line 672):

```tsx
      {/* Add Existing Trips Dialog */}
      <AddTripToGroupDialog
        open={showAddTripsDialog}
        onOpenChange={setShowAddTripsDialog}
        groupId={groupId}
        groupName={group?.name || 'Group'}
        existingTripIds={trips?.map((t) => t.id) || []}
      />

      {/* Create New Trip Dialog */}
      <TripFormDialog
        open={showCreateTripDialog}
        onOpenChange={setShowCreateTripDialog}
        mode="create"
        initialValues={{
          tripGroupId: groupId,
          tripType: 'group' as const,
          ...(group?.startDate && group?.endDate ? {
            startDate: group.startDate,
            endDate: group.endDate,
          } : {}),
        }}
        redirectOnCreate={false}
        onCreated={handleTripCreated}
      />
```

- [ ] **Step 6: Verify in browser**

1. Navigate to a group detail page (e.g., `/trips/groups/<id>`)
2. Verify "Add Existing" and "New Trip" buttons appear in the Trips section header
3. Click "Add Existing" — verify the search dialog opens and shows ungrouped trips
4. Click "New Trip" — verify the trip form opens with group and dates pre-filled
5. Create a trip — verify it appears in the group's trips list without navigating away

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/trips/groups/\[groupId\]/page.tsx
git commit -m "feat(admin): add New Trip and Add Existing buttons to group detail page

Users can now create trips directly within a group (pre-filled with
group dates) or search and add existing trips. Completing the group
trip management workflow.

fixes #46"
```

---

### Task 5: Final verification and cleanup

- [ ] **Step 1: Type check**

```bash
cd apps/admin && pnpm typecheck
```

Fix any type errors (ignore pre-existing transportation-validation test errors).

- [ ] **Step 2: End-to-end verification**

1. Create a new group booking with dates
2. Click "New Trip" → verify dates pre-filled, tripType is group, group is selected
3. Create the trip → verify it appears in the group list, no redirect
4. Click "Add Existing" → verify search works, ungrouped filter works
5. Toggle "Include grouped" → verify grouped trips show with warning badge
6. Select a grouped trip → verify reassignment confirmation appears
7. Confirm → verify trip moved to this group
8. Remove a trip from group → verify it disappears

- [ ] **Step 3: Push and merge to preview**

```bash
git push -u origin feature/issue-46-trip-group-management
git checkout preview && git merge feature/issue-46-trip-group-management --no-edit && git push
git checkout feature/issue-46-trip-group-management
```

- [ ] **Step 4: Create PR**

```bash
gh pr create --base main --head feature/issue-46-trip-group-management \
  --title "feat(admin): add/create trips in group detail page" \
  --body "## Summary
- Add 'New Trip' button to group detail page (pre-fills group, dates, type)
- Add 'Add Existing' button with search dialog and multi-select
- Extend TripFormDialog with initialValues, redirectOnCreate, onCreated props
- Add ungrouped filter to trip list API endpoint

fixes #46"
```
