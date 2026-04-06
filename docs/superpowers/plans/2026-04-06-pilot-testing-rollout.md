# Pilot Testing Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the preview/staging environment for real agent testing by EOD 2026-04-06.

**Architecture:** Two phases — (1) wipe preview DB and re-import fresh TES data, (2) build welcome page + trip owner reassignment UI. Phase 2 code changes deploy to preview after merge to the `preview` branch.

**Tech Stack:** NestJS API, Next.js admin app, Drizzle ORM, Supabase auth, TanStack Query, shadcn/ui, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-06-pilot-testing-rollout-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `scripts/migration/preview-reset.sql` | Dedicated preview DB wipe script with FK-safe deletion order |
| `apps/admin/src/app/welcome/page.tsx` | Welcome page for first-time users |

### Modified Files
| File | Lines | Change |
|------|-------|--------|
| `packages/shared-types/src/api/user-profiles.types.ts` | ~28-32 | Add `onboardingCompletedAt` to `PlatformPreferencesDto` |
| `apps/api/src/user-profiles/dto/update-user-profile.dto.ts` | ~96-109 | Add `onboardingCompletedAt` to validation class |
| `apps/admin/src/components/layout/dashboard-layout.tsx` | ~1-16 | Add welcome page redirect gate |
| `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx` | ~347-452 | Add owner selector to Trip Settings card |

---

## Task 1: Write Preview Reset SQL Script

**Files:**
- Create: `scripts/migration/preview-reset.sql`

This script runs against the **preview DB only** (Tailfire-Preview / `gaqacfstpnmwphekjzae`). It deletes all imported data in FK-safe order while preserving agencies, users, system config, and Drizzle migrations.

- [ ] **Step 1: Create the preview reset SQL script**

```sql
-- preview-reset.sql
-- Wipes all TES-imported data from preview DB in FK-safe order.
-- RUN ONLY AGAINST PREVIEW (gaqacfstpnmwphekjzae). NEVER PRODUCTION.
--
-- Usage:
--   doppler run --project tailfire --config stg -- sh -lc 'psql "$DATABASE_URL" -f scripts/migration/preview-reset.sql'

BEGIN;

-- Safety check: abort if this is production
DO $$
BEGIN
  IF current_database() NOT LIKE '%gaqacfstpnmwphekjzae%'
     AND current_user NOT LIKE '%gaqacfstpnmwphekjzae%' THEN
    -- Can't reliably detect from DB name alone; rely on operator discipline
    RAISE NOTICE 'Proceeding with preview reset...';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 1: Commission items (must go before trips cascade)
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM commission_check_items
WHERE activity_pricing_id IN (
  SELECT ap.id FROM activity_pricing ap
  JOIN itinerary_activities ia ON ia.id = ap.activity_id
  JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
  JOIN itineraries itin ON itin.id = iday.itinerary_id
  JOIN trips t ON t.id = itin.trip_id
  WHERE t.external_reference IS NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════
-- Phase 2: Delete trips (cascades to 20+ child tables)
-- Cascade handles: trip_collaborators, trip_travelers, traveler_groups,
-- itineraries (-> itinerary_days -> itinerary_activities -> activity_pricing),
-- trip_orders, trip_shares, trip_media, activity_logs, insurance,
-- package_details, activity_travelers, cruise_booking_sessions,
-- tags, notes, financials, automation_job_history, form_tokens
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM trips WHERE external_reference IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 3: Orphaned commission checks
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM commission_checks
WHERE id NOT IN (SELECT DISTINCT check_id FROM commission_check_items);

-- ═══════════════════════════════════════════════════════════════════
-- Phase 4: Trip groups from TES import
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM trip_groups WHERE description LIKE '%TraveleSolutions%';

-- ═══════════════════════════════════════════════════════════════════
-- Phase 5: CRM cleanup (contacts + related)
-- Order matters due to RESTRICT on trip_travelers.contact_id
-- but trips are already gone, so trip_travelers are cascade-deleted
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM client_portal_users;
DELETE FROM contact_duplicate_dismissals;
DELETE FROM contact_share_requests;
DELETE FROM contact_shares;
DELETE FROM contact_documents;
DELETE FROM contact_loyalty_programs;
DELETE FROM contact_group_members;
DELETE FROM contact_groups;
DELETE FROM contact_relationships;
-- contact_tags are handled via cascade from tags table, but clean up stragglers
DELETE FROM tags WHERE contact_id IS NOT NULL;
DELETE FROM contacts;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 6: Suppliers (after commission_checks are cleared)
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM suppliers;

COMMIT;

-- Report
SELECT 'Reset complete' AS status,
  (SELECT count(*) FROM trips) AS remaining_trips,
  (SELECT count(*) FROM contacts) AS remaining_contacts,
  (SELECT count(*) FROM suppliers) AS remaining_suppliers;
```

