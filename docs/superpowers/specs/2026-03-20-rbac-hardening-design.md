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
| Automations/queues | Full access | No access |
| Impersonate users | Yes (agents in same agency only) | No |

---

## Work Item 1: `@AdminOnly()` Decorator

### Problem
Inconsistent admin protection — some endpoints use `@UseGuards(AdminGuard)`, others use `@Roles('admin')`.

### Solution
Create a single `@AdminOnly()` decorator combining both patterns. Migrate all admin endpoints.

```typescript
// apps/api/src/auth/decorators/admin-only.decorator.ts
export const AdminOnly = () => applyDecorators(
  SetMetadata('roles', ['admin']),
  UseGuards(AdminRoleGuard),
)
```

### Files
- Create: `apps/api/src/auth/decorators/admin-only.decorator.ts`
- Modify: All controllers using `@UseGuards(AdminGuard)` or `@Roles('admin')`

---

## Work Item 2: Public Endpoint Audit

### Scope
Verify every `@Public()` endpoint has proper authorization in its service layer.

| Endpoint | Auth Mechanism | Expected |
|----------|---------------|----------|
| `/health` | None | Keep public |
| `/auth/request-password-reset` | Rate limit 5/min | Keep |
| `/cruise-import/*` | InternalApiKeyGuard | Keep |
| `/cruise-repository/*` | CatalogAuthGuard (JWT or API key) | Keep |
| `/portal/*` | PortalAuthGuard | Keep |
| Trip share/preview endpoints | Token-based in service | Verify token checks |

### Deliverable
Checklist of all `@Public()` endpoints with verification status.

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
Add `ownerId` filter to dashboard and reporting queries when `auth.role === 'agent'`.

### Files
- `apps/api/src/dashboard/dashboard.service.ts` — filter KPIs by trip owner
- Any export endpoints — filter by ownership

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

### Duplicate Prevention
- Cannot request if pending request already exists for same contact + requester
- Cannot request if already shared

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
    3. Verify target user is in same agency
    4. Swap auth context: userId → targetUserId, role → target's role
    5. Attach originalAdmin { id, name } to request for audit
  → All downstream guards/services see impersonated user's permissions
  → Audit service logs with original admin identity
```

### Safety Rails
- Admin cannot impersonate other admins
- Admin cannot impersonate users in different agencies
- Maximum 1 active impersonation per admin at a time
- Cannot impersonate locked/pending users
- Sessions logged permanently (never deleted)
- 30 minute timeout with extend option

### Frontend
- **Location**: Admin Settings → Users page → action menu per user → "Impersonate"
- **Banner**: Fixed amber bar at top: "Viewing as [Agent Name] — [MM:SS remaining] — Extend | Exit"
- **Exit**: Calls DELETE endpoint, reloads page to admin context
- **Extend**: Calls extend endpoint, resets 30 min timer

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
Extend existing `ActivityLogsService` with `@OnEvent('audit.*')` handler (already configured with EventEmitter2 wildcard).

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
const ROLE_DISPLAY_NAMES = { admin: 'Admin', user: 'Agent' }
```

---

## Out of Scope
- Granular per-action permissions (e.g., `can_delete_trips` separate from role)
- Multi-agency per user
- JWT secret rotation strategy (document separately)
- Field-level RBAC at schema level (keep in service layer for now)
- Trip share request workflow (trips already have sharing, no request flow needed)
