# RBAC Hardening & Expansion — Design Spec

## Goal

Harden the existing RBAC implementation and expand it with impersonation, contact share requests, and consistent permission enforcement before go-live testing on tf-demo.

## Roles

| Role | Scope | Access |
|------|-------|--------|
| **admin** | Full platform | All data, all settings, user management, impersonation |
| **agent** (currently `user` in DB) | Own + shared data | Own trips/contacts, shared resources, personal settings only |
| **client_portal** | Portal only | Read-only trip view, approve/request changes |

## Permission Matrix

| Action | Admin | Agent |
|--------|-------|-------|
| View all trips | Yes | No — own + shared only |
| Edit/delete trips | All (delete: draft/quoted only) | Own + shared (delete: draft/quoted only) |
| View all contacts | Full details | Basic only (name, email, phone, owner) unless own/shared |
| Edit contacts | All | Own + shared only |
| Request contact access | N/A (sees all) | Yes — owner approves/denies |
| Share contacts | Any contact with anyone (override) | Only own contacts |
| Export/reporting | All agency data | Own data only |
| Commission/suppliers | Full access | No access |
| User management | Full access | No access |
| Platform settings | Full access | No access |
| Personal settings | Own profile | Own profile |
| Delete contacts | Any contact | Own contacts only (not if tied to active trip) |
| Tasks | View/edit all | View own + assigned only |
| Email accounts | All agency accounts | Own connected accounts only |
| Calendar | All agency events | Own events + assigned tasks |
| Notes (on trips/contacts) | All | Only on own/shared trips/contacts |
| Automations/queues | Full access | No access |
| Impersonate users | Yes (agents in same agency only) | No |

---

## Work Item 1: `@AdminOnly()` Decorator

### Problem
Three inconsistent admin protection patterns exist:

1. `@UseGuards(AdminGuard)` — api-credentials, users, commission, trips (standalone guard from `common/guards/`)
2. `@Roles('admin')` with RolesGuard — enrichment, loyalty-programs, suppliers (metadata + guard)
3. `@UseGuards(JwtAuthGuard, AdminRoleGuard)` — automation controller (explicit JWT + admin from `auth/guards/`)

### Solution
Create a single `@AdminOnly()` decorator. Migrate all three patterns.

```typescript
// apps/api/src/auth/decorators/admin-only.decorator.ts
export const AdminOnly = () => applyDecorators(
  SetMetadata('roles', ['admin']),
  UseGuards(AdminRoleGuard),
)
```

Note: JwtAuthGuard is global, so pattern 3's explicit JwtAuthGuard is redundant and can be removed.

### Files
- Create: `apps/api/src/auth/decorators/admin-only.decorator.ts`
- Modify: All controllers using any of the three patterns above

---

## Work Item 2: Public Endpoint Audit

### Scope
Verify every `@Public()` endpoint has proper authorization in its service layer.

