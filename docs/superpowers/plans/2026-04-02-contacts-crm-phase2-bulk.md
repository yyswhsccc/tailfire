# Contacts CRM Portal — Phase 2: Bulk Operations + Filters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk actions toolbar (tag, status change, delete, create trip), expanded filter panel (type, status, active, passport), and the create-trip-from-contacts flow.

**Architecture:** New `BulkActionsToolbar` component with popover-based actions. Expanded filter panel adds 4 new filter types. Create-trip flow embeds `TripFormDialog` on the contacts page with `onCreated` callback that auto-adds travelers. All bulk mutations are client-side loops over existing endpoints (no new bulk API endpoints needed for Phase 2).

**Tech Stack:** React, shadcn/ui (Popover, Command, Select, Dialog), React Query mutations, TripFormDialog

**Spec:** `docs/superpowers/specs/2026-04-02-contacts-crm-portal-design.md`

---

### Task 1: Expand filter panel with type, status, active, passport filters

The filter panel currently only has tags. Add 4 more filters.

**Files:**
- Rewrite: `apps/admin/src/app/contacts/_components/contacts-filter-panel.tsx`

- [ ] **Step 1: Rewrite the filter panel**

Add these filters alongside existing tags filter:

1. **Contact Type** — Select with "All", "Lead", "Client" options. Sets `filters.contactType`.
2. **Contact Status** — Multi-select Popover (same pattern as tags). Shows 7 statuses with checkboxes. Sets `filters.contactStatus` as string array.
3. **Active/Inactive** — Toggle/Select with "Active" (default), "Inactive", "All". Sets `filters.isActive`.
4. **Passport** — Select with "All", "Has Passport", "Expiring Soon". Sets `filters.hasPassport` or `filters.passportExpiring`.

**Props interface stays the same:**
```typescript
interface ContactsFilterPanelProps {
  filters: ContactFilterDto
  onFiltersChange: (filters: ContactFilterDto) => void
}
```

**Layout:** Horizontal row of filter buttons (same as current), each opens a Popover or is a Select. "Clear Filters" button at end shows active filter count.

**Status filter uses same multi-select Popover pattern as tags:**
```typescript
const STATUS_OPTIONS = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'traveling', label: 'Traveling' },
  { value: 'returned', label: 'Returned' },
  { value: 'awaiting_next', label: 'Awaiting Next' },
  { value: 'inactive', label: 'Inactive' },
]
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/contacts/_components/contacts-filter-panel.tsx
git commit -m "feat(admin): expand contacts filter panel with type, status, active, passport

Adds Contact Type, Contact Status (multi-select), Active/Inactive,
and Passport Status filters alongside existing tags filter."
```

---

### Task 2: Create TagAssignPopover component

Popover for bulk-assigning tags to selected contacts. Shows existing tags with checkboxes + ability to create new tags. Handles the merge logic (since the API is replace-style PUT).

**Files:**
- Create: `apps/admin/src/app/contacts/_components/tag-assign-popover.tsx`

- [ ] **Step 1: Create the component**

**Props:**
```typescript
interface TagAssignPopoverProps {
  selectedContactIds: string[]
  onComplete: () => void  // Called after tagging is done (to deselect)
}
```

**Behavior:**
- Opens a Popover with Command/CommandInput for searching tags
- Fetches available tags via `useContactFilterOptions()`
- Shows tags as checkboxes (check = will be added to all selected contacts)
- "Create New Tag" option at bottom (type name, creates inline)
- "Apply" button that:
  1. For each selected contact, fetches current tags (GET), merges new tags, calls PUT
  2. Shows progress (N of M)
  3. On complete, calls `onComplete()` and closes
- Uses `useQueryClient` to invalidate contact queries after

**Key import:** Tags API is `PUT /contacts/:contactId/tags` with `{ tagIds: string[] }`. This REPLACES all tags. So to ADD tags, we must:
1. Fetch current contact tags
2. Merge selected new tags
3. PUT the merged set

For bulk, this means N contacts × (GET + PUT) = 2N API calls. Show a progress indicator.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/contacts/_components/tag-assign-popover.tsx
git commit -m "feat(admin): create TagAssignPopover for bulk tag assignment

Merge-style tag assignment (fetch current + merge + PUT) since the API
uses replace semantics. Shows progress for bulk operations."
```

---

### Task 3: Create BulkActionsToolbar component

The main toolbar that appears when contacts are selected.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/bulk-actions-toolbar.tsx`

- [ ] **Step 1: Create the component**

**Props:**
```typescript
interface BulkActionsToolbarProps {
  selectedIds: Set<string>
  onDeselect: () => void
  onCreateTrip: () => void  // Opens TripFormDialog
}
```

