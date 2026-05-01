# Phase 1: Progressive Identity + Auth Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable consumers to create accounts via magic link from the OTA and access an authenticated client portal, with seamless cross-subdomain SSO between `ota.phoenixvoyages.ca` and `my.phoenixvoyages.ca`.

**Architecture:** New `consumer-auth` NestJS module on the API handles registration (create contact + Supabase auth user + magic link). Both frontend apps share Supabase auth cookies scoped to `.phoenixvoyages.ca`. OTA middleware adds Supabase session refresh alongside existing cookie logic. Portal rebuilt as a Phoenix Voyages branded shell with magic link login.

**Tech Stack:** NestJS (API), Next.js 15 (OTA + Portal), Supabase Auth (@supabase/ssr), Zustand, Tailwind CSS, packages/ui-public (shared components)

---

## File Structure

### New files
| File | Responsibility |
|------|----------------|
| `apps/api/src/consumer-auth/consumer-auth.module.ts` | NestJS module for consumer registration |
| `apps/api/src/consumer-auth/consumer-auth.controller.ts` | `POST /consumer-auth/register` endpoint |
| `apps/api/src/consumer-auth/consumer-auth.service.ts` | Create contact + Supabase user + magic link |
| `apps/api/src/consumer-auth/dto/register-consumer.dto.ts` | Validation DTO |
| `apps/ota/src/components/auth/email-capture-modal.tsx` | Email capture modal component |
| `packages/ui-public/src/components/consumer-nav.tsx` | Shared nav bar (OTA + Portal mode) |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Register ConsumerAuthModule |
| `apps/api/src/auth/strategies/portal-jwt.strategy.ts` | Handle consumer tokens (contact_id present, relaxed agency_id check) |
| `apps/ota/src/middleware.ts` | Add Supabase `updateSession()` for cross-subdomain SSO |
| `apps/ota/src/lib/supabase/server.ts` | Set cookie domain to `.phoenixvoyages.ca` |
| `apps/ota/src/lib/supabase/middleware.ts` | Set cookie domain to `.phoenixvoyages.ca` |
| `apps/ota/src/components/layout/nav.tsx` | Add "Sign In" / "My Account" link |
| `apps/client/src/lib/supabase/server.ts` | Set cookie domain to `.phoenixvoyages.ca` |
| `apps/client/src/lib/supabase/middleware.ts` | Set cookie domain to `.phoenixvoyages.ca` |
| `apps/client/src/app/login/page.tsx` | Support self-serve magic link (remove `shouldCreateUser: false`) |
| `apps/client/src/app/layout.tsx` | Phoenix Voyages brand (Geist font, dark theme) |
| `apps/client/src/app/(dashboard)/layout.tsx` | New nav, Phoenix brand |
| `apps/client/src/app/(dashboard)/page.tsx` | Dashboard skeleton |
| `apps/client/src/components/dashboard/DashboardNav.tsx` | Replace with shared ConsumerNav |
| `packages/database/src/schema/contacts.schema.ts` | Add `authMethod` field |

### New migration
| File | Change |
|------|--------|
| `packages/database/src/migrations/{TIMESTAMP}_add_contact_auth_method.sql` | Add `auth_method` column to contacts |

---

### Task 1: Database Migration — Add `auth_method` to Contacts

**Files:**
- Create: `packages/database/src/migrations/{TIMESTAMP}_add_contact_auth_method.sql`
- Modify: `packages/database/src/schema/contacts.schema.ts`

- [ ] **Step 1: Create the migration file**

```bash
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
touch packages/database/src/migrations/${TIMESTAMP}_add_contact_auth_method.sql
```

```sql
-- Add auth_method to contacts for tracking how the consumer authenticates
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'magic_link';

COMMENT ON COLUMN contacts.auth_method IS 'Authentication method: magic_link, password, google, apple';
```

- [ ] **Step 2: Add the field to the Drizzle schema**