| Endpoint | Auth Mechanism | Expected |
|----------|---------------|----------|
| `GET /health` | None | Keep public |
| `POST /auth/request-password-reset` | Rate limit 5/min | Keep |
| `/cruise-import/*` | InternalApiKeyGuard | Keep |
| `/tour-import/*` | InternalApiKeyGuard | Keep |
| `/cruise-repository/*` | CatalogAuthGuard (JWT or API key) | Keep |
| `/tour-repository/*` | CatalogAuthGuard (JWT or API key) | Keep |
| `/globus/*` | CatalogAuthGuard | Keep |
| `/portal/*` | PortalAuthGuard | Keep |
| `/client-portal/*` | PortalAuthGuard | Keep |
| `/webhooks/stripe` | Stripe signature verification | Keep |
| `GET /user-profiles/public/:id` | None (returns only public profiles) | Verify returns minimal data |
| `GET /trips/shared/:token` | Token-based in service | Verify token validation |
| `POST /trips/shared/:token/approve` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/shared/:token/decline` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/shared/:token/comments` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/shared/:token/responses` | Token + ThrottlerGuard | Verify — write endpoint |

### Deliverable
Checklist of ALL `@Public()` endpoints individually verified, with special attention to write endpoints.

---

## Work Item 3: Contact Access Filtering

### Problem
Non-owner agents can currently see full contact details.

### Solution
Update `ContactAccessService.filterSensitiveFields()` to return only basic fields for non-owner, non-shared agents.

### Basic fields (visible to all agents in agency)
- firstName, lastName
- email, phone
- ownerId (+ owner display name)

### Full fields (visible to owner, shared users, admins)
- All basic fields plus: legal names, DOB, passport, address, preferences, travel docs, notes

### UI Change
Contact detail page shows "Limited View" badge for non-owner agents with "Request Access" button.

---

## Work Item 4: Report/Export Agent Filtering

### Problem
Agents may see all agency data in dashboard/reports/exports.

### Solution
Verify and extend existing filtering. `dashboard.service.ts` already calls `tripAccessService.getAccessibleTripIds(auth)` and checks `auth.role === 'admin'`. Verify this is applied consistently to ALL dashboard queries and export endpoints.

### Files
- `apps/api/src/dashboard/dashboard.service.ts` — verify existing agent filtering is complete
- Any export endpoints — verify ownership filter applied

---

## Work Item 5: Platform Settings Guard

### Solution
Ensure all platform settings endpoints use `@AdminOnly()`.
Agent access limited to personal profile settings under `/user-profiles/me`.

---

## Work Item 6: Contact Share Request Workflow

### New Table: `contact_share_requests`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| contactId | uuid | FK → contacts |
| requesterId | uuid | FK → user_profiles |
| ownerId | uuid | FK → user_profiles |
| agencyId | uuid | Agency scope |
| status | varchar(20) | 'pending' / 'approved' / 'denied' |
| reason | text | Optional deny reason |
| resolvedAt | timestamp | When approved/denied |
| resolvedBy | uuid | Who resolved |
| createdAt | timestamp | Request time |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contacts/:id/share-requests` | Agent | Request access |
| GET | `/contacts/share-requests/pending` | Any | Get pending requests (as owner) |
| PATCH | `/contacts/share-requests/:id` | Owner or Admin | Approve or deny |
| POST | `/contacts/:id/shares` | Owner or Admin | Direct share (admin override) |

### Flow
1. Agent sees contact with basic info → clicks "Request Access"
2. Creates `contact_share_requests` record (status: 'pending')
3. Owner gets notification: "[Agent] requested access to [Contact Name]"
4. Owner clicks Approve → auto-creates `contact_shares` row (access_level: 'full'), notifies requester
5. Owner clicks Deny → updates request status, notifies requester with optional reason
6. Admin override: Admin uses direct share endpoint, bypasses request flow

### Agency Scope Enforcement
Service validates requester, contact, and owner are all in the same agency before creating a request. Reuses existing `ContactAccessService.checkAccess()` pattern.

### Duplicate Prevention
- Cannot request if pending request already exists for same contact + requester
- Cannot request if already shared

### Request Expiration
Pending requests expire after 30 days. Cleanup via scheduled job or on-read filtering.

### Existing Infrastructure
- `contact_shares` table already exists with `accessLevel` ('basic'/'full'), `sharedBy`, `sharedWithUserId`
- `trip_shares` table already exists with `accessLevel` ('read'/'write')
- Notification system exists for in-app notifications

---

## Work Item 7: Impersonation System

### New Table: `impersonation_sessions`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| adminUserId | uuid | FK → user_profiles (real admin) |
| targetUserId | uuid | FK → user_profiles (impersonated user) |
| agencyId | uuid | Must match both users |
| expiresAt | timestamp | 30 min from start |
| endedAt | timestamp | When explicitly ended (null if active) |
| endReason | varchar(20) | 'manual' / 'timeout' / 'extended' |
| createdAt | timestamp | Session start |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/admin/impersonate/:userId` | Admin only | Start impersonation |
| POST | `/admin/impersonate/extend` | Admin only | Extend 30 min |
| DELETE | `/admin/impersonate` | Admin only | End impersonation |
| GET | `/admin/impersonate/status` | Admin only | Check active session |

### Auth Flow During Impersonation

```
Request with X-Impersonate-User-Id header
  → JwtAuthGuard validates admin JWT (normal)
  → ImpersonationMiddleware:
    1. Verify caller is admin
    2. Verify active impersonation session exists & not expired
    3. Verify X-Impersonate-User-Id === session.targetUserId (reject mismatch)
    4. Verify target user is in same agency
    5. Swap auth context: userId → targetUserId, role → target's role
    6. Attach originalAdmin { id, name } to request for audit
  → All downstream guards/services see impersonated user's permissions
  → Admin endpoints (@AdminOnly) are BLOCKED during impersonation
  → Audit service logs with original admin identity
