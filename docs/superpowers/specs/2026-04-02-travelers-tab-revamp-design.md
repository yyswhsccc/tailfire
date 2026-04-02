# Travelers Tab Revamp — Design Spec

## Goal

Replace the current Travelers Tab (snapshot diff for primary traveler only) with a full traveler management hub. Agents can view, edit, and validate all travelers without leaving the trip page.

## Scope

**In scope:**
- Accordion layout showing all travelers with editable contact fields
- Travel readiness validation with per-traveler status indicators
- Red count badge on the Travelers tab showing total issues
- Relationship display between travelers on the trip
- Trip-specific settings (role, type, special requirements)
- Snapshot-only traveler handling (read-only with "Create CRM Record" promotion)

**Out of scope:**
- Add/remove travelers (existing Edit Travelers modal stays as-is)
- AI-enhanced validation beyond current `validateContactForTravel` rules
- Deep-linking to contact page sections (just link to `/contacts/:id`)
- Address validation in travel readiness (deferred — current validator only checks DOB + passport)

## Architecture

### Component Structure

```
TravelersTab (new file: trip-travelers-tab.tsx)
├── Header: "Travelers" + "Manage Travelers" button (opens existing modal)
├── Validation Summary Banner (if issues exist)
│   └── "N travelers have issues requiring attention"
├── TravelerAccordion (one per traveler, only one open at a time)
│   ├── Collapsed: Avatar | Name | Role | Type | Status (✅/⚠️/🔴 + count)
│   └── Expanded:
│       ├── TravelerEssentialsForm (first name, last name, DOB, email, phone)
│       ├── TravelerPassportForm (number, expiry, country + inline validation)
│       ├── TravelerAddressForm (collapsible — address, city, province, postal, country)
│       ├── TravelerTripSettings (role dropdown, type dropdown, special requirements)
│       ├── TravelerRelationships (read-only list + "View Full CRM Record" link)
│       └── SnapshotDiffBanner (if snapshot differs from current contact)
└── Empty State: "No travelers on this trip. Add travelers to get started."
```

### File Plan

| File | Action | Purpose |
|------|--------|---------|
| `apps/admin/src/app/trips/[id]/_components/trip-travelers-tab.tsx` | Create | Main tab component with accordion |
| `apps/admin/src/app/trips/[id]/_components/traveler-accordion-item.tsx` | Create | Single traveler accordion card with all sections |
| `apps/admin/src/app/trips/[id]/page.tsx` | Modify | Replace inline `TravelersTab` with new component, upgrade badge |
| `apps/admin/src/components/layout/detail-sidebar.tsx` | Modify | Style badge as red count pill |
| `apps/admin/src/lib/snapshot-utils.ts` | Modify | Export validation types, no logic changes |

### Data Flow

**Reading traveler data:**
- `useTripTravelers(tripId)` — returns all travelers with embedded `contact?: ContactResponseDto`
- Provides enough fields for the editable forms (name, DOB, passport, address, email, phone)
- Add `orderBy: sequenceOrder` with primary-traveler-first sort

**Editing contact fields (linked travelers):**
- Component owns local form state (initialized from `traveler.contact`)
- Auto-save on blur via `useUpdateContact` (existing hook, `PUT /contacts/:id`)
- After save: invalidate `['trip-travelers', { tripId }]` AND `['contact', contactId]` query keys (matching actual key shapes from hooks)
- Snapshot reset debounced — fires 2s after last edit (see Snapshot Handling section)

**Editing contact fields (snapshot-only travelers, no contactId):**
- Fields render as read-only with values from `traveler.contactSnapshot`
- Show "Create CRM Record" button that:
  1. Calls `useCreateContact` (`POST /contacts`) with fields mapped from snapshot
  2. On success, calls `useUpdateTripTraveler` (`PATCH /trips/:tripId/travelers/:id`) with `{ contactId }` and preserves existing `role`
  3. If step 2 fails, show error but contact is still created (agent can retry link)
  4. If traveler is primary, explicitly send `role: 'primary_contact'` to sync `trip.primaryContactId`
- Once linked, fields become editable
- Note: `CreateContactDto` requires `firstName` — ensure snapshot has it before enabling the button

**Editing trip settings:**
- `useUpdateTripTraveler` (existing hook, `PATCH /trips/:tripId/travelers/:id`)
- Role, traveler type, special requirements
- Auto-save on change (dropdowns) or blur (textarea)

