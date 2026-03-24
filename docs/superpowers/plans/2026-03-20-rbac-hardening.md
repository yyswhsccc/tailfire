# RBAC Hardening & Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden RBAC with a unified `@AdminOnly()` decorator, filter agent access across contacts/dashboard/settings, add contact share request workflow, impersonation system, and security audit logging.

**Architecture:** Consolidate three inconsistent admin guard patterns into one `@AdminOnly()` decorator. Add service-layer filtering for agent-scoped data. Introduce three new tables (`security_audit_logs`, `contact_share_requests`, `impersonation_sessions`) with corresponding NestJS modules. Frontend changes: role display rename, contact limited-view badge, impersonation banner.

**Tech Stack:** NestJS (API), Next.js (Admin), Drizzle ORM, PostgreSQL, EventEmitter2

**Spec:** `docs/superpowers/specs/2026-03-20-rbac-hardening-design.md`

**Migration index start:** 162 (latest is idx 161)

---

## File Structure

### New Files (API)

| File | Responsibility |
|------|---------------|
| `apps/api/src/auth/decorators/admin-only.decorator.ts` | Unified `@AdminOnly()` decorator |
| `apps/api/src/auth/decorators/bypass-impersonation.decorator.ts` | `@BypassImpersonation()` metadata |
| `apps/api/src/auth/guards/impersonation.guard.ts` | Global guard — swaps request.user during impersonation |
| `apps/api/src/security-audit/security-audit.module.ts` | Module for security audit logging |
| `apps/api/src/security-audit/security-audit.service.ts` | `@OnEvent('security.*')` handler + query methods |
| `apps/api/src/security-audit/security-audit.types.ts` | Event type definitions |
| `apps/api/src/contacts/contact-share-requests.controller.ts` | REST endpoints for share requests |
| `apps/api/src/contacts/contact-share-requests.service.ts` | Share request business logic |
| `apps/api/src/contacts/dto/contact-share-request.dto.ts` | DTOs for share request endpoints |
| `apps/api/src/impersonation/impersonation.module.ts` | Module for impersonation |
| `apps/api/src/impersonation/impersonation.controller.ts` | Admin impersonation endpoints |
| `apps/api/src/impersonation/impersonation.service.ts` | Session management logic |

### New Files (Database)

| File | Responsibility |
|------|---------------|
| `packages/database/src/schema/security-audit-logs.schema.ts` | Drizzle schema for `security_audit_logs` |
| `packages/database/src/schema/contact-share-requests.schema.ts` | Drizzle schema for `contact_share_requests` |
| `packages/database/src/schema/impersonation-sessions.schema.ts` | Drizzle schema for `impersonation_sessions` |
| `packages/database/src/migrations/20260320120000_create_security_audit_logs.sql` | Migration |
| `packages/database/src/migrations/20260320120100_create_contact_share_requests.sql` | Migration |
| `packages/database/src/migrations/20260320120200_create_impersonation_sessions.sql` | Migration |

### New Files (Frontend)

| File | Responsibility |
|------|---------------|
| `apps/admin/src/lib/constants/roles.ts` | `ROLE_DISPLAY_NAMES` constant |
| `apps/admin/src/components/impersonation/impersonation-banner.tsx` | Fixed amber impersonation bar |
| `apps/admin/src/hooks/use-impersonation.ts` | Impersonation state hook |
| `apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx` | "Request Access" button |

### Modified Files (API)

| File | Change |
|------|--------|
| `apps/api/src/main.ts` | Add ImpersonationGuard to global guard chain |
| `apps/api/src/financials/commission/commission.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/users/users.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/api-credentials/api-credentials.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/trips/trips.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/reference-data/reference-data.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/external-apis/providers/aerodatabox/aerodatabox.controller.ts` | Migrate `@UseGuards(AdminGuard)` → `@AdminOnly()` |
| `apps/api/src/suppliers/suppliers.controller.ts` | Migrate `@Roles('admin')` → `@AdminOnly()` |
| `apps/api/src/loyalty-programs/loyalty-programs.controller.ts` | Migrate `@Roles('admin')` → `@AdminOnly()` |
| `apps/api/src/enrichment/enrichment.controller.ts` | Migrate `@Roles('admin')` → `@AdminOnly()` |
| `apps/api/src/automation/admin/automation.controller.ts` | Migrate `@UseGuards(JwtAuthGuard, AdminRoleGuard)` → `@AdminOnly()` |
| `apps/api/src/financials/stripe-connect.controller.ts` | Add `@AdminOnly()` to settings/stripe endpoints |
| `apps/api/src/dashboard/dashboard.service.ts` | Add auth filtering to `getStats()` |
| `apps/api/src/dashboard/dashboard.controller.ts` | Pass auth to `getStats()` |
| `apps/api/src/contacts/contacts.controller.ts` | Add ownership filter to linked-data endpoints |
| `apps/api/src/contacts/contacts.module.ts` | Register share request controller/service |
| `apps/api/src/notifications/notification.types.ts` | Add new categories |
| `apps/api/src/notifications/listeners/notification-events.listener.ts` | Add contact share + impersonation handlers |
| `apps/api/src/app.controller.ts` | Gate debug-sentry behind admin |
| `packages/database/src/schema/index.ts` | Export new schemas |
| `packages/database/src/migrations/meta/_journal.json` | Register new migrations |

### Modified Files (Frontend)

| File | Change |
|------|--------|
| `apps/admin/src/app/settings/users/_components/users-table.tsx` | Use `ROLE_DISPLAY_NAMES` |
| `apps/admin/src/app/contacts/[id]/page.tsx` | Show "Limited View" badge + "Request Access" button |
| `apps/admin/src/app/providers.tsx` | Add ImpersonationProvider |
| `apps/admin/src/components/layout/top-nav.tsx` | Mount ImpersonationBanner |

---

## Phase 1: Foundation

### Task 1: Create `@AdminOnly()` Decorator

**Files:**
- Create: `apps/api/src/auth/decorators/admin-only.decorator.ts`

- [ ] **Step 1: Create the decorator file**

```typescript
// apps/api/src/auth/decorators/admin-only.decorator.ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { AdminRoleGuard } from '../guards/admin-role.guard'

/**
 * Unified admin-only decorator.
 * Combines role metadata + AdminRoleGuard in one decorator.
 * JwtAuthGuard is global, so no need to include it.
 */
export const AdminOnly = () =>
  applyDecorators(
    SetMetadata('roles', ['admin']),
    UseGuards(AdminRoleGuard),
  )
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to admin-only.decorator.ts

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/decorators/admin-only.decorator.ts
git commit -m "feat(auth): create unified @AdminOnly() decorator"
```

---

### Task 2: Migrate All Admin Guard Patterns to `@AdminOnly()`

**Files:**
- Modify: `apps/api/src/financials/commission/commission.controller.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/api-credentials/api-credentials.controller.ts`
- Modify: `apps/api/src/trips/trips.controller.ts`
- Modify: `apps/api/src/reference-data/reference-data.controller.ts`
- Modify: `apps/api/src/external-apis/providers/aerodatabox/aerodatabox.controller.ts`
- Modify: `apps/api/src/suppliers/suppliers.controller.ts`
- Modify: `apps/api/src/loyalty-programs/loyalty-programs.controller.ts`
- Modify: `apps/api/src/enrichment/enrichment.controller.ts`
- Modify: `apps/api/src/automation/admin/automation.controller.ts`

**Pattern 1 migration** (`@UseGuards(AdminGuard)` → `@AdminOnly()`):

For each controller using Pattern 1:

- [ ] **Step 1: Read the controller to find all `AdminGuard` usages**

- [ ] **Step 2: Replace imports and decorators**

For each file:
1. Remove: `import { AdminGuard } from '../../common/guards/admin.guard'` (path varies)
2. Add: `import { AdminOnly } from '../../auth/decorators/admin-only.decorator'` (path varies)
3. Replace every `@UseGuards(AdminGuard)` with `@AdminOnly()`

