# Contact Merge + Duplicate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow agents to merge duplicate contacts with field-level control and a full 22-table re-point, plus auto-detect potential duplicates via a report page with fuzzy name matching.

**Architecture:** Backend merge service runs in a single DB transaction, re-pointing all 22 tables that reference contacts.id. Separate duplicate detection service uses pg_trgm for fuzzy name matching. Frontend has a side-by-side merge editor dialog (triggered from bulk toolbar) and a dedicated duplicate report page. Three migrations add merge columns, pg_trgm extension, and dismissals table.

**Tech Stack:** NestJS, Drizzle ORM transactions, PostgreSQL pg_trgm, React, shadcn/ui Dialog + Table

**Spec:** `docs/superpowers/specs/2026-04-03-contact-merge-design.md`

---

### Task 1: Database migrations

Three migrations: merge columns, pg_trgm extension, and dismissals table.

**Files:**
- Create: `packages/database/src/migrations/{TS1}_add_contact_merge_columns.sql`
- Create: `packages/database/src/migrations/{TS2}_add_pg_trgm_extension.sql`
- Create: `packages/database/src/migrations/{TS3}_create_duplicate_dismissals.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`
- Modify: `packages/database/src/schema/contacts.schema.ts` (add mergedIntoContactId, mergedAt, mergedBy columns)

- [ ] **Step 1: Create merge columns migration**

```sql
-- Add merge tracking columns to contacts table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS merged_into_contact_id UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by UUID;

CREATE INDEX IF NOT EXISTS idx_contacts_merged_into ON contacts(merged_into_contact_id)
  WHERE merged_into_contact_id IS NOT NULL;
```

- [ ] **Step 2: Create pg_trgm extension migration**

```sql
-- Enable pg_trgm for fuzzy name matching in duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on contact names for efficient similarity() queries
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gist (
    (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) gist_trgm_ops
  );
```

- [ ] **Step 3: Create dismissals table migration**

```sql
CREATE TABLE IF NOT EXISTS contact_duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  contact_id1 UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_id2 UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  match_type VARCHAR(50) NOT NULL,
  dismissed_by UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id1, contact_id2, match_type)
);
```

- [ ] **Step 4: Add columns to Drizzle schema**

In `packages/database/src/schema/contacts.schema.ts`, add after `ownerId`:
```typescript
mergedIntoContactId: uuid('merged_into_contact_id').references(() => contacts.id),
mergedAt: timestamp('merged_at', { withTimezone: true }),
mergedBy: uuid('merged_by'),
```

Also create a new schema file `packages/database/src/schema/contact-duplicate-dismissals.schema.ts` with the Drizzle table definition, and export from `index.ts`.

- [ ] **Step 5: Register migrations in journal and run locally**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(db): add contact merge columns, pg_trgm extension, and dismissals table"
```

---

### Task 2: Shared merge types

Types for merge and duplicate detection shared between frontend and backend.

**Files:**
- Modify: `packages/shared-types/src/api/contacts.types.ts`

- [ ] **Step 1: Add merge and duplicate types**

```typescript
// ============================================================================
// Contact Merge
// ============================================================================

export interface ContactMergeRequest {
  primaryId: string
  secondaryId: string
  fieldOverrides: Record<string, 'primary' | 'secondary'>
}

export interface ContactMergeResult {
  success: boolean
  mergedContactId: string
  repointed: {
    trips: number
    travelers: number
    relationships: number
    tags: number
    payments: number
    documents: number
    notes: number
    tasks: number
    other: number
  }
}

// ============================================================================
// Duplicate Detection
// ============================================================================

export type DuplicateMatchType = 'email' | 'phone_name' | 'dob_name'

export interface DuplicateGroup {
  matchType: DuplicateMatchType
  confidence: 'high' | 'medium'
  contacts: [ContactListItemDto, ContactListItemDto]
}

export interface DuplicateDetectionResult {
  groups: DuplicateGroup[]
  totalGroups: number
}

