# Contact Import — Design Spec

## Goal

Allow agents (not just admins) to bulk-import contacts from CSV/Excel files with column mapping, duplicate detection, and automatic tagging.

## Import Flow (4 steps)

### Step 1: Upload (client-side)
- Drag-drop zone or file picker
- Accepts `.csv`, `.xlsx`, `.xls`
- Parse client-side (Papa Parse for CSV, SheetJS for Excel)
- Show file name + row count after parse

### Step 2: Column Mapping (client-side)
- Left: detected file headers (e.g., "Full Name", "E-mail", "Cell Phone")
- Right: Tailfire field dropdown
- Auto-detect common headers: "First Name" → firstName, "Email" → email, "DOB" → dateOfBirth, "Phone" → phone, etc.
- "Full Name" auto-splits into firstName + lastName
- Unmapped columns shown as gray (ignored)
- Tag input: auto-filled with "Import {YYYY-MM-DD}", agent can add/edit/remove tags
- Client normalizes data before sending to server:
  - Dates → ISO `YYYY-MM-DD` (parse common formats: MM/DD/YYYY, DD-MMM-YYYY, etc.)
  - Country names → ISO 3-letter codes (Canada → CAN, United States → USA)
  - Phone numbers → strip formatting, keep digits + leading +
  - Trim whitespace on all fields

### Step 3: Preview (server-side matching)
- Client sends mapped + normalized rows to `POST /contacts/import/preview`
- Server runs duplicate matching and returns per-row disposition:
  - **New** (green): no match found → will create, importing agent becomes owner
  - **Update** (amber): matched contact (email or name+DOB) owned by agent or agency-wide → will fill empty fields
  - **Possible Match** (blue): name-only match found → agent must choose: merge, create new, or skip
  - **Skip - Other Agent** (gray): matched contact owned by a different agent → skip, don't touch
  - **Skip - Invalid** (red): missing firstName (only required field)
- For `possible_match` rows, agent selects per-row: "Merge with [Name]" / "Create New" / "Skip"
- Preview table shows first 100 rows with disposition + match details
- Summary bar: "45 new, 12 updates, 5 possible matches, 3 skipped (other agent), 2 invalid"
- Agent can uncheck individual rows to exclude them

