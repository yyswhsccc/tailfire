# Phase 2: Dream Board Persistence + Portal Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable authenticated consumers to access their dream boards in the client portal, with automatic migration from anonymous session-based boards when they create an account.

**Architecture:** Add a `findByContact()` query to the backend trip-request service so the portal can fetch boards by `contactId`. The consumer-auth registration flow backfills `contactId` onto session-linked trip requests. The portal gets a new `/board` page that renders saved boards. The OTA nav becomes auth-aware (My Account vs Sign In). The portal settings page gets fleshed out.

**Tech Stack:** NestJS (API), Next.js 15 (OTA + Portal), React Query, Zustand, Supabase Auth, Tailwind CSS

---

## File Structure

### New files
| File | Responsibility |
|------|----------------|
| `apps/client/src/app/(dashboard)/board/page.tsx` | Portal dream board page — renders saved boards |
| `apps/client/src/hooks/use-portal-boards.ts` | React Query hook for fetching boards by contact |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/ota/ota-trip-requests.service.ts` | Add `findByContact(contactId)` method |
| `apps/api/src/ota/ota-trip-requests.controller.ts` | Add `GET /ota/trip-requests/by-contact/:contactId` endpoint |
| `apps/api/src/client-portal/client-portal.controller.ts` | Add `GET /portal/my-boards` endpoint |
| `apps/api/src/client-portal/client-portal.service.ts` | Add `getMyBoards(contactId)` method |
| `apps/api/src/consumer-auth/consumer-auth.service.ts` | Backfill `contactId` on session trip requests during registration |
| `apps/ota/src/components/layout/nav.tsx` | Auth-aware Sign In / My Account link |
| `apps/ota/src/components/layout/mobile-nav.tsx` | Auth-aware Sign In / My Account link |
| `apps/client/src/app/(dashboard)/settings/page.tsx` | Flesh out from stub to working settings page |
| `apps/client/src/components/dashboard/DashboardNav.tsx` | Add "My Board" nav item |

---

### Task 1: Backend — findByContact Query + Portal Endpoint

**Files:**
- Modify: `apps/api/src/ota/ota-trip-requests.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.service.ts`
- Modify: `apps/api/src/client-portal/client-portal.controller.ts`

- [ ] **Step 1: Add findByContact to ota-trip-requests service**

Read `apps/api/src/ota/ota-trip-requests.service.ts`. Find the `findBySession()` method and add a similar `findByContact()` method after it:

```typescript
  /**
   * Find all trip requests (boards) linked to a contact.
   * Used by the client portal to show saved boards.
   */
  async findByContact(contactId: string) {
    const { otaTripRequests } = this.db.schema

    const rows = await this.db.client
      .select()
      .from(otaTripRequests)
      .where(eq(otaTripRequests.contactId, contactId))
      .orderBy(desc(otaTripRequests.updatedAt))

    return rows
  }
```

Make sure `desc` is imported from `drizzle-orm` (likely already imported).

- [ ] **Step 2: Add getMyBoards to client-portal service**

Read `apps/api/src/client-portal/client-portal.service.ts`. Add a method that wraps the trip-request query:

```typescript
  async getMyBoards(contactId: string) {
    return this.otaTripRequestsService.findByContact(contactId)
  }
```

This requires injecting `OtaTripRequestsService`. Check if it's already injected; if not, add it to the constructor and module imports.

- [ ] **Step 3: Add GET /portal/my-boards endpoint**

Read `apps/api/src/client-portal/client-portal.controller.ts`. Add a new endpoint:

```typescript
  @Get('my-boards')
  @UseGuards(PortalJwtAuthGuard)
  @ApiOperation({ summary: 'Get consumer dream boards' })
  async getMyBoards(@CurrentPortalUser() auth: PortalAuthContext) {
    return this.clientPortalService.getMyBoards(auth.contactId)
  }
