# Contact Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow agents to bulk-import contacts from CSV/Excel files with column mapping, server-side duplicate detection, merge logic, ownership rules, and auto-tagging.

**Architecture:** Client-side file parsing (Papa Parse + SheetJS) with column mapping and normalization. Server-side preview/confirm endpoints handle duplicate matching, ownership rules, and fill-only merge. Backend follows existing import pattern (cruise booking preview/confirm). Frontend is a 4-step wizard dialog.

**Tech Stack:** NestJS (backend endpoints), Papa Parse + SheetJS (client parsing), React Query mutations, shadcn/ui Dialog + Table + Command

**Spec:** `docs/superpowers/specs/2026-04-03-contact-import-design.md`

---

### Task 0: Fix ownerId persistence in ContactsService.create()

The `ownerId` field exists in the API DTO and DB schema but is not explicitly included in the service insert. Fix this prerequisite.

**Files:**
- Modify: `apps/api/src/contacts/contacts.service.ts` (~line 61-131)
- Modify: `packages/shared-types/src/api/contacts.types.ts` (~line 17-85, add ownerId to shared type)

- [ ] **Step 1: Add ownerId to shared CreateContactDto**

In `packages/shared-types/src/api/contacts.types.ts`, find the `CreateContactDto` interface and add:
```typescript
ownerId?: string | null
```

- [ ] **Step 2: Verify ownerId is passed in service create()**

In `apps/api/src/contacts/contacts.service.ts`, find the `create()` method's `.values({...})` block. Verify `ownerId` from the DTO is included in the insert values. If not, add:
```typescript
ownerId: dto.ownerId || null,
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(api): persist ownerId in ContactsService.create()

ownerId existed in the API DTO and DB schema but wasn't explicitly
included in the service insert values. Prerequisite for contact import."
```

---

### Task 1: Create ContactImportService with preview/confirm

The core backend service with duplicate matching, ownership rules, and fill-only merge.

**Files:**
- Create: `apps/api/src/contacts/contact-import.service.ts`

- [ ] **Step 1: Create the service**

```typescript
@Injectable()
export class ContactImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly contactsService: ContactsService,
    private readonly tagsService: TagsService,
  ) {}

  async preview(rows: ImportRow[], auth: AuthContext): Promise<ImportPreviewResult>
  async confirm(rows: ImportConfirmRow[], tags: string[], auth: AuthContext): Promise<ImportConfirmResult>
}
```

**preview() logic:**
1. Validate rows — skip those missing `firstName`
2. For each valid row, run duplicate matching:
   a. Query contacts with matching email (case-insensitive) within the agency
   b. If no email match, query contacts with matching firstName + lastName + dateOfBirth
   c. If no DOB available, query firstName + lastName only → `possible_match`
3. Apply multi-match rules: prefer agent-owned > agency-wide > most recent
4. Apply ownership rules: skip if owned by different agent
5. Return per-row disposition with match details

**confirm() logic:**
1. Re-run matching for each row (data may have changed since preview)
2. For `create` action: call `ContactsService.create()` with `ownerId = auth.userId`
3. For `merge` action: read current contact from DB, build fill-only payload (only null fields), update
4. For `skip` action: skip
5. After all creates/updates: assign tags to all successfully imported contacts
6. Return summary counts + per-row errors

**Types (define at top of file):**
```typescript
interface ImportRow {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  passportNumber?: string
  passportExpiry?: string
  passportCountry?: string
}

interface ImportConfirmRow extends ImportRow {
  action: 'create' | 'merge' | 'skip'
  mergeContactId?: string
}

type Disposition = 'new' | 'update' | 'possible_match' | 'skip_other_agent' | 'skip_invalid'

interface ImportPreviewResult {
  results: Array<{
    rowIndex: number
    disposition: Disposition
    matchedContactId?: string
    matchedContactName?: string
    matchedContactEmail?: string
    matchedContactOwner?: string
    matchType?: 'email' | 'name_dob' | 'name_only'
    fieldsToFill?: string[]
    validationErrors?: string[]
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

interface ImportConfirmResult {
  created: number
  updated: number
  skipped: number
  errors: Array<{ rowIndex: number; error: string }>
  tagName: string
}
```