Controllers to migrate (Pattern 1):
- `commission.controller.ts` — **method-level** `@UseGuards(AdminGuard)` on ~11 individual methods. Replace each one with `@AdminOnly()`. (Confirm all methods are admin-only before using a controller-level decorator instead.)
- `users.controller.ts` — controller-level `@UseGuards(AdminGuard)` → `@AdminOnly()`
- `api-credentials.controller.ts` — controller-level `@UseGuards(AdminGuard)` → `@AdminOnly()`
- `trips.controller.ts` — method-level on specific endpoints (2 usages)
- `reference-data.controller.ts` — controller-level
- `aerodatabox.controller.ts` — controller-level

- [ ] **Step 3: Verify Pattern 1 controllers compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -30`

**Pattern 2 migration** (`@Roles('admin')` → `@AdminOnly()`):

- [ ] **Step 4: Migrate Pattern 2 controllers**

For each file:
1. Remove: `import { Roles } from '../../auth/decorators/roles.decorator'` (path varies)
2. Add: `import { AdminOnly } from '../../auth/decorators/admin-only.decorator'` (path varies)
3. Replace every `@Roles('admin')` with `@AdminOnly()`

Controllers to migrate (Pattern 2):
- `suppliers.controller.ts` — 2 method-level `@Roles('admin')` → `@AdminOnly()`
- `loyalty-programs.controller.ts` — 3 method-level `@Roles('admin')` → `@AdminOnly()`
- `enrichment.controller.ts` — 1 method-level `@Roles('admin')` → `@AdminOnly()`

- [ ] **Step 5: Verify Pattern 2 controllers compile**

**Pattern 3 migration** (`@UseGuards(JwtAuthGuard, AdminRoleGuard)` → `@AdminOnly()`):

- [ ] **Step 6: Migrate automation controller**

In `apps/api/src/automation/admin/automation.controller.ts`:
1. Remove: `import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'`
2. Remove: `import { AdminRoleGuard } from '../../auth/guards/admin-role.guard'`
3. Add: `import { AdminOnly } from '../../auth/decorators/admin-only.decorator'`
4. Replace `@UseGuards(JwtAuthGuard, AdminRoleGuard)` with `@AdminOnly()` (JwtAuthGuard is global, redundant)

- [ ] **Step 7: Full compile check**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(auth): migrate all admin guards to @AdminOnly() decorator"
```

---

### Task 3: Role Display Rename (Work Item 9)

**Files:**
- Create: `apps/admin/src/lib/constants/roles.ts`
- Modify: `apps/admin/src/app/settings/users/_components/users-table.tsx`

- [ ] **Step 1: Create the shared constant**

```typescript
// apps/admin/src/lib/constants/roles.ts
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Admin',
  user: 'Agent',
  client_portal: 'Client',
}

export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role
}
```

- [ ] **Step 2: Update users table to use the constant**

In `apps/admin/src/app/settings/users/_components/users-table.tsx`:
1. Add: `import { getRoleDisplayName } from '@/lib/constants/roles'`
2. Update `getRoleBadge()` function (~line 46-51) to use `getRoleDisplayName(role)` for the badge label instead of hardcoded strings

Before:
```tsx
function getRoleBadge(role: string) {
  if (role === 'admin') return <Badge variant="outline" className="border-purple-500 text-purple-500">Admin</Badge>
  return <Badge variant="outline">User</Badge>
}
```

After:
```tsx
function getRoleBadge(role: string) {
  const label = getRoleDisplayName(role)
  if (role === 'admin') return <Badge variant="outline" className="border-purple-500 text-purple-500">{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}
```

- [ ] **Step 3: Search for other hardcoded "User" role labels in frontend**

Run: `grep -rn "role.*===.*'user'" apps/admin/src/ --include="*.tsx" --include="*.ts"` and update any display strings.

Check these known locations:
- `apps/admin/src/app/trips/[id]/_components/trip-travelers.tsx`
- `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): rename 'User' role display to 'Agent' across admin UI"
```

---

## Phase 2: Hardening

### Task 4: Public Endpoint Audit (Work Item 2)

**Files:**
- Modify: `apps/api/src/app.controller.ts`

This is primarily a verification task. Most public endpoints already have proper service-layer auth.

- [ ] **Step 1: Verify each @Public() endpoint category**

Read each controller with `@Public()` endpoints and verify auth mechanisms:

| Category | Controller | Check |
|----------|-----------|-------|
| Health | `app.controller.ts` | `GET /health` — OK, no data |
| Root | `app.controller.ts` | `GET /` — OK, returns version string |
| Debug | `app.controller.ts` | `GET /debug-sentry` — NEEDS FIX: gate behind `@AdminOnly()` or remove |
| Auth | `auth.controller.ts` | `POST /auth/request-password-reset` — Verify rate limit exists |
| Cruise import | `cruise-import.controller.ts` | Uses `InternalApiKeyGuard` — OK |
| Tour import | Verify existence and `InternalApiKeyGuard` |
| Cruise repo | `cruise-repository.controller.ts` | Uses `CatalogAuthGuard` — OK |
| Tour repo | Verify existence and `CatalogAuthGuard` |
| Globus | `globus.controller.ts` | Uses `CatalogAuthGuard` — OK |
| Portal | `portal.controller.ts` | Uses `PortalAuthGuard` — OK |
| Client portal | Verify `PortalAuthGuard` |
| Stripe webhooks | `stripe-invoice.controller.ts` | Stripe signature verification — OK |
| User profiles public | Verify returns minimal data only |
| Trip share token | `trips.controller.ts` share endpoints | Verify token validation + rate limits on write endpoints |

- [ ] **Step 2: Fix debug-sentry endpoint**

**IMPORTANT:** `@Public()` is applied at the **class level** on `AppController` (line 8). A method-level `@AdminOnly()` won't override the class-level `@Public()` because `JwtAuthGuard` checks `@Public()` first and skips auth entirely, so `request.user` is undefined when `AdminRoleGuard` runs.

**Fix:** Remove class-level `@Public()`, add method-level `@Public()` to the endpoints that need it, and add `@AdminOnly()` to `debugSentry()`:

```typescript
// Before:
@Controller()
@Public() // class-level — makes ALL endpoints public
export class AppController {
  @Get('health')
  getHealth() { ... }

  @Get()
  getInfo() { ... }

  @Get('debug-sentry')
  debugSentry() { ... }
}

// After:
import { AdminOnly } from './auth/decorators/admin-only.decorator'

@Controller()
export class AppController {
  @Get('health')
  @Public()
  getHealth() { ... }

  @Get()
  @Public()
  getInfo() { ... }

  @Get('debug-sentry')
  @AdminOnly()
  debugSentry() {
    throw new Error('Sentry test error from Tailfire API')
  }
}
```

- [ ] **Step 3: Verify all trip share token write endpoints have rate limiting**

Read `trips.controller.ts` share endpoints (lines 180-250+). Verify these POST endpoints have `@Throttle()`:
- `POST /trips/share/:token/comments`
- `POST /trips/share/:token/approve`
- `POST /trips/share/:token/decline`
- `POST /trips/share/:token/responses`
- `POST /trips/share/:token/select`

If any are missing `@Throttle()`, add it.

- [ ] **Step 4: Document findings as a checklist comment at top of commit**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "security(auth): audit all @Public() endpoints, gate debug-sentry behind admin"
```

---

### Task 5: Platform Settings Guard (Work Item 5)

**Files:**
- Modify: `apps/api/src/financials/stripe-connect.controller.ts`

- [ ] **Step 1: Read the stripe-connect controller**

Read `apps/api/src/financials/stripe-connect.controller.ts` to confirm the current pattern — manual `agencyId !== auth.agencyId` checks with no role guard.

- [ ] **Step 2: Add `@AdminOnly()` to all settings/stripe endpoints**

Add import at top:
```typescript
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
```

Add `@AdminOnly()` to each method:
- `getSettings()` — `GET /agencies/:agencyId/settings`
- `updateSettings()` — `PATCH /agencies/:agencyId/settings`
- `startOnboarding()` — `POST /agencies/:agencyId/stripe/onboard`
- `getStripeStatus()` — `GET /agencies/:agencyId/stripe/status`
- `getDashboardLink()` — `POST /agencies/:agencyId/stripe/dashboard`

