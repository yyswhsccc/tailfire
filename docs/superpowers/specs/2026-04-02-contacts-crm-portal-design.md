# Contacts CRM Portal — Design Spec

## Goal

Transform the contacts list page from a basic table into a full CRM pipeline portal with dual views (table + kanban), bulk operations, smart columns, and relationship indicators.

## Scope

**In scope:**
- Dual view toggle: enhanced table (default) + kanban pipeline
- Smart table columns: status, type, next trip, birthday, relationship indicator, phone
- Bulk operations toolbar: tag, status change, delete/archive, create trip from contacts
- Kanban board with 7 contactStatus columns, drag-to-change-status, hide/show columns
- Expanded filter panel: contact type, contact status, active/inactive, passport status
- Sortable columns via column header clicks
- Relationship indicator with tooltip + click-to-manage

**Out of scope (Phase 2):**
- Bulk CSV export
- Bulk email/SMS
- Bulk add to existing trip
- Duplicate detection/merge
- Inline table editing
- Contact source tracking
- Email/SMS integration improvements
- Profile photo upload

## Architecture

### Component Structure

```
ContactsPage (page.tsx — revamped)
├── ContactsHeader
│   ├── Title + count
│   ├── View toggle (Table / Kanban) — reuse trip page's RadioGroup pattern
│   ├── New Contact button
│   └── Bulk Actions Toolbar (visible when selection > 0)
│       ├── "N selected" count
│       ├── Tag button → TagAssignPopover
│       ├── Status button → StatusChangeDropdown
│       ├── Delete button → ConfirmDialog
│       ├── Create Trip button → navigates with contact IDs
│       └── Deselect All
├── ContactsFilterPanel (enhanced)
│   ├── Search (existing)
│   ├── Tags multi-select (existing)
│   ├── Contact Type filter (Lead / Client)
│   ├── Contact Status multi-select (7 statuses)
│   ├── Active/Inactive toggle
│   ├── Passport status filter (has passport, expiring)
│   └── Clear Filters
├── ContactsTable (enhanced — default view)
│   ├── Column: ☐ checkbox (bulk select)
│   ├── Column: Name (avatar + first + last, sortable, clickable)
│   ├── Column: Status (contactStatus badge, color-coded)
│   ├── Column: Type (Lead / Client badge)
│   ├── Column: Email (sortable)
│   ├── Column: Phone
│   ├── Column: Next Trip (trip name + date from contact trips)
│   ├── Column: Birthday (dateOfBirth, highlight if this month)
│   ├── Column: 👥 Relationships (count + tooltip + click)
│   ├── Column: Tags (badges, up to 3 + overflow)
│   └── Pagination (existing)
└── ContactsKanban (new — toggle view)
    ├── Column visibility controls (hide/show, persisted in localStorage)
    ├── 7 columns: Prospecting | Quoted | Booked | Traveling | Returned | Awaiting Next | Inactive
    ├── Drag-and-drop between columns (changes contactStatus)
    ├── ContactKanbanCard per contact
    │   ├── Avatar + Name (clickable)
    │   ├── Email
    │   ├── Tags (up to 2)
    │   ├── Relationship indicator (👥 count + tooltip)
    │   └── Next trip date
    └── Column headers with contact count
```

### File Plan

| File | Action | Purpose |
|------|--------|---------|
| `apps/admin/src/app/contacts/page.tsx` | Rewrite | Main page with view toggle, bulk state, filters |
| `apps/admin/src/app/contacts/_components/contacts-table.tsx` | Rewrite | Enhanced table with checkboxes, smart columns, sorting |
| `apps/admin/src/app/contacts/_components/contacts-filter-panel.tsx` | Rewrite | Expanded filters (type, status, active, passport) |
| `apps/admin/src/app/contacts/_components/contacts-kanban.tsx` | Create | Kanban pipeline board |
| `apps/admin/src/app/contacts/_components/contact-kanban-card.tsx` | Create | Individual kanban card |
| `apps/admin/src/app/contacts/_components/bulk-actions-toolbar.tsx` | Create | Bulk operations bar |
| `apps/admin/src/app/contacts/_components/relationship-indicator.tsx` | Create | 👥 count + tooltip + click handler |
| `apps/admin/src/app/contacts/_components/tag-assign-popover.tsx` | Create | Bulk tag assignment UI |
| `apps/admin/src/hooks/use-contacts.ts` | Modify | Add bulk mutation hooks |
| `apps/api/src/contacts/contacts.controller.ts` | Modify | Add bulk status/tag endpoints if needed |
| `apps/api/src/contacts/contacts.service.ts` | Modify | Add bulk operations |

### Data Flow

**Table & Kanban shared data:**
- `useContacts(filters)` — existing paginated hook, supports all needed filters
- Filters stored in URL search params for shareability and back-button support
- View toggle stored in localStorage (`contacts-view-preference`)

