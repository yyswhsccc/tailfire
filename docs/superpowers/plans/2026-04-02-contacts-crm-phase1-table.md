# Contacts CRM Portal — Phase 1: Backend + Enhanced Table

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contactType/contactStatus filters to the API, create ContactListItemDto with computed fields (nextTrip, relationshipCount), add DB indexes, and rebuild the contacts table with smart columns, sorting, checkboxes for bulk select, and a relationship indicator.

**Architecture:** Backend-first approach. Add new filter params and computed fields to the API, create a new list DTO, add performance indexes, then rebuild the frontend table component with sortable columns, select-all, and smart data display. The enhanced table replaces the current contacts-table.tsx entirely.

**Tech Stack:** NestJS, Drizzle ORM, React, shadcn/ui Table, Tailwind CSS, React Query

**Spec:** `docs/superpowers/specs/2026-04-02-contacts-crm-portal-design.md`

**Phases:**
- **Phase 1 (this plan):** Backend filters + enhanced table
- **Phase 2:** Bulk operations + expanded filter panel + create-trip flow
- **Phase 3:** Kanban pipeline view

---

### Task 1: Add contactType and contactStatus to filter DTO

Add the missing filter fields to the backend DTO, service WHERE clause, and shared types.

**Files:**
- Modify: `apps/api/src/contacts/dto/contact-filter.dto.ts`
- Modify: `apps/api/src/contacts/contacts.service.ts` (findAll WHERE clause, ~lines 157-208)
- Modify: `packages/shared-types/src/api/contacts.types.ts` (ContactFilterDto type)
- Modify: `apps/admin/src/hooks/use-contacts.ts` (add params to query builder)

- [ ] **Step 1: Add contactType and contactStatus to the API filter DTO**

In `apps/api/src/contacts/dto/contact-filter.dto.ts`, add after the `tags` field (around line 62):

```typescript
@IsOptional()
@IsIn(['lead', 'client'])
contactType?: 'lead' | 'client'

@IsOptional()
@IsArray()
@IsString({ each: true })
@Transform(({ value }) => {
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim())
  }
  return value
})
contactStatus?: string[]
```

- [ ] **Step 2: Add WHERE conditions in contacts.service.ts**

In `apps/api/src/contacts/contacts.service.ts`, after the `passportExpiring` filter block (around line 208), add:

```typescript
// contactType filter
if (filters.contactType) {
  conditions.push(eq(this.db.schema.contacts.contactType, filters.contactType))
}

// contactStatus filter (multi-select)
if (filters.contactStatus && filters.contactStatus.length > 0) {
  conditions.push(
    inArray(this.db.schema.contacts.contactStatus, filters.contactStatus)
  )
}
```

Make sure `inArray` is imported from `drizzle-orm`.

- [ ] **Step 3: Add to shared ContactFilterDto type**

In `packages/shared-types/src/api/contacts.types.ts`, find the `ContactFilterDto` interface and add:

```typescript
contactType?: 'lead' | 'client'
contactStatus?: string[]
```

- [ ] **Step 4: Wire filters in useContacts hook**

In `apps/admin/src/hooks/use-contacts.ts`, inside the `queryFn` URLSearchParams builder (around line 39), add:

```typescript
if (filters.contactType) params.append('contactType', filters.contactType)
if (filters.contactStatus?.length) {
  params.append('contactStatus', filters.contactStatus.join(','))
}
if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
if (filters.hasPassport !== undefined) params.append('hasPassport', filters.hasPassport.toString())
if (filters.passportExpiring !== undefined) params.append('passportExpiring', filters.passportExpiring.toString())
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter @tailfire/admin build && pnpm --filter @tailfire/api typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contacts/dto/contact-filter.dto.ts \
  apps/api/src/contacts/contacts.service.ts \
  packages/shared-types/src/api/contacts.types.ts \
  apps/admin/src/hooks/use-contacts.ts
git commit -m "feat(api): add contactType and contactStatus filters to contacts list

Adds contactType (lead/client) and contactStatus (multi-select) to
ContactFilterDto, service WHERE clause, shared types, and frontend hook.
Also wires sortOrder, hasPassport, passportExpiring to the frontend hook."
```