**Layout (sticky bar):**
```
[☑ 12 selected]  [🏷 Tag]  [📊 Status]  [🗑 Delete]  [✈ Create Trip]  [✕ Deselect]
```

**Actions:**

1. **Tag** — Opens `TagAssignPopover` (created in Task 2)

2. **Status** — Opens a Select dropdown with 7 status options. On select:
   - For each selected contact, call `PATCH /contacts/:id/status` with `{ status: newStatus }`
   - Use existing `useUpdateContact` or create inline mutation
   - Show toast on completion: "N contacts updated to {status}"
   - Deselect all after

3. **Delete** — Opens AlertDialog confirmation: "Delete N contacts? This action cannot be undone."
   - On confirm: loop `useDeleteContact().mutateAsync(id)` for each selected contact
   - Show progress toast
   - Deselect all after
   - Invalidate contact queries

4. **Create Trip** — Calls `onCreateTrip()` (parent handles the dialog)

5. **Deselect** — Calls `onDeselect()` to clear selection

**Styling:** `bg-blue-50 border border-blue-200 rounded-lg px-4 py-2` — matches the selection indicator from Phase 1 but replaces it.

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/contacts/_components/bulk-actions-toolbar.tsx
git commit -m "feat(admin): create BulkActionsToolbar for contacts

Bulk tag, status change, delete, and create trip actions.
Appears when 1+ contacts selected. Progress indicators for bulk ops."
```

---

### Task 4: Add create-trip-from-contacts flow

Embed TripFormDialog on the contacts page. After trip creation, auto-add selected contacts as travelers.

**Files:**
- Modify: `apps/admin/src/app/contacts/page.tsx`

- [ ] **Step 1: Add TripFormDialog state and rendering**

In `page.tsx`, add:

```typescript
import { TripFormDialog } from '@/app/trips/_components/trip-form-dialog'
import { useCreateTripTraveler } from '@/hooks/use-trip-travelers'
```

State:
```typescript
const [showCreateTrip, setShowCreateTrip] = useState(false)
```

Note: `useCreateTripTraveler` requires a tripId, but we don't have it until the trip is created. So we need to use the mutation directly or create travelers in the `onCreated` callback with a dynamic tripId.

**onCreated callback:**
```typescript
const handleTripCreated = useCallback(async (newTrip: TripResponseDto) => {
  const contactIds = Array.from(selectedIds)

  for (let i = 0; i < contactIds.length; i++) {
    try {
      await api.post(`/trips/${newTrip.id}/travelers`, {
        contactId: contactIds[i],
        role: i === 0 ? 'primary_contact' : 'full_access',
        isPrimaryTraveler: i === 0,
        travelerType: 'adult',
      })
    } catch (err) {
      console.error(`Failed to add traveler ${contactIds[i]}:`, err)
    }
  }

  toast({
    title: 'Trip created',
    description: `${newTrip.name} created with ${contactIds.length} traveler${contactIds.length !== 1 ? 's' : ''}`,
  })

  setSelectedIds(new Set())
  setShowCreateTrip(false)
  router.push(`/trips/${newTrip.id}?tab=travelers`)
}, [selectedIds, toast, router])
```

**Render TripFormDialog:**
```typescript
<TripFormDialog
  open={showCreateTrip}
  onOpenChange={setShowCreateTrip}
  mode="create"
  redirectOnCreate={false}
  onCreated={handleTripCreated}
/>
```

- [ ] **Step 2: Wire BulkActionsToolbar into page**

Replace the current selection indicator banner (lines ~193-203) with `BulkActionsToolbar`:

```typescript
{selectedIds.size > 0 && (
  <BulkActionsToolbar
    selectedIds={selectedIds}
    onDeselect={() => setSelectedIds(new Set())}
    onCreateTrip={() => setShowCreateTrip(true)}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/contacts/page.tsx
git commit -m "feat(admin): add create-trip-from-contacts flow + bulk toolbar

TripFormDialog embedded on contacts page. After trip creation, auto-adds
selected contacts as travelers (first = primary). Bulk actions toolbar
replaces selection indicator."
```

---

### Task 5: Final build and PR

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/contacts-crm-phase2
gh pr create --base main --title "feat(admin): Contacts CRM Portal — Phase 2: Bulk Operations + Filters"
```

- [ ] **Step 3: Test locally**

1. Select 3+ contacts → bulk toolbar appears
2. Click Tag → popover with tag search/select → Apply → tags added
3. Click Status → dropdown → select "Quoted" → contacts updated
4. Click Delete → confirmation → contacts soft-deleted
5. Click Create Trip → TripFormDialog opens → create trip → redirects to trip with travelers
6. Test each new filter: Type (Lead/Client), Status (multi-select), Active/Inactive, Passport

- [ ] **Step 4: Push to preview**

Merge to preview, verify on tf-demo.
