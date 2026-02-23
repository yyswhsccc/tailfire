# Plan: Itinerary Options, Versioning & Collaborative Comments

## Overview

Transform the itinerary system from flat options into a full **Options + Versions** model with **bidirectional collaborative comments** between agents and clients (Google Docs-style).

**Scope:** Schema changes, API endpoints, client portal UI, and admin integration guidance. This plan does NOT include Admin UI implementation — that is handled by the admin dev team.

**Validated by Codex** — 7 findings addressed (4 critical/high, 3 medium). See [Codex Review Notes](#codex-review-notes) at bottom.

---

## Pre-requisite: Fix Client Activation Deadlock (BLOCKING)

> **Codex Finding #1 (CRITICAL):** The current invite flow is deadlocked. Portal users are created as `status='invited'`, but the JWT hook only issues claims when `status='active'` and hard-fails otherwise. The activation endpoint requires a valid session token. Chicken-and-egg: can't get a token without active status, can't activate without a token.

**Fix (must be done before any versioning/comments work):**

Update the JWT hook migration (`20260217140000_update_jwt_hook_for_client_portal.sql`) to allow `invited` status users to receive minimal claims. Two options:

- **Option A (recommended):** Allow `invited` status in the JWT hook — issue claims with `role: 'client_portal_invited'` so the activation endpoint can verify the token. The `ClientPortalAuthGuard` still rejects `invited` users for all other endpoints.
- **Option B:** Make the `/client-portal/activate` endpoint fully public (no Bearer token required). Verify identity solely via `invite_token` hash match + `supabase_user_id` from the Supabase session exchange (the callback route already has the session before calling activate).

**Files:**
- `packages/database/src/migrations/` — new migration to update the hook function
- `apps/api/src/client-portal/client-portal.controller.ts` — adjust activate endpoint auth
- `apps/api/src/client-portal/client-portal-auth.guard.ts` — handle `invited` status if Option A

---

## Current State

- Itineraries are flat records under a trip (no version chain)
- `itinerary_feedback` table only supports client-authored entries (`client_portal_user_id` NOT NULL)
- Single-approved rule: only 1 itinerary per trip can be `status='approved'` (enforced in staff service, but NOT in client portal service — see resolved decisions)
- Statuses: `draft` → `proposing` → `approved` / `archived`

## Target State

```
Trip: "Smith Family Europe 2026"
├── Budget Option (option_group_id = AAA)
│   ├── v1 (archived)  — 12 comments (closed thread)
│   ├── v2 (proposing)  — 3 comments (active thread)
│   └── v3 (draft)      — no comments (not published yet)
│
├── Premium Option (option_group_id = BBB)
│   ├── v1 (archived)   — 8 comments (closed thread)
│   ├── v2 (approved)   — 5 comments (client chose this)
│   └── v3 (archived)   — 2 comments (client preferred v2)
│
└── Adventure Option (option_group_id = CCC)
    └── v1 (proposing)  — 0 comments (just published)
```

- **Options** = parallel choices (Budget vs Premium vs Adventure)
- **Versions** = revisions within an option (v1 → v2 → v3)
- **Comments** = bidirectional thread scoped to a specific version
- **Client can approve ANY version**, not just the latest
- **Per-trip single-approved** — only ONE itinerary across ALL options can be approved at a time

---

## Phase A: Schema Changes

### A1. Add versioning columns to `itineraries` table

**File:** `packages/database/src/schema/trips.schema.ts`
**Migration:** `YYYYMMDDHHMMSS_add_itinerary_versioning.sql`

Add these columns to the existing `itineraries` table:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `option_group_id` | UUID | `gen_random_uuid()` | Groups versions of the same option together. All versions of "Budget Option" share one group ID. Set on first creation, copied when creating a new version. |
| `version_number` | INTEGER | `1` | Auto-incremented per option group. v1, v2, v3... |
| `parent_version_id` | UUID NULL | NULL | FK → itineraries.id. Points to the version this was derived from. NULL for v1. Must belong to the same trip (enforced at application layer). |

**Migration SQL:**
```sql
ALTER TABLE itineraries
  ADD COLUMN option_group_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN parent_version_id UUID REFERENCES itineraries(id) ON DELETE SET NULL;

-- Backfill: each existing itinerary becomes v1 of its own option group
UPDATE itineraries SET option_group_id = gen_random_uuid() WHERE option_group_id IS NULL;

-- After backfill, make NOT NULL
ALTER TABLE itineraries ALTER COLUMN option_group_id SET NOT NULL;

-- Index for fast option group lookups
CREATE INDEX idx_itineraries_option_group ON itineraries(option_group_id);
CREATE INDEX idx_itineraries_parent_version ON itineraries(parent_version_id);

-- Unique: no duplicate version numbers within an option group
CREATE UNIQUE INDEX idx_itineraries_option_version ON itineraries(option_group_id, version_number);

-- Enforce per-trip single-approved at DB level
-- Only one itinerary per trip can have status='approved' at any time
CREATE UNIQUE INDEX idx_itineraries_single_approved
  ON itineraries(trip_id) WHERE status = 'approved';
```

**Drizzle schema additions:**
```typescript
optionGroupId: uuid('option_group_id').notNull().defaultRandom(),
versionNumber: integer('version_number').notNull().default(1),
parentVersionId: uuid('parent_version_id').references(() => itineraries.id, { onDelete: 'set null' }),
```

**Impact on existing logic:**
- `ItinerariesService.create()` — when creating from scratch, auto-generates `option_group_id`. When creating a new version (see A3), copies `option_group_id` from parent and increments `version_number`.
- `ItinerariesService.findAll()` — add ability to filter/group by `option_group_id`
- **Single-approved rule stays per-trip** (resolved decision). DB partial unique index enforces this. Both staff and client approval paths must archive other approved itineraries before approving.
- Response DTO — add `optionGroupId`, `versionNumber`, `parentVersionId` to `ItineraryResponseDto`
- **Version number increment must be transaction-safe:** Use `SELECT MAX(version_number) FROM itineraries WHERE option_group_id = $1 FOR UPDATE` within the transaction that creates the new version.

### A2. Extend `itinerary_feedback` table (expand-contract migration)

> **Codex Finding #7 (MEDIUM):** Renaming `itinerary_feedback` → `itinerary_comments` immediately is high rollout risk because current code is tightly coupled. Use expand-contract migration instead.

**Strategy: Two-phase migration (expand then contract)**

#### Phase A2a: Expand (additive, non-breaking)

**Migration:** `YYYYMMDDHHMMSS_expand_itinerary_feedback_for_comments.sql`

Add new columns to the EXISTING `itinerary_feedback` table without renaming:

```sql
-- Make client_portal_user_id nullable (was NOT NULL)
ALTER TABLE itinerary_feedback ALTER COLUMN client_portal_user_id DROP NOT NULL;

-- Add staff author column
-- ON DELETE RESTRICT: prevent deleting staff who authored comments
ALTER TABLE itinerary_feedback
  ADD COLUMN staff_user_id UUID REFERENCES user_profiles(id) ON DELETE RESTRICT;

-- Add threading support
ALTER TABLE itinerary_feedback
  ADD COLUMN parent_comment_id UUID REFERENCES itinerary_feedback(id) ON DELETE CASCADE;

-- Extend enum with new comment types
ALTER TYPE itinerary_feedback_type ADD VALUE 'agent_response';
ALTER TYPE itinerary_feedback_type ADD VALUE 'agent_comment';
ALTER TYPE itinerary_feedback_type ADD VALUE 'client_reply';

-- XOR author constraint: exactly one of client or staff must be set
ALTER TABLE itinerary_feedback
  ADD CONSTRAINT chk_comment_author
  CHECK (
    (client_portal_user_id IS NOT NULL AND staff_user_id IS NULL)
    OR
    (client_portal_user_id IS NULL AND staff_user_id IS NOT NULL)
  );

-- Comment type must match author type
-- Client types: approval, change_request, client_reply
-- Agent types: agent_response, agent_comment
ALTER TABLE itinerary_feedback
  ADD CONSTRAINT chk_comment_type_author_match
  CHECK (
    (client_portal_user_id IS NOT NULL AND feedback_type IN ('approval', 'change_request', 'client_reply'))
    OR
    (staff_user_id IS NOT NULL AND feedback_type IN ('agent_response', 'agent_comment'))
  );

-- Indexes for new columns
CREATE INDEX idx_itinerary_feedback_parent ON itinerary_feedback(parent_comment_id);
CREATE INDEX idx_itinerary_feedback_staff ON itinerary_feedback(staff_user_id);
```

> **Codex Finding #4 (HIGH):** `ON DELETE SET NULL` for `staff_user_id` would violate the XOR CHECK constraint if a staff user is deleted. Fixed: using `ON DELETE RESTRICT` — staff users who authored comments cannot be deleted (they must be soft-deleted/deactivated instead).

> **Codex Finding from area validation #3:** Added `chk_comment_type_author_match` constraint to enforce that comment types match the author class (client-only types vs agent-only types).

**Drizzle schema updates** (in `itinerary-feedback.schema.ts` — keep filename for now):
```typescript
// Make nullable
clientPortalUserId: uuid('client_portal_user_id').references(() => clientPortalUsers.id, { onDelete: 'cascade' }),
// Add new columns
staffUserId: uuid('staff_user_id').references(() => userProfiles.id, { onDelete: 'restrict' }),
parentCommentId: uuid('parent_comment_id').references(() => itineraryFeedback.id, { onDelete: 'cascade' }),
```

#### Phase A2b: Contract (rename, cleanup — do AFTER all code is migrated)

**Migration:** `YYYYMMDDHHMMSS_rename_feedback_to_comments.sql` (run AFTER code migration is complete)

```sql
-- Rename table
ALTER TABLE itinerary_feedback RENAME TO itinerary_comments;

-- Rename enum
ALTER TYPE itinerary_feedback_type RENAME TO itinerary_comment_type;
ALTER TYPE itinerary_feedback_status RENAME TO itinerary_comment_status;

-- Rename column
ALTER TABLE itinerary_comments RENAME COLUMN feedback_type TO comment_type;

-- Update index names (optional, for clarity)
ALTER INDEX idx_itinerary_feedback_itinerary RENAME TO idx_itinerary_comments_itinerary;
ALTER INDEX idx_itinerary_feedback_client RENAME TO idx_itinerary_comments_client;
ALTER INDEX idx_itinerary_feedback_agency RENAME TO idx_itinerary_comments_agency;
ALTER INDEX idx_itinerary_feedback_status RENAME TO idx_itinerary_comments_status;
ALTER INDEX idx_itinerary_feedback_parent RENAME TO idx_itinerary_comments_parent;
ALTER INDEX idx_itinerary_feedback_staff RENAME TO idx_itinerary_comments_staff;
```

Then rename schema file: `itinerary-feedback.schema.ts` → `itinerary-comments.schema.ts` and update all imports.

### A3. "Create New Version" service method

**File:** `apps/api/src/trips/itineraries.service.ts`

New method: `createNewVersion(itineraryId: string, tripId: string)`

> **Codex Finding #3 (HIGH):** Deep copy is underspecified. The current system has complex copy logic for detail tables, pricing, media, documents, and parent-child activity links (`trips.service.ts:1628-1735`). Must reuse existing deep-copy utilities.

Logic:
1. Load source itinerary + days + activities + ALL detail tables
2. Create new itinerary record with:
   - Same `option_group_id`
   - `version_number` = max version in group + 1 (transaction-safe with `FOR UPDATE`)
   - `parent_version_id` = source itinerary ID
   - `status` = 'draft' (always starts as draft)
   - Copy: name, description, coverPhoto, overview, dates, destinations
3. **Full deep-copy** reusing existing patterns from `trips.service.ts`:
   - Days (new UUIDs, preserve structure)
   - Activities (new UUIDs, preserve parent-child relationships)
   - **Activity detail tables**: lodging_details, flight_details, cruise_details, transportation_details, etc.
   - **Activity pricing** (activity_pricing table)
   - **Activity documents** (references/links, not file blobs)
   - **Activity media/photos** (JSONB arrays — copied inline)
   - **Parent-child activity links** (e.g., cruise → port_info nesting — remap parent IDs to new UUIDs)
4. Do NOT copy comments (fresh thread for new version)
5. Return new itinerary

**Implementation approach:** Extract the deep-copy logic from `trips.service.ts` (duplicateTrip, lines ~1628-1735) into a shared utility method that both `duplicateTrip` and `createNewVersion` can call.

**Endpoint:** `POST /trips/:tripId/itineraries/:itineraryId/new-version`

---

## Phase B: API Changes

### B1. Comment endpoints (agent-facing, admin auth)

Add to existing trips controller or new comments controller:

> **Codex Finding #5 (HIGH):** `GET /trips/:tripId/itineraries/options` can conflict with `@Get(':id')` route ordering. Put the `/options` route BEFORE the `/:id` route in the controller, or use a separate controller.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/trips/:tripId/itineraries/:itineraryId/comments` | List all comments for this itinerary version (threaded). **Must enforce tripId + agencyId filtering.** |
| POST | `/trips/:tripId/itineraries/:itineraryId/comments` | Agent posts a comment or reply. **Server-side enforcement:** only `agent_response` and `agent_comment` types allowed for staff. |
| PATCH | `/trips/:tripId/itineraries/:itineraryId/comments/:commentId` | Agent updates comment status (reviewed/resolved) |

**POST body:**
```json
{
  "commentType": "agent_response | agent_comment",
  "message": "string",
  "activityNotes": [{ "activityId": "...", "activityName": "...", "note": "..." }],
  "parentCommentId": "uuid | null"
}
```

**Server-side validation:** Reject if `commentType` doesn't match the authenticated user type (agent types for staff, client types for client portal users).

### B2. Comment endpoints (client-facing, client portal auth)

Extend existing client portal controllers:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/client-portal/trips/:tripId/itineraries/:itineraryId/comments` | List all comments (sees both client + agent comments). **Must enforce tripId + agencyId + contactId access check.** |
| POST | `/client-portal/trips/:tripId/itineraries/:itineraryId/comments` | Client posts approval, change request, or reply. **Server-side enforcement:** only `approval`, `change_request`, `client_reply` types allowed. |

The existing `approve` and `request-changes` endpoints should be refactored to use the comments system internally (create a comment of the appropriate type). The approval side-effect (setting itinerary status to `approved` + archiving others) should remain as a separate service call triggered when `commentType = 'approval'`.

### B3. Version endpoints (admin auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/trips/:tripId/itineraries/:itineraryId/new-version` | Create new version (full deep copy, fresh comments) |
| GET | `/trips/:tripId/itineraries/by-option` | List itineraries grouped by option_group_id with version info. **Route name avoids conflict with `/:id` — use `by-option` not `options`.** |

### B4. Comment response shape

```typescript
interface ItineraryCommentDto {
  id: string
  itineraryId: string
  commentType: 'approval' | 'change_request' | 'agent_response' | 'agent_comment' | 'client_reply'
  message: string | null
  activityNotes: { activityId: string; activityName: string; note: string }[]
  status: 'pending' | 'reviewed' | 'resolved'
  parentCommentId: string | null
  createdAt: string

  // Author info — exactly one is populated
  clientAuthor: { firstName: string; lastName: string; email: string } | null
  agentAuthor: { firstName: string; lastName: string; email: string } | null

  // Nested replies (optional, for threaded view)
  replies?: ItineraryCommentDto[]
}
```

### B5. Itinerary response DTO additions

Add to `ItineraryResponseDto`:
```typescript
optionGroupId: string
versionNumber: number
parentVersionId: string | null
commentCount: number          // Total comments on this version
unresolvedCount: number       // Comments with status != 'resolved'
```

---

## Phase C: Client Portal UI Changes

### C1. Itinerary viewer — comment thread

**File:** `apps/client/src/components/itinerary/`

Replace the current "Feedback" tab with a full **Comments** tab:
- Chronological thread showing all comments (client + agent)
- Visual distinction: client comments left-aligned, agent comments right-aligned (or colored differently)
- Each comment shows: author name, timestamp, type badge, message, activity notes
- Threaded replies: indent replies under parent comment
- Reply button on each comment to create a threaded response

### C2. Approval bar → Comment bar

**File:** `apps/client/src/components/itinerary/ItineraryApprovalBar.tsx`

Keep the "Approve" and "Request Changes" buttons but route them through the comments system. When the client approves or requests changes, it creates a comment of that type.

### C3. Version navigation

When viewing an itinerary, show version indicator:
- "Budget Option — Version 2 of 3"
- Navigation: "< v1 | v2 | v3 >" to switch between versions
- Each version shows its own comment thread
- Visual indicator for which version is approved (if any)

### C4. Options overview on trip detail

**File:** `apps/client/src/app/(dashboard)/trips/[tripId]/page.tsx`

Group itineraries by `optionGroupId` on the trip detail page:
```
Budget Option
  v1 (archived) — 12 comments
  v2 (proposing) — 3 comments ← reviewing

Premium Option
  v1 (archived) — 8 comments
  v2 (approved) — 5 comments ✓
```

---

## Phase D: Admin Integration (for admin dev team)

> **NOTE:** These are suggestions for the admin dev team. No admin UI code changes should be made by the portal team.

### D1. Trip View — Comment notifications

On the Trip View page, add a notification/badge when new client comments exist on any itinerary:
- Badge on the "Itinerary" tab: "Itinerary (3 new)"
- Or a dedicated "Client Feedback" card on the trip overview showing recent unresolved comments

### D2. Itinerary selector — version + comment indicators

In `itinerary-selector.tsx`, show version info and comment counts:
```
[Budget v2 (proposing) 💬3] [Premium v2 (approved) ✓] [Adventure v1 (proposing)]
```

Clicking an option could show a version dropdown/picker:
```
Budget Option
  ├── v1 (archived) — 12 comments
  ├── v2 (proposing) — 3 new comments  ← selected
  └── v3 (draft)
```

### D3. Comment panel in itinerary view

In `trip-itinerary.tsx`, add a comment sidebar or panel (similar to Google Docs comment sidebar):
- Shows all comments for the selected itinerary version
- Agent can type replies inline
- Agent can mark comments as reviewed/resolved
- Unresolved comments highlighted
- Activity-specific notes linked to the activity they reference (click to scroll to activity)

### D4. "New Version" action

In the itinerary selector dropdown (`itinerary-selector.tsx`), add:
- "Create New Version" menu item
- Deep-copies the selected itinerary as a new version
- Sets the new version to `draft`
- Switches view to the new version

### D5. Comment composition

Agent comment input should support:
- Free-text message
- Per-activity notes (select activity from dropdown, add note)
- Reply to a specific client comment (threaded)

---

## Phase E: Notifications (post-MVP enhancement)

### E1. In-app notifications
- When a client submits a comment → agent sees a badge/count on the trip
- When an agent responds → client sees it next time they log in

### E2. Email notifications
- Use existing EmailService to send notifications
- Agent: "New feedback on Budget Option v2 from John Smith"
- Client: "Your travel advisor responded to your comment on Premium Option"

### E3. Real-time (future)
- WebSocket/SSE for live comment updates
- Not required for MVP — polling or refresh-on-focus is sufficient

---

## Migration Order

0. **Pre-req** — Fix client activation deadlock (JWT hook for `invited` status)
1. **A1** — Add versioning columns to itineraries (backfill existing as v1) + single-approved partial unique index
2. **A2a** — Expand itinerary_feedback with new columns (additive, non-breaking)
3. **A3 + B3** — Create new version endpoint (with full deep-copy)
4. **B1 + B2** — Comment endpoints (admin + client) with server-side type enforcement
5. **B4 + B5** — Update response DTOs
6. **C1-C4** — Client portal UI
7. **D1-D5** — Admin UI (admin dev team)
8. **A2b** — Contract migration: rename table/columns/enums (AFTER all code is migrated)

---

## Key Files to Modify

### Schema
- `packages/database/src/schema/trips.schema.ts` — add versioning columns + partial unique index
- `packages/database/src/schema/itinerary-feedback.schema.ts` — expand with new columns (keep filename in Phase A2a, rename in A2b)
- `packages/database/src/schema/index.ts` — update exports (after rename)

### API
- `apps/api/src/trips/itineraries.service.ts` — createNewVersion (reuse deep-copy from trips.service.ts), version increment with FOR UPDATE, group-by-option queries
- `apps/api/src/trips/trips.service.ts` — extract deep-copy utility from duplicateTrip for reuse
- `apps/api/src/client-portal/client-portal.service.ts` — refactor feedback → comments, **fix approval to archive other approved itineraries** (align with staff path)
- `apps/api/src/client-portal/client-portal-feedback.controller.ts` — extend with comment endpoints
- New: admin-facing comment controller (or extend itineraries controller — put route BEFORE `/:id`)
- `packages/shared-types/src/api/trips.types.ts` — DTO additions

### Client Portal
- `apps/client/src/hooks/use-client-feedback.ts` → rename/extend for comments
- `apps/client/src/hooks/use-client-itinerary.ts` — version navigation
- `apps/client/src/components/itinerary/FeedbackDialog.tsx` → refactor to comment input
- `apps/client/src/components/itinerary/ItineraryApprovalBar.tsx` — route through comments
- New: comment thread component, version picker component

### Admin (guidance only — admin dev team implements)
- `apps/admin/src/app/trips/[id]/_components/itinerary-selector.tsx`
- `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx`
- `apps/admin/src/hooks/use-itinerary-feedback.ts` → extend for comments
- New: comment sidebar component, version picker

---

## Resolved Decisions

1. **Single-approved scope: PER-TRIP** (Codex Finding #2). Only 1 itinerary across all options can be `status='approved'` at a time. Enforced via DB partial unique index AND in both staff + client approval code paths. When approving, archive all other approved itineraries first.

2. **Deep copy scope: FULL** (Codex Finding #3). createNewVersion must deep-copy activity detail tables (lodging_details, flight_details, etc.), pricing, documents, media, and parent-child activity links. Reuse existing deep-copy logic from `trips.service.ts`.

3. **Comment editing:** Comments are immutable after posting. Users can post follow-up comments but cannot edit existing ones. This simplifies audit trail and avoids race conditions.

4. **Comment deletion:** Comments cannot be deleted. Agents can mark them as "resolved" to close the thread. This preserves the full conversation history.

5. **Notification channel:** Email only for MVP (Phase E). In-app badges deferred to post-MVP.

6. **Table rename strategy: Expand-contract** (Codex Finding #7). Add new columns to `itinerary_feedback` first (non-breaking), migrate all code, then rename table/columns in a separate migration.

7. **Staff FK behavior: ON DELETE RESTRICT** (Codex Finding #4). Staff users who authored comments cannot be hard-deleted (use soft-delete/deactivation instead). This preserves the XOR author constraint.

8. **Comment type validation: Server-side** (Codex area validation). Client portal users can only post `approval`, `change_request`, `client_reply`. Staff can only post `agent_response`, `agent_comment`. Enforced at API layer AND via DB CHECK constraint.

9. **Route naming: `/by-option` not `/options`** (Codex Finding #5). Avoids conflict with `/:id` parameter route in itineraries controller.

---

## Codex Review Notes

Full validation performed against current codebase. 7 findings addressed:

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | Client activation deadlocked — JWT hook rejects `invited` status but activation requires valid token | Added as blocking pre-requisite with two fix options |
| 2 | CRITICAL | Single-approved rule inconsistent between staff and client paths | Locked to per-trip, added DB partial unique index, both paths must archive before approving |
| 3 | HIGH | Deep copy underspecified — must include detail tables, pricing, media, docs, parent-child links | Specified full deep-copy reusing existing `trips.service.ts` patterns |
| 4 | HIGH | `ON DELETE SET NULL` + XOR CHECK conflict — deleting staff would violate constraint | Changed to `ON DELETE RESTRICT` for `staff_user_id` |
| 5 | HIGH | Route `/options` conflicts with `/:id` parameter ordering; feedback query missing tripId/agencyId filter | Renamed to `/by-option`; added explicit tripId + agencyId enforcement on all queries |
| 6 | MEDIUM | trip_travelers DTO still accepts snapshot input even though schema enforces NOT NULL | Noted — separate concern, existing create path auto-creates contacts so invariant holds after write |
| 7 | MEDIUM | Renaming table immediately is high rollout risk | Changed to expand-contract two-phase migration |

### Additional Codex Recommendations (incorporated)
- Transaction-safe version number increment using `SELECT ... FOR UPDATE`
- `chk_comment_type_author_match` CHECK constraint to enforce comment type matches author class
- Server-side `commentType` authorization enforcement
- Focused tests needed: concurrent version creation, approval invariants, author constraints, cross-trip comment access leakage