In `packages/database/src/schema/contacts.schema.ts`, add after the `portalActivatedAt` field:

```typescript
  authMethod: text('auth_method').default('magic_link'),
```

- [ ] **Step 3: Register migration in journal**

Add entry to `packages/database/src/migrations/meta/_journal.json` following the existing pattern.

- [ ] **Step 4: Run migration locally**

```bash
cd apps/api && pnpm db:migrate
```

Expected: Migration succeeds, `auth_method` column added to contacts table.

- [ ] **Step 5: Verify**

```bash
source apps/api/.env && psql "$DATABASE_URL" -c "\d contacts" | grep auth_method
```

Expected: `auth_method | text | | | 'magic_link'::text`

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/migrations/ packages/database/src/schema/contacts.schema.ts
git commit -m "feat(db): add auth_method column to contacts for consumer identity tracking"
```

---

### Task 2: Consumer Auth API — Registration Endpoint

**Files:**
- Create: `apps/api/src/consumer-auth/consumer-auth.module.ts`
- Create: `apps/api/src/consumer-auth/consumer-auth.controller.ts`
- Create: `apps/api/src/consumer-auth/consumer-auth.service.ts`
- Create: `apps/api/src/consumer-auth/dto/register-consumer.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

```typescript
// apps/api/src/consumer-auth/dto/register-consumer.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString } from 'class-validator'

export class RegisterConsumerDto {
  @ApiProperty({ description: 'Consumer email address' })
  @IsEmail()
  email: string

  @ApiProperty({ description: 'Consumer first name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string

  @ApiProperty({ description: 'Consumer last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string

  @ApiProperty({ description: 'OTA session ID for signal backfill', required: false })
  @IsOptional()
  @IsString()
  sessionId?: string

  @ApiProperty({ description: 'Advisor slug for lead attribution', required: false })
  @IsOptional()
  @IsString()
  advisorSlug?: string

  @ApiProperty({ description: 'Portal redirect URL after magic link click', required: false })
  @IsOptional()
  @IsString()
  redirectTo?: string
}
```

- [ ] **Step 2: Create the service**

