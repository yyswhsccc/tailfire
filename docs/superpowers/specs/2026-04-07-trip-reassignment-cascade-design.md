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

### Modified Endpoint: `PATCH /trips/:id/owner`

Currently: Sets `trips.ownerId` only.

**Enhancement:** After setting trip owner, cascade to traveler contacts:

```
1. Update trips.ownerId = newOwnerId
2. Get all trip_travelers for this trip → get contact IDs
3. For each contact:
   a. If contact.ownerId IS NULL → SET contact.ownerId = newOwnerId
   b. If contact.ownerId exists → check user_profiles.status for that owner
      - If status != 'active' → SET contact.ownerId = newOwnerId
      - If status == 'active' → skip (add to skipped list)
4. Return { tripsReassigned: 1, contactsAssigned: N, contactsSkipped: [...] }
```

### New Endpoint: `POST /admin/trips/bulk-reassign/preview`

**Input:** `{ tripIds: string[], newOwnerId: string }`
**Output:**
```typescript
{
  tripsCount: number
  contactsToAssign: { id: string, name: string, reason: 'unowned' | 'inactive_owner' }[]
  contactsToSkip: { id: string, name: string, currentOwnerName: string }[]
}
```

Dry-run only — no mutations. Computes what would happen.

### New Endpoint: `POST /admin/trips/bulk-reassign`

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
| `packages/shared-types/src/api/trips.types.ts` | Add BulkReassign DTOs |
| `apps/api/src/trips/trips.service.ts` | Add `reassignWithCascade()`, `bulkReassignPreview()`, `bulkReassign()` methods |
| `apps/api/src/trips/trips.controller.ts` | Modify `PATCH /:id/owner`, add `POST /admin/trips/bulk-reassign/preview` and `POST /admin/trips/bulk-reassign` |

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
