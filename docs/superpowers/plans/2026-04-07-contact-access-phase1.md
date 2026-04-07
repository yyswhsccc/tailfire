# Contact Access Hardening — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all backend data leak paths and establish a proper allowlist-based response for basic-access contacts.

**Architecture:** Modify `ContactAccessService.filterSensitiveFields()` to null all non-allowed fields (preserving DTO shape). Add `_ownerName` and `_shareRequestStatus` metadata fields. Add `scope` query parameter to contact list. Add access checks to notes, relationships, calendar birthdays, contact trips/bookings, and filter-options endpoints.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, TypeScript shared types

**Spec:** `docs/superpowers/specs/2026-04-07-contact-access-ux-design.md`
**Branch:** `feature/contact-access-ux`

---

## File Map

### Modified Files
| File | Change |
|------|--------|
| `packages/shared-types/src/api/contacts.types.ts` | Add `_ownerName`, `_shareRequestStatus` to response DTOs; add `scope` to filter DTO |
| `apps/api/src/contacts/contact-access.service.ts` | Replace blacklist with allowlist null-filter; add `_ownerName` and `_shareRequestStatus` computation |
| `apps/api/src/contacts/dto/contact-filter.dto.ts` | Add `scope` validation |
| `apps/api/src/contacts/contacts.service.ts` | Add scope filter to `findAll()`; scope `getContactFilterOptions()` |
| `apps/api/src/contacts/contacts.controller.ts` | Pass scope; fix trips/bookings endpoints to return 403 for basic access |
| `apps/api/src/calendar/calendar.service.ts` | Filter birthday events by contact ownership/shares |
| `apps/api/src/notes/notes.controller.ts` | Add contact access checks to all note CRUD |
| `apps/api/src/contacts/contact-relationships.controller.ts` | Add contact access checks |

---

## Task 1: Add Access Metadata Types to Shared Types

**Files:**
- Modify: `packages/shared-types/src/api/contacts.types.ts`

- [ ] **Step 1: Add `_ownerName` and `_shareRequestStatus` to `ContactResponseDto`**

Find the `ContactResponseDto` interface (around line 267) and add these fields alongside the existing `_accessLevel`:

```typescript
  _accessLevel?: 'full' | 'basic'
  _ownerName?: string | null
  _shareRequestStatus?: 'none' | 'pending' | 'approved' | 'denied' | null
```

- [ ] **Step 2: Add `scope` to `ContactFilterDto`**

Find the `ContactFilterDto` interface (around line 228) and add:

```typescript
  scope?: 'mine' | 'all'
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/api/contacts.types.ts
git commit -m "feat: add access metadata and scope filter to contact types"
```

---

## Task 2: Replace Blacklist with Allowlist in ContactAccessService

**Files:**
- Modify: `apps/api/src/contacts/contact-access.service.ts`

- [ ] **Step 1: Define the allowlist constant**

Replace the existing `SENSITIVE_FIELDS` constant (lines 27-51) with an allowlist:

```typescript
/**
 * Fields visible to basic-access users.
 * All other fields are nulled (not omitted) to preserve DTO shape.
 */
export const BASIC_VIEW_ALLOWED_FIELDS = [
  'id',
  'firstName',
  'lastName',
  'email',
  'phone',
  'ownerId',
  'agencyId',
  'isActive',
  'createdAt',
  'updatedAt',
  '_accessLevel',
  '_ownerName',
  '_shareRequestStatus',
] as const
```

- [ ] **Step 2: Replace `filterSensitiveFields()` with allowlist-based filter**

Replace the existing `filterSensitiveFields()` method (around line 209) with:

```typescript
  /**
   * Filter contact fields based on access level using an allowlist.
   * Non-allowed fields are set to null (not omitted) to preserve DTO shape.
   */
  filterToBasicView(contact: ContactResponseDto): ContactResponseDto {
    const filtered = { ...contact }
    const allowedSet = new Set<string>(BASIC_VIEW_ALLOWED_FIELDS)

    for (const key of Object.keys(filtered)) {
      if (!allowedSet.has(key)) {
        const value = (filtered as Record<string, unknown>)[key]
        if (Array.isArray(value)) {
          ;(filtered as Record<string, unknown>)[key] = []
        } else if (value !== null && typeof value === 'object') {
          ;(filtered as Record<string, unknown>)[key] = null
        } else {
          ;(filtered as Record<string, unknown>)[key] = null
        }
      }
    }
    return filtered
  }
```