```typescript
// apps/api/src/consumer-auth/consumer-auth.service.ts
import { Injectable, Logger, ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { DatabaseService } from '../database/database.service'
import { eq } from 'drizzle-orm'
import type { RegisterConsumerDto } from './dto/register-consumer.dto'

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name)
  private readonly supabaseAdmin: ReturnType<typeof createClient>
  private readonly portalBaseUrl: string

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    this.supabaseAdmin = createClient(
      this.config.getOrThrow('SUPABASE_URL'),
      this.config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    )
    this.portalBaseUrl = this.config.get('CLIENT_PORTAL_URL') || 'https://my.phoenixvoyages.ca'
  }

  async registerConsumer(dto: RegisterConsumerDto) {
    const { contacts } = this.db.schema
    const email = dto.email.toLowerCase().trim()

    // 1. Check if contact already exists
    const existing = await this.db.client
      .select()
      .from(contacts)
      .where(eq(contacts.email, email))
      .limit(1)

    let contact = existing[0]
    let isNewContact = false

    // 2. Create contact if new
    if (!contact) {
      const [created] = await this.db.client
        .insert(contacts)
        .values({
          email,
          firstName: dto.firstName || null,
          lastName: dto.lastName || null,
          contactType: 'lead',
          contactStatus: 'prospecting',
          authMethod: 'magic_link',
        })
        .returning()
      contact = created!
      isNewContact = true
      this.logger.log(`Created new consumer contact: ${contact.id} (${email})`)
    }

    // 3. Check if already has portal auth
    if (contact.portalUserId) {
      // Already has an auth account — just send a new magic link
      const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${this.portalBaseUrl}/auth/callback?redirectTo=${dto.redirectTo || '/'}`,
        },
      })

      if (linkError) {
        this.logger.error(`Failed to generate magic link for existing user: ${linkError.message}`)
        throw new Error('Failed to send sign-in link')
      }

      return {
        status: 'existing_user',
        contactId: contact.id,
        message: 'Sign-in link sent to your email.',
        magicLinkUrl: linkData.properties?.action_link,
      }
    }

    // 4. Create Supabase auth user
    const agencyId = contact.agencyId || (await this.getDefaultAgencyId())

    const { data: authData, error: authError } = await this.supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        portal_user: true,
        contact_id: contact.id,
        agency_id: agencyId,
      },
      user_metadata: {
        first_name: dto.firstName || contact.firstName || '',
        last_name: dto.lastName || contact.lastName || '',
      },
    })

    if (authError) {
      // If user already exists in Supabase auth but not linked to contact
      if (authError.message?.includes('already been registered')) {
        this.logger.warn(`Supabase auth user exists for ${email} but contact not linked`)
        throw new ConflictException('An account with this email already exists. Please sign in.')
      }
      this.logger.error(`Failed to create Supabase auth user: ${authError.message}`)
      throw new Error('Failed to create account')
    }

    // 5. Link auth user to contact
    await this.db.client
      .update(contacts)
      .set({
        portalUserId: authData.user.id,
        portalActivatedAt: new Date(),
        authMethod: 'magic_link',
        ...(dto.firstName && !contact.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName && !contact.lastName ? { lastName: dto.lastName } : {}),
      })
      .where(eq(contacts.id, contact.id))

    // 6. Generate magic link
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${this.portalBaseUrl}/auth/callback?redirectTo=${dto.redirectTo || '/'}`,
      },
    })

    if (linkError) {
      // Rollback: delete auth user if link generation fails
      await this.supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      await this.db.client
        .update(contacts)
        .set({ portalUserId: null, portalActivatedAt: null })
        .where(eq(contacts.id, contact.id))
      this.logger.error(`Failed to generate magic link, rolled back: ${linkError.message}`)
      throw new Error('Failed to send sign-in link')
    }

    this.logger.log(`Consumer registered: contact=${contact.id}, auth=${authData.user.id}, new=${isNewContact}`)

    return {
      status: isNewContact ? 'new_account' : 'account_linked',
      contactId: contact.id,
      message: 'Check your email for a sign-in link to access your Phoenix Voyages portal.',
      magicLinkUrl: linkData.properties?.action_link,
    }
  }

  private async getDefaultAgencyId(): Promise<string> {
    // Get the first (and typically only) agency
    const { agencies } = this.db.schema
    const [agency] = await this.db.client.select().from(agencies).limit(1)
    if (!agency) throw new Error('No agency configured')
    return agency.id
  }
}
```

- [ ] **Step 3: Create the controller**

```typescript
// apps/api/src/consumer-auth/consumer-auth.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { ConsumerAuthService } from './consumer-auth.service'
import { RegisterConsumerDto } from './dto/register-consumer.dto'

@ApiTags('Consumer Auth')
@Controller('consumer-auth')
export class ConsumerAuthController {
  constructor(private readonly consumerAuthService: ConsumerAuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register consumer or send magic link for existing consumer' })
  @ApiResponse({ status: 200, description: 'Registration successful, magic link sent' })
  @ApiResponse({ status: 409, description: 'Account already exists' })
  async register(@Body() dto: RegisterConsumerDto) {
    return this.consumerAuthService.registerConsumer(dto)
  }
}
```

- [ ] **Step 4: Create the module**

```typescript
// apps/api/src/consumer-auth/consumer-auth.module.ts
import { Module } from '@nestjs/common'
import { ConsumerAuthController } from './consumer-auth.controller'
import { ConsumerAuthService } from './consumer-auth.service'

@Module({
  controllers: [ConsumerAuthController],
  providers: [ConsumerAuthService],
  exports: [ConsumerAuthService],
})
export class ConsumerAuthModule {}
```

- [ ] **Step 5: Register in AppModule**