Keep the existing `agencyId !== auth.agencyId` checks — they prevent cross-agency access even among admins.

- [ ] **Step 3: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/financials/stripe-connect.controller.ts
git commit -m "security(auth): add @AdminOnly() to agency settings and Stripe endpoints"
```

---

### Task 6: Contact Access Filtering — Backend (Work Item 3)

**Files:**
- Modify: `apps/api/src/contacts/contacts.controller.ts`

The `ContactAccessService.filterSensitiveFields()` already strips fields for non-owner/non-shared agents. The gap is in the **linked-data endpoints** that only check `agencyId`:

- `GET /contacts/:id/trips` (line 110-116) — no ownership check
- `GET /contacts/:id/bookings` (line 123-130) — no ownership check
- `GET /contacts/:id/payment-transactions` (line 157-165) — no ownership check

- [ ] **Step 1: Read contact-access.service.ts to confirm `canAccessSensitiveData` API**

Confirm signature: `canAccessSensitiveData(contactId: string, auth: AuthContext): Promise<ContactAccessResult>`
Where `ContactAccessResult` has `canAccessSensitive: boolean`.

- [ ] **Step 2: Add ownership filter to `GET /contacts/:id/trips`**

In `contacts.controller.ts`, update the `getTrips()` method (~line 110):

```typescript
@Get(':id/trips')
async getTrips(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
) {
  // Non-admins: if they don't have full access to this contact,
  // only show trips they own or are shared on
  if (auth.role !== 'admin') {
    const accessResult = await this.contactAccessService.canAccessSensitiveData(id, auth)
    if (!accessResult.canAccessSensitive) {
      // Filter to only trips the agent can access
      const allTrips = await this.contactsService.getTripsForContact(id, auth.agencyId)
      const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
      if (accessibleTripIds === 'all') return allTrips
      return allTrips.filter((t: any) => accessibleTripIds.includes(t.id))
    }
  }
  return this.contactsService.getTripsForContact(id, auth.agencyId)
}
```

- [ ] **Step 3: Add ownership filter to `GET /contacts/:id/bookings`**

Same pattern as trips — filter bookings to trips the agent can access:

```typescript
@Get(':id/bookings')
async getBookings(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
) {
  await this.contactsService.findOne(id, auth.agencyId)
  if (auth.role !== 'admin') {
    const accessResult = await this.contactAccessService.canAccessSensitiveData(id, auth)
    if (!accessResult.canAccessSensitive) {
      const allBookings = await this.contactsService.getBookingsForContact(id, auth.agencyId)
      const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
      if (accessibleTripIds === 'all') return allBookings
      // NOTE: getBookingsForContact returns { trip: { id, name, status } } — use b.trip.id
      return allBookings.filter((b: any) => accessibleTripIds.includes(b.trip.id))
    }
  }
  return this.contactsService.getBookingsForContact(id, auth.agencyId)
}
```

- [ ] **Step 4: Add ownership filter to `GET /contacts/:id/payment-transactions`**

```typescript
@Get(':contactId/payment-transactions')
async getContactPaymentTransactions(
  @GetAuthContext() auth: AuthContext,
  @Param('contactId') contactId: string,
) {
  await this.contactsService.findOne(contactId, auth.agencyId)
  if (auth.role !== 'admin') {
    const accessResult = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
    if (!accessResult.canAccessSensitive) {
      return [] // Non-owner agents cannot see payment transactions
    }
  }
  return this.paymentSchedulesService.getContactPaymentTransactions(contactId, auth.agencyId)
}
```

- [ ] **Step 5: Verify notes controller checks resource ownership (not just agencyId)**

Read `apps/api/src/notes/notes.controller.ts` fully. Verify that:
1. `verifyEntityAccess()` (called at ~line 56 and ~line 157) dispatches to `TripAccessService.verifyReadAccess()` for trip-linked notes and `ContactsService.findOne()` for contact-linked notes
2. For contact-linked notes, verify that non-owner agents WITHOUT full access are blocked — `ContactsService.findOne()` only checks agencyId. If it does NOT check ownership, add a `ContactAccessService.canAccessSensitiveData()` check and throw `ForbiddenException` for non-owner agents
3. Grep: `grep -n "verifyEntityAccess\|findOne\|canAccess" apps/api/src/notes/notes.controller.ts`

- [ ] **Step 6: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contacts/contacts.controller.ts
git commit -m "security(contacts): gate linked-data endpoints by contact ownership for agents"
```

---

### Task 7: Contact Access Filtering — Frontend (Work Item 3 UI)

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx`
- Create: `apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx`

- [ ] **Step 1: Read the contact detail page**

Read `apps/admin/src/app/contacts/[id]/page.tsx` to understand the current layout and where to add the "Limited View" badge.

- [ ] **Step 2: Add "Limited View" badge and "Request Access" button**

Determine from the API response whether the contact has been filtered (sensitive fields are null/missing). The `ContactAccessService.filterSensitiveFields()` nulls out sensitive fields — so if e.g. `dateOfBirth === null && passportNumber === null` on a contact that likely has them, it's a filtered view. However, a cleaner approach: add a `_accessLevel: 'basic' | 'full'` field to the API response.

**Two changes needed:**

1. In `packages/shared-types/src/api/contacts.types.ts`, add `_accessLevel` to `ContactResponseDto`:
```typescript
// Add to ContactResponseDto interface:
_accessLevel?: 'basic' | 'full'
```

2. In `apps/api/src/contacts/contact-access.service.ts`, update `applyAccessControl()` to include access level in the response:

```typescript
async applyAccessControl(contact: any, auth: AuthContext) {
  const result = await this.canAccessSensitiveData(contact.id, auth)
  const filtered = this.filterSensitiveFields(contact, result.canAccessSensitive)
  return { ...filtered, _accessLevel: result.canAccessSensitive ? 'full' : 'basic' }
}
```

And in `applyAccessControlToMany()`, do the same for each contact.

- [ ] **Step 3: Add badge UI to contact detail page**

In the contact detail page header area, add:

```tsx
{contact._accessLevel === 'basic' && !isAdmin && (
  <div className="flex items-center gap-2">
    <Badge variant="outline" className="border-amber-500 text-amber-500">Limited View</Badge>
    <ContactShareRequestButton contactId={contact.id} />
  </div>
)}
```

- [ ] **Step 4: Create the "Request Access" button component**

```tsx
// apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx
'use client'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useState } from 'react'
import { toast } from 'sonner'