- [ ] **Step 3: Update `applyAccessControl()` to use new filter**

Replace the method body (around line 228):

```typescript
  async applyAccessControl(
    contact: ContactResponseDto,
    auth: AuthContext,
  ): Promise<ContactResponseDto> {
    const access = await this.canAccessSensitiveData(contact.id, auth)
    if (access.canAccessSensitive) {
      return { ...contact, _accessLevel: 'full' as const }
    }
    return { ...this.filterToBasicView(contact), _accessLevel: 'basic' as const }
  }
```

- [ ] **Step 4: Update `applyAccessControlToMany()` to use new filter**

In the method (around line 242), replace the last line of the `map()` callback:

```typescript
      // Basic access only — apply allowlist filter
      return { ...this.filterToBasicView(contact), _accessLevel: 'basic' as const }
```

Replace the old line:
```typescript
      return { ...this.filterSensitiveFields(contact, false), _accessLevel: 'basic' as const }
```

- [ ] **Step 5: Remove old `filterSensitiveFields()` method and `SENSITIVE_FIELDS` constant**

Delete the `SENSITIVE_FIELDS` array and the `filterSensitiveFields()` method since they are replaced by `BASIC_VIEW_ALLOWED_FIELDS` and `filterToBasicView()`. Keep `filterSnapshotFields()` as-is (it uses its own allowlist for trip traveler snapshots).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contacts/contact-access.service.ts
git commit -m "feat: replace contact access blacklist with allowlist-based null filter"
```

---

## Task 3: Add _ownerName and _shareRequestStatus to Access Control

**Files:**
- Modify: `apps/api/src/contacts/contact-access.service.ts`
- Modify: `apps/api/src/contacts/contacts.service.ts`

- [ ] **Step 1: Add owner name lookup to `applyAccessControlToMany()`**

In `applyAccessControlToMany()`, after fetching shares, batch-fetch owner names:

```typescript
    // Batch fetch owner names for all contacts
    const ownerIds = [...new Set(contacts.map(c => c.ownerId).filter(Boolean))] as string[]
    const ownerNameMap = new Map<string, string>()
    if (ownerIds.length > 0) {
      const owners = await this.db.client
        .select({
          id: this.db.schema.userProfiles.id,
          firstName: this.db.schema.userProfiles.firstName,
          lastName: this.db.schema.userProfiles.lastName,
        })
        .from(this.db.schema.userProfiles)
        .where(inArray(this.db.schema.userProfiles.id, ownerIds))

      for (const owner of owners) {
        ownerNameMap.set(owner.id, [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Unknown')
      }
    }

    // Batch fetch pending share requests for current user
    const contactIds = contacts.map(c => c.id)
    const shareRequestMap = new Map<string, string>()
    if (contactIds.length > 0) {
      const requests = await this.db.client
        .select({
          contactId: this.db.schema.contactShareRequests.contactId,
          status: this.db.schema.contactShareRequests.status,
        })
        .from(this.db.schema.contactShareRequests)
        .where(
          and(
            inArray(this.db.schema.contactShareRequests.contactId, contactIds),
            eq(this.db.schema.contactShareRequests.requestedByUserId, auth.userId),
          ),
        )

      for (const req of requests) {
        // Keep the most relevant status (pending > approved > denied)
        if (!shareRequestMap.has(req.contactId) || req.status === 'pending') {
          shareRequestMap.set(req.contactId, req.status)
        }
      }
    }
```

Then update the `.map()` callback to include these fields on every contact:

```typescript
    return contacts.map((contact) => {
      const ownerName = contact.ownerId ? (ownerNameMap.get(contact.ownerId) || null) : null
      const shareRequestStatus = shareRequestMap.get(contact.id) || 'none'
      const metadata = { _ownerName: ownerName, _shareRequestStatus: shareRequestStatus }

      // Owner has full access
      if (contact.ownerId === auth.userId) {
        return { ...contact, ...metadata, _accessLevel: 'full' as const }
      }

      // Check share
      const shareLevel = shareMap.get(contact.id)
      if (shareLevel === 'full') {
        return { ...contact, ...metadata, _accessLevel: 'full' as const }
      }

      // Basic access only — apply allowlist filter
      return { ...this.filterToBasicView(contact), ...metadata, _accessLevel: 'basic' as const }
    })
```

- [ ] **Step 2: Do the same for `applyAccessControl()` (single contact)**

Update `applyAccessControl()` to also fetch and attach `_ownerName` and `_shareRequestStatus`:

```typescript
  async applyAccessControl(
    contact: ContactResponseDto,
    auth: AuthContext,
  ): Promise<ContactResponseDto> {
    const access = await this.canAccessSensitiveData(contact.id, auth)

    // Fetch owner name
    let ownerName: string | null = null
    if (contact.ownerId) {
      const [owner] = await this.db.client
        .select({ firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
        .limit(1)
      if (owner) {
        ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null
      }
    }

    // Fetch share request status
    let shareRequestStatus: string = 'none'
    if (auth.role !== 'admin') {
      const [request] = await this.db.client
        .select({ status: this.db.schema.contactShareRequests.status })
        .from(this.db.schema.contactShareRequests)
        .where(
          and(
            eq(this.db.schema.contactShareRequests.contactId, contact.id),
            eq(this.db.schema.contactShareRequests.requestedByUserId, auth.userId),
          ),
        )
        .orderBy(desc(this.db.schema.contactShareRequests.createdAt))
        .limit(1)
      if (request) {
        shareRequestStatus = request.status
      }
    }

    const metadata = { _ownerName: ownerName, _shareRequestStatus: shareRequestStatus }

    if (access.canAccessSensitive) {
      return { ...contact, ...metadata, _accessLevel: 'full' as const }
    }
    return { ...this.filterToBasicView(contact), ...metadata, _accessLevel: 'basic' as const }
  }
```

- [ ] **Step 3: Add required imports**

Add `inArray` and `desc` to the drizzle-orm imports at the top of the file, and import `userProfiles` and `contactShareRequests` from the schema if not already imported.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contacts/contact-access.service.ts
git commit -m "feat: add _ownerName and _shareRequestStatus to contact access control"
```

---

## Task 4: Add Server-Side Scope Filter

**Files:**
- Modify: `apps/api/src/contacts/dto/contact-filter.dto.ts`
- Modify: `apps/api/src/contacts/contacts.service.ts`
- Modify: `apps/api/src/contacts/contacts.controller.ts`

- [ ] **Step 1: Add `scope` to the runtime DTO**

In `contact-filter.dto.ts`, add the `scope` field:

```typescript
  @IsOptional()
  @IsString()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all'
```

- [ ] **Step 2: Add scope filter to `findAll()` in contacts.service.ts**

In the `findAll()` method, after the agency filter condition (around line 155), add the scope filter:

```typescript
    // Scope filter: 'mine' = owned + full shares, 'all' = agency-wide
    const scope = filters.scope || 'all'
    if (scope === 'mine' && userId) {
      conditions.push(
        sql`(
          ${this.db.schema.contacts.ownerId} = ${userId}
          OR EXISTS (
            SELECT 1 FROM contact_shares cs
            WHERE cs.contact_id = contacts.id
            AND cs.shared_with_user_id = ${userId}
            AND cs.access_level = 'full'
          )
        )`,
      )
    }
```

- [ ] **Step 3: Scope `getContactFilterOptions()` to respect contact access**

In `getContactFilterOptions()`, add an optional `scope` parameter and filter tags to only contacts the user can access when `scope=mine`:

```typescript
  async getContactFilterOptions(
    agencyId: string,
    userId: string,
    scope?: 'mine' | 'all',
  ): Promise<{ tags: string[] }> {
    const conditions = [
      eq(this.db.schema.contacts.agencyId, agencyId),
      eq(this.db.schema.contacts.isActive, true),
      eq(this.db.schema.tags.agencyId, agencyId),
      or(
        eq(this.db.schema.tags.type, 'system'),
        and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, userId)),
      ),
    ]

    if (scope === 'mine') {
      conditions.push(
        sql`(
          ${this.db.schema.contacts.ownerId} = ${userId}
          OR EXISTS (
            SELECT 1 FROM contact_shares cs
            WHERE cs.contact_id = contacts.id
            AND cs.shared_with_user_id = ${userId}
            AND cs.access_level = 'full'
          )
        )`,
      )
    }

    const tagsResult = await this.db.client
      .selectDistinct({ tag: this.db.schema.tags.name })
      .from(this.db.schema.tags)
      .innerJoin(this.db.schema.contactTags, eq(this.db.schema.tags.id, this.db.schema.contactTags.tagId))
      .innerJoin(this.db.schema.contacts, eq(this.db.schema.contacts.id, this.db.schema.contactTags.contactId))
      .where(and(...conditions))

    return { tags: tagsResult.map(r => r.tag).filter((t): t is string => t !== null).sort() }
  }
```

- [ ] **Step 4: Update controller to pass scope**

In `contacts.controller.ts`, update the `findAll` endpoint to pass `filters.scope`, and update `getFilterOptions` to accept and pass scope:

```typescript
  @Get('filter-options')
  async getFilterOptions(
    @GetAuthContext() auth: AuthContext,
    @Query('scope') scope?: 'mine' | 'all',
  ): Promise<{ tags: string[] }> {
    return this.contactsService.getContactFilterOptions(auth.agencyId, auth.userId, scope)
  }
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/dto/contact-filter.dto.ts apps/api/src/contacts/contacts.service.ts apps/api/src/contacts/contacts.controller.ts
git commit -m "feat: add server-side scope filter for contact list (mine/all)"
```

---

## Task 5: Fix Contact Trips and Bookings Endpoints

**Files:**
- Modify: `apps/api/src/contacts/contacts.controller.ts`

- [ ] **Step 1: Return 403 for basic access on trips endpoint**

Replace the current `GET /:id/trips` endpoint (lines 112-128) to return 403 for basic access instead of filtering:

```typescript
  @Get(':id/trips')
  async getTrips(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    // Verify contact access — basic access users cannot see trip associations
    if (auth.role !== 'admin') {
      const accessResult = await this.contactAccessService.canAccessSensitiveData(id, auth)
      if (!accessResult.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to view trips')
      }
    }
    return this.contactsService.getTripsForContact(id, auth.agencyId)
  }
```

- [ ] **Step 2: Same for bookings endpoint**

Replace the `GET /:id/bookings` endpoint (lines 135-153):

```typescript
  @Get(':id/bookings')
  async getBookings(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    // Verify contact access — basic access users cannot see booking associations
    if (auth.role !== 'admin') {
      const accessResult = await this.contactAccessService.canAccessSensitiveData(id, auth)
      if (!accessResult.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to view bookings')
      }
    }
    await this.contactsService.findOne(id, auth.agencyId)
    return this.contactsService.getBookingsForContact(id, auth.agencyId)
  }
```

- [ ] **Step 3: Add ForbiddenException import if missing**

Ensure `ForbiddenException` is imported from `@nestjs/common`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contacts/contacts.controller.ts
git commit -m "fix: return 403 for basic-access users on contact trips/bookings endpoints"
```

---

## Task 6: Fix Calendar Birthday Leak

**Files:**
- Modify: `apps/api/src/calendar/calendar.service.ts`

- [ ] **Step 1: Add ownership/share filter to birthday query**

In the `getBirthdayEvents()` method (around line 555), after the existing conditions and before the query execution, add a non-admin ownership filter:

```typescript
    // Non-admin users only see birthdays for contacts they own or have shared access to
    if (auth.role !== 'admin') {
      conditions.push(
        sql`(
          ${this.db.schema.contacts.ownerId} = ${auth.userId}
          OR EXISTS (
            SELECT 1 FROM contact_shares cs
            WHERE cs.contact_id = contacts.id
            AND cs.shared_with_user_id = ${auth.userId}
          )
        )`,
      )
    }
```

This goes after the existing `query.contactId` condition check and before the `this.db.client.select(...)` call.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/calendar/calendar.service.ts
git commit -m "fix: filter calendar birthdays by contact ownership/shares"
```

---

## Task 7: Fix Notes Access Leak

**Files:**
- Modify: `apps/api/src/notes/notes.controller.ts`

- [ ] **Step 1: Add ContactAccessService injection**

Add `ContactAccessService` to the controller's constructor injection. Import it and add to the module if needed:

```typescript
import { ContactAccessService } from '../contacts/contact-access.service'

// In constructor:
constructor(
  private readonly notesService: NotesService,
  private readonly contactAccessService: ContactAccessService,
) {}
```

- [ ] **Step 2: Add access check helper method**

Add a private method to the controller:

```typescript
  private async verifyContactAccess(contactId: string | null | undefined, auth: AuthContext): Promise<void> {
    if (!contactId) return // Notes not attached to a contact are fine
    if (auth.role === 'admin') return

    const access = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
    if (!access.canAccessSensitive) {
      throw new ForbiddenException('Full contact access required for notes')
    }
  }
```

- [ ] **Step 3: Add access check to create note endpoint**

In the `POST /` handler, before creating the note, add:

```typescript
    await this.verifyContactAccess(dto.contactId, auth)
```

- [ ] **Step 4: Add access check to get note, update, delete, and pin endpoints**

For `GET /notes/:id`, `PUT /notes/:id`, `DELETE /notes/:id`, and `PATCH /notes/:id/pin` — fetch the note first to get its `contactId`, then verify access:

```typescript
    const note = await this.notesService.findOne(id, auth.agencyId)
    await this.verifyContactAccess(note.contactId, auth)
```

- [ ] **Step 5: Add access check to list notes endpoint**

For `GET /` with `contactId` filter, verify access before listing:

```typescript
    if (filters.contactId) {
      await this.verifyContactAccess(filters.contactId, auth)
    }
```

- [ ] **Step 6: Update the notes module to provide ContactAccessService**

In `apps/api/src/notes/notes.module.ts`, import and add `ContactAccessService` to the providers (or import the `ContactsModule` if it exports the service).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/notes/notes.controller.ts apps/api/src/notes/notes.module.ts
git commit -m "fix: add contact access checks to all note CRUD endpoints"
```

---

## Task 8: Fix Relationships Access Leak

**Files:**
- Modify: `apps/api/src/contacts/contact-relationships.controller.ts`

- [ ] **Step 1: Add ContactAccessService injection**

The controller is likely already in the contacts module, so `ContactAccessService` should be available. Add it to the constructor:

```typescript
constructor(
  private readonly contactRelationshipsService: ContactRelationshipsService,
  private readonly contactAccessService: ContactAccessService,
) {}
```

- [ ] **Step 2: Add access check to create relationship**

In the `POST /` handler, verify full access to both contacts:

```typescript
    if (auth.role !== 'admin') {
      const access1 = await this.contactAccessService.canAccessSensitiveData(dto.contactId1, auth)
      const access2 = await this.contactAccessService.canAccessSensitiveData(dto.contactId2, auth)
      if (!access1.canAccessSensitive || !access2.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to manage relationships')
      }
    }
```

- [ ] **Step 3: Add access check to list relationships**

In the `GET /` handler, if filtering by contactId, verify access:

```typescript
    if (filters.contactId && auth.role !== 'admin') {
      const access = await this.contactAccessService.canAccessSensitiveData(filters.contactId, auth)
      if (!access.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to view relationships')
      }
    }
```

- [ ] **Step 4: Add access check to update and delete**

For `PUT /:id` and `DELETE /:id`, fetch the relationship first to get both contact IDs, then verify access to at least one:

```typescript
    const relationship = await this.contactRelationshipsService.findOne(id, auth.agencyId)
    if (auth.role !== 'admin') {
      const access1 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId1, auth)
      const access2 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId2, auth)
      if (!access1.canAccessSensitive && !access2.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to manage relationships')
      }
    }
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contact-relationships.controller.ts
git commit -m "fix: add contact access checks to relationship CRUD endpoints"
```

---

## Task 9: Verify and Test

- [ ] **Step 1: Run the API typecheck**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit
```

Expected: No new type errors from our changes.

- [ ] **Step 2: Run the admin typecheck**

```bash
pnpm --filter @tailfire/admin exec tsc --noEmit
```

Expected: No new type errors (shared types changed but frontend hasn't consumed new fields yet — they're optional).

- [ ] **Step 3: Verify locally with turbo dev**

Start the dev server and test:
1. Log in as admin — contacts should show all fields (full access)
2. Log in as a non-admin agent — contacts they don't own should show nulled fields (basic access)
3. Calendar should only show birthdays for owned/shared contacts
4. Notes on someone else's contact should return 403

- [ ] **Step 4: Final commit and push**

```bash
git push -u origin feature/contact-access-ux
```