**Duplicate matching query (for email):**
```typescript
const emailMatches = await this.db.client
  .select()
  .from(this.db.schema.contacts)
  .where(
    and(
      eq(this.db.schema.contacts.agencyId, auth.agencyId),
      eq(this.db.schema.contacts.isActive, true),
      sql`LOWER(${this.db.schema.contacts.email}) = LOWER(${row.email})`,
    )
  )
```

**Multi-match resolution:**
```typescript
function pickBestMatch(matches: Contact[], agentId: string): Contact | null {
  // Prefer agent-owned
  const agentOwned = matches.find(m => m.ownerId === agentId)
  if (agentOwned) return agentOwned
  // Then agency-wide
  const agencyWide = matches.filter(m => !m.ownerId)
  if (agencyWide.length > 0) return agencyWide.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  // All owned by other agents → skip
  return null
}
```

**Fill-only merge:**
```typescript
function buildFillOnlyPayload(existing: Contact, importRow: ImportRow): Partial<UpdateContactDto> {
  const payload: any = {}
  for (const [key, value] of Object.entries(importRow)) {
    if (value && !existing[key]) {
      payload[key] = value
    }
  }
  return payload
}
```

This is a large service (~300-400 lines). Implement the core logic with clear helper methods.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): create ContactImportService with preview/confirm

Server-side duplicate matching (email → name+DOB → name-only),
ownership rules, fill-only merge, multi-match resolution.
Follows cruise booking import pattern."
```

---

### Task 2: Create ContactImportController

REST endpoints for preview and confirm.

**Files:**
- Create: `apps/api/src/contacts/contact-import.controller.ts`
- Modify: `apps/api/src/contacts/contacts.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
@Controller('contacts/import')
export class ContactImportController {
  constructor(private readonly importService: ContactImportService) {}

  @Post('preview')
  async preview(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { rows: ImportRow[] },
  ) {
    return this.importService.preview(body.rows, auth)
  }

  @Post('confirm')
  async confirm(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { rows: ImportConfirmRow[]; tags: string[] },
  ) {
    return this.importService.confirm(body.rows, body.tags, auth)
  }
}
```

**IMPORTANT:** The route `contacts/import` must be registered BEFORE the `contacts/:id` catch-all route in the module. NestJS matches routes in registration order. Add `ContactImportController` BEFORE `ContactsController` in the module's controllers array.

- [ ] **Step 2: Register in contacts.module.ts**

In `apps/api/src/contacts/contacts.module.ts`, add to controllers (BEFORE ContactsController) and providers:
```typescript
controllers: [
  ContactImportController,  // Must be before ContactsController to avoid :id route conflict
  ContactsController,
  // ... rest
],
providers: [
  ContactImportService,
  // ... rest
],
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): add contact import preview/confirm endpoints

POST /contacts/import/preview and POST /contacts/import/confirm.
Registered before ContactsController to avoid route conflicts."
```

---

### Task 3: Add shared import types

Types shared between frontend and backend.

**Files:**
- Modify: `packages/shared-types/src/api/contacts.types.ts`

- [ ] **Step 1: Add import types to shared types**

At the end of `contacts.types.ts`, add the import-specific types:

```typescript
// ============================================================================
// Contact Import
// ============================================================================

export interface ContactImportRow {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string
  passportNumber?: string
  passportExpiry?: string
  passportCountry?: string
}

export interface ContactImportConfirmRow extends ContactImportRow {
  action: 'create' | 'merge' | 'skip'
  mergeContactId?: string
}

export type ContactImportDisposition = 'new' | 'update' | 'possible_match' | 'skip_other_agent' | 'skip_invalid'

