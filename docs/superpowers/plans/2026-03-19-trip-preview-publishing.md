# Trip Preview & Publishing Fix

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the agent Preview button to show live draft data within the admin app (authenticated), fix Publish flow to copy the correct client URL, and extract shared trip-proposal UI components into a reusable package consumed by both admin and client apps.

**Architecture:** Extract the 26 client-app proposal components into a new `packages/trip-proposal-ui` package. Create an admin route `/trips/[id]/preview` that fetches live data via `GET /trips/:id/preview-proposal` (authenticated) and renders the shared components. Update the Preview button to navigate within the admin app instead of opening the client URL. Fix `getClientOrigin()` for the Publish button's copied link using `NEXT_PUBLIC_CLIENT_URL` env var.

**Tech Stack:** Next.js 15, React 18, Tailwind CSS, `@tailfire/ui-public` (shadcn/ui + phoenix preset), TanStack Query, Turbo monorepo

---

## Key Design Decisions

1. **Preview = admin-only, live data** — The Preview button navigates to `/trips/[id]/preview` within the admin app. Requires auth. Shows live (unpublished) itinerary data via `GET /trips/:id/preview-proposal`. No `shareToken` is created for preview.

2. **Publish = client-facing, snapshot data** — The Publish button creates snapshots and copies the client URL (`client.phoenixvoyages.ca` / `client-dev.phoenixvoyages.ca`). The client renders frozen snapshots via the public `GET /trips/share/{token}` endpoint.

3. **Shared components** — `packages/trip-proposal-ui` exports all presentation components. Both admin and client import from it. Zero drift between preview and published views.

4. **Component separation** — Presentation components (rendering trip data) go in the shared package. Interactive features that differ by context (comments, approval, activity responses) stay in each app with callbacks/props.

5. **Tailwind theme** — The shared package includes a Tailwind preset (`tripProposalPreset`) that defines the theme tokens the components need (`font-display`, `phoenix-charcoal`, `text-shadow-hero`). Both admin and client must import this preset.

6. **Admin preview layout** — The preview page opts out of the admin sidebar layout by using a route group `(preview)` or by rendering as a standalone full-width page. It should show the trip as clients will see it, with only a top banner for "Back to Editor."

7. **DaySection comment buttons** — `DaySection` in the shared package accepts a `renderDayCommentButton` render prop instead of directly importing the client-specific `DayCommentButton`. Same pattern for `ActivityCard` action buttons.

---

## File Structure

### New Package — `packages/trip-proposal-ui`

| File | Purpose |
|------|---------|
| `package.json` | Package config, peer deps (react, tailwind) |
| `tsconfig.json` | TypeScript config extending root |
| `src/index.ts` | Public exports |
| `src/components/ProposalHero.tsx` | Trip header with cover photo, dates, name |
| `src/components/AgentProfileCard.tsx` | Agent contact card |
| `src/components/ProposalShell.tsx` | Main layout shell (tabs, comparison views) — presentation only, callbacks for interactions |
| `src/components/ItineraryNav.tsx` | Multi-itinerary tab selector |
| `src/components/DaySection.tsx` | Day header + activities list |
| `src/components/ActivityCard.tsx` | Activity card — presentation + optional action slots |
| `src/components/ActivityDetailModal.tsx` | Full activity detail overlay |
| `src/components/PricingSummary.tsx` | Pricing breakdown |
| `src/components/SideBySideComparison.tsx` | Multi-itinerary comparison layout |
| `src/components/SummaryComparison.tsx` | Summary table comparison |
| `src/components/details/FlightDetail.tsx` | Flight-specific detail rendering |
| `src/components/details/LodgingDetail.tsx` | Lodging-specific detail rendering |
| `src/components/details/DiningDetail.tsx` | Dining-specific detail rendering |
| `src/components/details/TransportDetail.tsx` | Transportation detail rendering |
| `src/components/details/CruiseDetail.tsx` | Cruise detail rendering |
| `src/components/details/TourDetail.tsx` | Tour detail rendering |
| `src/components/details/PackageDetail.tsx` | Package detail rendering |
| `src/components/details/GenericDetail.tsx` | Fallback detail rendering |
| `src/components/details/PortInfoDetail.tsx` | Port info detail rendering (if exists) |
| `src/utils/activity-presentation.tsx` | Icons, status variants, currency formatting (includes inline PortInfo and Options detail renderers) |
| `src/tailwind.preset.ts` | Tailwind preset exporting theme tokens needed by shared components (`font-display`, `phoenix-charcoal`, `text-shadow-hero`) |