### Step 4: Confirm (server-side execution)
- "Import N contacts" button sends selected rows to `POST /contacts/import/confirm`
- Each row carries an `action` field: `create`, `merge` (with `mergeContactId`), or `skip`
- Server re-runs matching to verify dispositions haven't changed since preview
- Processes each row independently (partial-success — row failures don't block other rows)
- Tags all successfully imported contacts with selected tags
- Returns summary: counts + any per-row errors


## Duplicate Matching Logic (server-side)

Priority order:
1. **Email exact match** — if imported row has email AND a contact in the agency has same email (case-insensitive) → match
2. **Name + DOB match** — if no email match, check firstName + lastName + dateOfBirth exact match (case-insensitive names)
3. **Name-only match** — if no DOB available, firstName + lastName exact match → treated as `possible_match` disposition. NOT auto-merged. Preview shows the candidate contact's details and the agent must explicitly choose per row: **merge** (update existing), **create new**, or **skip**.

Matching scoped to the agency (all contacts in the agency, not just the importing agent's).

### Multi-match rules

Email is NOT unique in the contacts table — multiple contacts can share an email. When a match query returns multiple results:

| Scenario | Rule |
|----------|------|
| Multiple email matches | Pick the one owned by the importing agent. If none, pick the agency-wide one (ownerId = null). If multiple agency-wide, pick the most recently updated. If all owned by other agents, skip. |
| Multiple name+DOB matches | Same priority: agent-owned > agency-wide > skip |
| Possible match (name-only) owned by another agent | Show in preview as `skip_other_agent`, not `possible_match` — agent can't merge with another agent's contact |

**Re-matching on confirm:** The server re-runs matching during confirm (not just preview) because contacts may have been created/modified between preview and confirm.

## Ownership Rules

| Scenario | Action | Owner After |
|----------|--------|-------------|
| No match found | Create new contact | Importing agent |
| Match: agency-wide (ownerId = null) | Update (fill empty fields) | Importing agent (takes ownership) |
| Match: owned by importing agent | Update (fill empty fields) | Importing agent (unchanged) |
| Match: owned by different agent | **Skip** — don't touch | Original agent (unchanged) |

**Key principle:** An agent can never modify another agent's contacts via import. Agency-wide contacts (no owner) are fair game — the importing agent claims them.

## Update Merge Logic

When updating a matched contact, only fill fields that are currently null/empty on the existing contact. Never overwrite existing data.

**IMPORTANT:** The server must build the fill-only payload by reading the current DB state and only including fields where the existing value is null/empty AND the import value is non-null. Sending all non-null import fields to `PUT /contacts/:id` would overwrite existing data — the fill-only logic must happen server-side in `contact-import.service.ts`, not via the existing PUT endpoint directly.

```
Existing: { firstName: "John", email: "john@email.com", phone: null, city: "Ottawa" }
Import:   { firstName: "John", email: "john@email.com", phone: "+1613555000", city: "Toronto" }
Payload:  { phone: "+1613555000" }  ← only null fields with import values
Result:   { firstName: "John", email: "john@email.com", phone: "+1613555000", city: "Ottawa" }
```

## Auto-Tagging

- All imported contacts receive the tag(s) specified in Step 2
- Default tag: "Import {YYYY-MM-DD}" (e.g., "Import 2026-04-03")
- Agent can add custom tags (e.g., "Wedding Group Smith", "Corporate Acme")
- Tag assignment uses existing tag system: create tag if it doesn't exist, then assign to contact
- Tags are additive — if contact already has tags, import tags are merged (not replaced)

## Mappable Fields

| Tailfire Field | Auto-detect Headers |
|---------------|-------------------|
| firstName | "First Name", "First", "Prénom" |
| lastName | "Last Name", "Last", "Nom" |
| email | "Email", "E-mail", "Email Address", "Courriel" |
| phone | "Phone", "Telephone", "Cell", "Mobile", "Téléphone" |
| dateOfBirth | "DOB", "Date of Birth", "Birthday", "Birth Date", "Date de naissance" |
| addressLine1 | "Address", "Street", "Address Line 1", "Adresse" |
| addressLine2 | "Address 2", "Apt", "Suite", "Unit" |
| city | "City", "Ville" |
| province | "Province", "State", "Region" |
| postalCode | "Postal Code", "Zip", "Zip Code", "Code Postal" |
| country | "Country", "Pays" |
| passportNumber | "Passport", "Passport Number", "Passport #" |
| passportExpiry | "Passport Expiry", "Passport Exp", "Expiry Date" |
| passportCountry | "Passport Country", "Issuing Country" |

Special: "Full Name" / "Name" / "Nom Complet" → auto-split into firstName + lastName

## API Endpoints (new)

### `POST /contacts/import/preview`

**Request:**
```typescript
{
  rows: Array<{
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    dateOfBirth?: string  // ISO YYYY-MM-DD
    addressLine1?: string
    addressLine2?: string
    city?: string
    province?: string
    postalCode?: string
    country?: string      // ISO 3-letter
    passportNumber?: string
    passportExpiry?: string // ISO YYYY-MM-DD
    passportCountry?: string // ISO 3-letter
  }>
}
```

**Response:**
```typescript
{
  results: Array<{
    rowIndex: number
    disposition: 'new' | 'update' | 'possible_match' | 'skip_other_agent' | 'skip_invalid'
    matchedContactId?: string
    matchedContactName?: string
    matchedContactEmail?: string
    matchedContactOwner?: string  // Agent name if owned by another agent
    matchType?: 'email' | 'name_dob' | 'name_only'
    fieldsToFill?: string[]  // Which fields would be updated
    validationErrors?: string[]  // e.g., "Missing firstName"
  }>
  summary: {
    newCount: number
    updateCount: number
    possibleMatchCount: number
    skipOtherAgentCount: number
    skipInvalidCount: number
    totalRows: number
  }
}
```

### `POST /contacts/import/confirm`

**Request:**
```typescript
{
  rows: Array<{
    ...contactFields,  // Same fields as preview
    action: 'create' | 'merge' | 'skip'  // Agent decision per row
    mergeContactId?: string  // Which contact to merge with (for possible_match rows)
  }>
  tags: string[]       // Tag names to apply
}
```

**Response:**
```typescript
{
  created: number
  updated: number
  skipped: number
  errors: Array<{ rowIndex: number; error: string }>
  tagName: string  // The import tag that was created/used
}
```

**Semantics:** Partial-success batch — each row is processed independently. If row 5 fails, rows 1-4 and 6+ are still committed. Errors are returned per-row so the agent can see what failed and retry those rows.
```

## Architecture

### Files

| File | Purpose |
|------|---------|
| `apps/admin/src/app/contacts/_components/contact-import-wizard.tsx` | Main 4-step wizard dialog |
| `apps/admin/src/app/contacts/_components/import-column-mapper.tsx` | Column mapping UI with auto-detect |
| `apps/admin/src/app/contacts/_components/import-preview-table.tsx` | Preview table with disposition badges |
| `apps/admin/src/lib/import/parse-contacts.ts` | Client-side file parsing (Papa Parse + SheetJS) |
| `apps/admin/src/lib/import/normalize-contacts.ts` | Date, phone, country normalization |
| `apps/admin/src/lib/import/column-detection.ts` | Auto-detect column header → field mapping |
| `apps/admin/src/hooks/use-contact-import.ts` | React Query mutations for preview + confirm |
| `apps/api/src/contacts/contact-import.controller.ts` | Preview + Confirm endpoints |
| `apps/api/src/contacts/contact-import.service.ts` | Matching, merge logic, bulk create/update |

### Dependencies to Add
- `papaparse` — CSV parsing (client-side)
- `xlsx` (SheetJS) — Excel parsing (client-side)
- Both added to `apps/admin/package.json` only

## Access Control

- **Any agent can import** — not admin-only
- Imported contacts have `ownerId = currentUser.id`
- Matched contacts owned by other agents are silently skipped
- Agency-wide contacts (ownerId = null) are claimed by the importing agent
- The import endpoints respect the same agency scoping as other contact endpoints

## Prerequisites (fix before import)

- **ownerId in create flow:** The `ownerId` field exists on the contacts table but is not reliably persisted via `POST /contacts`. Add `ownerId` to `CreateContactDto` shared type and ensure `ContactsService.create()` persists it. The import service sets `ownerId = currentUserId` for all new contacts.
- **Remove notes from mappable fields:** Unless real contact notes support exists (notes are currently only on the detail page activity timeline, not a contact field). If `notes` is a real column on contacts, keep it.

## Not Changing

- Contact create/update DTOs (reuse existing)
- Tag system (reuse existing create + assign)
- Contact detail page
- Contact list/CRM portal (import just adds contacts to the existing system)