**Smart columns:**
- **Next Trip:** Requires backend enhancement. Add `nextTripName` and `nextTripDate` to `ContactResponseDto` computed from the contacts' trip associations where `trip.startDate > today`. Alternatively, use a separate lightweight query per-page (batch).
- **Birthday:** Already on `ContactResponseDto.dateOfBirth`. Format client-side. Highlight with amber badge if birthday is within current month.
- **Relationship count:** Already available via `useRelationships(contactId)`. For the table, add `relationshipCount` to `ContactResponseDto` (computed server-side) to avoid N+1 queries. Tooltip content lazy-loaded on hover via `useRelationships`.

**Bulk operations:**
- **Bulk tag:** `POST /contacts/bulk/tags` — body: `{ contactIds: string[], tags: string[] }`. Adds tags to all specified contacts. Backend loops `addTagToContact` per contact in a transaction.
- **Bulk status change:** `POST /contacts/bulk/status` — body: `{ contactIds: string[], status: ContactStatus }`. Updates `contactStatus` for all. Backend loops `updateContactStatus` per contact.
- **Bulk delete:** Loop existing `DELETE /contacts/:id` client-side (soft delete). Show progress indicator for large batches.
- **Create trip from contacts:** Navigate to `/trips?action=create&contactIds=id1,id2,id3`. The trips page reads URL params, opens Create Trip modal, and after creation auto-adds contacts as travelers via `POST /trips/:id/travelers` for each contact ID.

**Kanban drag-and-drop:**
- Uses `@dnd-kit` (already in project for itinerary DnD)
- On drop: call `PATCH /contacts/:id/status` (existing endpoint) with new status
- Optimistic update via React Query `setQueryData`

**Column visibility (kanban):**
- Stored in localStorage key `contacts-kanban-columns`
- Default: all 7 visible
- Toggle via a "Columns" settings popover in the kanban header

### Table Columns Detail

| Column | Field | Sortable | Width | Behavior |
|--------|-------|----------|-------|----------|
| ☐ | — | No | 40px | Select/deselect row, header checkbox for select all |
| Name | firstName, lastName, photoUrl | Yes (lastName) | flex | Avatar + full name, click navigates to `/contacts/:id` |
| Status | contactStatus | Yes | 120px | Color-coded badge: green (booked/traveling), blue (prospecting/quoted), gray (returned/awaiting), red (inactive) |
| Type | contactType | Yes | 80px | "Lead" or "Client" badge |
| Email | email | Yes | flex | Truncated with tooltip |
| Phone | phone | No | 130px | Formatted display |
| Next Trip | nextTripName, nextTripDate | Yes (nextTripDate) | 160px | Trip name + "May 15" date, or "—" if none |
| Birthday | dateOfBirth | Yes | 100px | "Mar 15" format, amber highlight if this month |
| 👥 | relationshipCount | No | 50px | Count badge, tooltip on hover, click opens relationship manager |
| Tags | tags[] | No | flex | Up to 3 Badge components + "+N" overflow |

### Status Badge Colors

| Status | Color | Tailwind |
|--------|-------|----------|
| prospecting | Blue | `bg-blue-100 text-blue-700` |
| quoted | Indigo | `bg-indigo-100 text-indigo-700` |
| booked | Green | `bg-green-100 text-green-700` |
| traveling | Emerald | `bg-emerald-100 text-emerald-700` |
| returned | Slate | `bg-slate-100 text-slate-700` |
| awaiting_next | Amber | `bg-amber-100 text-amber-700` |
| inactive | Red | `bg-red-100 text-red-700` |

### Kanban Card Layout

```
┌─────────────────────────────┐
│ [AV]  John Smith        👥3 │
│ ✉ john@email.com            │
│ 🏷 VIP   Wedding-2027       │
│ ✈ Cancun Trip — May 15      │
└─────────────────────────────┘
```

- **Top row:** Avatar initials + name (bold, clickable) + relationship indicator (right-aligned)
- **Email:** Muted text, truncated
- **Tags:** Up to 2 small badges
- **Next trip:** Small text with plane icon, or omitted if none

### Bulk Actions Toolbar

Appears as a sticky bar between the filter panel and the table/kanban when `selectedCount > 0`.

```
┌──────────────────────────────────────────────────────────────────┐
│  ☑ 12 selected  │  🏷 Tag  │  📊 Status  │  🗑 Delete  │  ✈ Create Trip  │  ✕ Deselect │
└──────────────────────────────────────────────────────────────────┘
```

- **Tag:** Opens `TagAssignPopover` — search/create tags, apply to all selected
- **Status:** Opens dropdown with 7 status options, applies to all selected
- **Delete:** Confirmation dialog "Delete N contacts?", soft-deletes all
- **Create Trip:** Navigates with contact IDs in URL, trip creation flow handles the rest
- **Deselect:** Clears selection