export interface ContactImportPreviewResult {
  results: Array<{
    rowIndex: number
    disposition: ContactImportDisposition
    matchedContactId?: string
    matchedContactName?: string
    matchedContactEmail?: string
    matchedContactOwner?: string
    matchType?: 'email' | 'name_dob' | 'name_only'
    fieldsToFill?: string[]
    validationErrors?: string[]
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

export interface ContactImportConfirmResult {
  created: number
  updated: number
  skipped: number
  errors: Array<{ rowIndex: number; error: string }>
  tagName: string
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(types): add shared contact import types

ImportRow, ImportConfirmRow, PreviewResult, ConfirmResult types
shared between frontend wizard and backend endpoints."
```

---

### Task 4: Install client-side parsing dependencies

Add Papa Parse and SheetJS to the admin app.

**Files:**
- Modify: `apps/admin/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/admin && pnpm add papaparse xlsx && pnpm add -D @types/papaparse
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(admin): add papaparse and xlsx for contact import

Client-side CSV and Excel file parsing."
```

---

### Task 5: Create client-side parsing and normalization utilities

File parsing, column auto-detection, and data normalization.

**Files:**
- Create: `apps/admin/src/lib/import/parse-contacts.ts`
- Create: `apps/admin/src/lib/import/normalize-contacts.ts`
- Create: `apps/admin/src/lib/import/column-detection.ts`

- [ ] **Step 1: Create column-detection.ts**

Auto-detect column header → Tailfire field mapping. The mappable fields and their common header variants per spec.

```typescript
const FIELD_MAPPINGS: Record<string, string[]> = {
  firstName: ['first name', 'first', 'prénom', 'prenom', 'given name'],
  lastName: ['last name', 'last', 'nom', 'surname', 'family name'],
  email: ['email', 'e-mail', 'email address', 'courriel', 'mail'],
  phone: ['phone', 'telephone', 'cell', 'mobile', 'téléphone', 'tel'],
  dateOfBirth: ['dob', 'date of birth', 'birthday', 'birth date', 'date de naissance'],
  // ... all mappings from spec
}

export function detectColumnMapping(headers: string[]): Record<string, string>
export function splitFullName(fullName: string): { firstName: string; lastName: string }
```

- [ ] **Step 2: Create normalize-contacts.ts**

Date parsing, phone cleanup, country code conversion.

```typescript
export function normalizeDate(value: string): string | null  // → YYYY-MM-DD or null
export function normalizePhone(value: string): string | null  // → +digits or null
export function normalizeCountry(value: string): string | null  // → 3-letter ISO or null
export function normalizeRow(row: Record<string, string>, mapping: Record<string, string>): ContactImportRow
```

- [ ] **Step 3: Create parse-contacts.ts**

File parsing with Papa Parse and SheetJS.

```typescript
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }>
```

Detects file type from extension, uses Papa Parse for CSV, SheetJS for xlsx/xls.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): add contact import parsing and normalization utilities

Column auto-detection, date/phone/country normalization, CSV/Excel parsing.
Client-side only — prepares data for server-side preview endpoint."
```

---

### Task 6: Create useContactImport hooks

React Query mutations for preview and confirm.

**Files:**
- Create: `apps/admin/src/hooks/use-contact-import.ts`

- [ ] **Step 1: Create the hooks file**

Follow the existing `use-import-booking.ts` pattern:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { contactKeys } from './use-contacts'
import type {
  ContactImportRow,
  ContactImportConfirmRow,
  ContactImportPreviewResult,
  ContactImportConfirmResult,
} from '@tailfire/shared-types/api'

export function useContactImportPreview() {
  return useMutation({
    mutationFn: (data: { rows: ContactImportRow[] }) =>
      api.post<ContactImportPreviewResult>('/contacts/import/preview', data),
  })
}

export function useContactImportConfirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { rows: ContactImportConfirmRow[]; tags: string[] }) =>
      api.post<ContactImportConfirmResult>('/contacts/import/confirm', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.invalidateQueries({ queryKey: contactKeys.all })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): add useContactImportPreview and useContactImportConfirm hooks

React Query mutations following the cruise booking import pattern."
```

---

### Task 7: Create ImportColumnMapper component

Column mapping UI for Step 2 of the wizard.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/import-column-mapper.tsx`

- [ ] **Step 1: Create the component**

**Props:**
```typescript
interface ImportColumnMapperProps {
  headers: string[]
  autoMapping: Record<string, string>  // header → fieldName
  onMappingChange: (mapping: Record<string, string>) => void
}
```

Shows a table with:
- Left column: file headers
- Right column: Select dropdown with Tailfire field options + "Ignore" option
- Pre-filled from `autoMapping` (from column-detection.ts)
- Agent can override any mapping

~100-150 lines.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): create ImportColumnMapper component