### Admin — New

| File | Purpose |
|------|---------|
| `apps/admin/src/app/trips/[id]/preview/page.tsx` | Admin preview route — fetches live data, renders shared components |

### Admin — Modify

| File | Purpose |
|------|---------|
| `apps/admin/src/app/trips/[id]/page.tsx` | Fix Preview button (navigate to admin route), fix `getClientOrigin()` |
| `apps/admin/src/hooks/use-trips.ts` | Add `usePreviewProposal(tripId)` hook |
| `apps/admin/package.json` | Add `@tailfire/trip-proposal-ui` dependency |
| `apps/admin/tailwind.config.ts` | Add trip-proposal-ui to content paths |

### Client — Modify

| File | Purpose |
|------|---------|
| `apps/client/src/app/shared/trips/[token]/page.tsx` | Import from shared package instead of local components |
| `apps/client/src/app/shared/trips/[token]/_components/ProposalClientShell.tsx` | Refactor to use shared ProposalShell + add client-specific interaction layer |
| `apps/client/package.json` | Add `@tailfire/trip-proposal-ui` dependency |
| `apps/client/tailwind.config.ts` | Add trip-proposal-ui to content paths |

### Doppler — Config

| Config | Variable | Value |
|--------|----------|-------|
| `dev` | `NEXT_PUBLIC_CLIENT_URL` | `http://localhost:3103` |
| `stg` | `NEXT_PUBLIC_CLIENT_URL` | `https://client-dev.phoenixvoyages.ca` |
| `prd` | `NEXT_PUBLIC_CLIENT_URL` | `https://client.phoenixvoyages.ca` |

---

## Chunk 1: Create Shared Package

### Task 1: Package scaffolding

- [ ] **Step 1: Create package directory and config files**

`packages/trip-proposal-ui/package.json`:
```json
{
  "name": "@tailfire/trip-proposal-ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./components": "./src/components/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "dependencies": {
    "@tailfire/shared-types": "workspace:*",
    "@tailfire/ui-public": "workspace:*",
    "lucide-react": "^0.454.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

`packages/trip-proposal-ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 2: Create index exports**

`packages/trip-proposal-ui/src/index.ts` — will export all components after they're moved.

- [ ] **Step 3: Run `pnpm install` from repo root to register the new workspace package**

- [ ] **Step 4: Commit**

### Task 2: Move presentation components from client to shared package

This is the core extraction. Move all pure-presentation components from `apps/client/src/app/shared/trips/[token]/_components/` to `packages/trip-proposal-ui/src/components/`.

- [ ] **Step 1: Move detail components** (pure presentation, no client-specific logic)

Move these files, updating imports as needed:
- `FlightDetail.tsx` → `packages/trip-proposal-ui/src/components/details/FlightDetail.tsx`
- `LodgingDetail.tsx` → same pattern
- `DiningDetail.tsx`, `TransportDetail.tsx`, `CruiseDetail.tsx`, `TourDetail.tsx`, `PackageDetail.tsx`, `GenericDetail.tsx`

Each file's internal imports change from relative `@tailfire/shared-types` (if used) to the package import. Most of these are self-contained — they receive a `detail` prop and render it.

- [ ] **Step 2: Move utility files**