### Create Trip from Contacts Flow

Embeds `TripFormDialog` directly on the contacts page (per Codex review — simpler than URL-param cross-page navigation). Uses existing `redirectOnCreate={false}` + `onCreated` callback pattern.

1. Agent selects contacts in table (checkboxes) or kanban (click cards)
2. Clicks "Create Trip" in bulk toolbar
3. `TripFormDialog` opens directly on the contacts page (same modal used on trips page)
4. Agent fills trip details (name, dates, type) and submits
5. `onCreated(newTrip)` callback fires. The contacts page then:
   - Creates travelers via `POST /trips/:id/travelers` for each selected contact
   - First contact → `role: 'primary_contact'`, `isPrimaryTraveler: true`
   - Remaining contacts → `role: 'full_access'`
   - All default to `travelerType: 'adult'`
6. Navigate to the new trip's Travelers tab via `router.push(/trips/:id?tab=travelers)`
7. Agent can adjust roles/types there

### Filter State Management

Currently only `search` is read from URL params. This revamp moves ALL filters to URL search params for shareability and back-button support:
```
/contacts?search=smith&status=prospecting,quoted&type=lead&tags=VIP
```

- `search` — text query
- `status` — comma-separated contactStatus values
- `type` — "lead" or "client"
- `tags` — comma-separated tag names
- `active` — "true" or "false"
- `passport` — "has" or "expiring"
- `sortBy` — column name
- `sortOrder` — "asc" or "desc"
- `view` — "table" or "kanban"

### API Changes Needed

**New DTO:**
- `ContactListItemDto` — extends `ContactResponseDto` with optional computed fields:
  - `nextTripName?: string | null`
  - `nextTripDate?: string | null`
  - `relationshipCount?: number`
- This avoids breaking the 10+ places that reuse `ContactResponseDto` as an embedded type (trip-travelers, relationships, etc.)
- Computed fields are batched per-page in the list query, NOT in `mapToResponseDto()` (avoids N+1)

**New filter params (add to filter DTO + service):**
- `contactType` — "lead" | "client" (NOT currently supported — must add to `ContactFilterDto`, service WHERE clause, and useContacts hook)
- `contactStatus` — string[] of status values (NOT currently supported — must add same)
- Note: `isActive`, `hasPassport`, `passportExpiring`, `sortBy`, `sortOrder` already exist server-side but are NOT wired in the frontend hook

**New endpoints:**
- `POST /contacts/:contactId/tags/add` — `{ tags: string[] }` → MERGES tags (existing PUT replaces all tags). Place with existing tag API in `tags.controller.ts`, not contacts controller.
- `POST /contacts/bulk/status` — `{ contactIds: string[], status: string }` → changes status for multiple contacts in a transaction

**Status clarification:**
- `contactStatus = 'inactive'` is a CRM pipeline stage (agent moved them there intentionally)
- `isActive = false` is a soft-delete (contact is archived/removed)
- The kanban shows contactStatus columns. The "Active/Inactive" filter toggle controls isActive (soft-delete). These are independent.

**Performance — batched computed fields:**
- `nextTrip`: After fetching the contacts page, batch-query `trip_travelers` → `trips` WHERE `contact_id IN (pageContactIds)` AND `startDate > today` GROUP BY contact_id, pick MIN startDate per contact
- `relationshipCount`: After fetching, batch-query `contact_relationships` WHERE `contact_id1 IN (ids) OR contact_id2 IN (ids)` GROUP BY contact_id, COUNT
- **Add indexes:** `CREATE INDEX idx_trip_travelers_contact_id ON trip_travelers(contact_id)` and `CREATE INDEX idx_contact_relationships_contact_ids ON contact_relationships(contact_id1, contact_id2)`

**Status endpoint hardening:**
- `PATCH /contacts/:id/status` — add Zod enum validation for the 7 contactStatus values

### Performance Considerations

- **Next trip computation:** Server-side join in `mapToResponseDto`. Query `trip_travelers` → `trips` where `startDate > today` ORDER BY startDate LIMIT 1. Batched for list queries.
- **Relationship count:** Server-side COUNT in `mapToResponseDto`. Subquery on `contact_relationships` table.
- **Kanban pagination:** Each column loads independently with `status` filter + `limit=50`. Infinite scroll per column if needed.
- **Bulk operations:** Client-side progress indicator for large batches. Backend processes in transaction.

## Not Changing

- Contact detail page (13 sections, comprehensive)
- Contact create/edit forms
- Relationship management dialog (reused via indicator click)
- Quick contact dialog
- API authentication/authorization
- Contact access control (shares)