---

### Task 2: Create ContactListItemDto with computed fields

Add nextTripName, nextTripDate, and relationshipCount as optional fields on a new list-specific DTO. Batch-compute them in the list query.

**Files:**
- Modify: `packages/shared-types/src/api/contacts.types.ts`
- Modify: `apps/api/src/contacts/contacts.service.ts`
- Modify: `apps/api/src/contacts/contacts.controller.ts`

- [ ] **Step 1: Create ContactListItemDto type**

In `packages/shared-types/src/api/contacts.types.ts`, add after `ContactResponseDto`:

```typescript
/**
 * Extended contact DTO for list views with computed fields.
 * Avoids adding these to the global ContactResponseDto which is embedded in
 * trip-travelers, relationships, and other responses.
 */
export interface ContactListItemDto extends ContactResponseDto {
  nextTripName?: string | null
  nextTripDate?: string | null
  relationshipCount?: number
}
```

Update `PaginatedContactsResponseDto` to use it:

```typescript
export interface PaginatedContactsResponseDto {
  data: ContactListItemDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

- [ ] **Step 2: Add batch computed fields in contacts.service.ts**

In `contacts.service.ts`, after the main findAll query returns `contacts`, add two batch queries before mapping to DTOs.

After the contacts query (around line 229), add:

```typescript
// Batch compute nextTrip for all contacts on this page
const contactIds = contacts.map(c => c.id)
const nextTrips = contactIds.length > 0
  ? await this.db.client.execute(sql`
      SELECT DISTINCT ON (tt.contact_id)
        tt.contact_id,
        t.name AS trip_name,
        t.start_date AS trip_date
      FROM trip_travelers tt
      JOIN trips t ON t.id = tt.trip_id
      WHERE tt.contact_id = ANY(${contactIds})
        AND t.start_date > CURRENT_DATE
        AND t.status NOT IN ('cancelled')
      ORDER BY tt.contact_id, t.start_date ASC
    `) as any[]
  : []

const nextTripMap = new Map<string, { name: string; date: string }>()
for (const row of nextTrips) {
  nextTripMap.set(row.contact_id, { name: row.trip_name, date: row.trip_date })
}

// Batch compute relationship count
const relCounts = contactIds.length > 0
  ? await this.db.client.execute(sql`
      SELECT contact_id, COUNT(*) as cnt FROM (
        SELECT contact_id1 AS contact_id FROM contact_relationships WHERE contact_id1 = ANY(${contactIds})
        UNION ALL
        SELECT contact_id2 AS contact_id FROM contact_relationships WHERE contact_id2 = ANY(${contactIds})
      ) sub
      GROUP BY contact_id
    `) as any[]
  : []

const relCountMap = new Map<string, number>()
for (const row of relCounts) {
  relCountMap.set(row.contact_id, Number(row.cnt))
}
```

Then in the map step, enhance each contact:

```typescript
const data: ContactListItemDto[] = contacts.map(contact => {
  const base = this.mapToResponseDto(contact)
  const nextTrip = nextTripMap.get(contact.id)
  return {
    ...base,
    nextTripName: nextTrip?.name || null,
    nextTripDate: nextTrip?.date || null,
    relationshipCount: relCountMap.get(contact.id) || 0,
  }
})
```

- [ ] **Step 3: Update controller return type**

In `apps/api/src/contacts/contacts.controller.ts`, update the list endpoint return type annotation if it has one.

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter @tailfire/api typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/api/contacts.types.ts \
  apps/api/src/contacts/contacts.service.ts \
  apps/api/src/contacts/contacts.controller.ts
git commit -m "feat(api): add ContactListItemDto with nextTrip and relationshipCount

Batch-computes nextTripName/Date and relationshipCount for the contacts
list page. Uses DISTINCT ON and UNION ALL to avoid N+1 queries.
New fields are optional on ContactListItemDto (extends ContactResponseDto)
to avoid breaking embedded contact references."
```