export interface DuplicateDismissRequest {
  contactId1: string
  contactId2: string
  matchType: string
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(types): add shared contact merge and duplicate detection types"
```

---

### Task 3: ContactMergeService — the core merge engine

The most complex task. Handles the 22-table re-point in a single transaction.

**Files:**
- Create: `apps/api/src/contacts/contact-merge.service.ts`

- [ ] **Step 1: Create the service**

The service has one main method: `merge(request, auth)`.

**Transaction flow:**
```typescript
async merge(req: ContactMergeRequest, auth: AuthContext): Promise<ContactMergeResult> {
  return this.db.client.transaction(async (tx) => {
    // 1. Load both contacts, verify ownership
    // 2. Build merged field values from fieldOverrides
    // 3. Update primary contact with merged fields
    // 4. Re-point all 22 tables (see below)
    // 5. Soft-delete secondary (isActive=false, mergedIntoContactId=primary)
    // 6. Return repointed counts
  })
}
```

**Re-point order (inside transaction):**

```typescript
// Simple re-points (UPDATE contact_id = primaryId WHERE contact_id = secondaryId)
const simpleRepoints = [
  { table: 'notes', column: 'contact_id' },
  { table: 'tasks', column: 'contact_id' },
  { table: 'tasks', column: 'assignee_contact_id' },
  { table: 'email_logs', column: 'contact_id' },
  { table: 'calendar_events', column: 'contact_id' },
  { table: 'contact_documents', column: 'contact_id' },
  { table: 'proposal_comments', column: 'contact_id' },
  { table: 'planning_sessions', column: 'contact_id' },
  { table: 'client_activity_responses', column: 'contact_id' },
  { table: 'itinerary_feedback', column: 'contact_id' },
  { table: 'ota_trip_requests', column: 'contact_id' },
  { table: 'ota_referrals', column: 'converted_to_contact_id' },
  { table: 'expected_payment_items', column: 'contact_id' },
  { table: 'payment_transactions', column: 'contact_id' },
  { table: 'contact_share_requests', column: 'contact_id' },
]
```

For each: `await tx.execute(sql\`UPDATE ${table} SET ${column} = ${primaryId} WHERE ${column} = ${secondaryId}\`)`

**Complex re-points (need conflict handling):**

1. **trips.primary_contact_id** — UPDATE, no unique issues
2. **trip_travelers** — UPDATE contact_id. Handle primary_contact role: if both are travelers on same trip, one must lose primary role. Emergency_contact_id also re-pointed.
3. **contact_relationships** — Canonicalize: re-point, delete self-links, delete duplicate pairs
4. **contact_tags** — Merge additively: get B's tags, add any A doesn't have, delete B's
5. **contact_group_members** — Re-point, skip if A already in group
6. **contact_shares** — Re-point, skip duplicates
7. **contact_loyalty_programs** — Re-point, skip if same program exists
8. **contact_stripe_customers** — Transfer if primary doesn't have one, otherwise keep primary's
9. **client_portal_users** — Transfer if primary doesn't have portal, otherwise deactivate secondary's

Each complex re-point is a separate private method for clarity.

**~500-700 lines.** Focus on correctness — every UPDATE/DELETE is in the transaction.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): create ContactMergeService with 22-table transactional re-point"
```

---

### Task 4: ContactMergeController + duplicate detection endpoints

Controller with merge, duplicates, and dismiss endpoints.

**Files:**
- Create: `apps/api/src/contacts/contact-merge.controller.ts`
- Modify: `apps/api/src/contacts/contacts.module.ts`

- [ ] **Step 1: Create the controller**

Three endpoints:
- `POST /contacts/merge` — merge two contacts
- `GET /contacts/duplicates` — run duplicate detection, return groups
- `POST /contacts/duplicates/dismiss` — dismiss a false positive

The duplicate detection logic can live in the same service or a separate one. For simplicity, add `detectDuplicates()` and `dismiss()` methods to ContactMergeService.

**detectDuplicates():**
- Run the three-tier SQL queries from the spec (email, phone+name, DOB+name)
- Filter out dismissed pairs via NOT EXISTS subquery
- Return grouped results with both contact records

**IMPORTANT:** Register controller BEFORE ContactsController in contacts.module.ts (route ordering).

- [ ] **Step 2: Register in module**

Add `ContactMergeController` and `ContactMergeService` to contacts.module.ts.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): add contact merge + duplicate detection endpoints"
```

---

### Task 5: Merge Editor Dialog

Side-by-side field comparison with radio buttons.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/merge-editor-dialog.tsx`

- [ ] **Step 1: Create the component**

**Props:**
```typescript
interface MergeEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactIds: [string, string]  // exactly 2
  onMergeComplete: () => void
}
```

**Layout:**
1. Fetch both contacts via `useContact(id)` (2 queries)
2. Primary selector: radio buttons at top (Contact A / Contact B)
3. Field comparison table: field name | A value | B value | radio to pick
4. Inheritance summary: counts of trips, relationships, etc. that will be re-pointed
5. "Merge Contacts" button calls `useContactMerge` mutation

**Fields to compare:** firstName, lastName, email, phone, dateOfBirth, addressLine1, addressLine2, city, province, postalCode, country, passportNumber, passportExpiry, passportCountry, contactType, contactStatus

**~250-350 lines.**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): create MergeEditorDialog with side-by-side field comparison"
```

