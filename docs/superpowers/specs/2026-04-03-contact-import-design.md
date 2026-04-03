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
  - **Update** (amber): matched agency-wide contact → will fill empty fields, importing agent becomes owner
  - **Skip - Other Agent** (gray): matched contact owned by a different agent → skip, don't touch
  - **Skip - Invalid** (red): missing firstName (only required field)
- Preview table shows first 100 rows with disposition + match details
- Summary bar: "45 new, 12 updates, 3 skipped (other agent), 2 invalid"
- Agent can uncheck individual rows to exclude them

### Step 4: Confirm (server-side execution)
- "Import N contacts" button sends selected rows to `POST /contacts/import/confirm`
- Server creates/updates in a transaction
- Tags all imported contacts with selected tags
- Returns summary: counts + any per-row errors
- Client shows results with success/error breakdown

## Duplicate Matching Logic (server-side)

Priority order:
1. **Email exact match** — if imported row has email AND a contact in the agency has same email (case-insensitive) → match
2. **Name + DOB match** — if no email match, check firstName + lastName + dateOfBirth exact match (case-insensitive names)
3. **Name-only match** — if no DOB available, firstName + lastName exact match → treated as "possible match", shown in preview but NOT auto-merged. Agent must confirm.

Matching scoped to the agency (all contacts in the agency, not just the importing agent's).

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

```
Existing: { firstName: "John", email: "john@email.com", phone: null, city: "Ottawa" }
Import:   { firstName: "John", email: "john@email.com", phone: "+1613555000", city: "Toronto" }
Result:   { firstName: "John", email: "john@email.com", phone: "+1613555000", city: "Ottawa" }
                                                         ↑ filled                    ↑ NOT overwritten
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
| notes | "Notes", "Comments", "Remarks" |

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
    notes?: string
  }>
}
```

**Response:**
```typescript
{
  results: Array<{
    rowIndex: number
    disposition: 'new' | 'update' | 'skip_other_agent' | 'skip_invalid'
    matchedContactId?: string
    matchedContactName?: string
    matchedContactOwner?: string  // Agent name if owned by another agent
    matchType?: 'email' | 'name_dob' | 'name_only'
    fieldsToFill?: string[]  // Which fields would be updated
    validationErrors?: string[]  // e.g., "Missing firstName"
  }>
  summary: {
    newCount: number
    updateCount: number
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
  rows: Array<{...}>  // Same as preview, but only selected rows
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

## Not Changing

- Contact create/update DTOs (reuse existing)
- Tag system (reuse existing create + assign)
- Contact detail page
- Contact list/CRM portal (import just adds contacts to the existing system)