- `activity-presentation.tsx` → `packages/trip-proposal-ui/src/utils/activity-presentation.tsx`

- [ ] **Step 3: Move layout/presentation components**

Move (with import updates):
- `ProposalHero.tsx` → `packages/trip-proposal-ui/src/components/ProposalHero.tsx`
- `AgentProfileCard.tsx` → same
- `ItineraryNav.tsx` → same
- `DaySection.tsx` → same
- `ActivityCard.tsx` → same
- `ActivityDetailModal.tsx` → same
- `PricingSummary.tsx` → same
- `SideBySideComparison.tsx` → same
- `SummaryComparison.tsx` → same

For components that use client-specific hooks (comments, responses), refactor to accept callbacks via props instead of calling hooks directly. The hooks stay in each app.

**Critical refactors during move:**
- `DaySection.tsx` directly imports `DayCommentButton` — replace with a `renderDayCommentButton` render prop
- `ActivityCard.tsx` may import client-specific action components — replace with `renderActions` render prop
- `activity-presentation.tsx` contains inline `PortInfoDetail` and `OptionsDetail` renderers — keep them inline in the utility file (they're small)

- [ ] **Step 4: Create ProposalShell.tsx** — extract the core layout/state from `ProposalClientShell.tsx`

The shell manages: active tab selection, view mode (tabs/compare/summary), selected activity for detail modal. It does NOT manage: comments, activity responses, approval. Those are passed as render props or callbacks.

```typescript
// packages/trip-proposal-ui/src/components/ProposalShell.tsx
interface ProposalShellProps {
  trip: SharedTripProposalDto
  /** Render function for interaction layer (comments, approval, responses) */
  renderInteractions?: (props: { itineraryId: string }) => React.ReactNode
  /** Render function for activity action buttons (confirm/decline) */
  renderActivityActions?: (props: { activityId: string, itineraryId: string }) => React.ReactNode
  /** Whether to show pricing */
  showPricing?: boolean
  /** Whether this is a preview (hides approval section) */
  isPreview?: boolean
}
```

- [ ] **Step 5: Create package exports**

`packages/trip-proposal-ui/src/index.ts`:
```typescript
export { ProposalHero } from './components/ProposalHero'
export { AgentProfileCard } from './components/AgentProfileCard'
export { ProposalShell } from './components/ProposalShell'
export type { ProposalShellProps } from './components/ProposalShell'
export { ItineraryNav } from './components/ItineraryNav'
export { DaySection } from './components/DaySection'
export { ActivityCard } from './components/ActivityCard'
export { ActivityDetailModal } from './components/ActivityDetailModal'
export { PricingSummary } from './components/PricingSummary'
export { SideBySideComparison } from './components/SideBySideComparison'
export { SummaryComparison } from './components/SummaryComparison'
// Detail components
export { FlightDetail } from './components/details/FlightDetail'
export { LodgingDetail } from './components/details/LodgingDetail'
// ... etc
// Utils
export { getActivityIcon, getStatusVariant, formatCurrency } from './utils/activity-presentation'
```

- [ ] **Step 6: Verify types** — `pnpm turbo typecheck --filter=@tailfire/trip-proposal-ui` (no build script needed — consuming apps transpile source directly, matching `@tailfire/ui-public` pattern)

- [ ] **Step 7: Commit**

### Task 3: Update client app to use shared package

- [ ] **Step 1: Add dependency to client app**

In `apps/client/package.json`, add: `"@tailfire/trip-proposal-ui": "workspace:*"`

- [ ] **Step 2: Update `apps/client/tailwind.config.ts`** — add package to content paths:

```typescript
content: [
  "./src/**/*.{ts,tsx}",
  "../../packages/ui-public/src/**/*.{ts,tsx}",
  "../../packages/trip-proposal-ui/src/**/*.{ts,tsx}",  // Add this
],
```

- [ ] **Step 3: Update client page.tsx** — import from shared package:

```typescript
import { ProposalHero, AgentProfileCard } from '@tailfire/trip-proposal-ui'
```

- [ ] **Step 4: Update ProposalClientShell.tsx** — import shared components, keep client-specific hooks (comments, responses, approval) local:

```typescript
import { ProposalShell, DaySection, ActivityCard } from '@tailfire/trip-proposal-ui'
// Client-specific hooks remain local
import { useProposalComments } from './useProposalComments'
import { useActivityResponses } from './useActivityResponses'
```

- [ ] **Step 5: Delete moved component files from client** (they now live in the shared package)

Keep in `_components/`:
- `ProposalClientShell.tsx` (client-specific wrapper using shared ProposalShell)
- `useProposalComments.ts` (client-specific hook)
- `useActivityResponses.ts` (client-specific hook)
- `ApprovalSection.tsx` (client-specific — approval/decline buttons)
- `CommentThread.tsx` (client-specific — comment display)
- `ActivityCommentButton.tsx` (client-specific)
- `DayCommentButton.tsx` (client-specific)

- [ ] **Step 6: Verify client builds** — `pnpm turbo build --filter=@tailfire/client`

- [ ] **Step 7: Commit**

---

## Chunk 2: Admin Preview Route

### Task 4: Add preview-proposal hook to admin

- [ ] **Step 1: Add `usePreviewProposal` hook**

In `apps/admin/src/hooks/use-trips.ts`:
```typescript
export function usePreviewProposal(tripId: string | undefined) {
  return useQuery({
    queryKey: tripKeys.detail(tripId!, 'preview-proposal'),
    queryFn: () => api.get<SharedTripProposalDto>(`/trips/${tripId}/preview-proposal`),
    enabled: !!tripId,
  })
}
```

Import `SharedTripProposalDto` from `@tailfire/shared-types`.

- [ ] **Step 2: Commit**

### Task 5: Create admin preview page

- [ ] **Step 1: Add dependency**

In `apps/admin/package.json`, add: `"@tailfire/trip-proposal-ui": "workspace:*"`

- [ ] **Step 2: Update `apps/admin/tailwind.config.ts`** — add package to content paths AND import the trip-proposal preset:

```typescript
import { tripProposalPreset } from "@tailfire/trip-proposal-ui/tailwind.preset"

const config: Config = {
  presets: [tripProposalPreset],  // Add preset for shared component theme tokens
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui-public/src/**/*.{ts,tsx}",        // Ensure ui-public is scanned
    "../../packages/trip-proposal-ui/src/**/*.{ts,tsx}",  // Add shared package
  ],
  // ... existing theme/plugins
}
```

- [ ] **Step 3: Create `apps/admin/src/app/trips/[id]/preview/page.tsx`**

```typescript
'use client'

import { useParams, useRouter } from 'next/navigation'
import { ProposalHero, AgentProfileCard, ProposalShell } from '@tailfire/trip-proposal-ui'
import { usePreviewProposal } from '@/hooks/use-trips'
import { Button } from '@tailfire/ui-public'
import { ArrowLeft, Eye } from 'lucide-react'

export default function TripPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string
  const { data: trip, isLoading, error } = usePreviewProposal(tripId)

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading preview...</div>
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Preview Unavailable</h1>
          <p className="text-muted-foreground mb-4">Could not load trip preview.</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Trip
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner */}
      <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            Preview Mode — This is how the trip will appear to clients
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push(`/trips/${tripId}?tab=itinerary`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Editor
        </Button>
      </div>

      <ProposalHero
        name={trip.name}
        description={trip.description}
        tripType={trip.tripType}
        startDate={trip.startDate}
        endDate={trip.endDate}
        coverPhotoUrl={trip.coverPhotoUrl}
      />
      {trip.agent && <AgentProfileCard agent={trip.agent} />}
      <ProposalShell trip={trip} isPreview={true} showPricing={trip.pricingVisible} />
      <div className="pb-16" />
    </div>
  )
}
```

- [ ] **Step 4: Verify it builds** — `pnpm turbo build --filter=@tailfire/admin`

- [ ] **Step 5: Commit**

### Task 6: Update Preview button and fix client URL

- [ ] **Step 1: Update `handlePreview` in `apps/admin/src/app/trips/[id]/page.tsx`**

Replace the current popup-based preview with an in-app navigation:

```typescript
const handlePreview = () => {
  if (!trip) return
  router.push(`/trips/${trip.id}/preview`)
}
```

Remove the `getClientOrigin()` usage from `handlePreview`. Keep it only for `handlePublish` and `handleCopyShareLink`.

- [ ] **Step 2: Fix `getClientOrigin()` for Publish button**

```typescript
const getClientOrigin = () => {
  if (process.env.NEXT_PUBLIC_CLIENT_URL) return process.env.NEXT_PUBLIC_CLIENT_URL
  const origin = window.location.origin
  if (origin.includes(':3100')) return origin.replace(':3100', ':3103')
  if (origin.includes('tailfire.phoenixvoyages.ca')) return 'https://client.phoenixvoyages.ca'
  // Fallback: try subdomain swap (e.g., tf-demo → tf-demo-client, admin → client)
  return origin.replace('admin', 'client')
}
```

- [ ] **Step 3: Commit**

---

## Chunk 3: Environment Configuration

### Task 7: Set NEXT_PUBLIC_CLIENT_URL in Doppler

- [ ] **Step 1: Set in Doppler `dev` config**

```
NEXT_PUBLIC_CLIENT_URL = http://localhost:3103
```

- [ ] **Step 2: Set in Doppler `stg` config**

```
NEXT_PUBLIC_CLIENT_URL = https://client-dev.phoenixvoyages.ca
```

- [ ] **Step 3: Set in Doppler `prd` config**

```
NEXT_PUBLIC_CLIENT_URL = https://client.phoenixvoyages.ca
```

- [ ] **Step 4: Add to local `.env` file for dev**

In `apps/admin/.env.local` (or `apps/admin/.env`):
```
NEXT_PUBLIC_CLIENT_URL=http://localhost:3103
```

- [ ] **Step 5: Commit any .env.example updates**

---

## Summary

| Task | What | Depends On |
|------|------|------------|
| 1 | Package scaffolding (`@tailfire/trip-proposal-ui`) | — |
| 2 | Move client components to shared package | 1 |
| 3 | Update client app to use shared package | 2 |
| 4 | Add `usePreviewProposal` hook to admin | — |
| 5 | Create admin preview page | 1, 2, 4 |
| 6 | Update Preview button + fix client URL | 5 |
| 7 | Set Doppler env vars | — |

**Dependencies:**
- Tasks 1-3 are sequential (package → move → update client)
- Task 4 is independent (just a hook)
- Task 5 depends on 1, 2, 4 (needs package + hook)
- Task 6 depends on 5
- Task 7 is independent (env config)

---

## Risk Mitigation

1. **Component extraction may break client app** — Task 3 verifies the client still builds. If imports break, fix them before moving to admin integration.

2. **ProposalShell refactor is the hardest task** — The current `ProposalClientShell` mixes presentation with client-specific interaction (comments, responses). The extraction in Task 2 Step 4 requires carefully separating these concerns. If too complex, keep ProposalShell simpler and have each app build its own shell using the smaller shared components (DaySection, ActivityCard, etc.).

3. **Tailwind content paths** — Both apps must include the shared package in their Tailwind content config, or styles won't be extracted. Tasks 3 and 5 handle this.

4. **`useRouter` in preview page** — The admin uses Next.js App Router. The preview page is a client component (`'use client'`) because it needs `usePreviewProposal` (React Query hook). This is standard for the admin app.