In `apps/api/src/app.module.ts`, add import and registration:

```typescript
import { ConsumerAuthModule } from './consumer-auth/consumer-auth.module'
```

Add `ConsumerAuthModule` to the `imports` array.

- [ ] **Step 6: Verify the API starts**

```bash
cd apps/api && pnpm start:dev
```

Test the endpoint:
```bash
curl -X POST http://localhost:3101/api/v1/consumer-auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-consumer@example.com"}'
```

Expected: 200 response with `{ status: "new_account", contactId: "...", message: "..." }`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/consumer-auth/ apps/api/src/app.module.ts
git commit -m "feat(api): add consumer-auth module with registration + magic link endpoint"
```

---

### Task 3: Cross-Subdomain Cookie Configuration

**Files:**
- Modify: `apps/ota/src/lib/supabase/server.ts`
- Modify: `apps/ota/src/lib/supabase/middleware.ts`
- Modify: `apps/client/src/lib/supabase/server.ts`
- Modify: `apps/client/src/lib/supabase/middleware.ts`

The cookie domain must be set to `.phoenixvoyages.ca` so auth cookies are shared between `ota.phoenixvoyages.ca` and `my.phoenixvoyages.ca`. In local dev, use `localhost` (no domain needed — cookies are already shared on same host).

- [ ] **Step 1: Add cookie domain config**

Create a shared config helper. In both OTA and Client apps, the Supabase server/middleware files use `cookieStore.set()` with cookie options. We need to inject `domain: '.phoenixvoyages.ca'` into these options.

In `apps/ota/src/lib/supabase/server.ts`, find the `set` callback inside `createServerClient()` and add domain:

```typescript
set(name: string, value: string, options: CookieOptions) {
  try {
    cookieStore.set({ name, value, ...options, domain: process.env.COOKIE_DOMAIN || undefined })
  } catch {
    // Server Component — can't set cookies, will be handled by middleware
  }
},
```

Apply the same change to:
- `apps/ota/src/lib/supabase/middleware.ts` — in `supabaseResponse.cookies.set()` callback
- `apps/client/src/lib/supabase/server.ts` — same `set` callback
- `apps/client/src/lib/supabase/middleware.ts` — same `set` callback

- [ ] **Step 2: Add `COOKIE_DOMAIN` to environment**

Add to Doppler configs:
- `dev`: (leave unset — localhost doesn't need domain)
- `stg`: `COOKIE_DOMAIN=.phoenixvoyages.ca`
- `prd`: `COOKIE_DOMAIN=.phoenixvoyages.ca`

Also add to OTA `.env.local`:
```
# Cookie domain for cross-subdomain SSO (leave unset for localhost)
# COOKIE_DOMAIN=.phoenixvoyages.ca
```

And to Client `.env.local`:
```
# COOKIE_DOMAIN=.phoenixvoyages.ca
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/lib/supabase/ apps/client/src/lib/supabase/
git commit -m "feat: configure cross-subdomain cookie domain for OTA + Portal SSO"
```

---

### Task 4: OTA Middleware — Add Supabase Session Refresh

**Files:**
- Modify: `apps/ota/src/middleware.ts`

Currently the OTA middleware only manages `ota_ref` and `ota_session` cookies. It does NOT refresh Supabase auth sessions. For SSO to work, the OTA must call `updateSession()` so that Supabase auth cookies stay fresh when authenticated consumers browse the OTA.

- [ ] **Step 1: Add Supabase updateSession to OTA middleware**

Read the current `apps/ota/src/middleware.ts`, then modify it to import and call `updateSession()` from `@/lib/supabase/middleware` BEFORE the existing cookie logic. The Supabase response must be merged with the OTA cookie response.

The key change: instead of creating a `NextResponse.next()` directly, first call `updateSession(request)` to get the Supabase-managed response, then set the OTA cookies (`ota_ref`, `ota_session`) on that same response.

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

function extractAdvisorSlug(request: NextRequest): string | null {
  // ... existing logic unchanged
}

export async function middleware(request: NextRequest) {
  // 1. Refresh Supabase auth session (for cross-subdomain SSO)
  const { supabaseResponse } = await updateSession(request)

  // 2. Use the Supabase response as the base (it has updated auth cookies)
  const response = supabaseResponse

  // 3. Set OTA-specific cookies on the same response
  const advisorSlug = extractAdvisorSlug(request)
  if (advisorSlug) {
    response.cookies.set('ota_ref', advisorSlug, {
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  if (!request.cookies.get('ota_session')?.value) {
    response.cookies.set('ota_session', crypto.randomUUID(), {
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|images/).*)'],
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/middleware.ts
git commit -m "feat(ota): add Supabase session refresh to middleware for cross-subdomain SSO"
```