export function ContactShareRequestButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequest() {
    setLoading(true)
    try {
      await api.post(`/contacts/${contactId}/share-requests`)
      setRequested(true)
      toast.success('Access request sent to contact owner')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request access')
    } finally {
      setLoading(false)
    }
  }

  if (requested) {
    return <Button variant="outline" size="sm" disabled>Request Sent</Button>
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
      {loading ? 'Requesting...' : 'Request Access'}
    </Button>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(contacts): add Limited View badge and Request Access button for agents"
```

---

### Task 8: Dashboard Agent Filtering (Work Item 4)

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`

- [ ] **Step 1: Fix `getStats()` to accept auth and filter for agents**

In `dashboard.controller.ts`, pass `auth` to `getStats()`:

```typescript
@Get('stats')
async getStats(@GetAuthContext() auth: AuthContext): Promise<DashboardStats> {
  return this.dashboardService.getStats(auth)
}
```

- [ ] **Step 2: Update `getStats()` in dashboard.service.ts to filter by ownership**

In `dashboard.service.ts`, change `getStats(agencyId: string)` to `getStats(auth: AuthContext)`:

```typescript
async getStats(auth: AuthContext): Promise<DashboardStats> {
  const { agencyId } = auth
  const isAdmin = auth.role === 'admin'

  // For agents, scope to accessible trips only
  let tripFilter = eq(this.db.schema.trips.agencyId, agencyId)
  let contactFilter = eq(this.db.schema.contacts.agencyId, agencyId)
  let paymentFilter = eq(this.db.schema.paymentTransactions.agencyId, agencyId)

  if (!isAdmin) {
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    if (accessibleTripIds === 'all') {
      // Shouldn't happen for non-admin, but handle gracefully
    } else if (accessibleTripIds.length === 0) {
      return { totalTrips: 0, activeTrips: 0, totalContacts: 0, totalRevenue: 0 }
    } else {
      tripFilter = and(
        eq(this.db.schema.trips.agencyId, agencyId),
        inArray(this.db.schema.trips.id, accessibleTripIds),
      )!
      // Contacts: scope to owned + shared
      contactFilter = and(
        eq(this.db.schema.contacts.agencyId, agencyId),
        eq(this.db.schema.contacts.ownerId, auth.userId),
      )!
    }
  }

  // ... rest uses tripFilter/contactFilter/paymentFilter instead of just agencyId eq
```

Note: The full `getOverview()` method already uses `tripAccessService.getAccessibleTripIds(auth)` — that path is correct. Only `getStats()` needs fixing.

- [ ] **Step 3: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.ts
git commit -m "security(dashboard): filter legacy getStats() endpoint by agent ownership"
```

---

## Phase 3: Security Audit Logging + Contact Share Requests

### Task 9: Security Audit Logs — Migration & Schema (Work Item 8)

**Files:**
- Create: `packages/database/src/migrations/20260320120000_create_security_audit_logs.sql`
- Create: `packages/database/src/schema/security-audit-logs.schema.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration SQL**

```sql
-- 20260320120000_create_security_audit_logs.sql
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(100) NOT NULL,
  user_id UUID,
  actor_id UUID,
  agency_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_audit_logs_event ON security_audit_logs(event);
CREATE INDEX idx_security_audit_logs_agency ON security_audit_logs(agency_id);
CREATE INDEX idx_security_audit_logs_created ON security_audit_logs(created_at DESC);
CREATE INDEX idx_security_audit_logs_user ON security_audit_logs(user_id);
```

- [ ] **Step 2: Create Drizzle schema**

```typescript
// packages/database/src/schema/security-audit-logs.schema.ts
import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const securityAuditLogs = pgTable('security_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: varchar('event', { length: 100 }).notNull(),
  userId: uuid('user_id'),
  actorId: uuid('actor_id'),
  agencyId: uuid('agency_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Export from schema index**

In `packages/database/src/schema/index.ts`, add:
```typescript
export * from './security-audit-logs.schema'
```

- [ ] **Step 4: Register in migration journal**

Add to `_journal.json` array:
```json
{
  "idx": 162,
  "version": "7",
  "when": 1774267200000,
  "tag": "20260320120000_create_security_audit_logs",
  "breakpoints": false
}
```

- [ ] **Step 5: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration applies successfully

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): create security_audit_logs table"
```

---

### Task 10: Security Audit Service (Work Item 8)

**Files:**
- Create: `apps/api/src/security-audit/security-audit.types.ts`
- Create: `apps/api/src/security-audit/security-audit.service.ts`
- Create: `apps/api/src/security-audit/security-audit.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the event types**

```typescript
// apps/api/src/security-audit/security-audit.types.ts
export interface SecurityAuditEvent {
  event: string
  userId?: string | null
  actorId?: string | null
  agencyId?: string | null
  metadata?: Record<string, unknown>
}
```

- [ ] **Step 2: Create the service**

```typescript
// apps/api/src/security-audit/security-audit.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DatabaseService } from '../db/database.service'
import type { SecurityAuditEvent } from './security-audit.types'

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name)

  constructor(private readonly db: DatabaseService) {}

  @OnEvent('security.*')
  async handleSecurityEvent(event: SecurityAuditEvent): Promise<void> {
    try {
      await this.db.client.insert(this.db.schema.securityAuditLogs).values({
        event: event.event,
        userId: event.userId ?? null,
        actorId: event.actorId ?? null,
        agencyId: event.agencyId ?? null,
        metadata: event.metadata ?? {},
      })
    } catch (error) {
      this.logger.error(`Failed to log security event: ${event.event}`, error)
    }
  }
}
```

- [ ] **Step 3: Create the module**

```typescript
// apps/api/src/security-audit/security-audit.module.ts
import { Module } from '@nestjs/common'
import { SecurityAuditService } from './security-audit.service'