**Validation:**
- Run `validateContactForTravel(contact, tripStartDate)` client-side per traveler
- Source: current contact data (not snapshot) for linked travelers, snapshot for unlinked
- Recompute after every contact save
- Current checks: DOB missing, passport missing/expired/expiring within 6 months, passport country missing

**Relationships:**
- Lazy-load via `useRelationships(contactId)` only when accordion is expanded
- Filter to show only relationships where the related contact is ALSO a traveler on this trip
- Render directionally: use `labelForContact2` when the traveler is `contact1Id`, and vice versa (not the simplified contact-page pattern)
- "View Full CRM Record" links to `/contacts/:id`

### Tab Badge

**Current:** `badge: hasTravelerChanges ? '!' : undefined`

**New:** Aggregate `error` + `warning` count from `validateContactForTravel` across all travelers.

```typescript
// Build a minimal Contact-shaped object from snapshot for validation
function contactFromSnapshot(snapshot: any): Contact {
  return {
    dateOfBirth: snapshot?.dateOfBirth || null,
    passportNumber: snapshot?.passportNumber || snapshot?.passport?.number || null,
    passportExpiry: snapshot?.passportExpiry || snapshot?.passport?.expiry || null,
    passportCountry: snapshot?.passportCountry || snapshot?.passport?.country || null,
    // ... other fields default to null
  } as Contact
}

const totalIssueCount = travelers.reduce((sum, t) => {
  const contact = t.contact || contactFromSnapshot(t.contactSnapshot)
  const validation = validateContactForTravel(contact, trip.startDate)
  return sum + validation.issues.length
}, 0)

// In sidebar config (query key from use-trip-travelers.ts):
// useTripTravelers uses queryKey: ['trip-travelers', { tripId }]
badge: totalIssueCount > 0 ? totalIssueCount.toString() : undefined
```

**Badge styling:** Update `detail-sidebar.tsx` to render numeric badges as a red pill (bg-red-500 text-white rounded-full) instead of plain text.

### Accordion Collapsed State

Each traveler row shows:

```
[Avatar/Initials]  Name  [Role Badge]  [Type]  [Status]  [Chevron]
```

- **Status indicators:**
  - `✅` green checkmark — 0 issues, travel ready
  - `⚠️` amber warning — warnings only (passport expiring)
  - `🔴` red circle + count — errors present (missing DOB, missing passport)

- **Sort order:** Primary traveler first, then by `sequenceOrder`, then by name

### Snapshot Handling

When an agent edits a contact field in the accordion:
1. Local state updates immediately (optimistic)
2. `PUT /contacts/:id` fires on blur via `useUpdateContact`
3. On success: invalidate `['trip-travelers', { tripId }]` AND `['contact', contactId]` query keys
4. Snapshot reset is **debounced** — after 2s of no edits, call `POST /trips/:tripId/travelers/:id/snapshot/reset`
5. Validation recomputes from the local state (not waiting for server)

**Why debounce snapshot reset:** The reset endpoint snapshots whatever is in the DB at call time. If the agent edits first name then immediately edits last name, two blur-saves fire. Without debounce, the reset could run between them and capture a half-edited state. Debouncing to 2s after last edit ensures all fields settle before snapshotting.

**Failure handling:** If contact save succeeds but snapshot reset fails, show a subtle "Snapshot out of sync" indicator. The agent can manually reset or it will sync on next edit.

This prevents the "edit looks unsaved" problem where snapshot-first UIs show old data.

### Edge Cases

- **No travelers:** Show empty state with prompt to use "Manage Travelers" button
- **Snapshot-only traveler (no contactId):** Read-only fields, "Create CRM Record" button
- **Deleted contact:** Show snapshot data as read-only, warn "Contact record not found"
- **Multiple validation issues:** Show count in collapsed state, detailed list in expanded passport/essentials sections
- **Concurrent edits:** Last-write-wins (existing PUT behavior), auto-save reduces window for conflicts

## Not Changing

- **Edit Travelers modal** — stays as-is for add/remove/search/role-assignment
- **Snapshot comparison logic** — `useTravelerSnapshotDiff` stays, but auto-reset after edits makes it less visible
- **Validation rules** — `validateContactForTravel` stays as-is (DOB + passport checks only)
- **Contact API** — no new endpoints needed, uses existing `PUT /contacts/:id`
- **Relationship management** — uses existing relationship dialog from contacts page (no trip-level relationships)