```

Follow the pattern of existing endpoints in the controller (e.g., `getMyTrips`, `getMyDocuments`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/ota/ota-trip-requests.service.ts apps/api/src/client-portal/
git commit -m "feat(api): add findByContact for trip requests + portal my-boards endpoint"
```

---

### Task 2: Session-to-Contact Board Migration

**Files:**
- Modify: `apps/api/src/consumer-auth/consumer-auth.service.ts`

When a consumer registers, any trip requests linked to their `sessionId` should get their `contactId` backfilled. This way boards created before account creation survive the transition.

- [ ] **Step 1: Add session backfill to registerConsumer**

Read `apps/api/src/consumer-auth/consumer-auth.service.ts`. The `RegisterConsumerDto` already has an optional `sessionId` field. After successfully creating/linking the contact and auth user, add a backfill step:

After the contact update (the `portalUserId` set), add:

```typescript
    // Backfill contactId on any session-linked trip requests
    if (dto.sessionId) {
      try {
        const { otaTripRequests } = this.db.schema
        const updated = await this.db.client
          .update(otaTripRequests)
          .set({ contactId, contactEmail: email, updatedAt: new Date() })
          .where(
            and(
              eq(otaTripRequests.sessionId, dto.sessionId),
              isNull(otaTripRequests.contactId),
            ),
          )
        this.logger.log(`Backfilled ${dto.sessionId} trip requests with contactId ${contactId}`)
      } catch (err) {
        // Non-critical — log but don't fail registration
        this.logger.warn(`Failed to backfill session trip requests: ${(err as Error).message}`)
      }
    }
```

Make sure `and`, `isNull` are imported from `drizzle-orm`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/consumer-auth/consumer-auth.service.ts
git commit -m "feat(api): backfill contactId on session trip requests during consumer registration"
```

---

### Task 3: Portal Board Hook + Page

**Files:**
- Create: `apps/client/src/hooks/use-portal-boards.ts`
- Create: `apps/client/src/app/(dashboard)/board/page.tsx`
- Modify: `apps/client/src/components/dashboard/DashboardNav.tsx`

- [ ] **Step 1: Create the React Query hook**

```typescript
// apps/client/src/hooks/use-portal-boards.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface BoardComponent {
  id: string
  type: 'flight' | 'hotel' | 'cruise' | 'tour'
  data: Record<string, unknown>
  display?: {
    heroImage?: string
    title?: string
    subtitle?: string
    price?: string
  }
}

export interface BoardInspirationCard {
  id: string
  imageUrl: string
  title: string
  subtitle?: string
}

export interface PortalBoard {
  id: string
  title: string | null
  status: string
  components: BoardComponent[]
  inspiration: BoardInspirationCard[]
  boardOrder: Array<{ id: string; type: 'component' | 'inspiration' }>
  createdAt: string
  updatedAt: string
}

export function usePortalBoards() {
  return useQuery({
    queryKey: ['portal', 'boards'],
    queryFn: () => portalApi<PortalBoard[]>('/portal/my-boards'),
  })
}
```

- [ ] **Step 2: Create the board page**

```typescript
// apps/client/src/app/(dashboard)/board/page.tsx
'use client'