@Module({
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
```

- [ ] **Step 4: Register in AppModule**

In `apps/api/src/app.module.ts`, add `SecurityAuditModule` to imports array.

- [ ] **Step 5: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(security): add SecurityAuditService with @OnEvent('security.*') handler"
```

---

### Task 10b: Wire Remaining Security Audit Events (Work Item 8)

**Files:**
- Modify: `apps/api/src/auth/guards/jwt-auth.guard.ts`
- Modify: `apps/api/src/auth/guards/admin-role.guard.ts`
- Modify: `apps/api/src/users/users.service.ts` (or users controller)
- Modify: `apps/api/src/main.ts`

The spec lists these events that Task 10 doesn't wire:
- `security.login_failed` — Failed JWT validation
- `security.role_changed` — User role updated
- `security.access_denied` — 403 response

- [ ] **Step 1: Emit `security.login_failed` from JwtAuthGuard**

Since guards in `useGlobalGuards()` are manually instantiated (no DI), use `app.get(EventEmitter2)` in `main.ts` and pass it to the guard constructor. Alternatively, add a NestJS exception filter that catches `UnauthorizedException` from JWT validation and emits the event.

Recommended approach: Create a global `SecurityExceptionFilter` that listens for 401/403 responses and emits security events:

```typescript
// apps/api/src/security-audit/security-exception.filter.ts
@Catch(UnauthorizedException, ForbiddenException)
export class SecurityExceptionFilter implements ExceptionFilter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest()
    const response = ctx.getResponse()
    const status = exception.getStatus()

    const event = status === 401 ? 'security.login_failed' : 'security.access_denied'
    this.eventEmitter.emit(event, {
      event,
      userId: request.user?.userId ?? null,
      actorId: request.user?.userId ?? null,
      agencyId: request.user?.agencyId ?? null,
      metadata: {
        endpoint: `${request.method} ${request.url}`,
        reason: exception.message,
        ip: request.ip,
      },
    })

    response.status(status).json(exception.getResponse())
  }
}
```

Register in `app.module.ts` as `APP_FILTER` (after SentryGlobalFilter).

- [ ] **Step 2: Emit `security.role_changed` from users service**

In the users service/controller where role updates happen, add:
```typescript
this.eventEmitter.emit('security.role_changed', {
  event: 'security.role_changed',
  userId: targetUserId,
  actorId: auth.userId,
  agencyId: auth.agencyId,
  metadata: { oldRole, newRole },
})
```

- [ ] **Step 3: Verify compile and commit**

```bash
git add -A
git commit -m "feat(security): wire login_failed, access_denied, role_changed audit events"
```

---

### Task 10c: Impersonation Action Attribution (Work Item 7 — Followup)

**Note:** Full action attribution during impersonation (making every write log `actorId = adminUserId` with `impersonatingAs = targetUserId`) requires touching every service that emits audit events. This is deferred to a follow-up PR.

For now, the plan captures:
- `request.originalAdmin` is stored on every impersonated request (available for any service to read)
- Impersonation start/end are logged to `security_audit_logs`
- Target agent receives notification after session ends

**Followup task:** Create an `ActorResolver` utility that services use instead of `auth.userId` directly. When impersonating, it returns `{ actorId: originalAdmin.id, impersonatingAs: auth.userId }`. This requires auditing all `auth.userId` usages in audit-emitting services.

---

### Task 11: Contact Share Requests — Migration & Schema (Work Item 6)

**Files:**
- Create: `packages/database/src/migrations/20260320120100_create_contact_share_requests.sql`
- Create: `packages/database/src/schema/contact-share-requests.schema.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration SQL**

```sql
-- 20260320120100_create_contact_share_requests.sql
CREATE TABLE IF NOT EXISTS contact_share_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csr_contact ON contact_share_requests(contact_id);
CREATE INDEX idx_csr_owner_status ON contact_share_requests(owner_id, status);
CREATE INDEX idx_csr_requester ON contact_share_requests(requester_id);
CREATE INDEX idx_csr_agency ON contact_share_requests(agency_id);

-- Prevent duplicate pending requests
CREATE UNIQUE INDEX idx_csr_unique_pending
  ON contact_share_requests(contact_id, requester_id)
  WHERE status = 'pending';
```

- [ ] **Step 2: Create Drizzle schema**

```typescript
// packages/database/src/schema/contact-share-requests.schema.ts
import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'

export const contactShareRequests = pgTable('contact_share_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  requesterId: uuid('requester_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  agencyId: uuid('agency_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reason: text('reason'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Export from schema index**

Add to `packages/database/src/schema/index.ts`:
```typescript
export * from './contact-share-requests.schema'
```

- [ ] **Step 4: Register in migration journal**

```json
{
  "idx": 163,
  "version": "7",
  "when": 1774267260000,
  "tag": "20260320120100_create_contact_share_requests",
  "breakpoints": false
}
```

- [ ] **Step 5: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): create contact_share_requests table"
```

---

### Task 12: Contact Share Requests — Backend Service (Work Item 6)

**Files:**
- Create: `apps/api/src/contacts/dto/contact-share-request.dto.ts`
- Create: `apps/api/src/contacts/contact-share-requests.service.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// apps/api/src/contacts/dto/contact-share-request.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator'

export class ResolveShareRequestDto {
  @IsEnum(['approved', 'denied'])
  status!: 'approved' | 'denied'

  @IsOptional()
  @IsString()
  reason?: string
}
```

- [ ] **Step 2: Create the service**

```typescript
// apps/api/src/contacts/contact-share-requests.service.ts
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, desc, gt, lt } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ContactSharesService } from './contact-shares.service'
import { ContactAccessService } from './contact-access.service'
import { UserValidationService } from '../common/user-validation.service'
import type { AuthContext } from '../auth/auth.types'

@Injectable()
export class ContactShareRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly contactSharesService: ContactSharesService,
    private readonly contactAccessService: ContactAccessService,
    private readonly userValidationService: UserValidationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createRequest(contactId: string, auth: AuthContext) {
    // Verify contact exists and is in same agency
    const contact = await this.db.client.query.contacts.findFirst({
      where: and(
        eq(this.db.schema.contacts.id, contactId),
        eq(this.db.schema.contacts.agencyId, auth.agencyId),
      ),
    })
    if (!contact) throw new NotFoundException('Contact not found')
    if (!contact.ownerId) throw new BadRequestException('Cannot request access to agency-wide contacts')
    if (contact.ownerId === auth.userId) throw new BadRequestException('You already own this contact')

    // Check if already shared
    const accessResult = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
    if (accessResult.canAccessSensitive) {
      throw new BadRequestException('You already have full access to this contact')
    }

    // Expire stale pending requests (>30 days) before checking for duplicates.
    // Without this, the partial unique index on (contactId, requesterId) WHERE status='pending'
    // would block new requests even though the old one is logically expired.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await this.db.client.update(this.db.schema.contactShareRequests)
      .set({ status: 'expired' })
      .where(and(
        eq(this.db.schema.contactShareRequests.contactId, contactId),
        eq(this.db.schema.contactShareRequests.requesterId, auth.userId),
        eq(this.db.schema.contactShareRequests.status, 'pending'),
        lt(this.db.schema.contactShareRequests.createdAt, thirtyDaysAgo),
      ))

    // Check for existing active pending request
    const existing = await this.db.client.query.contactShareRequests.findFirst({
      where: and(
        eq(this.db.schema.contactShareRequests.contactId, contactId),
        eq(this.db.schema.contactShareRequests.requesterId, auth.userId),
        eq(this.db.schema.contactShareRequests.status, 'pending'),
      ),
    })
    if (existing) throw new BadRequestException('You already have a pending request for this contact')

    const [request] = await this.db.client.insert(this.db.schema.contactShareRequests).values({
      contactId,
      requesterId: auth.userId,
      ownerId: contact.ownerId,
      agencyId: auth.agencyId,
      status: 'pending',
    }).returning()

    // Get requester name for notification
    const requester = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, auth.userId),
      columns: { firstName: true, lastName: true },
    })
    const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || 'Unknown'
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'

    this.eventEmitter.emit('contact.share_requested', {
      requestId: request!.id,
      contactId,
      contactName,
      ownerId: contact.ownerId,
      requesterId: auth.userId,
      requesterName,
      agencyId: auth.agencyId,
    })

    this.eventEmitter.emit('security.share_requested', {
      event: 'security.share_requested',
      userId: contact.ownerId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: { requestId: request!.id, contactId },
    })

    return request
  }

  async getPendingForOwner(auth: AuthContext) {
    // Pending requests expire after 30 days (on-read filtering)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return this.db.client.query.contactShareRequests.findMany({
      where: and(
        eq(this.db.schema.contactShareRequests.ownerId, auth.userId),
        eq(this.db.schema.contactShareRequests.status, 'pending'),
        eq(this.db.schema.contactShareRequests.agencyId, auth.agencyId),
        gt(this.db.schema.contactShareRequests.createdAt, thirtyDaysAgo),
      ),
      orderBy: [desc(this.db.schema.contactShareRequests.createdAt)],
    })
  }

  async resolve(requestId: string, status: 'approved' | 'denied', reason: string | undefined, auth: AuthContext) {
    const request = await this.db.client.query.contactShareRequests.findFirst({
      where: and(
        eq(this.db.schema.contactShareRequests.id, requestId),
        eq(this.db.schema.contactShareRequests.agencyId, auth.agencyId),
      ),
    })
    if (!request) throw new NotFoundException('Share request not found')
    if (request.status !== 'pending') throw new BadRequestException('Request already resolved')

    // Only owner or admin can resolve
    if (auth.role !== 'admin' && request.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner or an admin can resolve share requests')
    }

    // Update request
    await this.db.client.update(this.db.schema.contactShareRequests)
      .set({
        status,
        reason: reason ?? null,
        resolvedAt: new Date(),
        resolvedBy: auth.userId,
      })
      .where(eq(this.db.schema.contactShareRequests.id, requestId))

    if (status === 'approved') {
      // Create the share via existing ContactSharesService
      await this.contactSharesService.create(
        request.contactId,
        {
          sharedWithUserId: request.requesterId,
          accessLevel: 'full',
        },
        auth,
      )

      this.eventEmitter.emit('contact.share_approved', {
        requestId,
        contactId: request.contactId,
        requesterId: request.requesterId,
        ownerId: request.ownerId,
        agencyId: auth.agencyId,
      })

      this.eventEmitter.emit('security.share_approved', {
        event: 'security.share_approved',
        userId: request.requesterId,
        actorId: auth.userId,
        agencyId: auth.agencyId,
        metadata: { requestId },
      })
    } else {
      this.eventEmitter.emit('contact.share_denied', {
        requestId,
        contactId: request.contactId,
        requesterId: request.requesterId,
        ownerId: request.ownerId,
        reason,
        agencyId: auth.agencyId,
      })

      this.eventEmitter.emit('security.share_denied', {
        event: 'security.share_denied',
        userId: request.requesterId,
        actorId: auth.userId,
        agencyId: auth.agencyId,
        metadata: { requestId, reason },
      })
    }

    return { status }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(contacts): add ContactShareRequestsService with create/resolve logic"
```

---

### Task 13: Contact Share Requests — Controller & Module Wiring (Work Item 6)

**Files:**
- Create: `apps/api/src/contacts/contact-share-requests.controller.ts`
- Modify: `apps/api/src/contacts/contacts.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
// apps/api/src/contacts/contact-share-requests.controller.ts
import { Controller, Post, Get, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ContactShareRequestsService } from './contact-share-requests.service'
import { ResolveShareRequestDto } from './dto/contact-share-request.dto'

@ApiTags('Contact Share Requests')
@Controller('contacts')
export class ContactShareRequestsController {
  constructor(private readonly shareRequestsService: ContactShareRequestsService) {}

  @Post(':id/share-requests')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @GetAuthContext() auth: AuthContext,
    @Param('id') contactId: string,
  ) {
    return this.shareRequestsService.createRequest(contactId, auth)
  }

  @Get('share-requests/pending')
  async getPending(@GetAuthContext() auth: AuthContext) {
    return this.shareRequestsService.getPendingForOwner(auth)
  }

  @Patch('share-requests/:id')
  async resolve(
    @GetAuthContext() auth: AuthContext,
    @Param('id') requestId: string,
    @Body() dto: ResolveShareRequestDto,
  ) {
    return this.shareRequestsService.resolve(requestId, dto.status, dto.reason, auth)
  }
}
```

- [ ] **Step 2: Register in ContactsModule**

In `apps/api/src/contacts/contacts.module.ts`:
1. Add import: `import { ContactShareRequestsController } from './contact-share-requests.controller'`
2. Add import: `import { ContactShareRequestsService } from './contact-share-requests.service'`
3. Add import: `import { CommonModule } from '../common/common.module'` (for UserValidationService — check if it's already available or needs to be imported)
4. Add `ContactShareRequestsController` to `controllers` array
5. Add `ContactShareRequestsService` to `providers` array

Note: Check if `UserValidationService` is provided globally or needs explicit import. If it's in a `CommonModule`, import that module. If it's provided in `AppModule` globally, it should be available.

- [ ] **Step 3: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(contacts): add share request controller and wire into ContactsModule"
```