```

### Write Policy
Full impersonation — admin can perform all actions the agent can do (create, edit, delete).
This enables support scenarios: "I can't edit this trip" → admin impersonates → fixes the issue.
All write actions are logged with the admin's real identity in the audit trail.

### Safety Rails
- Admin cannot impersonate other admins
- Admin cannot impersonate users in different agencies
- Maximum 1 active impersonation per admin at a time
- Cannot impersonate locked/pending users
- Sessions logged permanently (never deleted)
- 30 minute timeout with extend option
- Maximum 4 hours total session duration (max 8 extensions)
- Admin endpoints blocked during impersonation (must exit to use admin features)

### Frontend
- **Location**: Admin Settings → Users page → action menu per user → "Impersonate"
- **Banner**: Fixed amber bar at top: "Viewing as [Agent Name] — [MM:SS remaining] — Extend | Exit — Admin features disabled"
- **Exit**: Calls DELETE endpoint, reloads page to admin context
- **Extend**: Calls extend endpoint, resets 30 min timer (disabled after 8 extensions)

### Audit Trail
- Impersonation start: logged to activity_logs as `audit.impersonation_started`
- Impersonation end: logged as `audit.impersonation_ended`
- Actions during impersonation: logged with `actorId = adminUserId`, metadata includes `impersonatingAs = targetUserId`
- After session ends: agent sees "Admin [name] viewed your account at [time]" in their activity feed

### Notification
- After impersonation session ends, target agent receives an in-app notification: "Admin [name] impersonated your account on [date] at [time] for [duration]"

---

## Work Item 8: Auth Event Audit Logging

### Events to Log

| Event | Trigger | Data |
|-------|---------|------|
| `audit.login_failed` | Failed JWT validation | userId (if known), IP, reason |
| `audit.impersonation_started` | Admin starts impersonation | adminId, targetId |
| `audit.impersonation_ended` | Session ends | adminId, targetId, duration, reason |
| `audit.role_changed` | User role updated | userId, oldRole, newRole, changedBy |
| `audit.share_requested` | Agent requests contact access | requesterId, contactId, ownerId |
| `audit.share_approved` | Owner approves request | requestId, resolvedBy |
| `audit.share_denied` | Owner denies request | requestId, resolvedBy, reason |
| `audit.access_denied` | 403 response | userId, endpoint, reason |

### Implementation
Use a separate `security.*` event namespace with a dedicated handler to keep the existing `audit.*` handler (entity-centric) clean. Security events have a different shape — they are not entity-centric and may lack `entityId`/`tripId`.

```typescript
interface SecurityAuditEvent {
  event: string           // e.g., 'security.login_failed'
  userId?: string         // User involved (may be unknown for login failures)
  actorId?: string        // Who performed the action
  agencyId?: string       // Agency scope
  metadata: Record<string, unknown>  // Event-specific data
  ip?: string             // Request IP
  timestamp: Date
}
```

New handler: `@OnEvent('security.*')` in `ActivityLogsService` or a dedicated `SecurityAuditService`.

---

## Work Item 9: Role Display Rename

### Problem
DB stores `user` but the business term is "Agent".

### Solution
Keep `user` in DB enum (no migration risk). Display "Agent" in all UI:
- User management table
- Role badges
- Profile page
- Impersonation UI

Map in a shared constant:
```typescript
const ROLE_DISPLAY_NAMES = { admin: 'Admin', user: 'Agent', client_portal: 'Client' }
```

---

## Out of Scope
- Granular per-action permissions (e.g., `can_delete_trips` separate from role)
- Multi-agency per user
- JWT secret rotation strategy (document separately)
- Field-level RBAC at schema level (keep in service layer for now)
- Trip share request workflow (trips already have sharing, no request flow needed)
