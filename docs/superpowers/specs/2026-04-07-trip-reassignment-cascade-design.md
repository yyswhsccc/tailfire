# Trip Reassignment with Contact Cascade Design

**Date:** 2026-04-07
**Goal:** Allow admins to reassign trips (single and bulk) to agents, with automatic cascade to traveler contacts.

---

## Policy

| Scenario | Action |
|----------|--------|
| Contact has **no owner** (agency-wide) | Assign to new agent |
| Contact owner is **inactive** | Reassign to new agent |
| Contact owner is **active** (any agent, including different) | Leave as-is |

---

## Single Trip Reassign (Trip Overview Page)

The "Assigned Agent" selector already exists on the trip overview settings card (built during pilot rollout). Currently it only changes `trips.ownerId`.

**Enhancement:**
- After changing trip owner via `PATCH /trips/:id/owner`, the backend cascades to traveler contacts using the policy above
- API returns a summary: `{ tripsReassigned: 1, contactsAssigned: N, contactsSkipped: [{ contactName, currentOwner }] }`
- Frontend shows a toast: "Trip reassigned. N contacts assigned to [Agent Name]" + if any skipped: "N contacts unchanged (owned by active agents)"

---

## Bulk Trip Reassign (Trips List Page)

### UI Flow

1. Admin selects multiple trips via table checkboxes
2. Clicks **"Reassign"** button in bulk actions toolbar
3. **Reassign Dialog** opens:
   - Agent selector dropdown (all active users)
   - **Preview** button → calls `POST /admin/trips/bulk-reassign/preview`
   - Preview shows:
     - "N trips will be reassigned to [Agent Name]"
     - "N contacts will be assigned (currently unowned or owned by inactive agents)"
     - "N contacts will NOT be reassigned:" + list with contact name and current active owner
   - **"Confirm Reassign"** button
4. On confirm → calls `POST /admin/trips/bulk-reassign`
5. Shows result summary dialog/toast

### Bulk Actions Toolbar Addition

Add "Reassign" button alongside existing bulk actions (tag, status, delete, merge, create-trip). Only visible to admin users.

---

## Backend

### Prerequisite: Consolidate Owner-Change Logic

> **Codex finding:** The trip overview UI currently uses generic `PATCH /trips/:id` (which allows ownerId changes without admin check), not the dedicated `PATCH /trips/:id/owner`. The dedicated endpoint also misses collaborator sync logic that the generic update does.

**Fix first:**
1. Extract a shared `reassignTripOwner(tripId, newOwnerId, auth)` method in `trips.service.ts`
2. This method: updates ownerId, syncs lead collaborator, cascades to contacts, returns summary
3. Both `PATCH /trips/:id/owner` (admin-only) and generic `PATCH /trips/:id` (when ownerId changes) call this method
4. **Remove ownerId from `UpdateTripDto`** for non-admin users — only admins can change trip ownership
5. Use a **transaction** for the trip update + contact cascade

### Contact Collection for Cascade

Collect contacts via `UNION DISTINCT`:
- `trip_travelers.contact_id` (all travelers on the trip)
- `trips.primary_contact_id` (if set)
- **Exclude** `trip_travelers.emergency_contact_id`

Deduplicate across trips in bulk operations — report unique contacts, not per-trip rows.

### Inactive Owner Definition

A contact owner is considered **inactive** if:
- `user_profiles.status != 'active'` OR `user_profiles.isActive = false`

### Modified Endpoint: `PATCH /trips/:id/owner`

Uses the shared `reassignTripOwner()` method. Returns:

```typescript
{
  trip: TripResponseDto
  cascade: {
    contactsAssigned: number
    contactsSkipped: { contactName: string, currentOwner: string }[]
  }
}
```

### New Endpoint: `POST /trips/bulk-reassign/preview` (@AdminOnly)

**Input:** `{ tripIds: string[], newOwnerId: string }`
**Output:**
```typescript
{
  tripsCount: number
  contactsToAssign: { id: string, name: string, reason: 'unowned' | 'inactive_owner' }[]
  contactsToSkip: { id: string, name: string, currentOwnerName: string }[]
}
```

Dry-run only — no mutations. Reports unique contacts across all selected trips.

### New Endpoint: `POST /trips/bulk-reassign` (@AdminOnly)

**Input:** `{ tripIds: string[], newOwnerId: string }`
**Output:**
```typescript
{
  tripsReassigned: number
  contactsAssigned: number
  contactsSkipped: { contactName: string, currentOwner: string }[]
}
```

Admin-only. Executes the reassignment for all trips + cascades to contacts.

### New DTO

```typescript
export interface BulkReassignTripsDto {
  tripIds: string[]
  newOwnerId: string
}

export interface BulkReassignPreviewDto {
  tripsCount: number
  contactsToAssign: { id: string; name: string; reason: 'unowned' | 'inactive_owner' }[]
  contactsToSkip: { id: string; name: string; currentOwnerName: string }[]
}

export interface BulkReassignResultDto {
  tripsReassigned: number
  contactsAssigned: number
  contactsSkipped: { contactName: string; currentOwner: string }[]
}
```

---

## Files

### Backend
| File | Change |
|------|--------|
| `packages/shared-types/src/api/trips.types.ts` | Add BulkReassign DTOs, remove ownerId from UpdateTripDto for non-admin |
| `apps/api/src/trips/trips.service.ts` | Extract shared `reassignTripOwner()`, add `bulkReassignPreview()`, `bulkReassign()` |
| `apps/api/src/trips/trips.controller.ts` | Modify `PATCH /:id/owner`, add `POST /trips/bulk-reassign/preview` and `POST /trips/bulk-reassign` (@AdminOnly), gate ownerId in generic update |

### Frontend
| File | Change |
|------|--------|
| `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx` | Show toast with cascade summary after owner change |
| `apps/admin/src/app/trips/_components/bulk-reassign-dialog.tsx` | New dialog with agent selector, preview, confirm |
| `apps/admin/src/app/trips/page.tsx` or bulk toolbar | Add "Reassign" button to bulk actions |
| `apps/admin/src/hooks/use-trips.ts` | Add bulk reassign preview + execute mutations |

---

## Success Criteria

- [ ] Single trip reassign cascades to unowned/inactive-owner contacts
- [ ] Single reassign shows toast summary with assigned/skipped counts
- [ ] Bulk reassign preview shows what will happen before confirming
- [ ] Bulk reassign preview lists skipped contacts with their active owner names
- [ ] Bulk reassign executes and shows result summary
- [ ] Active-owner contacts are never reassigned
- [ ] Admin-only access on bulk endpoints