---

### Task 14: Contact Share Requests — Notification Wiring (Work Item 6)

**Files:**
- Modify: `apps/api/src/notifications/notification.types.ts`
- Modify: `apps/api/src/notifications/listeners/notification-events.listener.ts`

- [ ] **Step 1: Add notification category**

In `notification.types.ts`, add `'contact_share'` to the `NotificationCategory` type and `NOTIFICATION_CATEGORY_VALUES` array:

```typescript
export type NotificationCategory =
  | 'payment_reminders'
  | 'trip_updates'
  | 'client_care'
  | 'booking_alerts'
  | 'system_alerts'
  | 'assignment'
  | 'collaboration'
  | 'payment_alert'
  | 'contact_share'
```

Add `'contact_share'` to `NOTIFICATION_CATEGORY_VALUES` array and add to `CategoryPreferences`.

- [ ] **Step 2: Add event handlers to NotificationEventsListener**

At the end of the listener class, add:

```typescript
// =========================================================================
// Contact Share Request Events
// =========================================================================

@OnEvent('contact.share_requested')
async handleShareRequested(event: {
  requestId: string
  contactId: string
  contactName: string
  ownerId: string
  requesterId: string
  requesterName: string
  agencyId: string
}): Promise<void> {
  try {
    await this.notificationService.send({
      userId: event.ownerId,
      category: 'contact_share',
      title: `${event.requesterName} requested access to ${event.contactName}`,
      body: `Review and approve or deny the access request.`,
      data: { requestId: event.requestId, contactId: event.contactId },
      actionUrl: `/contacts/${event.contactId}`,
    })
  } catch (error) {
    this.logger.error('Failed to send share request notification', error)
  }
}

@OnEvent('contact.share_approved')
async handleShareApproved(event: {
  requestId: string
  contactId: string
  requesterId: string
  agencyId: string
}): Promise<void> {
  try {
    await this.notificationService.send({
      userId: event.requesterId,
      category: 'contact_share',
      title: 'Contact access request approved',
      body: 'You now have full access to the requested contact.',
      data: { contactId: event.contactId },
      actionUrl: `/contacts/${event.contactId}`,
    })
  } catch (error) {
    this.logger.error('Failed to send share approved notification', error)
  }
}

@OnEvent('contact.share_denied')
async handleShareDenied(event: {
  requestId: string
  contactId: string
  requesterId: string
  reason?: string
  agencyId: string
}): Promise<void> {
  try {
    await this.notificationService.send({
      userId: event.requesterId,
      category: 'contact_share',
      title: 'Contact access request denied',
      body: event.reason || 'Your access request was denied.',
      data: { contactId: event.contactId },
    })
  } catch (error) {
    this.logger.error('Failed to send share denied notification', error)
  }
}
```

- [ ] **Step 3: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(notifications): add contact share request notification handlers"
```

---

## Phase 4: Impersonation System

### Task 15: Impersonation — Migration & Schema (Work Item 7)

**Files:**
- Create: `packages/database/src/migrations/20260320120200_create_impersonation_sessions.sql`
- Create: `packages/database/src/schema/impersonation-sessions.schema.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration SQL**

```sql
-- 20260320120200_create_impersonation_sessions.sql
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_imp_admin_active ON impersonation_sessions(admin_user_id)
  WHERE ended_at IS NULL;
CREATE INDEX idx_imp_target ON impersonation_sessions(target_user_id);
CREATE INDEX idx_imp_agency ON impersonation_sessions(agency_id);
```

- [ ] **Step 2: Create Drizzle schema**

```typescript
// packages/database/src/schema/impersonation-sessions.schema.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'

export const impersonationSessions = pgTable('impersonation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull(),
  targetUserId: uuid('target_user_id').notNull(),
  agencyId: uuid('agency_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: varchar('end_reason', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Export from schema index**

Add to `packages/database/src/schema/index.ts`:
```typescript
export * from './impersonation-sessions.schema'
```

- [ ] **Step 4: Register in migration journal**

```json
{
  "idx": 164,
  "version": "7",
  "when": 1774267320000,
  "tag": "20260320120200_create_impersonation_sessions",
  "breakpoints": false
}
```

- [ ] **Step 5: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): create impersonation_sessions table"
```

---

### Task 16: Impersonation — `@BypassImpersonation()` Decorator + `ImpersonationGuard`

**Files:**
- Create: `apps/api/src/auth/decorators/bypass-impersonation.decorator.ts`
- Create: `apps/api/src/auth/guards/impersonation.guard.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create the bypass decorator**

```typescript
// apps/api/src/auth/decorators/bypass-impersonation.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const BYPASS_IMPERSONATION_KEY = 'bypass-impersonation'
export const BypassImpersonation = () => SetMetadata(BYPASS_IMPERSONATION_KEY, true)
```

- [ ] **Step 2: Create the ImpersonationGuard**

```typescript
// apps/api/src/auth/guards/impersonation.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BYPASS_IMPERSONATION_KEY } from '../decorators/bypass-impersonation.decorator'
import type { AuthContext } from '../auth.types'

@Injectable()
export class ImpersonationGuard implements CanActivate {
  private readonly logger = new Logger(ImpersonationGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip for public endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthContext
    const impersonateUserId = request.headers['x-impersonate-user-id']

    // No impersonation header — but check for active session lock
    // If admin has an active session, block non-bypass endpoints even without the header
    // This prevents admins from bypassing impersonation by omitting the header
    if (!impersonateUserId) {
      if (user?.role === 'admin') {
        const activeSession = await this.db.client.query.impersonationSessions.findFirst({
          where: and(
            eq(this.db.schema.impersonationSessions.adminUserId, user.userId),
            isNull(this.db.schema.impersonationSessions.endedAt),
            gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
          ),
        })
        if (activeSession) {
          // Admin has active session but didn't send header — block admin endpoints
          // (bypass-decorated endpoints like /admin/impersonate/* are exempt)
          throw new UnauthorizedException(
            'Active impersonation session exists. Include X-Impersonate-User-Id header or end the session.',
          )
        }
      }
      return true
    }

    // Check bypass decorator
    const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_IMPERSONATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (bypass) return true

    const user = request.user as AuthContext
    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can impersonate')
    }

    // Find active session
    const session = await this.db.client.query.impersonationSessions.findFirst({
      where: and(
        eq(this.db.schema.impersonationSessions.adminUserId, user.userId),
        eq(this.db.schema.impersonationSessions.targetUserId, impersonateUserId),
        isNull(this.db.schema.impersonationSessions.endedAt),
        gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
      ),
    })

