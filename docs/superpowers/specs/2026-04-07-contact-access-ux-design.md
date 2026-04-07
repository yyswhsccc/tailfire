# Contact Access UX Hardening Design

**Date:** 2026-04-07
**Goal:** Make contact access limitations visible, close data leak paths, and complete the share request workflow.
**Validated by:** User + Codex (deep codebase analysis)
**Branch:** `feature/contact-access-ux`

---

## Policy Decisions

| Question | Decision |
|----------|----------|
| Agency-wide contacts (no owner) | **Basic access** — Name, Email, Phone only |
| Shared contacts | Full access, activity logged |
| Default contacts list view | "My Contacts" (owned + shared) |
| Duplicate detection on create | Deferred to Phase 4 |

---

## Access Tiers

| Tier | Can See | Can Edit | Can See Trips/Payments/Docs | Notes |
|------|---------|----------|----------------------------|-------|
| **Owner** | Everything | Yes | Yes | Full access |
| **Shared (full)** | Everything | Yes | Yes | Activity logged |
| **Admin** | Everything | Yes | Yes | Can manage all contacts |
| **Agency-wide (no owner)** | Name, Email, Phone | No | No | Basic access — must claim or request |
| **Someone else's** | Name, Email, Phone | No | No | Can request access |

---

## Phase 1: Backend Access Hardening

### 1a: Allowlist Response Shape for Basic View

**Current behavior:** `filterSensitiveFields()` in `contact-access.service.ts:24` uses a blacklist — nulls specific sensitive fields but still exposes tags, lifecycle, portal status, next trip, relationship count, and other business metadata.

**New behavior:** Replace with an allowlist. Basic view contacts **null all non-allowed fields** (not omit — the full DTO shape is preserved to prevent frontend crashes). Allowed fields:
- `id`
- `firstName`
- `lastName`
- `email`
- `phone`
- `ownerId`
- `_accessLevel` (existing field)
- `_ownerName` (new field — see 1b)
- `_shareRequestStatus` (new field — see 1b)

All other fields are set to `null` (or `[]` for arrays, `{}` for objects). This preserves the `ContactResponseDto` shape so existing table/kanban renderers don't crash on missing fields like `contactStatus`, `contactType`, or `displayName`.

> **Codex finding:** Omitting fields entirely would break `contacts-table.tsx:318` (`formatStatusLabel(contact.contactStatus)`) and similar hard assumptions. Nulling is safer and allows Phase 1a to ship independently of Phase 2 frontend changes.

**Files:**
- `apps/api/src/contacts/contact-access.service.ts` — replace `filterSensitiveFields()` with `applyAllowlistFilter()` using an explicit field allowlist (null non-allowed fields)

### 1b: Add Access Metadata to Contact Response

Add three new computed fields to `ContactResponseDto` and `ContactListItemDto`:

| Field | Type | Source |
|-------|------|--------|
| `_ownerName` | `string \| null` | JOIN on `user_profiles.firstName + lastName` where `contacts.owner_id = user_profiles.id` |
| `_shareRequestStatus` | `'none' \| 'pending' \| 'approved' \| 'denied' \| null` | Query `contact_share_requests` for current user + contact |
| `_accessLevel` | `'full' \| 'basic'` | Already exists — keep as-is |

**Files:**
- `packages/shared-types/src/api/contacts.types.ts` — add `_ownerName` and `_shareRequestStatus` to DTOs
- `apps/api/src/contacts/contact-access.service.ts` — compute and attach these fields in `applyAccessControl()` and `applyAccessControlToMany()`
- `apps/api/src/contacts/contacts.service.ts` — include owner JOIN in contact queries

### 1c: Server-Side List Scope Filter

Add a `scope` query parameter to `GET /contacts`:

| Value | Returns |
|-------|---------|
| `mine` | Contacts where user is owner OR has a share (default for non-admin) |
| `all` | All agency contacts (with access control applied to each) |

Admin users default to `all`.

**`scope=mine` includes:** owned contacts + full shares. Basic shares are excluded (basic share = limited view, not "my" contact).

**Files:**
- `packages/shared-types/src/api/contacts.types.ts` — add `scope` to `ContactFilterDto`
- `apps/api/src/contacts/dto/contact-filter.dto.ts` — add `scope` field with validation
- `apps/api/src/contacts/contacts.service.ts` — apply scope filter in list query
- `apps/api/src/contacts/contacts.controller.ts` — pass scope to service
- `apps/admin/src/hooks/use-contacts.ts` — serialize `scope` parameter in API calls

### 1d: Fix Data Leak Endpoints

#### Calendar Birthdays
`calendar.service.ts:555` — currently shows all agency contacts with DOBs.

