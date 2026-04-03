# Contact Merge + Duplicate Detection — Design Spec

## Goal

Allow agents to merge duplicate contacts with field-level control, automatically re-point all dependent records, and detect potential duplicates via a report page.

## Two Entry Points

### 1. Manual Merge (Bulk Toolbar)
- Agent selects exactly 2 contacts in the table → "Merge" button appears
- Opens side-by-side merge editor dialog
- Agent picks primary, overrides individual fields, confirms
- Server merges in a single transaction

### 2. Duplicate Report Page
- `/contacts/duplicates` — shows auto-detected duplicate groups
- Agent reviews each group: merge or dismiss
- Dismissed pairs stored permanently (don't reappear)
- Detection runs on-demand (not live on every page load)

---

## Merge Editor Dialog

Side-by-side comparison of exactly 2 contacts. Agent picks primary (radio button at top), then can override any field by clicking the radio for the other contact's value.

**Fields shown:**
- firstName, lastName, email, phone, dateOfBirth
- addressLine1, addressLine2, city, province, postalCode, country
- passportNumber, passportExpiry, passportCountry
- contactType, contactStatus
- tags (merged additively)

**Inheritance summary at bottom:**
Lists what the surviving contact will inherit from the secondary:
- N trips (as traveler)
- N relationships
- N payment transactions
- N tags
- Portal account (if secondary has one)
- etc.

---

## Re-pointing: Complete Table Reference List

When merging contact B into contact A (A survives), ALL of the following tables must be handled:

### Core Tables (FK to contacts.id)

| Table | Column(s) | Re-point Strategy |
|-------|-----------|-------------------|
| `trips` | `primary_contact_id` | UPDATE SET A WHERE B |
| `trip_travelers` | `contact_id` | **Sub-merge** (see below) |
| `trip_travelers` | `emergency_contact_id` | UPDATE SET A WHERE B |
| `contact_relationships` | `contact_id1`, `contact_id2` | **Canonicalize** (see below) |
| `contact_tags` | `contact_id` | Merge additively, skip duplicates |
| `contact_groups` | `primary_contact_id` | UPDATE SET A WHERE B |
| `contact_group_members` | `contact_id` | UPDATE SET A WHERE B, skip if A already member |
| `expected_payment_items` | `contact_id` | UPDATE SET A WHERE B |
| `payment_transactions` | `contact_id` | UPDATE SET A WHERE B |
| `contact_stripe_customers` | `contact_id` | **Keep primary's Stripe record, delete secondary's** (or skip if conflict) |
| `client_portal_users` | `contact_id` | **Portal policy** (see below) |
| `contact_shares` | `contact_id` | UPDATE SET A WHERE B, skip duplicates |
| `contact_share_requests` | `contact_id` | UPDATE SET A WHERE B |
| `contact_loyalty_programs` | `contact_id` | UPDATE SET A WHERE B, skip if same program already exists |
| `contact_documents` | `contact_id` | UPDATE SET A WHERE B |
| `notes` | `contact_id` | UPDATE SET A WHERE B |
| `tasks` | `contact_id` | UPDATE SET A WHERE B |
| `tasks` | `assignee_contact_id` | UPDATE SET A WHERE B |
| `task_notification_pending` | `contact_id` | UPDATE SET A WHERE B |
| `email_logs` | `contact_id` | UPDATE SET A WHERE B |
| `calendar_events` | `contact_id` | UPDATE SET A WHERE B |
| `proposal_comments` | `contact_id` | UPDATE SET A WHERE B |
| `planning_sessions` | `contact_id` | UPDATE SET A WHERE B |
| `client_activity_responses` | `contact_id` | UPDATE SET A WHERE B |
| `itinerary_feedback` | `contact_id` | UPDATE SET A WHERE B |

### Non-FK References (best-effort)

| Table | Column | Strategy |
|-------|--------|----------|
| `ota_trip_requests` | `contactId` | UPDATE SET A WHERE B |
| `ocr_import_jobs` | `contactId` | UPDATE SET A WHERE B (if column exists) |
| `ota_referrals` | `converted_to_contact_id` | UPDATE SET A WHERE B |

### trip_travelers Sub-Merge

`trip_travelers` has a UNIQUE constraint on `(trip_id, contact_id)`. If both contacts are travelers on the same trip:

1. Identify the "winning" traveler row (prefer A's row, or B's if A doesn't have one for that trip)
2. Re-point B's child records to A's traveler row:
   - `activity_travelers` → UPDATE `trip_traveler_id` from B's traveler to A's traveler
   - `traveler_bookings` → UPDATE `trip_traveler_id`
   - `trip_traveler_insurance` → UPDATE `trip_traveler_id`
   - `traveler_group_members` → UPDATE `trip_traveler_id`
   - `cruise_booking_sessions` → UPDATE if has `trip_traveler_id`
3. Delete B's duplicate traveler row (now childless)
4. For trips where only B was a traveler (A wasn't): simply UPDATE `contact_id = A`

### contact_relationships Canonicalization

Merging B into A can create:
- **Self-links**: (A, A) — if A and B had a relationship → DELETE these
- **Duplicate pairs**: (A, C) already exists and (B, C) also exists → keep (A, C), DELETE (B, C)
- **Bidirectional duplicates**: unique index on `LEAST(contact_id1, contact_id2), GREATEST(contact_id1, contact_id2)` → check before re-pointing

Steps:
1. UPDATE `contact_id1 = A WHERE contact_id1 = B` (where no self-link or duplicate would result)
2. UPDATE `contact_id2 = A WHERE contact_id2 = B` (same check)
3. DELETE any rows where `contact_id1 = contact_id2` (self-links)
4. DELETE duplicate pairs (keep the one with the most data/oldest)

### Portal Account Policy

If secondary has a portal account (`client_portal_users` row) but primary does not:
- Transfer portal account to primary: UPDATE `contact_id = A`
- Update `contacts.portalUserId` on primary

If both have portal accounts:
- Keep primary's portal account
- Deactivate secondary's portal account
- Log conflict for admin review

If neither has a portal account: nothing to do.

### Stripe Customer Policy

If secondary has a `contact_stripe_customers` record but primary does not:
- Transfer to primary: UPDATE `contact_id = A`

If both have records:
- Keep primary's Stripe customer
- Soft-delete secondary's (mark inactive)
- **Do not merge Stripe customer IDs** — Stripe identities should not be combined

---

## Merge Metadata

### New columns on contacts table (migration)

```sql
ALTER TABLE contacts
  ADD COLUMN merged_into_contact_id UUID REFERENCES contacts(id),
  ADD COLUMN merged_at TIMESTAMPTZ,
  ADD COLUMN merged_by UUID;
```

### Read-path behavior

When a contact is fetched by ID and `merged_into_contact_id IS NOT NULL`:
- API returns a redirect-style response: `{ merged: true, mergedIntoContactId: "..." }`
- Frontend navigates to the surviving contact
- This handles stale bookmarks and links

---

## Duplicate Detection

### pg_trgm Extension (migration)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_contacts_name_trgm
  ON contacts USING gin ((LOWER(first_name || ' ' || last_name)) gin_trgm_ops);
```

### Detection Tiers

**Tier 1 — Email match (highest confidence):**
```sql
SELECT c1.id, c2.id, 'email' as match_type
FROM contacts c1
JOIN contacts c2 ON LOWER(c1.email) = LOWER(c2.email)
WHERE c1.id < c2.id
  AND c1.is_active AND c2.is_active
  AND c1.agency_id = c2.agency_id
  AND c1.merged_into_contact_id IS NULL
  AND c2.merged_into_contact_id IS NULL
```

**Tier 2 — Phone + fuzzy name:**
```sql
SELECT c1.id, c2.id, 'phone_name' as match_type
FROM contacts c1
JOIN contacts c2 ON c1.phone = c2.phone AND c1.phone IS NOT NULL
WHERE c1.id < c2.id
  AND c1.is_active AND c2.is_active
  AND c1.agency_id = c2.agency_id
  AND c1.merged_into_contact_id IS NULL
  AND c2.merged_into_contact_id IS NULL
  AND similarity(
    LOWER(COALESCE(c1.first_name,'') || ' ' || COALESCE(c1.last_name,'')),
    LOWER(COALESCE(c2.first_name,'') || ' ' || COALESCE(c2.last_name,''))
  ) > 0.6
```

**Tier 3 — DOB + fuzzy name:**
```sql
SELECT c1.id, c2.id, 'dob_name' as match_type
FROM contacts c1
JOIN contacts c2 ON c1.date_of_birth = c2.date_of_birth AND c1.date_of_birth IS NOT NULL
WHERE c1.id < c2.id
  AND c1.is_active AND c2.is_active
  AND c1.agency_id = c2.agency_id
  AND c1.merged_into_contact_id IS NULL
  AND c2.merged_into_contact_id IS NULL
  AND similarity(
    LOWER(COALESCE(c1.first_name,'') || ' ' || COALESCE(c1.last_name,'')),
    LOWER(COALESCE(c2.first_name,'') || ' ' || COALESCE(c2.last_name,''))
  ) > 0.6
```

### Performance

853 contacts → ~363K pairs. With indexes (email, phone, DOB) the join-based approach is efficient because it only compares rows that share a key. The `similarity()` call is only on rows that already matched a key — not a full cross-join.

Run on-demand only (not on every page load). Cache results. Invalidate cache on contact create/update/merge.

### False Positive Dismissals

New table:

```sql
CREATE TABLE contact_duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  contact_id1 UUID NOT NULL REFERENCES contacts(id),
  contact_id2 UUID NOT NULL REFERENCES contacts(id),
  match_type VARCHAR(50) NOT NULL,
  dismissed_by UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id1, contact_id2, match_type)
);
```

Detection queries filter out dismissed pairs via `NOT EXISTS` subquery.

---

## API Endpoints

### Merge

`POST /contacts/merge`
```typescript
{
  primaryId: string
  secondaryId: string
  fieldOverrides: Record<string, 'primary' | 'secondary'>
}
```

Response: `{ success: true, mergedContactId: string, repointed: { trips: N, relationships: N, ... } }`

Runs in a single database transaction. If any re-point fails, entire merge rolls back.

### Duplicate Detection

`GET /contacts/duplicates`

Response:
```typescript
{
  groups: Array<{
    matchType: 'email' | 'phone_name' | 'dob_name'
    confidence: 'high' | 'medium'
    contacts: [ContactListItemDto, ContactListItemDto]
  }>
  totalGroups: number
}
```

### Dismiss Duplicate

`POST /contacts/duplicates/dismiss`
```typescript
{ contactId1: string, contactId2: string, matchType: string }
```

---

## UI Components

### Merge Editor Dialog

Triggered from bulk toolbar when exactly 2 contacts selected.

| File | Purpose |
|------|---------|
| `apps/admin/src/app/contacts/_components/merge-editor-dialog.tsx` | Side-by-side merge UI |

### Duplicate Report Page

| File | Purpose |
|------|---------|
| `apps/admin/src/app/contacts/duplicates/page.tsx` | Report page with duplicate groups |
| `apps/admin/src/app/contacts/duplicates/_components/duplicate-group-card.tsx` | Single group card |

### Hooks

| File | Purpose |
|------|---------|
| `apps/admin/src/hooks/use-contact-merge.ts` | Merge mutation + duplicates query |

### Backend

| File | Purpose |
|------|---------|
| `apps/api/src/contacts/contact-merge.service.ts` | Merge logic + all re-pointing |
| `apps/api/src/contacts/contact-merge.controller.ts` | Merge + duplicates endpoints |

### Migrations

| File | Purpose |
|------|---------|
| `{TS}_add_contact_merge_columns.sql` | merged_into_contact_id, merged_at, merged_by |
| `{TS}_add_pg_trgm_and_indexes.sql` | pg_trgm extension + name trigram index |
| `{TS}_create_duplicate_dismissals.sql` | contact_duplicate_dismissals table |

---

## Bulk Toolbar Integration

In `bulk-actions-toolbar.tsx`, show "Merge" button only when `selectedIds.size === 2`:
```typescript
{selectedIds.size === 2 && (
  <Button variant="outline" size="sm" onClick={onMerge}>
    <Merge className="h-3.5 w-3.5 mr-1" />
    Merge
  </Button>
)}
```

---

## Access Control

- Any agent can merge contacts they own or agency-wide contacts
- Agents cannot merge contacts owned by other agents (unless admin)
- Duplicate report shows all agency duplicates but merge respects ownership
- Merge audit trail: `merged_by` records who performed the merge

## Not Changing

- Contact create/update endpoints
- Contact import (already has its own duplicate handling)
- Contact detail page (except: handle merged-contact redirect)
- Tag system