    if (!session) {
      throw new UnauthorizedException('No active impersonation session')
    }

    // Verify same agency
    if (session.agencyId !== user.agencyId) {
      throw new UnauthorizedException('Cannot impersonate users in different agencies')
    }

    // Load target user
    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, impersonateUserId),
    })

    if (!targetUser) {
      throw new UnauthorizedException('Target user not found')
    }

    // Store original admin context
    // NOTE: AuthContext only has userId, email, agencyId, role, userStatus — no name fields.
    // Admin name is resolved downstream from userProfiles if needed (e.g., in audit logging).
    request.originalAdmin = {
      id: user.userId,
      role: user.role,
    }

    // Build FULL impersonated AuthContext from target user
    // IMPORTANT: Do NOT spread admin's context — email, userStatus must come from target
    // so that downstream guards (ActiveUserGuard, UserStatusGuard) check the target's status
    request.user = {
      userId: targetUser.id,
      email: targetUser.email,
      agencyId: user.agencyId, // Same agency (already verified)
      role: targetUser.role,
      userStatus: targetUser.status,
    } as AuthContext

    return true
  }
}
```

- [ ] **Step 3: Register ImpersonationGuard in `main.ts`**

In `apps/api/src/main.ts`, update the global guards block (~lines 94-99).

**NOTE:** `main.ts` only has `JwtAuthGuard` and `RolesGuard` in `useGlobalGuards()`. `UserStatusGuard` and `ActiveUserGuard` are registered separately as `APP_GUARD` providers in `app.module.ts` (lines 203-210) and execute AFTER `useGlobalGuards` guards. Do NOT move them.

**Execution order after this change:**
1. `JwtAuthGuard` (authenticates, sets `request.user`)
2. `ImpersonationGuard` (NEW — swaps context if impersonating)
3. `RolesGuard` (checks role — now sees impersonated role)
4. `UserStatusGuard` (APP_GUARD — checks impersonated user is active)
5. `ActiveUserGuard` (APP_GUARD — checks impersonated user is not pending)

Before:
```typescript
const reflector = app.get(Reflector)
app.useGlobalGuards(
  new JwtAuthGuard(reflector),
  new RolesGuard(reflector)
)
```

After:
```typescript
const reflector = app.get(Reflector)
const dbService = app.get(DatabaseService)
app.useGlobalGuards(
  new JwtAuthGuard(reflector),
  new ImpersonationGuard(reflector, dbService),
  new RolesGuard(reflector),
)
```

Add imports:
```typescript
import { ImpersonationGuard } from './auth/guards/impersonation.guard'
import { DatabaseService } from './db/database.service'
```

- [ ] **Step 4: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): add ImpersonationGuard with @BypassImpersonation() support"
```

---

### Task 17: Impersonation — Service

**Files:**
- Create: `apps/api/src/impersonation/impersonation.service.ts`

- [ ] **Step 1: Create the service**

```typescript
// apps/api/src/impersonation/impersonation.service.ts
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { UserValidationService } from '../common/user-validation.service'
import type { AuthContext } from '../auth/auth.types'

const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const MAX_EXTENSIONS = 8
const MAX_TOTAL_DURATION_MS = 4 * 60 * 60 * 1000 // 4 hours

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userValidationService: UserValidationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startSession(targetUserId: string, auth: AuthContext) {
    if (auth.role !== 'admin') throw new ForbiddenException('Admin access required')

    // Validate target user
    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, targetUserId),
    })
    if (!targetUser) throw new NotFoundException('User not found')
    if (targetUser.agencyId !== auth.agencyId) throw new ForbiddenException('Cannot impersonate users in different agencies')
    if (targetUser.role === 'admin') throw new ForbiddenException('Cannot impersonate other admins')
    if (targetUser.status === 'locked' || targetUser.status === 'pending') {
      throw new BadRequestException(`Cannot impersonate ${targetUser.status} users`)
    }

    // Check for existing active session
    const existing = await this.getActiveSession(auth.userId)
    if (existing) throw new BadRequestException('You already have an active impersonation session. End it first.')

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    const [session] = await this.db.client.insert(this.db.schema.impersonationSessions).values({
      adminUserId: auth.userId,
      targetUserId,
      agencyId: auth.agencyId,
      expiresAt,
    }).returning()

    this.eventEmitter.emit('security.impersonation_started', {
      event: 'security.impersonation_started',
      userId: targetUserId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: { sessionId: session!.id },
    })

    return {
      sessionId: session!.id,
      targetUserId,
      expiresAt,
    }
  }

  async extendSession(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) throw new NotFoundException('No active impersonation session')

    // Check max total duration
    const totalDuration = Date.now() - session.createdAt.getTime()
    if (totalDuration + SESSION_DURATION_MS > MAX_TOTAL_DURATION_MS) {
      throw new BadRequestException('Maximum session duration reached (4 hours)')
    }

    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await this.db.client.update(this.db.schema.impersonationSessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(this.db.schema.impersonationSessions.id, session.id))

    return { expiresAt: newExpiresAt }
  }

  async endSession(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) throw new NotFoundException('No active impersonation session')

    await this.db.client.update(this.db.schema.impersonationSessions)
      .set({ endedAt: new Date(), endReason: 'manual' })
      .where(eq(this.db.schema.impersonationSessions.id, session.id))

    const duration = Date.now() - session.createdAt.getTime()

    this.eventEmitter.emit('security.impersonation_ended', {
      event: 'security.impersonation_ended',
      userId: session.targetUserId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: {
        sessionId: session.id,
        durationMs: duration,
        reason: 'manual',
      },
    })

    // Notify the target agent
    // Import NotificationService if needed, or emit an event for the listener
    this.eventEmitter.emit('impersonation.ended', {
      adminUserId: auth.userId,
      targetUserId: session.targetUserId,
      agencyId: auth.agencyId,
      sessionId: session.id,
      duration,
    })

    return { ended: true }
  }

  async getStatus(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) return { active: false }

    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, session.targetUserId),
      columns: { firstName: true, lastName: true },
    })

    return {
      active: true,
      sessionId: session.id,
      targetUserId: session.targetUserId,
      targetName: [targetUser?.firstName, targetUser?.lastName].filter(Boolean).join(' '),
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    }
  }

  private async getActiveSession(adminUserId: string) {
    return this.db.client.query.impersonationSessions.findFirst({
      where: and(
        eq(this.db.schema.impersonationSessions.adminUserId, adminUserId),
        isNull(this.db.schema.impersonationSessions.endedAt),
        gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
      ),
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/impersonation/impersonation.service.ts
git commit -m "feat(impersonation): add ImpersonationService with session management"
```

---

### Task 18: Impersonation — Controller & Module

**Files:**
- Create: `apps/api/src/impersonation/impersonation.controller.ts`
- Create: `apps/api/src/impersonation/impersonation.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
// apps/api/src/impersonation/impersonation.controller.ts
import { Controller, Post, Delete, Get, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { BypassImpersonation } from '../auth/decorators/bypass-impersonation.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ImpersonationService } from './impersonation.service'

@ApiTags('Impersonation')
@Controller('admin/impersonate')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  @Post(':userId')
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  async start(
    @GetAuthContext() auth: AuthContext,
    @Param('userId') targetUserId: string,
  ) {
    return this.impersonationService.startSession(targetUserId, auth)
  }

  @Post('extend')
  @AdminOnly()
  @BypassImpersonation()
  async extend(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.extendSession(auth)
  }

  @Delete()
  @AdminOnly()
  @BypassImpersonation()
  @HttpCode(HttpStatus.OK)
  async end(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.endSession(auth)
  }

  @Get('status')
  @AdminOnly()
  @BypassImpersonation()
  async status(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.getStatus(auth)
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
// apps/api/src/impersonation/impersonation.module.ts
import { Module } from '@nestjs/common'
import { ImpersonationController } from './impersonation.controller'
import { ImpersonationService } from './impersonation.service'

@Module({
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}
```

- [ ] **Step 3: Register in AppModule**

In `apps/api/src/app.module.ts`, add `ImpersonationModule` to imports.