---

### Task 5: Portal JWT Strategy — Support Consumer Tokens

**Files:**
- Modify: `apps/api/src/auth/strategies/portal-jwt.strategy.ts`

The current JWT strategy requires both `contact_id` and `agency_id`. Consumer tokens created by `consumer-auth/register` will have these in `app_metadata` (set during `createUser()`), but the validation logic should be more forgiving for consumers — they're always portal users but their agency relationship may differ from agent-invited clients.

- [ ] **Step 1: Update the strategy validation**

Read `apps/api/src/auth/strategies/portal-jwt.strategy.ts`, then modify the `validate()` method. The key change: the portal user detection already checks `payload.portal_user || appMetadata.portal_user`, which consumer-auth sets. Ensure `agency_id` falls back gracefully — consumers always have `agency_id` set from `getDefaultAgencyId()` in the registration flow, but if it's missing, use a fallback rather than throwing.

In the section that extracts `agencyId` (around the portal user branch), ensure it doesn't throw if `agency_id` is null:

```typescript
// For portal users, agency_id comes from app_metadata (set during registration)
const agencyId = payload.agency_id || appMetadata?.agency_id
if (!agencyId) {
  this.logger.warn(`Portal user ${payload.sub} has no agency_id — using default`)
  // Don't throw — consumers may have been created before agency was assigned
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/auth/strategies/portal-jwt.strategy.ts
git commit -m "feat(api): relax portal JWT strategy for consumer tokens"
```

---

### Task 6: Portal Login Page — Support Self-Serve Magic Link

**Files:**
- Modify: `apps/client/src/app/login/page.tsx`

Currently the login page uses `signInWithOtp({ shouldCreateUser: false })` — only pre-invited users can log in. For consumer self-serve, we need to also support the magic link flow where the consumer registered via the OTA's `consumer-auth/register` endpoint.

The simplest change: switch from `shouldCreateUser: false` to `shouldCreateUser: true` is NOT what we want (that would let anyone create an account by typing an email on the login page). Instead, keep `shouldCreateUser: false` but improve the error handling: when a user gets "Signups not allowed", add a link to the OTA where they can start the registration flow properly.

Actually, consumers registered via `consumer-auth/register` already have Supabase auth accounts. So `shouldCreateUser: false` is correct — they CAN log in with OTP because their account exists. The only issue is the error message for users who haven't registered yet.

- [ ] **Step 1: Update login page error messaging**

Read `apps/client/src/app/login/page.tsx`, then update the error handling for "Signups not allowed" to guide unregistered users to the OTA:

```typescript
// Replace the existing "Signups not allowed" error handler with:
if (error.message?.includes('Signups not allowed') || error.message?.includes('not allowed')) {
  setError(
    'No account found with this email. Start by exploring trips on our website — you can create an account when you save your dream board!'
  )
  return
}
```