---

### Task 3: Add database indexes for computed fields

Performance indexes for the batch queries added in Task 2.

**Files:**
- Create: `packages/database/src/migrations/TIMESTAMP_add_contacts_crm_indexes.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration file**

Generate timestamp: `date -u +%Y%m%d%H%M%S`

Create `packages/database/src/migrations/{TIMESTAMP}_add_contacts_crm_indexes.sql`:

```sql
-- Indexes for Contacts CRM Portal computed fields
-- nextTrip batch query: trip_travelers.contact_id
CREATE INDEX IF NOT EXISTS idx_trip_travelers_contact_id
  ON trip_travelers(contact_id);

-- relationshipCount batch query: contact_relationships.contact_id1/contact_id2
CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id1
  ON contact_relationships(contact_id1);

CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id2
  ON contact_relationships(contact_id2);
```

- [ ] **Step 2: Register migration in journal**

Add entry to `packages/database/src/migrations/meta/_journal.json`.

- [ ] **Step 3: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/migrations/
git commit -m "feat(db): add CRM performance indexes for contacts list

Indexes on trip_travelers.contact_id and
contact_relationships.contact_id1/contact_id2 for batch nextTrip
and relationshipCount queries."
```

---

### Task 4: Create RelationshipIndicator component

Small reusable component for the 👥 count + tooltip + click handler.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/relationship-indicator.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRelationships } from '@/hooks/use-relationships'
import type { ContactRelationshipResponseDto } from '@tailfire/shared-types/api'

interface RelationshipIndicatorProps {
  contactId: string
  contactName: string
  count: number
  onClick?: () => void
}

