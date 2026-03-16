# Beta Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical security gaps before controlled beta release to real users on Preview.

**Architecture:** Add `@GetAuthContext()` + agency scoping to all financial controllers (IDOR fix), add IMAP/SMTP host validation to email account DTOs (SSRF mitigation), add `@Throttle()` to email endpoints (rate limiting), and fix Stripe webhook `@Public()` decorator.

**Tech Stack:** NestJS guards/decorators, class-validator, `@nestjs/throttler`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/financials/service-fees.controller.ts` | Modify | Add `@GetAuthContext`, pass auth to service |
| `apps/api/src/financials/service-fees.service.ts` | Modify | Add agency scoping to all queries |
| `apps/api/src/financials/stripe-connect.controller.ts` | Modify | Replace `@Param('agencyId')` with `auth.agencyId` |
| `apps/api/src/financials/stripe-connect.service.ts` | Modify | Verify agency ownership on settings access |
| `apps/api/src/financials/financial-summary.controller.ts` | Modify | Add `@GetAuthContext`, verify trip access |
| `apps/api/src/financials/traveller-splits.controller.ts` | Modify | Add `@GetAuthContext`, verify trip/activity access |
| `apps/api/src/financials/stripe-invoice.controller.ts` | Modify | Add `@Public()` to webhook endpoint |
| `apps/api/src/trips/payment-templates.controller.ts` | Modify | Replace hardcoded `'system'` userId with `auth.userId` |
| `apps/api/src/email-accounts/dto/create-email-account.dto.ts` | Modify | Add IMAP/SMTP host validation |
| `apps/api/src/email-accounts/dto/update-email-account.dto.ts` | Modify | Add IMAP/SMTP host validation |
| `apps/api/src/email-accounts/email-accounts.controller.ts` | Modify | Add `@UseGuards(ThrottlerGuard)` + `@Throttle()` to sync/send/test endpoints |
| `apps/api/src/common/validators/is-valid-email-host.validator.ts` | Create | Custom validator for email host allowlist |
| `apps/api/src/common/guards/safe-host.guard.ts` | Create | Runtime DNS resolution + private IP rejection for SSRF |
| `apps/api/src/email-accounts/dto/test-connection.dto.ts` | Create | Typed DTO for test-connection endpoint (currently inline body) |
| `apps/api/src/financials/trip-notifications.controller.ts` | Modify | Add auth context + trip access checks |
| `apps/api/src/financials/trip-order.controller.ts` | Modify | Add auth context + trip access checks |

---

## Chunk 1: Financial Controller IDOR Fixes (Critical)

### Task 1: Add auth context to ServiceFeesController

The controller accepts `tripId` from params without verifying the user has access to that trip. Fix: inject `@GetAuthContext()` and use `TripAccessService.verifyReadAccess()` / `verifyWriteAccess()`.

**Files:**
- Modify: `apps/api/src/financials/service-fees.controller.ts`
- Modify: `apps/api/src/financials/service-fees.service.ts`
- Modify: `apps/api/src/financials/financials.module.ts`

- [ ] **Step 1: Update ServiceFeesController** — Add `@GetAuthContext()` to every endpoint, pass `auth` to service.

```typescript
// service-fees.controller.ts
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