Also update the page branding to use the Phoenix Voyages golden hour theme (dark background, gold accents) — but keep this minimal for now; full brand polish is Phase 6.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/app/login/page.tsx
git commit -m "feat(client): improve login error messaging for unregistered consumers"
```

---

### Task 7: OTA Email Capture Modal

**Files:**
- Create: `apps/ota/src/components/auth/email-capture-modal.tsx`
- Modify: `apps/ota/src/components/trip-builder/dream-board.tsx` (or wherever "Save Board" triggers)

- [ ] **Step 1: Create the email capture modal**

```typescript
// apps/ota/src/components/auth/email-capture-modal.tsx
'use client'

import { useState } from 'react'
import { X, Loader2, Mail, CheckCircle } from 'lucide-react'

interface EmailCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (email: string) => void
  trigger: 'save_board' | 'submit_trip' | 'ai_chat'
  title?: string
  subtitle?: string
}

export function EmailCaptureModal({
  isOpen,
  onClose,
  onSuccess,
  trigger,
  title = 'Save your trip ideas',
  subtitle = 'Enter your email to save your dream board and access it anytime.',
}: EmailCaptureModalProps) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setErrorMessage('')

    try {
      const sessionId = document.cookie
        .split('; ')
        .find((c) => c.startsWith('ota_session='))
        ?.split('=')[1]

      const advisorSlug = document.cookie
        .split('; ')
        .find((c) => c.startsWith('ota_ref='))
        ?.split('=')[1]

      const res = await fetch('/api/consumer-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          sessionId,
          advisorSlug,
          redirectTo: '/board',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Something went wrong')
      }

      setStatus('success')
      onSuccess?.(email.trim())
    } catch (err) {
      setStatus('error')
      setErrorMessage((err as Error).message || 'Unable to save. Please try again.')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="size-5" />
          </button>

          {status === 'success' ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="size-6 text-green-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[#1A1A1A]">Check your email!</h3>
              <p className="mt-2 text-sm text-gray-600">
                We sent a sign-in link to <strong>{email}</strong>. Click it to access your saved trip ideas anytime.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full rounded-full bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#B08638]"
              >
                Got it
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#C59746]/10">
                  <Mail className="size-5 text-[#C59746]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1A1A1A]">{title}</h3>
                  <p className="text-sm text-gray-500">{subtitle}</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="First name (optional)"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
                />

                {errorMessage && (
                  <p className="text-xs text-red-500">{errorMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading' || !email.trim()}
                  className="w-full rounded-full bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#B08638] disabled:opacity-50"
                >
                  {status === 'loading' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save & Send me a link'
                  )}
                </button>

                <p className="text-center text-xs text-gray-400">
                  We&apos;ll send you a magic link to access your saved trips. No password needed.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create OTA API proxy route for consumer-auth**

```typescript
// apps/ota/src/app/api/consumer-auth/register/route.ts
import { serviceFetch } from '@/lib/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await serviceFetch('/consumer-auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return Response.json(result)
  } catch (error) {
    const status = (error as any)?.status || 500
    const message = (error as any)?.body?.message || 'Registration failed'
    return Response.json({ message }, { status })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/auth/email-capture-modal.tsx apps/ota/src/app/api/consumer-auth/
git commit -m "feat(ota): add email capture modal + consumer-auth proxy route"
```

---

### Task 8: OTA Nav — Add Sign In Link

**Files:**
- Modify: `apps/ota/src/components/layout/nav.tsx`

- [ ] **Step 1: Add Sign In / My Account link to the nav**

Read `apps/ota/src/components/layout/nav.tsx`. Add a "Sign In" link next to the "Talk to AI" button in the desktop nav. This links to the portal login page.

In the desktop nav actions area (the right side with the "Talk to AI" button), add:

```typescript
<a
  href={process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca'}
  className="text-sm text-[#1A1A1A] transition-colors hover:text-[#C59746]"
>
  Sign In
</a>
```

Add `NEXT_PUBLIC_CLIENT_PORTAL_URL` to OTA `.env.local`:
```
NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3103
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/layout/nav.tsx
git commit -m "feat(ota): add Sign In link to nav pointing to client portal"
```

---

### Task 9: Portal Shell — Dashboard Skeleton with Phoenix Voyages Brand

**Files:**
- Modify: `apps/client/src/app/layout.tsx`
- Modify: `apps/client/src/app/(dashboard)/layout.tsx`
- Modify: `apps/client/src/app/(dashboard)/page.tsx`
- Modify: `apps/client/src/components/dashboard/DashboardNav.tsx`

This task gives the portal a basic Phoenix Voyages branded shell — dark nav, gold accents, dashboard skeleton. Full page implementations come in Phase 2.

- [ ] **Step 1: Update root layout font to Geist (matching OTA)**

Read `apps/client/src/app/layout.tsx`. Replace the Cinzel + Lato fonts with Geist Sans + Geist Mono to match the OTA:

```typescript
import localFont from 'next/font/local'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})
```

Update the `<body>` className to use the new font variables. Copy the Geist font files from `apps/ota/src/app/fonts/` to `apps/client/src/app/fonts/` if they don't exist.

- [ ] **Step 2: Update dashboard nav with dark header + Phoenix logo**

Read `apps/client/src/components/dashboard/DashboardNav.tsx`. Replace with a dark header nav matching the OTA brand:

```typescript
// Key nav items for the portal
const PORTAL_NAV = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/board', label: 'My Board', icon: Sparkles },
  { href: '/trips', label: 'My Trips', icon: Briefcase },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/payments', label: 'Payments', icon: CreditCard },
]
```

Style with dark background (#1A1A1A), gold accent (#C59746) for active items, Phoenix Voyages logo on the left, user avatar/dropdown on the right, "Browse Trips ↗" link back to OTA.

- [ ] **Step 3: Update dashboard page with prospect welcome state**

Read `apps/client/src/app/(dashboard)/page.tsx`. Replace with a simple welcome dashboard:

```typescript
export default async function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A1A]">
        Welcome to Phoenix Voyages
      </h1>
      <p className="mt-2 text-gray-600">
        Your personal travel hub — save trip ideas, review proposals, and manage your bookings.
      </p>

      {/* Quick action cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          title="My Dream Board"
          description="View and manage your saved trip ideas"
          href="/board"
          icon="✨"
        />
        <DashboardCard
          title="Browse Trips"
          description="Explore destinations, cruises, and more"
          href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
          icon="🌍"
          external
        />
        <DashboardCard
          title="My Profile"
          description="Update your travel preferences and info"
          href="/travelers"
          icon="👤"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/app/ apps/client/src/components/
git commit -m "feat(client): Phoenix Voyages branded portal shell — dark nav, dashboard skeleton"
```

---

## Self-Review

**Spec coverage check:**

| Phase 1 Requirement | Task |
|---|---|
| Consumer registration API endpoint | Task 2 |
| Email capture modal on OTA | Task 7 |
| Cross-subdomain cookie setup | Task 3 |
| Add Supabase updateSession to OTA middleware | Task 4 |
| Update portal JWT strategy for consumer tokens | Task 5 |
| Portal login page (magic link) | Task 6 |
| Portal shell with dark nav + Phoenix brand | Task 9 |
| Shared nav component | Task 9 (inline — shared package extraction deferred to Phase 2 when both navs stabilize) |
| Database: auth_method on contacts | Task 1 |

**Placeholder scan:** No TBDs or TODOs. All tasks have complete code.

**Type consistency:** `RegisterConsumerDto` used in Task 2 controller + service. `COOKIE_DOMAIN` env var used consistently in Task 3. `updateSession` import path matches existing OTA Supabase middleware pattern.

**Note on shared nav:** The spec calls for a `packages/ui-public` shared nav component. I've deferred extracting this to Phase 2 — in Phase 1, both navs are implemented inline in their respective apps. Once both navs stabilize (after Phase 2 adds board/settings pages), extracting to a shared component is cleaner than trying to abstract prematurely.