Column mapping UI with auto-detected defaults and override dropdowns."
```

---

### Task 8: Create ImportPreviewTable component

Preview table showing disposition badges and per-row actions.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/import-preview-table.tsx`

- [ ] **Step 1: Create the component**

**Props:**
```typescript
interface ImportPreviewTableProps {
  previewResults: ContactImportPreviewResult
  rows: ContactImportRow[]
  selectedRows: Set<number>  // rowIndex set
  onSelectionChange: (selected: Set<number>) => void
  rowActions: Map<number, 'create' | 'merge' | 'skip'>  // for possible_match rows
  onRowActionChange: (rowIndex: number, action: 'create' | 'merge' | 'skip') => void
}
```

Shows:
- Summary bar at top with counts per disposition
- Table with: ☐ checkbox, Row #, Name, Email, Disposition badge, Match details, Action (for possible_match)
- Disposition colors: green (new), amber (update), blue (possible_match), gray (skip_other_agent), red (invalid)
- possible_match rows show a Select: "Merge with [Name]" / "Create New" / "Skip"

~200-250 lines.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): create ImportPreviewTable with disposition badges

Preview table with per-row selection, disposition coloring,
and action dropdowns for possible_match rows."
```

---

### Task 9: Create ContactImportWizard and wire into contacts page

The main 4-step wizard dialog that ties everything together.

**Files:**
- Create: `apps/admin/src/app/contacts/_components/contact-import-wizard.tsx`
- Modify: `apps/admin/src/app/contacts/page.tsx`

- [ ] **Step 1: Create the wizard component**

**Props:**
```typescript
interface ContactImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**4 steps managed via state:**
1. Upload — dropzone + file picker, parse on select
2. Column Mapping — ImportColumnMapper + tag input (auto-filled "Import {date}")
3. Preview — call `useContactImportPreview`, show ImportPreviewTable
4. Results — call `useContactImportConfirm`, show summary

Uses shadcn Dialog with step navigation (Back / Next / Import buttons).

~300-400 lines.

- [ ] **Step 2: Wire into contacts page**

In `apps/admin/src/app/contacts/page.tsx`, add:
- Import `ContactImportWizard`
- State: `const [showImport, setShowImport] = useState(false)`
- "Import" button next to "New Contact" button in header
- Render `<ContactImportWizard open={showImport} onOpenChange={setShowImport} />`

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): create ContactImportWizard 4-step dialog

Upload → Column Mapping → Preview → Import flow.
Wired into contacts page header with Import button."
```

---

### Task 10: Final build, PR, deploy

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/contact-import
gh pr create --base main --title "feat: Contact Import — CSV/Excel with column mapping and duplicate detection"
```

- [ ] **Step 3: Test locally**

1. Click "Import" on contacts page → wizard opens
2. Upload a CSV with "First Name, Last Name, Email, Phone" columns
3. Column mapping auto-detects, shows tag input with "Import 2026-04-03"
4. Preview shows rows with dispositions (new/update/skip)
5. Import → contacts created with correct ownership and tags
6. Verify on contacts page — new contacts appear with import tag