**Fix:** Filter birthday events to contacts the user owns or has shared access to. Agency-wide contacts (no owner) with DOBs are excluded for non-admin users.

**File:** `apps/api/src/calendar/calendar.service.ts`

#### Notes
`notes.controller.ts:73,171` — only verifies contact exists, not contact access.

**Fix:** Add contact access check before allowing note read/write. Basic access users cannot read or create notes on contacts they don't own/share.

**File:** `apps/api/src/notes/notes.controller.ts`

#### Activity Logs
`activity-logs.service.ts:453` — includes direct contact audit logs for basic viewers.

**Fix:** Filter activity logs by contact access level. Basic access users see no activity logs for that contact.

**File:** `apps/api/src/activity-logs/activity-logs.service.ts`

#### Relationships
`contact-relationships.controller.ts` — no contact-access checks at all.

**Fix:** Add access check. Basic access users cannot view or modify relationships for contacts they don't own/share.

**File:** `apps/api/src/contacts/contact-relationships.controller.ts`

#### Contact Trips and Bookings
`contacts.controller.ts:112,135` — `GET /contacts/:id/trips` and `GET /contacts/:id/bookings` return data to basic-access users.

**Fix:** Add contact access check. Basic access users get 403 Forbidden.

**File:** `apps/api/src/contacts/contacts.controller.ts`

#### Note CRUD (Full Lifecycle)
`notes.controller.ts:86` — `GET /notes/:id`, `PUT /notes/:id`, `DELETE /notes/:id`, and `PATCH /notes/:id/pin` bypass contact access checks entirely.

**Fix:** All note endpoints that reference a contact must verify the user has full access to that contact. Basic access users get 403.

**File:** `apps/api/src/notes/notes.controller.ts`

#### Contact Filter Options
`contacts.service.ts:964` — `GET /contacts/filter-options` exposes tags across all agency contacts regardless of ownership.

**Fix:** Filter options should only reflect contacts the user has access to (same scope as their current list view).

**File:** `apps/api/src/contacts/contacts.service.ts`

---

## Phase 2: Frontend UX

### 2a: Contact Detail Page — Limited View

**Current:** Page renders full chrome (tags, activity, relationships, notes, emails, docs) with a small "Limited View" badge at `page.tsx:576`. Sections show empty/error states.

**New behavior for basic access contacts:**

- **Banner at top:** Alert banner with lock icon: "This contact belongs to **{ownerName}**. You have limited access." + "Request Access" button (or "Access Requested — Waiting for approval" if pending)
- **Visible sections:** Contact header (name, email, phone) only
- **Hidden sections:** Trips, Payments, Documents, Tags, Notes, Activity Log, Emails, Calendar, Relationships, Loyalty Programs — all removed from render (not just empty)
- **Edit buttons:** All disabled / hidden
- **Existing share request button:** Keep in current position, wire to `_shareRequestStatus` from API (persists across reload)

**Files:**
- `apps/admin/src/app/contacts/[id]/page.tsx` — conditional rendering based on `_accessLevel`
- `apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx` — use `_shareRequestStatus` instead of local state

### 2b: Contacts List Page — My/All Toggle

**New toggle** in the filter bar: segmented control "My Contacts" | "All Contacts"

| Mode | Default | What Shows | Kanban Allowed |
|------|---------|------------|----------------|
| My Contacts | Yes (non-admin) | Owned + shared contacts | Yes |
| All Contacts | Default for admin | All agency contacts with access control | Table only |

**All Contacts table additions:**
- Lock icon column for contacts where `_accessLevel === 'basic'`
- Owner column showing `_ownerName` (or "Unassigned" if no owner)

**My Contacts empty state:**
- "No contacts yet" message
- "Create New Contact" button
- "Import from CSV" button

**Kanban restriction:** When "All Contacts" is active, force table view. Kanban is only available in "My Contacts" mode (prevents unauthorized drag-drop status changes).

**Files:**
- `apps/admin/src/app/contacts/page.tsx` — add scope toggle, pass to API query
- `apps/admin/src/app/contacts/_components/contacts-filter-panel.tsx` — add scope segmented control
- `apps/admin/src/app/contacts/_components/contacts-table.tsx` — add lock icon + owner column
- `apps/admin/src/hooks/use-contacts.ts` — pass `scope` parameter to API

### 2c: Contact Detail Page — Edit Controls

For basic access contacts:
- Hide or disable all edit buttons (pencil icons, inline edit triggers)
- Hide action menu items that require full access (delete, change status, promote to client, portal invite)
- Keep "Request Access" as the primary action