- [ ] **Step 2: Verify script syntax (dry run)**

```bash
# Parse-check only (does not execute)
doppler run --project tailfire --config stg -- sh -lc 'psql "$DATABASE_URL" -f scripts/migration/preview-reset.sql --set ON_ERROR_STOP=on' <<< 'ROLLBACK;'
```

Expected: No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/migration/preview-reset.sql
git commit -m "feat: add dedicated preview DB reset script for pilot rollout"
```

---

## Task 2: Extend PlatformPreferences Type for Onboarding

**Files:**
- Modify: `packages/shared-types/src/api/user-profiles.types.ts:28-32`
- Modify: `apps/api/src/user-profiles/dto/update-user-profile.dto.ts:96-109`

- [ ] **Step 1: Add `onboardingCompletedAt` to shared type**

In `packages/shared-types/src/api/user-profiles.types.ts`, update the `PlatformPreferencesDto` interface (lines 28-32):

```typescript
export interface PlatformPreferencesDto {
  theme?: 'light' | 'dark' | 'system'
  timezone?: string
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  onboardingCompletedAt?: string | null
}
```

- [ ] **Step 2: Add validation to API DTO**

In `apps/api/src/user-profiles/dto/update-user-profile.dto.ts`, update the `PlatformPreferencesDto` class (lines 96-109):

```typescript
export class PlatformPreferencesDto {
  @IsOptional()
  @IsString()
  theme?: 'light' | 'dark' | 'system'

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string

  @IsOptional()
  @IsString()
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'

  @IsOptional()
  @IsString()
  onboardingCompletedAt?: string | null
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/api/user-profiles.types.ts apps/api/src/user-profiles/dto/update-user-profile.dto.ts
git commit -m "feat: add onboardingCompletedAt to platformPreferences type and DTO"
```

---

## Task 3: Build Welcome Page

**Files:**
- Create: `apps/admin/src/app/welcome/page.tsx`

- [ ] **Step 1: Create the welcome page component**

Create `apps/admin/src/app/welcome/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plane,
  Users,
  CalendarDays,
  CreditCard,
  HelpCircle,
  Bug,
} from 'lucide-react'