import { usePortalBoards, type PortalBoard, type BoardComponent } from '@/hooks/use-portal-boards'
import { Sparkles, Ship, Plane, Hotel, MapPin, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

function formatPrice(price?: string) {
  if (!price) return null
  return price
}

function ComponentCard({ component }: { component: BoardComponent }) {
  const icons = { cruise: Ship, flight: Plane, hotel: Hotel, tour: MapPin }
  const Icon = icons[component.type] || MapPin

  return (
    <div className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {component.display?.heroImage && (
        <div className="relative h-40 w-full">
          <Image
            src={component.display.heroImage}
            alt={component.display?.title || component.type}
            fill
            className="object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-[#C59746]" />
          <span className="text-xs font-medium uppercase text-gray-500">{component.type}</span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-[#1A1A1A]">
          {component.display?.title || 'Untitled'}
        </h3>
        {component.display?.subtitle && (
          <p className="mt-0.5 text-xs text-gray-500">{component.display.subtitle}</p>
        )}
        {component.display?.price && (
          <p className="mt-2 text-sm font-bold text-[#C59746]">{formatPrice(component.display.price)}</p>
        )}
      </div>
    </div>
  )
}

function BoardCard({ board }: { board: PortalBoard }) {
  const componentCount = board.components?.length ?? 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A1A]">{board.title || 'My Dream Board'}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {componentCount} item{componentCount !== 1 ? 's' : ''} saved
          </p>
        </div>
        <span className="rounded-full bg-[#C59746]/10 px-3 py-1 text-xs font-medium text-[#C59746]">
          {board.status}
        </span>
      </div>

      {componentCount > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {board.components.map((c) => (
            <ComponentCard key={c.id} component={c} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-gray-50 p-8 text-center">
          <Sparkles className="mx-auto size-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No items saved yet</p>
          <a
            href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#C59746] hover:underline"
          >
            Browse trips <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

export default function BoardPage() {
  const { data: boards, isLoading, error } = usePortalBoards()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">My Dream Board</h1>
          <p className="mt-1 text-sm text-gray-500">Your saved trip ideas and inspiration</p>
        </div>
        <a
          href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#C59746] px-4 py-2 text-sm font-medium text-white hover:bg-[#B08638]"
        >
          Add more <ExternalLink className="size-3.5" />
        </a>
      </div>

      {isLoading && (
        <div className="mt-8 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          Unable to load your boards. Please try again.
        </div>
      )}

      {boards && boards.length === 0 && (
        <div className="mt-12 text-center">
          <Sparkles className="mx-auto size-12 text-gray-200" />
          <h2 className="mt-4 text-lg font-semibold text-[#1A1A1A]">No boards yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Start exploring destinations, cruises, and more on our travel site.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_OTA_URL || 'https://ota.phoenixvoyages.ca'}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#C59746] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#B08638]"
          >
            Start exploring <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}

      {boards && boards.length > 0 && (
        <div className="mt-6 space-y-6">
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add My Board to portal nav**

Read `apps/client/src/components/dashboard/DashboardNav.tsx`. Add a "My Board" item to the nav items array. Import `Sparkles` from lucide-react:

```typescript
{ href: '/board', label: 'My Board', icon: Sparkles },
```

Add it as the second item (after Dashboard).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/hooks/use-portal-boards.ts apps/client/src/app/\(dashboard\)/board/ apps/client/src/components/dashboard/DashboardNav.tsx
git commit -m "feat(client): portal dream board page with saved trip components"
```

---

### Task 4: OTA Nav — Auth-Aware Sign In / My Account

**Files:**
- Modify: `apps/ota/src/components/layout/nav.tsx`
- Modify: `apps/ota/src/components/layout/mobile-nav.tsx`

The OTA currently always shows "Sign In". When a consumer is authenticated (Supabase session cookie present from cross-subdomain SSO), it should show "My Account" linking to the portal dashboard.

- [ ] **Step 1: Update desktop nav**

Read `apps/ota/src/components/layout/nav.tsx`. The component is already `'use client'`. Add Supabase session detection:

At the top, add imports:
```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
```

Inside the `Nav()` component, add state for auth:
```typescript
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user?.app_metadata?.portal_user)
    })
  }, [])
```

Replace the "Sign In" link in the CTA section with:
```typescript
{isAuthenticated ? (
  <a
    href={process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca'}
    className="text-sm text-[#1A1A1A] transition-colors hover:text-[#C59746]"
  >
    My Account
  </a>
) : (
  <a
    href={`${process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca'}/login`}
    className="text-sm text-[#1A1A1A] transition-colors hover:text-[#C59746]"
  >
    Sign In
  </a>
)}
```

- [ ] **Step 2: Update mobile nav**

Read `apps/ota/src/components/layout/mobile-nav.tsx`. Apply the same auth-aware logic — pass `isAuthenticated` as a prop from the parent `Nav` component, or duplicate the Supabase check.

The simplest approach: export `isAuthenticated` state from `Nav` via a shared context or prop. But since `MobileNav` is rendered inside `Nav`, pass it as a prop:

In `nav.tsx`, pass to MobileNav:
```typescript
<MobileNav isAuthenticated={isAuthenticated} ... />
```

In `mobile-nav.tsx`, use the prop to toggle "Sign In" / "My Account".

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/layout/nav.tsx apps/ota/src/components/layout/mobile-nav.tsx
git commit -m "feat(ota): auth-aware nav — show My Account when authenticated, Sign In when not"
```

---

### Task 5: Portal Settings Page

**Files:**
- Modify: `apps/client/src/app/(dashboard)/settings/page.tsx`

Currently a 15-line stub. Flesh it out with account management options.

- [ ] **Step 1: Implement settings page**

Read the current stub at `apps/client/src/app/(dashboard)/settings/page.tsx`. Replace with a working settings page:

```typescript
// apps/client/src/app/(dashboard)/settings/page.tsx
'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { usePortalProfile, useUpdatePortalProfile } from '@/hooks/use-portal-data'
import { Loader2, Check, Mail, Shield, Bell } from 'lucide-react'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { data: profile, isLoading } = usePortalProfile()
  const updateProfile = useUpdatePortalProfile()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    preferredName: '',
    phone: '',
  })

  // Sync form with profile data on load
  const [initialized, setInitialized] = useState(false)
  if (profile && !initialized) {
    setForm({
      preferredName: profile.preferredName || '',
      phone: profile.phone || '',
    })
    setInitialized(true)
  }

  async function handleSave() {
    await updateProfile.mutateAsync({
      preferredName: form.preferredName || null,
      phone: form.phone || null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#C59746]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A1A]">Account Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your account preferences</p>

      {/* Account Info */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Mail className="size-5 text-gray-400" />
          <h2 className="text-base font-semibold text-[#1A1A1A]">Account</h2>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Email</label>
            <p className="mt-1 text-sm text-[#1A1A1A]">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Preferred Name</label>
            <input
              type="text"
              value={form.preferredName}
              onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
              placeholder="How should we address you?"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Your phone number"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className="rounded-full bg-[#C59746] px-6 py-2 text-sm font-medium text-white hover:bg-[#B08638] disabled:opacity-50"
          >
            {updateProfile.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              <span className="flex items-center gap-1"><Check className="size-4" /> Saved</span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Shield className="size-5 text-gray-400" />
          <h2 className="text-base font-semibold text-[#1A1A1A]">Security</h2>
        </div>
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            You sign in via magic link sent to your email. Password login coming soon.
          </p>
        </div>
      </div>

      {/* Sign Out */}
      <div className="mt-6">
        <button
          onClick={() => logout()}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Sign out of my account
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(client): implement portal settings page — account info, preferred name, phone"
```

---

## Self-Review

**Spec coverage:**

| Phase 2 Requirement | Task |
|---|---|
| Dream board migrates from anonymous session to authenticated storage | Task 2 (session backfill on registration) |
| Portal `/board` page | Task 3 |
| Portal `/settings` page | Task 5 |
| Portal `/travelers` page | Already exists (842 lines, fully built) |
| Dashboard page | Already exists (updated in Phase 1) |
| "Sign In" / "My Account" in OTA nav | Task 4 |
| Backend portal boards endpoint | Task 1 |

**Placeholder scan:** No TBDs or TODOs. All tasks have complete code.

**Type consistency:** `PortalBoard` interface in Task 3 matches the backend `ota_trip_requests` shape. `BoardComponent` matches the OTA's `TripComponent` display fields. `findByContact()` return type matches what the portal hook expects.

**Note:** The `/travelers` page is already fully implemented at 842 lines with passport, preferences, dietary, and address management. No work needed there — Phase 2 spec requirement already satisfied.