**Files:**
- `apps/admin/src/app/contacts/[id]/page.tsx` — pass `_accessLevel` to child components
- Various `_components/` files that render edit controls — add `disabled` prop based on access level

---

## Phase 3: Admin Approval Flow

### 3a: Pending Request Banner (Admin/Owner View)

When an admin or contact owner views a contact that has pending share requests:

- **Banner:** "{User Name} requested access to this contact" with:
  - **Share** button — grants full shared access (logged)
  - **Reassign** button — transfers ownership to the requester
  - **Deny** button — rejects the request
- Multiple pending requests show as a list

**Files:**
- `apps/admin/src/app/contacts/[id]/page.tsx` — render pending requests banner for admin/owner
- `apps/admin/src/app/contacts/[id]/_components/pending-access-requests.tsx` — new component
- `apps/api/src/contacts/contact-share-requests.controller.ts` — add `GET /contacts/:id/share-requests/pending` if not exists

### 3b: Notification Integration

**Already exists:** `contact.share_requested`, `contact.share_approved`, `contact.share_denied` notification events fire in `notification-events.listener.ts:590`.

**What's needed:**
- Notification click action: navigate to the contact record
- After admin approves/denies, requesting user receives notification with the outcome
- Share request status updates in real-time (or on next page load)

**Files:**
- `apps/api/src/notifications/listeners/notification-events.listener.ts` — verify notification payloads include contact ID for navigation
- `apps/admin/src/components/notifications/` — ensure notification click navigates to `/contacts/{id}`

### 3c: Approve/Deny Actions

When admin clicks Share/Reassign/Deny:

- **Share:** Calls `POST /contacts/:id/shares` with `{ userId, accessLevel: 'full' }` + resolves the share request
- **Reassign:** Calls `PATCH /contacts/:id/owner` with `{ ownerId: requesterId }` + resolves the share request
- **Deny:** Calls `PATCH /contacts/share-requests/:id/deny` + sends denial notification

**Files:**
- `apps/api/src/contacts/contact-share-requests.service.ts` — add resolve/deny methods if not complete
- `apps/admin/src/app/contacts/[id]/_components/pending-access-requests.tsx` — wire buttons to API

---

## Phase 4: Follow-ups (Deferred)

These are out of scope for the initial implementation but tracked here:

### 4a: Duplicate Contact Detection on Create
- Preflight check when creating a contact: search by email/phone
- If match found, show the existing contact in limited view
- User can Request Access instead of creating a duplicate

### 4b: CRM Report Access Scoping
- `reporting/queries/crm.queries.ts:47` queries by agency/trip scope, not contact ownership
- Reports should respect the same access tiers as the contact list

### 4c: "Shared = Full Access" Boundary Definition
- Currently: main edit works for shared contacts, but status change, promote-to-client, portal invite, delete, owner change require owner/admin
- Decision needed: which of these should shared users be able to do?

### 4d: Contact Claiming for Agency-Wide Contacts
- Quick action for agents to claim an unowned contact as their own
- Could be a "Claim Contact" button on the limited view banner for contacts with `ownerId === null`

---

## Implementation Order

```
Phase 1 (Backend — do first, closes security holes):
  1a. Allowlist response shape
  1b. Access metadata fields
  1c. Server-side scope filter
  1d. Fix leak endpoints (calendar, notes, activity logs, relationships)

Phase 2 (Frontend — makes access visible):
  2a. Contact detail limited view
  2b. Contacts list My/All toggle
  2c. Edit control restrictions

Phase 3 (Approval flow — completes the cycle):
  3a. Pending request banner
  3b. Notification integration
  3c. Approve/deny actions

Phase 4 (Deferred):
  4a-4d as separate tickets
```

Phases 1-3 should be implemented in order. Phase 1 is a prerequisite for Phase 2 (frontend needs the new response shape). Phase 3 depends on Phase 2 (admin needs to see the contact page to act on requests).

---

## Success Criteria

- [ ] Basic access contacts return only: id, firstName, lastName, email, phone, mobilePhone, ownerId, _accessLevel, _ownerName, _shareRequestStatus
- [ ] Calendar birthdays only show for owned/shared contacts
- [ ] Notes, activity logs, relationships require contact access check
- [ ] Contact detail page hides all sections for basic access, shows owner banner
- [ ] "My Contacts" is the default view for non-admin users
- [ ] "All Contacts" shows lock icon + owner column, forces table view
- [ ] Share request persists across page reload (via _shareRequestStatus)
- [ ] Admin sees pending request banner with Share/Reassign/Deny actions
- [ ] Requesting user gets notified when access is granted or denied
- [ ] No data leaks through any endpoint for basic access contacts