// For every endpoint, add the decorator and pass auth:
@Get('trips/:tripId/service-fees')
async getServiceFees(
  @GetAuthContext() auth: AuthContext,
  @Param('tripId') tripId: string,
): Promise<ServiceFeeResponseDto[]> {
  return this.serviceFeesService.getServiceFees(tripId, auth)
}
```

Apply this pattern to ALL endpoints:
- `getServiceFees(tripId, auth)`
- `getServiceFee(id, auth)`
- `createServiceFee(tripId, dto, auth)`
- `updateServiceFee(id, dto, auth)`
- `sendServiceFee(id, auth)`
- `markAsPaid(id, auth)`
- `processRefund(id, dto, auth)`
- `cancelServiceFee(id, auth)`
- `deleteServiceFee(id, auth)`

- [ ] **Step 2: Update ServiceFeesService** — Add `auth: AuthContext` param to all methods. Add agency scoping to queries.

For methods that take `tripId`: verify trip access via `TripAccessService.verifyReadAccess(tripId, auth)` (reads) or `verifyWriteAccess(tripId, auth)` (writes).

For methods that take a service fee `id`: fetch the service fee, then verify trip access on the fee's `tripId`.

Add `TripAccessService` + `TripGroupAccessService` as direct providers in `financials.module.ts` (NOT by importing TripsModule — that would create a circular dep since TripsModule already imports FinancialsModule). Same pattern used by DashboardModule and TagsModule.

- [ ] **Step 3: Remove stale TODO comments** from controller header.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @tailfire/api typecheck 2>&1 | grep 'error TS' | grep -v 'api-credentials\|portal-jwt'`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/financials/service-fees.controller.ts apps/api/src/financials/service-fees.service.ts apps/api/src/financials/financials.module.ts
git commit -m "security: add auth context + trip access checks to ServiceFeesController"
```

---

### Task 2: Add auth context to StripeConnectController

The controller accepts `agencyId` from URL params. Any authenticated user could pass a different agency's ID. Fix: ignore the param and use `auth.agencyId` from JWT context.

**Files:**
- Modify: `apps/api/src/financials/stripe-connect.controller.ts`

- [ ] **Step 1: Add auth context and assert agencyId match.**

Keep existing route shape (frontend uses `agencies/${agencyId}/...`). Assert JWT match:

```typescript
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { ForbiddenException } from '@nestjs/common'
import type { AuthContext } from '../auth/auth.types'

@Get('agencies/:agencyId/settings')
async getAgencySettings(
  @GetAuthContext() auth: AuthContext,
  @Param('agencyId') agencyId: string,
): Promise<AgencySettingsResponseDto> {
  if (agencyId !== auth.agencyId) throw new ForbiddenException('Agency mismatch')
  return this.stripeConnectService.getAgencySettings(auth.agencyId)
}
```

Apply same pattern to ALL endpoints. Do NOT change route paths.

- [ ] **Step 2: Remove stale TODO comments.**

- [ ] **Step 3: Typecheck and commit.**

---

### Task 3: Add auth context to FinancialSummaryController

**Files:**
- Modify: `apps/api/src/financials/financial-summary.controller.ts`
- Modify: `apps/api/src/financials/financial-summary.service.ts`

- [ ] **Step 1: Add @GetAuthContext and verify trip access.**

```typescript
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