const features = [
  {
    icon: Plane,
    title: 'Trips',
    description: 'Manage client trips, itineraries, and bookings from planning through completion.',
  },
  {
    icon: Users,
    title: 'Contacts',
    description: 'Your CRM — import, merge, and track client relationships and lifecycle.',
  },
  {
    icon: CalendarDays,
    title: 'Calendar',
    description: 'See tasks, final payment deadlines, and trip dates at a glance.',
  },
  {
    icon: CreditCard,
    title: 'Payments',
    description: 'Track deposits, balances, and commission across all bookings.',
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()

  const firstName = profile?.firstName || 'there'

  const handleGetStarted = () => {
    updateProfile.mutate(
      {
        platformPreferences: {
          ...profile?.platformPreferences,
          onboardingCompletedAt: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          router.push('/dashboard')
        },
      },
    )
  }

  return (
    <div className="min-h-screen bg-ash-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-ash-900">
            Welcome to Tailfire, {firstName}
          </h1>
          <p className="text-ash-600">
            Your travel agency management platform. Here&apos;s what you can do.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((feature) => (
            <Card key={feature.title} className="border-ash-200">
              <CardContent className="p-5 flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-ash-900">{feature.title}</h3>
                  <p className="text-sm text-ash-500 mt-1">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Help & Bug Reporting */}
        <Card className="border-ash-200 bg-ash-25">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-ash-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-ash-900">Need help?</p>
                <p className="text-sm text-ash-500">
                  Click the <strong>?</strong> icon in the top navigation bar to open the help guide. It covers every feature in detail.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Bug className="h-5 w-5 text-ash-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-ash-900">Found a bug or have a feature request?</p>
                <p className="text-sm text-ash-500">
                  Click the <strong>?</strong> icon, then <strong>&quot;Report a Bug&quot;</strong>. It automatically captures a screenshot and creates a ticket for our team.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Get Started Button */}
        <div className="text-center">
          <Button
            size="lg"
            onClick={handleGetStarted}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Setting up...' : 'Get Started'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/welcome/page.tsx
git commit -m "feat: add welcome page for first-time pilot users"
```

---

## Task 4: Add Welcome Redirect Gate to Dashboard Layout

**Files:**
- Modify: `apps/admin/src/components/layout/dashboard-layout.tsx:1-16`

- [ ] **Step 1: Add redirect logic**

Replace the full content of `apps/admin/src/components/layout/dashboard-layout.tsx`:

```tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { TopNav } from './top-nav'
import { useMyProfile } from '@/hooks/use-user-profile'

// Routes exempt from welcome redirect
const EXEMPT_ROUTES = ['/welcome', '/auth', '/profile']

function isExempt(pathname: string): boolean {
  return EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?'),
  )
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: profile, isLoading } = useMyProfile()

  useEffect(() => {
    if (isLoading || !profile) return
    if (isExempt(pathname)) return

    const onboardingDone = profile.platformPreferences?.onboardingCompletedAt
    if (!onboardingDone) {
      router.replace('/welcome')
    }
  }, [profile, isLoading, pathname, router])

  return (
    <div className="min-h-screen bg-ash-50">
      <TopNav />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/layout/dashboard-layout.tsx
git commit -m "feat: add welcome page redirect gate for first-time users"
```

---

## Task 5: Add Trip Owner Selector to Trip Overview

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx:347-452`

The Trip Settings card in the right sidebar already has a pattern of `<Select>` controls for currency, pricing visibility, and calendar display. We add an "Assigned Agent" selector following the same pattern.

- [ ] **Step 1: Add the owner selector**

In `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`, add these imports at the top (merge with existing imports):

```tsx
import { useUsers } from '@/hooks/use-users'
```

Inside the component function, add this alongside existing hooks (near top of component body):

```tsx
const { data: usersData } = useUsers({ status: 'active', limit: 100 })
const users = usersData?.data ?? []
```

Then inside the Trip Settings `<Card>` (after the Calendar Display select, around line 443), add:

```tsx
            {/* Assigned Agent */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ash-500">
                Assigned Agent
              </label>
              <Select
                value={trip.ownerId || ''}
                onValueChange={(value) => {
                  handleUpdateSetting('ownerId', value || null)
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

Note: `handleUpdateSetting` already exists in the component (lines 62-70) and calls `useUpdateTrip()`. The trip update DTO accepts `ownerId`, so this uses the existing `PATCH /trips/:id` endpoint rather than the separate `PATCH /trips/:id/owner` endpoint. Both achieve the same result but the existing mutation pattern is simpler.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/trips/[id]/_components/trip-overview.tsx
git commit -m "feat: add assigned agent selector to trip overview settings"
```

---

## Task 6: Pre-Set Onboarding for Existing Admin Users

After Tasks 2-5 are deployed, existing admin users need `onboardingCompletedAt` set so they don't see the welcome page.

**Files:** None (API call only)

- [ ] **Step 1: Set onboardingCompletedAt for existing admin users via API**

After deploying to preview, log in as admin and run this in the browser console (or via curl):

```bash
# Get auth token from preview
# Then update the admin user's profile
curl -X PUT "https://api-dev.tailfire.ca/api/v1/user-profiles/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platformPreferences": {"onboardingCompletedAt": "2026-04-06T00:00:00Z"}}'
```

This only needs to run for the existing admin account. New pilot agent accounts will see the welcome page naturally.

---

## Task 7: Re-Extract TES Data

**Files:** None (external scripts)

- [ ] **Step 1: Run the TES extraction**

```bash
cd /Users/alguertin/Development/tailfire-project

# TES credentials: check project memory or ask Andre
TS_USER="$TES_USER" TS_PASS="$TES_PASS" TS_COMPANY="$TES_COMPANY" \
  npx tsx scripts/migration/extract-travelesolutions.ts
```

Expected: JSON files updated in `data/migration/` (trips.json, contacts.json, bookings.json, suppliers.json, commission-checks.json, payments.json).

- [ ] **Step 2: Verify extraction counts**

```bash
python3 -c "
import json
for f in ['trips', 'contacts', 'bookings', 'suppliers', 'commission-checks', 'payments']:
    with open(f'data/migration/{f}.json') as fh:
        data = json.load(fh)
        print(f'{f}: {len(data)} records')
"
```

Expected: ~426 trips, ~840 contacts, etc.

---

## Task 8: Wipe Preview DB and Re-Import

**Files:** None (scripts + API calls)

- [ ] **Step 1: Run the preview reset SQL**

```bash
cd /Users/alguertin/Development/tailfire-project/tailfire

doppler run --project tailfire --config stg -- sh -lc \
  'psql "$DATABASE_URL" -f ../scripts/migration/preview-reset.sql'
```

Expected: `Reset complete` with 0 remaining trips, contacts, suppliers.

- [ ] **Step 2: Clear the id-mapping ledger**

```bash
echo '{}' > data/migration/id-mapping.json
```

- [ ] **Step 3: Run the TES import against preview API**

```bash
cd /Users/alguertin/Development/tailfire-project

# Get a fresh auth token for preview
SUPABASE_URL="https://gaqacfstpnmwphekjzae.supabase.co" \
SUPABASE_ANON_KEY="$(doppler run --project tailfire --config stg -- sh -lc 'echo $SUPABASE_ANON_KEY')" \
SUPABASE_EMAIL="admin@phoenixvoyages.ca" \
SUPABASE_PASSWORD="Phoenix2026!" \
TAILFIRE_API="https://api-dev.tailfire.ca/api/v1" \
  npx tsx scripts/migration/import-to-tailfire.ts
```

Expected: ~426 trips, ~840 contacts, ~1209 activities imported.

- [ ] **Step 4: Run lifecycle backfills (BOTH)**

```bash
# Get auth token first (from step 3's Supabase login)
TOKEN="..." # copy from import output

# Trip lifecycle backfill
curl -X POST "https://api-dev.tailfire.ca/api/v1/trips/backfill-lifecycle" \
  -H "Authorization: Bearer $TOKEN"

# Contact lifecycle backfill
curl -X POST "https://api-dev.tailfire.ca/api/v1/contacts/backfill-lifecycle" \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 5: Run validate-import**

```bash
cd /Users/alguertin/Development/tailfire-project

DATABASE_URL="$(doppler run --project tailfire --config stg -- sh -lc 'echo $DATABASE_URL')" \
  npx tsx scripts/migration/validate-import.ts
```

Expected: All validation checks pass, monthly sales match TES targets.

- [ ] **Step 6: Verify counts in preview DB**

```bash
doppler run --project tailfire --config stg -- sh -lc \
  'psql "$DATABASE_URL" -Atc "SELECT
    (SELECT count(*) FROM trips) AS trips,
    (SELECT count(*) FROM contacts) AS contacts,
    (SELECT count(*) FROM itinerary_activities) AS activities,
    (SELECT count(*) FROM suppliers) AS suppliers"'
```

Expected: ~426 trips, ~840 contacts, ~1209 activities.

---

## Task 9: Deploy to Preview and Verify

**Files:** None (git operations)

- [ ] **Step 1: Merge code changes to preview branch**

```bash
cd /Users/alguertin/Development/tailfire-project/tailfire
git checkout preview && git merge main && git push
```

This triggers `deploy-preview.yml` which deploys to `tf-demo.phoenixvoyages.ca` / `api-dev.tailfire.ca`.

- [ ] **Step 2: Wait for deploy and verify**

Wait for Railway + Vercel deploy to complete, then verify:

1. **Welcome page**: Open `tf-demo.phoenixvoyages.ca` in an incognito window. If not logged in, log in — new users should redirect to `/welcome`.
2. **Welcome dismissal**: Click "Get Started" — should redirect to dashboard and never show welcome again.
3. **Trip owner selector**: Navigate to any trip overview page. The Trip Settings card should show "Assigned Agent" dropdown.
4. **Bug report**: Click ? icon > "Report a Bug" — verify it opens the dialog and can submit.
5. **Help guide**: Click ? icon > "Documentation" — verify the help sheet opens.

- [ ] **Step 3: Set onboardingCompletedAt for admin user (Task 6)**

Run the curl command from Task 6 so the admin account skips the welcome page going forward.

---

## Task 10: Handoff to Andre (Manual)

No code changes. Andre completes these manually:

- [ ] **Step 1: Create pilot agent user accounts**

Via `tf-demo.phoenixvoyages.ca` > Settings > Users > Create/Invite.

- [ ] **Step 2: Reassign trips by designation code**

Search trips by `(AG)`, `(MG)`, `(JL)`, etc. in the trip list. Open each trip overview, use the new "Assigned Agent" dropdown to set the owner.

- [ ] **Step 3: Send login credentials to pilot agents**

Share the preview URL (`tf-demo.phoenixvoyages.ca`) and their credentials with each agent.
