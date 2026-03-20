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
| Notes (on trips/contacts) | All | Only on own/shared trips/contacts (verify `notes.controller.ts` checks resource ownership, not just agency) |
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
| `GET /` | None (AppController) | Verify — should return minimal info or redirect |
| `GET /debug-sentry` | None | Remove or gate behind admin in production |
| `GET /user-profiles/public/:id` | None (returns only public profiles) | Verify returns minimal data |
| `GET /trips/share/:token` | Token-based in service | Verify token validation |
| `POST /trips/share/:token/approve` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/share/:token/decline` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/share/:token/comments` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/share/:token/responses` | Token + ThrottlerGuard | Verify — write endpoint |
| `POST /trips/share/:token/select` | Token + ThrottlerGuard | Verify — write endpoint (itinerary selection) |
| `GET /trips/share/:token/activity-responses` | Token-based | Verify read scope |
| `GET /trips/share/:token/comments` | Token-based | Verify read scope |

**Note:** Route path is `/trips/share/:token` (not `/trips/shared/:token`). Verify actual controller routes during implementation.

### Deliverable
Checklist of ALL `@Public()` endpoints individually verified. Every write endpoint must have token validation + rate limiting confirmed in the service layer.

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

### Contact-Linked Data Gating
Non-owner agents with basic-only access must also be blocked from:
- `GET /contacts/:id/trips` — agent sees only trips they own/are shared on (not all contact's trips)
- `GET /contacts/:id/bookings` — same ownership filter
- `GET /contacts/:id/payment-transactions` — same ownership filter
- `GET /contacts/:id/notes` — blocked for non-owner agents

Currently these endpoints only check `agencyId` match. Must add ownership/share check via `ContactAccessService`.

### UI Change
Contact detail page shows "Limited View" badge for non-owner agents with "Request Access" button. Contact sub-tabs (trips, bookings, payments) are hidden or filtered to own data only.

---

## Work Item 4: Report/Export Agent Filtering

### Problem
Agents may see all agency data in dashboard/reports/exports.

### Solution
Verify and extend existing filtering. `dashboard.service.ts` already calls `tripAccessService.getAccessibleTripIds(auth)` and checks `auth.role === 'admin'` in some queries. However, `GET /dashboard/stats` (line 66) returns agency-wide totals for ALL roles — must add agent filtering.

### Specific Endpoints to Fix
- `GET /dashboard/stats` (`dashboard.controller.ts:23`) — currently agency-wide, must filter by trip ownership for agents
- `GET /dashboard/pipeline` — verify agent sees only own pipeline
- `GET /dashboard/revenue` — verify agent sees only own revenue
- Any CSV/XLSX export endpoints — verify ownership filter

### Files
- `apps/api/src/dashboard/dashboard.service.ts` — add agent filtering to `getStats()` and all query methods
- `apps/api/src/dashboard/dashboard.controller.ts` — pass auth context to all service calls

---

## Work Item 5: Platform Settings Guard

### Problem
Platform settings endpoints currently check only agency match, not admin role.

### Solution
Add `@AdminOnly()` to all platform-level settings endpoints. Enumerate:

| Endpoint | Current Protection | Fix |
|----------|-------------------|-----|
| `POST /stripe-connect/onboard` | Agency check only | Add `@AdminOnly()` |
| `GET /stripe-connect/status` | Agency check only | Add `@AdminOnly()` |
| `GET /stripe-connect/dashboard-link` | Agency check only | Add `@AdminOnly()` |
| `/api-credentials/*` | `@UseGuards(AdminGuard)` ✅ | Migrate to `@AdminOnly()` |
| `/users/*` (user management) | `@UseGuards(AdminGuard)` ✅ | Migrate to `@AdminOnly()` |
| `/admin/automation/*` | `@UseGuards(JwtAuthGuard, AdminRoleGuard)` ✅ | Migrate to `@AdminOnly()` |

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
3. Emits `contact.share_requested` event
4. Owner gets notification: "[Agent] requested access to [Contact Name]"
5. Owner clicks Approve → auto-creates `contact_shares` row via `ContactSharesService.createShare()` (access_level: 'full'), emits `contact.share_approved`, notifies requester
6. Owner clicks Deny → updates request status, emits `contact.share_denied`, notifies requester with optional reason
7. Admin override: Admin uses direct share endpoint, bypasses request flow

### Notification Wiring
Current `NotificationEventsListener` handles `trip.*`, `payment.*`, `proposal.*` events. Must add handlers for:

```typescript
@OnEvent('contact.share_requested')
async handleShareRequested(event) {
  // Create notification for contact owner
  await this.notificationService.createNotification({
    userId: event.ownerId,
    type: 'contact_share_request',
    title: `${event.requesterName} requested access to ${event.contactName}`,
    data: { requestId: event.requestId, contactId: event.contactId },
  })
}

@OnEvent('contact.share_approved')
async handleShareApproved(event) {
  // Create notification for requester
}

@OnEvent('contact.share_denied')
async handleShareDenied(event) {
  // Create notification for requester
}
```

Add `'contact_share_request'`, `'contact_share_approved'`, `'contact_share_denied'` to notification type enum.

### Agency Scope Enforcement
Service validates requester, contact, and owner are all in the same agency before creating a request. Reuses existing `ContactAccessService.checkAccess()` pattern.

### Duplicate Prevention
- Cannot request if pending request already exists for same contact + requester
- Cannot request if already shared

### Request Expiration
Pending requests expire after 30 days. Cleanup via scheduled job or on-read filtering.

### Existing Infrastructure — Must Reuse
- **`ContactSharesService`** (`contact-shares.service.ts`) — has `createShare()` method. On approval, call this directly (do NOT duplicate share creation logic).
- **`ContactAccessService`** (`contact-access.service.ts`) — has `checkAccess()` for agency/ownership validation. Reuse for request validation.
- **`UserValidationService`** (`user-validation.service.ts`) — validates user exists and is in same agency. Use for requester/owner validation.
- **`contact_shares`** table already exists with `accessLevel` ('basic'/'full'), `sharedBy`, `sharedWithUserId`
- **`trip_shares`** table already exists with `accessLevel` ('read'/'write')
- **Notification system** exists for in-app notifications (see Fix #10 below)

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
| POST | `/admin/impersonate/:userId` | Admin only (pre-impersonation) | Start impersonation |
| POST | `/admin/impersonate/extend` | Admin only (bypass impersonation swap) | Extend 30 min |
| DELETE | `/admin/impersonate` | Admin only (bypass impersonation swap) | End impersonation |
| GET | `/admin/impersonate/status` | Admin only (bypass impersonation swap) | Check active session |

**Deadlock prevention:** Impersonation control endpoints (`/admin/impersonate/*`) are marked with a `@BypassImpersonation()` decorator. The `ImpersonationInterceptor` checks for this metadata and skips the context swap, leaving the original admin context intact. This allows the admin to extend/exit/check status while impersonating, without exposing other admin endpoints.

```typescript
// apps/api/src/auth/decorators/bypass-impersonation.decorator.ts
export const BypassImpersonation = () => SetMetadata('bypass-impersonation', true)
```

### Auth Flow During Impersonation

**Implementation: NestJS Interceptor** (not middleware — middleware runs before guards so `request.user` is unavailable). An Interceptor runs after guards, giving access to the authenticated user context.

```
Request with X-Impersonate-User-Id header
  → JwtAuthGuard validates admin JWT (normal) — sets request.user
  → ImpersonationInterceptor (global, registered via APP_INTERCEPTOR):
    1. Check for X-Impersonate-User-Id header; if absent, skip
    2. Verify request.user.role === 'admin'
    3. Query impersonation_sessions for active session matching adminUserId + targetUserId
    4. Verify session exists, not expired, and header value === session.targetUserId
    5. Verify target user is in same agency as admin
    6. Store original admin context: request.originalAdmin = { id, name, role }
    7. Swap request.user: userId → targetUserId, role → target's role
  → Downstream guards/services see impersonated user's permissions
  → @AdminOnly guard rejects (role is now 'user') EXCEPT impersonation control endpoints
  → Audit service uses request.originalAdmin for actor identity
```

**Why Interceptor over Guard:** NestJS execution order is Middleware → Guards → Interceptors → Route Handler. We need the JWT guard to run first to authenticate the admin, then the interceptor swaps context. A guard would work too but interceptors are cleaner for request transformation.

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
| `security.login_failed` | Failed JWT validation | userId (if known), IP, reason |
| `security.impersonation_started` | Admin starts impersonation | adminId, targetId |
| `security.impersonation_ended` | Session ends | adminId, targetId, duration, reason |
| `security.role_changed` | User role updated | userId, oldRole, newRole, changedBy |
| `security.share_requested` | Agent requests contact access | requesterId, contactId, ownerId |
| `security.share_approved` | Owner approves request | requestId, resolvedBy |
| `security.share_denied` | Owner denies request | requestId, resolvedBy, reason |
| `security.access_denied` | 403 response | userId, endpoint, reason |

### Implementation

**Problem:** Current `audit.*` handler uses enum-constrained `entityType`/`action` fields and persists to `activity_logs` table. Security events are not entity-centric and don't fit this model.

**Solution:** New `security_audit_logs` table + dedicated `SecurityAuditService` + `@OnEvent('security.*')` handler.

**New table: `security_audit_logs`**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| event | varchar(100) | e.g., 'security.login_failed' |
| userId | uuid (nullable) | User involved (may be unknown for login failures) |
| actorId | uuid (nullable) | Who performed the action |
| agencyId | uuid (nullable) | Agency scope |
| metadata | jsonb | Event-specific data (IP, endpoint, reason, etc.) |
| createdAt | timestamp | Event time |

```typescript
// apps/api/src/security-audit/security-audit.service.ts
@Injectable()
export class SecurityAuditService {
  @OnEvent('security.*')
  async handleSecurityEvent(event: SecurityAuditEvent) {
    await this.db.client.insert(this.db.schema.securityAuditLogs).values({
      event: event.event,
      userId: event.userId,
      actorId: event.actorId,
      agencyId: event.agencyId,
      metadata: event.metadata,
    })
  }
}
```

This keeps the existing `audit.*` handler untouched and adds a parallel persistence path for security events.

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