- [ ] **Step 4: Verify compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(impersonation): add controller, module, and wire into AppModule"
```

---

### Task 19: Impersonation — Notification Wiring

**Files:**
- Modify: `apps/api/src/notifications/listeners/notification-events.listener.ts`

- [ ] **Step 1: Add impersonation end notification handler**

```typescript
// Add to NotificationEventsListener class

@OnEvent('impersonation.ended')
async handleImpersonationEnded(event: {
  adminUserId: string
  targetUserId: string
  agencyId: string
  sessionId: string
  duration: number
}): Promise<void> {
  try {
    // Get admin name
    const admin = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, event.adminUserId),
      columns: { firstName: true, lastName: true },
    })
    const adminName = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || 'An admin'
    const durationMins = Math.round(event.duration / 60000)

    await this.notificationService.send({
      userId: event.targetUserId,
      category: 'system_alerts',
      title: `${adminName} viewed your account`,
      body: `Admin session lasted ${durationMins} minute(s).`,
      data: { sessionId: event.sessionId },
    })
  } catch (error) {
    this.logger.error('Failed to send impersonation ended notification', error)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(notifications): add impersonation session end notification"
```

---

### Task 20: Impersonation — Frontend Banner

**Files:**
- Create: `apps/admin/src/hooks/use-impersonation.ts`
- Create: `apps/admin/src/components/impersonation/impersonation-banner.tsx`
- Modify: `apps/admin/src/components/layout/top-nav.tsx` (or root layout)

- [ ] **Step 1: Create impersonation hook**

```typescript
// apps/admin/src/hooks/use-impersonation.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useUser } from './use-user'

interface ImpersonationStatus {
  active: boolean
  sessionId?: string
  targetUserId?: string
  targetName?: string
  expiresAt?: string
  createdAt?: string
}

export function useImpersonation() {
  const { isAdmin } = useUser()
  const [status, setStatus] = useState<ImpersonationStatus>({ active: false })
  const [loading, setLoading] = useState(false)

  const checkStatus = useCallback(async () => {
    if (!isAdmin) return
    try {
      const data = await api.get<ImpersonationStatus>('/admin/impersonate/status')
      setStatus(data)
    } catch {
      setStatus({ active: false })
    }
  }, [isAdmin])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Only poll when actively impersonating
  useEffect(() => {
    if (!status.active) return
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [status.active, checkStatus])

  const start = async (userId: string) => {
    setLoading(true)
    try {
      await api.post(`/admin/impersonate/${userId}`)
      await checkStatus()
      window.location.reload() // Reload to apply impersonated context
    } finally {
      setLoading(false)
    }
  }

  const extend = async () => {
    try {
      await api.post('/admin/impersonate/extend')
      await checkStatus()
    } catch (err: any) {
      throw err
    }
  }

  const end = async () => {
    try {
      await api.delete('/admin/impersonate')
      setStatus({ active: false })
      window.location.reload() // Reload to restore admin context
    } catch (err: any) {
      throw err
    }
  }

  return { ...status, start, extend, end, loading, checkStatus }
}
```

- [ ] **Step 2: Create the impersonation banner**

```tsx
// apps/admin/src/components/impersonation/impersonation-banner.tsx
'use client'

import { useImpersonation } from '@/hooks/use-impersonation'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export function ImpersonationBanner() {
  const { active, targetName, expiresAt, extend, end } = useImpersonation()
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!active || !expiresAt) return
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('Expired')
        return
      }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [active, expiresAt])

  if (!active) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <span>
        Viewing as <strong>{targetName}</strong> — {remaining} remaining — Admin features disabled
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-black/30 bg-transparent text-black hover:bg-amber-600"
        onClick={async () => {
          try {
            await extend()
            toast.success('Session extended by 30 minutes')
          } catch (err: any) {
            toast.error(err.message || 'Failed to extend')
          }
        }}
      >
        Extend
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-black/30 bg-transparent text-black hover:bg-amber-600"
        onClick={async () => {
          try {
            await end()
          } catch (err: any) {
            toast.error(err.message || 'Failed to exit')
          }
        }}
      >
        Exit
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Mount the banner in the layout**

Find the root layout or top-nav component and add `<ImpersonationBanner />` at the very top, before any other content. The banner uses `fixed` positioning so it overlays.

In the top-level layout (e.g., `apps/admin/src/app/providers.tsx` or the authenticated layout):
```tsx
import { ImpersonationBanner } from '@/components/impersonation/impersonation-banner'

// Add at the top of the provider tree, before other content:
<ImpersonationBanner />
```

- [ ] **Step 4: Add "Impersonate" action to users table**

In `apps/admin/src/app/settings/users/_components/users-table.tsx`, add an "Impersonate" option to the action menu for non-admin users. This calls `useImpersonation().start(userId)`.

- [ ] **Step 5: Add `X-Impersonate-User-Id` header to API client**

In `apps/admin/src/lib/api.ts`, read the impersonation target from a cookie or localStorage and add the header:

```typescript
// In fetchApi() or getAuthHeaders():
const impersonateUserId = localStorage.getItem('impersonate-user-id')
if (impersonateUserId) {
  headers['X-Impersonate-User-Id'] = impersonateUserId
}
```

The `useImpersonation().start()` method should set this value in localStorage before reloading:
```typescript
const start = async (userId: string) => {
  await api.post(`/admin/impersonate/${userId}`)
  localStorage.setItem('impersonate-user-id', userId)
  window.location.reload()
}

const end = async () => {
  await api.delete('/admin/impersonate')
  localStorage.removeItem('impersonate-user-id')
  window.location.reload()
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add impersonation banner, hook, and API header injection"
```

---

## Phase 5: Final Verification

### Task 21: End-to-End Compile & Smoke Test

- [ ] **Step 1: Full API typecheck**

Run: `cd apps/api && npx tsc --noEmit --pretty`
Expected: No new errors

- [ ] **Step 2: Full admin build check**

Run: `cd apps/admin && npx next build 2>&1 | tail -20`
Expected: Build succeeds (or pre-existing errors only)

- [ ] **Step 3: Run migrations on clean local DB**

Run: `cd apps/api && pnpm db:migrate`
Expected: All 3 new migrations apply cleanly

- [ ] **Step 4: Start dev server and verify no crashes**

Run: `turbo dev` (in tmux pane 2)
Expected: Both admin and API start without import or DI errors

- [ ] **Step 5: Verify decorator migration with grep**

Run: `grep -rn "AdminGuard\|@Roles('admin')\|UseGuards(JwtAuthGuard, AdminRoleGuard)" apps/api/src/ --include="*.ts"`
Expected: Zero matches (all migrated to `@AdminOnly()`)

- [ ] **Step 6: Verify new tables exist**

Run: `source apps/api/.env && psql "$DATABASE_URL" -c "\dt security_audit_logs" && psql "$DATABASE_URL" -c "\dt contact_share_requests" && psql "$DATABASE_URL" -c "\dt impersonation_sessions"`

- [ ] **Step 7: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore: fixups from RBAC hardening verification"
```

---

## Dependency Graph

```
Task 1 (@AdminOnly decorator)
  ├── Task 2 (migrate all controllers) → Task 5 (settings guard)
  └── Task 18 (impersonation controller uses @AdminOnly)

Task 9 (security audit migration)
  └── Task 10 (security audit service)
       └── Task 17 (impersonation service emits security events)

Task 11 (share requests migration)
  └── Task 12 (share requests service)
       └── Task 13 (share requests controller)
            └── Task 14 (notification wiring)

Task 15 (impersonation migration)
  └── Task 16 (impersonation guard)
       └── Task 17 (impersonation service)
            └── Task 18 (impersonation controller)
                 └── Task 19 (notification wiring)
                      └── Task 20 (frontend)

Independent: Task 3 (role rename), Task 4 (public audit), Task 6-7 (contact filtering), Task 8 (dashboard)
```

Tasks 3, 4, 6-8 can run in parallel with everything else. Phase 3 and Phase 4 can also run in parallel since they share no files (except the schema index and journal, which need sequential commits).