@Get('trips/:tripId/financial-summary')
async getFinancialSummary(
  @GetAuthContext() auth: AuthContext,
  @Param('tripId') tripId: string,
): Promise<TripFinancialSummaryResponseDto> {
  return this.financialSummaryService.getTripFinancialSummary(tripId, auth)
}
```

- [ ] **Step 2: In service, make auth optional for internal callers.**

`TripOrderService` calls `getTripFinancialSummary()` internally without auth context. Make `auth` optional — verify access only when present:

```typescript
async getTripFinancialSummary(tripId: string, auth?: AuthContext) {
  if (auth) {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
  }
  // ... existing logic
}
```

- [ ] **Step 3: Remove stale TODOs. Typecheck and commit.**

---

### Task 4: Add auth context to TravellerSplitsController

**Files:**
- Modify: `apps/api/src/financials/traveller-splits.controller.ts`
- Modify: `apps/api/src/financials/traveller-splits.service.ts`

- [ ] **Step 1: Add @GetAuthContext to all endpoints.**

For endpoints with `tripId` param: verify trip read/write access.
For endpoints with `activityId` param: the service should resolve the trip via the activity's itinerary chain, then verify access.

Note: If resolving trip from activity is complex, a simpler approach is to add `agencyId` filtering in the service queries (all `activity_traveller_splits` should have trips in the user's agency).

- [ ] **Step 2: Typecheck and commit.**

---

### Task 5: Fix PaymentTemplatesController hardcoded userId

**Files:**
- Modify: `apps/api/src/trips/payment-templates.controller.ts`

- [ ] **Step 1: Replace `'system'` with `auth.userId`.**

```typescript
// Line 95: Replace
const userId = 'system' // Placeholder until auth is implemented
// With:
const userId = auth.userId
```

- [ ] **Step 2: Validate `agencyId` matches `auth.agencyId`.**

Add to each endpoint that takes `@Param('agencyId')`:
```typescript
if (agencyId !== auth.agencyId) {
  throw new ForbiddenException('Agency mismatch')
}
```

- [ ] **Step 3: Remove stale TODOs. Typecheck and commit.**

---

## Chunk 2: Email Security (Important)

### Task 6: Add IMAP/SMTP host validation (SSRF mitigation)

User-supplied `imapHost`/`smtpHost` are used directly for outbound connections. Add a custom validator that restricts to well-known email providers or valid public hostnames, blocking internal IPs.

**Files:**
- Create: `apps/api/src/common/validators/is-valid-email-host.validator.ts`
- Modify: `apps/api/src/email-accounts/dto/create-email-account.dto.ts`
- Modify: `apps/api/src/email-accounts/dto/update-email-account.dto.ts`

- [ ] **Step 1: Create host validator.**

```typescript
// is-valid-email-host.validator.ts
import { registerDecorator, ValidationOptions } from 'class-validator'
import { isIP } from 'net'

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,        // link-local
  /^\[?::1\]?$/,        // IPv6 loopback
  /^\[?fe80:/i,          // IPv6 link-local
  /^\[?fc00:/i,          // IPv6 ULA
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

export function IsValidEmailHost(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidEmailHost',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid public email server hostname`,
        ...options,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== 'string' || !value) return false
          // Block raw IPs (IMAP/SMTP should use hostnames)
          if (isIP(value)) return false
          // Block private/internal patterns
          return !BLOCKED_PATTERNS.some(p => p.test(value))
        },
      },
    })
  }
}
```

- [ ] **Step 2: Add to DTOs.**

```typescript
// create-email-account.dto.ts — add to imapHost and smtpHost:
import { IsValidEmailHost } from '../../common/validators/is-valid-email-host.validator'

@IsString()
@IsValidEmailHost()
imapHost!: string

@IsString()
@IsValidEmailHost()
smtpHost!: string
```

Same for `update-email-account.dto.ts`.

- [ ] **Step 3: Create TestConnectionDto** (test-connection currently uses inline body type, bypasses class-validator):

```typescript
// apps/api/src/email-accounts/dto/test-connection.dto.ts
import { IsString, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { IsValidEmailHost } from '../../common/validators/is-valid-email-host.validator'

export class TestConnectionDto {
  @IsString()
  @IsValidEmailHost()
  imapHost!: string

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort!: number

  @IsBoolean()
  imapTls!: boolean

  @IsString()
  username!: string

  @IsString()
  password!: string
}
```

Update controller to use DTO: `@Body() dto: TestConnectionDto` instead of inline type.

- [ ] **Step 4: Add runtime DNS resolution guard** — Create `apps/api/src/common/guards/safe-host.guard.ts`:

Before making IMAP/SMTP connections, resolve the hostname and reject private IPs. Add a helper `assertPublicHost(host)` called in `imap-sync.service.ts` (before `new ImapFlow()`) and `smtp-send.service.ts` (before `createTransport()`):

```typescript
import { lookup } from 'dns/promises'
const PRIVATE_RANGES = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^169\.254\./]

export async function assertPublicHost(host: string): Promise<void> {
  const addresses = await lookup(host, { all: true })
  for (const addr of addresses) {
    if (PRIVATE_RANGES.some(r => r.test(addr.address))) {
      throw new BadRequestException(`Host ${host} resolves to a private IP address`)
    }
  }
}
```

- [ ] **Step 5: Typecheck and commit.**

---

### Task 7: Add rate limiting to email endpoints

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.controller.ts`

