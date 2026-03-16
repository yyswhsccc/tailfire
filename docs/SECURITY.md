# Security Model

This document describes the authentication, authorization, and data protection strategies used in Tailfire.

## Overview: API-First Security

Tailfire uses an **API-First / RLS Lockdown** security model:

```
┌─────────────────────────────────────────────────────┐
│ Frontend Apps (Admin, OTA, Client)                  │
│ - Use Supabase anon key (public, safe to expose)    │
│ - Cannot query contacts/trips directly (RLS blocks) │
│ - Must call API endpoints for all data operations   │
└─────────────────────────────────────────────────────┘
                        ↓
             ┌──────────────────┐
             │  API (NestJS)    │
             │  - Validates JWT │
             │  - Enforces RBAC │
             │  - Uses service  │
             │    role key      │
             └──────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Database (PostgreSQL + Supabase)                    │
│ - RLS enabled on core tables                        │
│ - NO policies on contacts/trips = blocked for anon  │
│ - Service role bypasses RLS (API can access)        │
│ - Agency_id on all rows = data isolation            │
└─────────────────────────────────────────────────────┘
```

**Why This Design?**
- **Single Entry Point**: All data queries flow through the API
- **Centralized Auth**: Easier to audit, change, and enforce
- **Defense in Depth**: Multiple validation layers (JWT + Guards + RLS)
- **Future-Proof**: Can add sharing, delegation, and audit features at API layer

---

## Authentication Flow

### Frontend (Admin, OTA, Client Apps)

Frontend apps use `@supabase/ssr` for authentication:

| Component | Purpose |
|-----------|---------|
| `createBrowserClient()` | Client-side Supabase client with anon key |
| `createServerClient()` | Server-side client (reads cookies for session) |
| `updateSession()` | Next.js middleware for token refresh |

**Location**: `apps/*/src/lib/supabase/`

The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is safe to expose publicly. It only allows operations permitted by RLS policies.

### API Layer (NestJS)

The API validates JWTs using dynamic algorithm detection:

**JWT Strategy** (`apps/api/src/auth/strategies/jwt.strategy.ts`):
- Supports **both HS256 and ES256** algorithms (auto-detected from token header)
- **HS256**: Uses `SUPABASE_JWT_SECRET` for verification (older Supabase projects)
- **ES256**: Uses JWKS endpoint for public key verification (newer Supabase projects)
- Extracts custom claims: `agency_id`, `role`, `user_id`, `user_status`
- Rejects tokens missing required claims (fail-fast)

### JWT Custom Claims Hook

Custom claims are injected during login via a database hook:

**Location**: `packages/database/src/migrations/20251231200000_jwt_custom_claims_hook.sql`

The hook:
1. Intercepts JWT generation during login
2. Looks up `user_profiles` table for `agency_id` and `role`
3. Injects claims into the token payload
4. Rejects tokens if user profile is incomplete
5. Blocks locked users at token generation

---

## Authorization Guards

The API uses a chain of guards executed in order:

```
Request → JwtAuthGuard → UserStatusGuard → ActiveUserGuard → RolesGuard → Controller
```

### 1. JwtAuthGuard

**Location**: `apps/api/src/auth/guards/jwt-auth.guard.ts`

- Validates bearer token signature using JWKS
- Skips routes decorated with `@Public()`
- Blocks locked users (defense in depth)
- Throws `UnauthorizedException` for invalid tokens

### 2. UserStatusGuard

**Location**: `apps/api/src/auth/guards/user-status.guard.ts`

- Database lookup for real-time `isActive` status
- Blocks soft-deleted users
- Status is checked on each request (not cached in token)

### 3. ActiveUserGuard

**Location**: `apps/api/src/auth/guards/active-user.guard.ts`

- Blocks pending users from most routes
- Can be bypassed with `@AllowPendingUser()` decorator
- Used for account setup flows

### 4. RolesGuard

**Location**: `apps/api/src/auth/guards/roles.guard.ts`

- Enforces `@Roles('admin', 'user')` decorators
- Role extracted from JWT `app_metadata`
- Skips routes without `@Roles()` decorator

### Decorators

| Decorator | Location | Purpose |
|-----------|----------|---------|
| `@Public()` | `apps/api/src/auth/decorators/public.decorator.ts` | Skip authentication |
| `@Roles('admin')` | `apps/api/src/auth/decorators/roles.decorator.ts` | Require specific role |
| `@AllowPendingUser()` | `apps/api/src/auth/decorators/allow-pending.decorator.ts` | Allow pending users |

### Controller-Level Authorization

Beyond guards, controllers implement ownership checks:

```typescript
@Patch(':id')
async update(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
  @Body() dto: UpdateTripDto,
) {
  // Admins can update any trip, users only their own
  if (auth.role !== 'admin') {
    const existing = await this.tripsService.findOne(id)
    if (existing.ownerId !== auth.userId) {
      throw new ForbiddenException('You can only update trips you own')
    }
  }
  return this.tripsService.update(id, dto)
}
```

---

## Row Level Security (RLS)

### The Lockdown Strategy

Core tables have RLS enabled with **no policies** for authenticated/anon roles:

**Location**: `packages/database/src/migrations/20260107000000_enable_rls_api_lockdown.sql`

```sql
-- Enable and FORCE RLS (prevents bypass by table owners)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips FORCE ROW LEVEL SECURITY;

-- NO policies created = complete lockout for authenticated/anon
-- Only service_role can access these tables (used by API)
```

**Result**:
- Frontend apps using anon key cannot query contacts/trips directly
- API using service role key bypasses RLS
- All data access must go through API endpoints

### Agency-Scoped Policies

Tables with RLS policies use agency-scoped access:

**Location**: `packages/database/src/migrations/20251231300000_enable_rls_policies.sql`

```sql
-- Example: Agency-scoped SELECT policy
CREATE POLICY "trips_select_agency" ON trips
  FOR SELECT
  USING (agency_id = (auth.jwt() ->> 'agency_id')::uuid);

-- Example: Role-based UPDATE policy
CREATE POLICY "trips_update_admin_or_owner" ON trips
  FOR UPDATE
  USING (
    agency_id = (auth.jwt() ->> 'agency_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'admin'
      OR owner_id = (auth.jwt() ->> 'user_id')::uuid
    )
  );
```

### Tables with RLS

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| trips | Agency | Agency | Admin/Owner | Admin/Owner |
| contacts | Agency | Admin/Owner | Admin/Owner | Admin/Owner |
| itineraries | Agency | Agency | Agency | Admin only |
| activities | Agency | Agency | Agency | Admin only |
| user_profiles | Own record only | - | - | - |
| agencies | All authenticated | - | - | - |

---

## Sensitive Data Handling

### Encryption Service

**Location**: `apps/api/src/common/encryption/encryption.service.ts`

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: Base64-encoded 32-byte key (`ENCRYPTION_KEY` env var)
- **Features**: Random IV per encryption, authentication tag for integrity

### API Credentials Storage

**Location**: `apps/api/src/api-credentials/api-credentials.service.ts`

External API credentials are encrypted before storage:
- Supabase storage keys
- Cloudflare R2 credentials
- Amadeus OAuth2 secrets
- Google Places API keys

**Features**:
- Validates credentials before encryption
- 5-minute cache for decrypted credentials
- Version history for rollback
- Soft-delete (mark as revoked)

---

## Environment Variables

### Security Classification

| Variable | Classification | Notes |
|----------|---------------|-------|
| `SUPABASE_URL` | Public | API endpoint |
| `SUPABASE_ANON_KEY` | Public | Safe to expose, RLS-restricted |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | Bypasses RLS - API only |
| `SUPABASE_JWT_SECRET` | **SECRET** | JWT verification |
| `ENCRYPTION_KEY` | **SECRET** | AES-256 key (base64) |
| `JWT_SECRET` | **SECRET** | Internal token signing |
| `DATABASE_URL` | **SECRET** | Postgres connection |

### Service Role Key Usage

**IMPORTANT**: `SUPABASE_SERVICE_ROLE_KEY` is only used for:
- Admin API operations (managing Auth users)
- Database operations from the API layer

It is **NEVER** used for:
- Frontend data fetching
- Client-side operations
- Any browser-accessible code

---

## Email Account Credentials

**Location**: `apps/api/src/email-accounts/email-accounts.service.ts`

Agent email accounts (IMAP/SMTP) store credentials encrypted at rest using AES-256-GCM (same as API credentials). The `ENCRYPTION_KEY` environment variable is used for both.

- IMAP host, port, username, and password are encrypted before database storage
- SMTP credentials are stored alongside IMAP in the same `email_accounts` record
- Decrypted only at sync time (IMAP fetch) or send time (SMTP relay)
- Non-production environments block email sends to domains outside the allowed list (`agency_settings.email_allowed_domains`)

## Trip Group Access Control

**Location**: `apps/api/src/trips/trip-group-access.service.ts`

Trip groups use a sharing model similar to trips:
- `trip_group_shares` table grants read or write access to specific users
- Group owners (the user who created the group) have implicit full access
- Admin users have access to all groups in their agency
- RLS policy on `trip_group_shares` enforces agency isolation

---

## Additional Security Controls

### Password Reset

**Location**: `apps/api/src/auth/auth.controller.ts`

Prevents email enumeration:
```typescript
// Always returns same response regardless of email existence
return { message: 'If an account exists, a reset email has been sent.' }
```

### CORS Configuration

**Location**: `apps/api/src/main.ts`

- Strict origin allowlist (environment-specific)
- Development: localhost + dev domains only
- Production: production domains only

### Input Validation

Global validation pipeline:
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // Strip unknown properties
    forbidNonWhitelisted: true, // Reject unknown properties
    transform: true,
  })
)
```

### Security Headers

Helmet middleware applied globally for protection against XSS, clickjacking, etc.

---

## Related Documentation

- [Environment Configuration](./ENVIRONMENTS.md) - Domain and environment variables
- [API Deployment](./DEPLOYMENT_API.md) - Railway security settings
- [Database Architecture](./DATABASE_ARCHITECTURE.md) - Schema and RLS details