---

### Task 6: React Query hooks for merge + duplicates

**Files:**
- Create: `apps/admin/src/hooks/use-contact-merge.ts`

- [ ] **Step 1: Create hooks**

```typescript
export function useContactMerge()  // POST /contacts/merge
export function useDuplicateDetection()  // GET /contacts/duplicates
export function useDismissDuplicate()  // POST /contacts/duplicates/dismiss
```

Follow the existing mutation/query patterns.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): add contact merge and duplicate detection hooks"
```

---

### Task 7: Wire Merge button into bulk toolbar

Add "Merge" button that only appears when exactly 2 contacts are selected.

**Files:**
- Modify: `apps/admin/src/app/contacts/_components/bulk-actions-toolbar.tsx`
- Modify: `apps/admin/src/app/contacts/page.tsx`

- [ ] **Step 1: Add onMerge prop and Merge button to toolbar**

Add `onMerge?: () => void` to `BulkActionsToolbarProps`.

Add button (visible only when `selectedIds.size === 2`):
```typescript
{selectedIds.size === 2 && (
  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onMerge}>
    <Merge className="h-3.5 w-3.5 mr-1" />
    Merge
  </Button>
)}
```

Import `Merge` from `lucide-react` (or `GitMerge` if `Merge` doesn't exist).

- [ ] **Step 2: Wire in page.tsx**

Add state for merge dialog and pass to toolbar + MergeEditorDialog:
```typescript
const [mergeIds, setMergeIds] = useState<[string, string] | null>(null)

// In toolbar:
onMerge={() => setMergeIds(Array.from(selectedIds) as [string, string])}

// Render dialog:
{mergeIds && (
  <MergeEditorDialog
    open={!!mergeIds}
    onOpenChange={(open) => !open && setMergeIds(null)}
    contactIds={mergeIds}
    onMergeComplete={() => { setMergeIds(null); setSelectedIds(new Set()) }}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): wire Merge button into bulk toolbar (2-contact selection)"
```

---

### Task 8: Duplicate Report Page

Dedicated page showing auto-detected duplicate groups.

**Files:**
- Create: `apps/admin/src/app/contacts/duplicates/page.tsx`
- Create: `apps/admin/src/app/contacts/duplicates/_components/duplicate-group-card.tsx`

- [ ] **Step 1: Create DuplicateGroupCard**

Shows two contacts side-by-side with match type badge and actions: "Merge" and "Dismiss".

**Props:**
```typescript
interface DuplicateGroupCardProps {
  group: DuplicateGroup
  onMerge: (contactIds: [string, string]) => void
  onDismiss: (contactId1: string, contactId2: string, matchType: string) => void
}
```

- [ ] **Step 2: Create duplicates page**

```typescript
export default function DuplicatesPage() {
  const { data, isLoading } = useDuplicateDetection()
  const dismissMutation = useDismissDuplicate()
  const [mergeIds, setMergeIds] = useState(null)

  // Header: "Duplicate Detection" + count + "Scan" button (refetch)
  // Grid of DuplicateGroupCards
  // MergeEditorDialog when mergeIds is set
}
```

Add a link to this page from the contacts page header or sidebar.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(admin): create Duplicate Report page at /contacts/duplicates"
```

---

### Task 9: Add merged-contact redirect in contact detail

When navigating to a contact that was merged, redirect to the surviving contact.

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx`

- [ ] **Step 1: Add redirect logic**

At the top of the contact detail page, after fetching the contact, check if it's merged:

```typescript
const contact = useContact(contactId)
if (contact.data?.mergedIntoContactId) {
  router.replace(`/contacts/${contact.data.mergedIntoContactId}`)
  return null
}
```

This requires `mergedIntoContactId` to be in `ContactResponseDto`. Add it if not already present.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): redirect merged contacts to surviving contact"
```

---

### Task 10: Final build, PR, deploy

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 2: Run migrations locally**

```bash
cd apps/api && pnpm db:migrate
```

- [ ] **Step 3: Push and create PR**

```bash
git push -u origin feature/contact-merge
gh pr create --base main --title "feat: Contact Merge + Duplicate Detection"
```

- [ ] **Step 4: Test locally**

1. Select 2 contacts → "Merge" button appears
2. Open merge editor → side-by-side comparison
3. Pick primary, override a field, confirm
4. Secondary contact soft-deleted, all records re-pointed
5. Navigate to secondary's URL → redirects to primary
6. Go to /contacts/duplicates → see detected groups
7. Dismiss a group → doesn't reappear
8. Merge from duplicates page → works same as bulk toolbar