- [ ] **Step 1: Add @Throttle to sensitive endpoints.**

```typescript
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { UseGuards } from '@nestjs/common'

// On test-connection endpoint (expensive outbound):
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('test-connection')
async testConnection(...)

// On sync endpoint:
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 3, ttl: 60000 } })
@Post(':id/sync')
async triggerSync(...)

// On send endpoint (route is :id/send, not :accountId/send):
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post(':id/send')
async sendEmail(...)
```

Note: `@UseGuards(ThrottlerGuard)` is required per-endpoint because no global throttler guard is registered. This matches the pattern in `auth.controller.ts`.

- [ ] **Step 2: Verify ThrottlerModule is imported in app.module.ts** (it already is, just confirm).

- [ ] **Step 3: Commit.**

---

## Chunk 3: Additional Financial IDOR Fixes (Critical)

### Task 9: Add auth context to TripNotificationsController

**Files:**
- Modify: `apps/api/src/financials/trip-notifications.controller.ts`

- [ ] **Step 1: Add @GetAuthContext and verify trip access** via TripAccessService before accessing notification data.

- [ ] **Step 2: Typecheck and commit.**

---

### Task 10: Add auth context to TripOrderController

**Files:**
- Modify: `apps/api/src/financials/trip-order.controller.ts`
- Modify: `apps/api/src/financials/trip-order.service.ts`

- [ ] **Step 1: Add @GetAuthContext and verify trip access.** The trip-order service fetches trip by ID without agency scoping — add access check in controller before calling service.

- [ ] **Step 2: Typecheck and commit.**

---

### Task 11: Add auth to StripeInvoiceController create/refund endpoints

**Files:**
- Modify: `apps/api/src/financials/stripe-invoice.controller.ts`

- [ ] **Step 1: Add @GetAuthContext to invoice create and refund endpoints.** Verify trip access before processing.

- [ ] **Step 2: Commit.**

---

## Chunk 4: Stripe Webhook Fix (Medium)

### Task 8: Add @Public() to Stripe webhook endpoint

**Files:**
- Modify: `apps/api/src/financials/stripe-invoice.controller.ts`

- [ ] **Step 1: Add @Public() to the webhook handler.**

```typescript
import { Public } from '../auth/decorators/public.decorator'

@Public()
@Post('webhooks/stripe')
async handleWebhook(...)
```

The webhook already validates via Stripe signature — no JWT needed.

- [ ] **Step 2: Remove stale TODO comments. Commit.**

---

## Summary

| Task | Issue | Severity | Estimated |
|------|-------|----------|-----------|
| 1 | ServiceFeesController IDOR | Critical | 10 min |
| 2 | StripeConnectController IDOR | Critical | 5 min |
| 3 | FinancialSummaryController IDOR | Critical | 5 min |
| 4 | TravellerSplitsController IDOR | Critical | 10 min |
| 5 | PaymentTemplates hardcoded userId | Critical | 5 min |
| 6 | Email host SSRF validation + runtime DNS | Important | 15 min |
| 7 | Email rate limiting | Medium | 5 min |
| 8 | Stripe webhook @Public() | Medium | 2 min |
| 9 | TripNotificationsController IDOR | Critical | 5 min |
| 10 | TripOrderController IDOR | Critical | 5 min |
| 11 | StripeInvoice create/refund IDOR | Critical | 5 min |

**Total: ~11 tasks, ~72 minutes**

**Key implementation notes (from Codex review):**
- Add TripAccessService as direct provider in financials.module.ts (avoid circular dep with TripsModule)
- Keep StripeConnect route shapes (frontend depends on them), assert agencyId match
- SSRF: DTO validation + runtime DNS resolution before outbound connection
- Throttle: requires both `@UseGuards(ThrottlerGuard)` and `@Throttle()` per endpoint
- FinancialSummaryService: make `auth` param optional for internal callers (TripOrderService)

After implementation: typecheck all, push to main, sync preview.