export function RelationshipIndicator({
  contactId,
  contactName,
  count,
  onClick,
}: RelationshipIndicatorProps) {
  const [hovered, setHovered] = useState(false)

  // Lazy-load relationship details only on hover
  const { data: relationships } = useRelationships(contactId, undefined, {
    enabled: hovered && count > 0,
  })

  if (count === 0) return null

  const tooltipContent = relationships
    ? relationships.map((r: ContactRelationshipResponseDto) => {
        const isContact1 = r.contactId1 === contactId
        const label = isContact1 ? r.labelForContact1 : r.labelForContact2
        const otherName = isContact1
          ? r.relatedContact2?.displayName || 'Unknown'
          : r.relatedContact1?.displayName || 'Unknown'
        return `${label || 'Related to'} ${otherName}`
      }).join('\n')
    : 'Loading...'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-ash-500 hover:text-ash-900 transition-colors"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{count}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-xs font-medium mb-1">{contactName}'s Relationships</p>
          <p className="text-xs whitespace-pre-line">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

Note: Check if `useRelationships` supports an `enabled` option. If not, pass it as the third arg to the underlying `useQuery` options. If the hook doesn't accept options, conditionally call it with `contactId` set to `null` when not hovered:

```typescript
const { data: relationships } = useRelationships(
  hovered && count > 0 ? contactId : null
)
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/contacts/_components/relationship-indicator.tsx
git commit -m "feat(admin): create RelationshipIndicator component

Shows 👥 count badge with lazy-loaded tooltip listing relationship
labels. Click handler for opening relationship manager."
```

---

### Task 5: Rebuild contacts table with smart columns

Complete rewrite of `contacts-table.tsx` with checkboxes, sortable columns, status badges, smart data, and relationship indicator.

**Files:**
- Rewrite: `apps/admin/src/app/contacts/_components/contacts-table.tsx`

- [ ] **Step 1: Rewrite the table component**

The new table should have:

**Props:**
```typescript
interface ContactsTableProps {
  contacts: ContactListItemDto[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
  onContactClick: (contactId: string) => void
}
```

**Columns (10):**
1. Checkbox — select/deselect, header has select-all
2. Name — avatar + firstName + lastName, sortable (sortBy: 'lastName')
3. Status — contactStatus badge with color coding per spec
4. Type — "Lead" / "Client" badge
5. Email — sortable
6. Phone — plain text
7. Next Trip — nextTripName + formatted nextTripDate, or "—"
8. Birthday — formatted dateOfBirth, amber highlight if this month
9. 👥 — RelationshipIndicator component
10. Tags — up to 3 Badge components + "+N" overflow

**Sortable column headers:** Click toggles asc/desc, shows chevron indicator.

**Status badge colors** per spec:
- prospecting: `bg-blue-100 text-blue-700`
- quoted: `bg-indigo-100 text-indigo-700`
- booked: `bg-green-100 text-green-700`
- traveling: `bg-emerald-100 text-emerald-700`
- returned: `bg-slate-100 text-slate-700`
- awaiting_next: `bg-amber-100 text-amber-700`
- inactive: `bg-red-100 text-red-700`

**Birthday highlight:** If `dateOfBirth` month matches current month, render with `bg-amber-50 text-amber-700` styling.

This is a large component (~200-250 lines). Use the existing shadcn Table components.

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/contacts/_components/contacts-table.tsx
git commit -m "feat(admin): rebuild contacts table with smart columns and bulk select

10-column table with checkboxes, sortable headers, status/type badges,
next trip, birthday highlight, relationship indicator, and tags.
Replaces the basic 6-column table."
```

---

### Task 6: Update contacts page with sorting and selection state

Wire the new table into the page with sort state, selection state, and URL-backed filters.

**Files:**
- Rewrite: `apps/admin/src/app/contacts/page.tsx`

- [ ] **Step 1: Add sort and selection state**

Update `page.tsx` to manage:
- `sortBy` / `sortOrder` state (passed to filters and table)
- `selectedIds: Set<string>` state (passed to table, used by future bulk toolbar)
- `view: 'table' | 'kanban'` state (stored in localStorage, toggle in header)
- All filters synced to URL search params via `useSearchParams` + `router.replace`

The page should:
- Read initial filters from URL params on mount
- Update URL params when filters change (debounced for search)
- Pass sort/selection/filters to the enhanced table
- Show contact count in header: "Contacts (N)"
- Keep the existing New Contact button and QuickContactDialog

- [ ] **Step 2: Add view toggle RadioGroup**

Add a `RadioGroup` in the header (same pattern as trips page) with Table and Kanban options. For Phase 1, kanban just shows a "Coming Soon" placeholder. The toggle sets `view` state.

```typescript
<RadioGroup value={view} onValueChange={setView} className="flex">
  <RadioGroupItem value="table" className="...">
    <TableIcon className="h-4 w-4" />
  </RadioGroupItem>
  <RadioGroupItem value="kanban" className="...">
    <KanbanIcon className="h-4 w-4" />
  </RadioGroupItem>
</RadioGroup>
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/contacts/page.tsx
git commit -m "feat(admin): contacts page with sort, selection, URL filters, view toggle

Sort state, bulk selection Set, URL-backed filters, and table/kanban
view toggle (kanban placeholder for Phase 3). Wires enhanced table."
```

---

### Task 7: Final build verification

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/contacts-crm-phase1
gh pr create --base main --title "feat(admin): Contacts CRM Portal — Phase 1: Backend + Enhanced Table"
```

- [ ] **Step 3: Push to preview and verify**

Merge to preview, verify on tf-demo:
1. Contacts page shows enhanced table with 10 columns
2. Status and Type badges render with correct colors
3. Sortable columns work (click header toggles asc/desc)
4. Next Trip and Birthday columns populated
5. Relationship indicator shows count + tooltip
6. Checkboxes work (select individual + select all)
7. View toggle present (kanban shows placeholder)
