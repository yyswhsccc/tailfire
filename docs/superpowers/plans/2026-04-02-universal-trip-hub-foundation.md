# Universal Trip Hub — Foundation + Destination Vertical

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared HubScaffold + section registry + CruiseProductCard and migrate the destination page as the first vertical proof of the new architecture.

**Architecture:** Entity pages become thin route files that fetch data, pass it through a typed adapter, and render via `HubScaffold`. The scaffold uses a section registry to map section descriptors to Suspense-wrapped Server Components. Cards render instantly with cached data; prices stream in progressively.

**Tech Stack:** Next.js 15 App Router (Server Components, Suspense), TypeScript, Tailwind CSS, Zustand (trip basket), existing `next/image` via SafeImage

**Spec:** `docs/superpowers/specs/2026-04-02-universal-trip-hub-shared-architecture-design.md`

**Scope:** This is Plan 1 of 4. It produces the foundation infrastructure and migrates the destination page. Plans 2-4 cover remaining cards, entity migrations, and AI/auth integration.

---

## File Structure

### New Files (create)

| File | Responsibility |
|------|---------------|
| `apps/ota/src/lib/entity-hubs/types.ts` | All shared types: HeroData, ContextPill, SectionDescriptor, HubAdapter, EntityType, BrowsingSignals, AiPageContext |
| `apps/ota/src/lib/entity-hubs/section-registry.ts` | Maps section keys → imported components + skeleton config |
| `apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts` | Transforms DestinationDetail → HubScaffoldProps |
| `apps/ota/src/components/hub/hub-scaffold.tsx` | Shared page shell: hero → pills → AI prompt → sections → related |
| `apps/ota/src/components/hub/hub-context-pills.tsx` | Scrollable context pills bar |
| `apps/ota/src/components/hub/hub-section-renderer.tsx` | Maps SectionDescriptor[] → Suspense-wrapped section components |
| `apps/ota/src/components/cards/product-card-frame.tsx` | Shared card chrome: image area, content slot, price row with shimmer, AddToTrip |
| `apps/ota/src/components/cards/price-shimmer.tsx` | Shimmer placeholder for price area (fixed-width, prevents CLS) |
| `apps/ota/src/components/cards/cruise-product-card.tsx` | Unified cruise card with full/compact/mini variants + AddToTrip |
| `apps/ota/src/components/hub/sections/cruises-section.tsx` | Shared cruises section (replaces destination-specific one) |
| `apps/ota/src/components/hub/sections/destinations-section.tsx` | Destinations grid for nearby/related |
| `apps/ota/src/components/hub/sections/photos-section.tsx` | Photo mosaic section (moved from destination-specific) |
| `apps/ota/src/components/hub/sections/activities-section.tsx` | Activities section (moved from destination-specific) |

### Modified Files

| File | Change |
|------|--------|
| `apps/ota/src/components/hub/section-skeleton.tsx` | Add skeleton variants (grid-2, grid-3, banner, mosaic) |
| `apps/ota/src/app/destinations/[slug]/page.tsx` | Rewrite to thin route using adapter + HubScaffold |

### Preserved (no changes)

| File | Why |
|------|-----|
| `apps/ota/src/components/hub/hub-hero.tsx` | HubScaffold wraps it, no changes needed |
| `apps/ota/src/components/hub/feed-section.tsx` | Used inside section components |
| `apps/ota/src/components/hub/feed-divider.tsx` | Used by HubSectionRenderer |
| `apps/ota/src/components/hub/safe-image.tsx` | Used by cards and hero |
| `apps/ota/src/components/trip-builder/add-to-trip-button.tsx` | Used by product cards |
| `apps/ota/src/components/page-context-bridge.tsx` | Used by HubScaffold |

---

### Task 1: Foundation Types

**Files:**
- Create: `apps/ota/src/lib/entity-hubs/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/ota/src/lib/entity-hubs/types.ts

import type { ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export type EntityType = 'destination' | 'ship' | 'sailing' | 'cruise_line' | 'region' | 'deal'

// ---------------------------------------------------------------------------
// HubScaffold props
// ---------------------------------------------------------------------------

export interface HubScaffoldProps {
  hero: HeroData
  contextPills: ContextPill[]
  sections: SectionDescriptor[]
  aiContext: AiPageContext
  entityType: EntityType
  entitySlug: string
}

export interface HeroData {
  imageUrl: string | null
  fallbackGradient?: string
  badge: string
  urgencyBadge?: string
  title: string
  subtitle?: string
  description?: string
  ctaLabel?: string
}

export interface ContextPill {
  label: string
  icon?: string
  accent?: boolean
  href?: string
}

// ---------------------------------------------------------------------------
// Section system
// ---------------------------------------------------------------------------

export interface SectionDescriptor {
  key: string
  title: string
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string
  props: Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

export interface SectionEntry {
  component: ComponentType<SectionComponentProps>
  skeleton: SkeletonVariant
}

export interface SectionComponentProps {
  entityType: EntityType
  entitySlug: string
  title: string
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string
  sectionProps: Record<string, unknown>
}

export type SkeletonVariant = 'grid-2' | 'grid-3' | 'grid-4' | 'banner' | 'mosaic' | 'scroll' | 'timeline' | 'single'

// ---------------------------------------------------------------------------
// Browsing signals (optional in v1)
// ---------------------------------------------------------------------------

export interface BrowsingSignals {
  basketComponentTypes: string[]
  recentEntityTypes: string[]
  detectedAirport?: string
}

// ---------------------------------------------------------------------------
// AI context
// ---------------------------------------------------------------------------

export interface AiPageContext {
  entityType: EntityType
  entityName: string
  entitySlug: string
  availableProducts?: { type: string; count: number }[]
  detectedAirport?: string
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface HubAdapter<T> {
  heroData: (entity: T) => HeroData
  contextPills: (entity: T, counts?: Record<string, number>) => ContextPill[]
  sections: (entity: T, signals?: BrowsingSignals) => SectionDescriptor[]
  aiContext: (entity: T) => AiPageContext
}

// ---------------------------------------------------------------------------
// Card variant type
// ---------------------------------------------------------------------------

export type CardVariant = 'full' | 'compact' | 'mini'
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from entity-hubs/types.ts

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/lib/entity-hubs/types.ts
git commit -m "feat(ota): add foundation types for Universal Trip Hub"
```

---

### Task 2: Section Skeleton Variants

**Files:**
- Modify: `apps/ota/src/components/hub/section-skeleton.tsx`

- [ ] **Step 1: Extend section-skeleton with variants**

Replace the entire file:

```typescript
// apps/ota/src/components/hub/section-skeleton.tsx

import type { SkeletonVariant } from '@/lib/entity-hubs/types'

interface SectionSkeletonProps {
  variant?: SkeletonVariant
  /** @deprecated Use variant instead. Kept for backward compat during migration. */
  cardCount?: number
}

function ShimmerBox({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />
}

export function SectionSkeleton({ variant, cardCount }: SectionSkeletonProps) {
  // Backward compat: if cardCount is passed without variant, infer variant
  const resolved = variant ?? (cardCount === 2 ? 'grid-2' : 'grid-3')

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-10 lg:px-[60px]">
      {/* Header shimmer */}
      <ShimmerBox className="mb-4 h-5 w-48" />

      {/* Grid layouts */}
      {resolved === 'grid-2' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-64" />
          ))}
        </div>
      )}
      {resolved === 'grid-3' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ShimmerBox key={i} className="h-48" />
          ))}
        </div>
      )}
      {resolved === 'grid-4' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-40" />
          ))}
        </div>
      )}
      {resolved === 'banner' && <ShimmerBox className="h-32" />}
      {resolved === 'mosaic' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ShimmerBox className="col-span-2 row-span-2 h-64 sm:col-span-1" />
          <ShimmerBox className="h-32" />
          <ShimmerBox className="h-32" />
        </div>
      )}
      {resolved === 'scroll' && (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-48 w-64 shrink-0" />
          ))}
        </div>
      )}
      {resolved === 'timeline' && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ShimmerBox key={i} className="h-12" />
          ))}
        </div>
      )}
      {resolved === 'single' && <ShimmerBox className="h-96" />}
    </div>
  )
}
```

- [ ] **Step 2: Verify no regressions (existing usage passes cardCount)**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors — cardCount is still accepted

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/hub/section-skeleton.tsx
git commit -m "feat(ota): add skeleton variants for section registry"
```

---

### Task 3: Price Shimmer Component

**Files:**
- Create: `apps/ota/src/components/cards/price-shimmer.tsx`

- [ ] **Step 1: Create price shimmer placeholder**

```typescript
// apps/ota/src/components/cards/price-shimmer.tsx
'use client'

interface PriceShimmerProps {
  className?: string
}

/**
 * Fixed-width shimmer placeholder for card price area.
 * Prevents CLS when price data streams in.
 */
export function PriceShimmer({ className }: PriceShimmerProps) {
  return (
    <span className={`inline-block h-6 w-20 animate-pulse rounded-md bg-muted ${className ?? ''}`} />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/cards/price-shimmer.tsx
git commit -m "feat(ota): add PriceShimmer component for progressive card rendering"
```

---

### Task 4: CruiseProductCard (Unified)

**Files:**
- Create: `apps/ota/src/components/cards/cruise-product-card.tsx`

This replaces both `hub/cards/cruise-card.tsx` (read-only) and the cruise portion of `search/cruise-result-card.tsx` (shoppable). All three variants in one file.

- [ ] **Step 1: Create the unified cruise product card**

```typescript
// apps/ota/src/components/cards/cruise-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface CruiseProductCardProps {
  id: string
  name: string
  shipName: string
  shipImageUrl: string | null
  cruiseLineName: string
  sailDate: string
  nights: number
  route?: string
  /** Price in cents — null means "still loading" */
  priceCents?: number | null
  /** If true, show shimmer instead of price */
  priceLoading?: boolean
  savingsLabel?: string
  originalPriceCents?: number | null
  variant?: CardVariant
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(cents / 100)
}

function buildTripComponent(props: CruiseProductCardProps): TripComponent {
  return {
    id: `cruise-${props.id}`,
    type: 'cruise',
    data: { sailingId: props.id, shipName: props.shipName, cruiseLine: props.cruiseLineName, nights: props.nights, sailDate: props.sailDate },
    display: {
      heroImage: props.shipImageUrl ?? undefined,
      title: props.name,
      subtitle: `${props.cruiseLineName} · ${props.shipName} · ${props.nights}N`,
      price: props.priceCents != null ? formatPrice(props.priceCents) : undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// Full variant — hero image, details, price + AddToTrip
// ---------------------------------------------------------------------------

function CruiseFull(props: CruiseProductCardProps) {
  const dateStr = new Date(props.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/cruises/${props.id}`} className="block">
        <div className="relative h-48 overflow-hidden sm:h-52">
          <SafeImage
            src={props.shipImageUrl}
            alt={props.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-2xl text-[#C59746]">🚢</div>}
          />
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
            🚢 {props.nights} Nights
          </span>
          <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
            {props.cruiseLineName}
          </span>
          {props.savingsLabel && (
            <span className="absolute left-2.5 top-2.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
              {props.savingsLabel}
            </span>
          )}
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <Link href={`/cruises/${props.id}`}>
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{props.name}</h3>
          <p className="mt-1 text-sm text-[#888]">{props.shipName} · {dateStr}</p>
          {props.route && <p className="mt-1 text-xs text-[#aaa]">{props.route}</p>}
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div>
            {priceLoading ? (
              <PriceShimmer />
            ) : props.priceCents != null ? (
              <>
                {props.originalPriceCents != null && (
                  <span className="mr-2 text-sm text-[#aaa] line-through">{formatPrice(props.originalPriceCents)}</span>
                )}
                <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(props.priceCents)}</span>
                <span className="ml-1 text-xs text-[#888]">/person</span>
              </>
            ) : (
              <span className="text-sm text-[#888]">Check price →</span>
            )}
          </div>
          <AddToTripButton component={buildTripComponent(props)} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact variant — horizontal thumbnail + summary
// ---------------------------------------------------------------------------

function CruiseCompact(props: CruiseProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link href={`/cruises/${props.id}`} className="relative w-24 shrink-0 sm:w-28">
        <SafeImage
          src={props.shipImageUrl}
          alt={props.name}
          fill
          className="object-cover"
          sizes="112px"
          fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-lg text-[#C59746]">🚢</div>}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href={`/cruises/${props.id}`}>
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">{props.name}</p>
          <p className="mt-0.5 text-xs text-[#888]">{props.cruiseLineName} · {props.nights}N</p>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.priceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">{formatPrice(props.priceCents)}</span>
          ) : (
            <span className="text-xs text-[#888]">Check price</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini variant — icon + text (basket, AI confirmations)
// ---------------------------------------------------------------------------

function CruiseMini(props: CruiseProductCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">🚢</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">{props.name} · {props.nights}N</p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export — variant switch
// ---------------------------------------------------------------------------

export function CruiseProductCard({ variant = 'full', ...props }: CruiseProductCardProps) {
  switch (variant) {
    case 'compact': return <CruiseCompact {...props} />
    case 'mini': return <CruiseMini {...props} />
    default: return <CruiseFull {...props} />
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/cards/cruise-product-card.tsx
git commit -m "feat(ota): add unified CruiseProductCard with full/compact/mini variants"
```

---

### Task 5: Shared CruisesSection

**Files:**
- Create: `apps/ota/src/components/hub/sections/cruises-section.tsx`

This replaces `app/destinations/[slug]/sections/cruises-section.tsx` with a shared version that works across entity types.

- [ ] **Step 1: Create the shared cruises section**

```typescript
// apps/ota/src/components/hub/sections/cruises-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { CruiseProductCard } from '@/components/cards/cruise-product-card'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function CruisesSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  // Determine fetch strategy based on entity type
  let sailings: any[] = []
  let total = 0

  try {
    if (entityType === 'destination') {
      const data = await fetchDestinationCruises(entitySlug, 1, 4)
      sailings = data.sailings
      total = data.total
    }
    // Future: add ship, cruise_line, region fetchers here
  } catch {
    return null
  }

  if (sailings.length === 0) return null

  const resolvedSubtitle = subtitle ?? `${total} sailings`
  const resolvedViewAll = viewAllLabel ?? `View all ${total} →`

  return (
    <FeedSection
      title={title}
      subtitle={resolvedSubtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={resolvedViewAll}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {sailings.slice(0, 4).map((s: any) => (
          <CruiseProductCard
            key={s.id}
            id={s.id}
            name={s.name}
            shipName={s.shipName}
            shipImageUrl={s.shipImageUrl}
            cruiseLineName={s.cruiseLineName}
            sailDate={s.sailDate}
            nights={s.nights}
            priceCents={s.cheapestInsideCents}
          />
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/hub/sections/cruises-section.tsx
git commit -m "feat(ota): add shared CruisesSection for section registry"
```

---

### Task 6: Shared ActivitiesSection, PhotosSection, DestinationsSection

**Files:**
- Create: `apps/ota/src/components/hub/sections/activities-section.tsx`
- Create: `apps/ota/src/components/hub/sections/photos-section.tsx`
- Create: `apps/ota/src/components/hub/sections/destinations-section.tsx`

These are thin wrappers that adapt the existing destination-specific sections to the SectionComponentProps contract.

- [ ] **Step 1: Create shared ActivitiesSection**

```typescript
// apps/ota/src/components/hub/sections/activities-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function ActivitiesSection({
  title,
  subtitle,
  sectionProps,
}: SectionComponentProps) {
  const activities = (sectionProps.activities as any[]) ?? []
  if (activities.length === 0) return null

  return (
    <FeedSection title={title} subtitle={subtitle}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activities.slice(0, 6).map((a: any, i: number) => (
          <div key={i} className="rounded-xl border border-[#f0f0f0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">{a.name}</h3>
            {a.category && <p className="mt-1 text-xs text-[#888]">{a.category}</p>}
            {a.rating != null && (
              <p className="mt-1 text-xs text-[#C59746]">⭐ {a.rating.toFixed(1)}</p>
            )}
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 2: Create shared PhotosSection**

```typescript
// apps/ota/src/components/hub/sections/photos-section.tsx

import Image from 'next/image'
import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function PhotosSection({
  title,
  sectionProps,
}: SectionComponentProps) {
  const photos = (sectionProps.photos as any[]) ?? []
  if (photos.length === 0) return null

  return (
    <FeedSection title={title}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.slice(0, 6).map((p: any, i: number) => (
          <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-xl">
            <Image
              src={p.url}
              alt={p.caption || 'Photo'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 3: Create shared DestinationsSection**

```typescript
// apps/ota/src/components/hub/sections/destinations-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import { DestinationCard } from '@/components/destinations/destination-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function DestinationsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinations = (sectionProps.destinations as any[]) ?? []
  if (destinations.length === 0) return null

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {destinations.slice(0, 6).map((d: any) => (
          <div key={d.slug} className="w-64 shrink-0 sm:w-auto">
            <DestinationCard destination={d} />
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/hub/sections/activities-section.tsx apps/ota/src/components/hub/sections/photos-section.tsx apps/ota/src/components/hub/sections/destinations-section.tsx
git commit -m "feat(ota): add shared Activities, Photos, Destinations sections"
```

---

### Task 7: Section Registry

**Files:**
- Create: `apps/ota/src/lib/entity-hubs/section-registry.ts`

- [ ] **Step 1: Create the registry with static imports**

```typescript
// apps/ota/src/lib/entity-hubs/section-registry.ts

import type { SectionEntry } from './types'
import { CruisesSection } from '@/components/hub/sections/cruises-section'
import { ActivitiesSection } from '@/components/hub/sections/activities-section'
import { PhotosSection } from '@/components/hub/sections/photos-section'
import { DestinationsSection } from '@/components/hub/sections/destinations-section'

// Section components are async Server Components.
// Static imports + per-section Suspense boundaries.
// Do NOT use React.lazy() — it's a client-side API.
export const SECTION_REGISTRY: Record<string, SectionEntry> = {
  cruises:      { component: CruisesSection as any,      skeleton: 'grid-2' },
  activities:   { component: ActivitiesSection as any,   skeleton: 'grid-3' },
  photoMosaic:  { component: PhotosSection as any,       skeleton: 'mosaic' },
  destinations: { component: DestinationsSection as any, skeleton: 'grid-3' },
  // Future sections added by Plan 2:
  // flights, hotels, tours, offers, sailings, cabinCategories,
  // deckPlans, itinerary, nearby, ships
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/lib/entity-hubs/section-registry.ts
git commit -m "feat(ota): add section registry with static imports"
```

---

### Task 8: HubSectionRenderer

**Files:**
- Create: `apps/ota/src/components/hub/hub-section-renderer.tsx`

- [ ] **Step 1: Create the section renderer**

```typescript
// apps/ota/src/components/hub/hub-section-renderer.tsx

import { Suspense } from 'react'
import { SECTION_REGISTRY } from '@/lib/entity-hubs/section-registry'
import { SectionSkeleton } from './section-skeleton'
import { FeedDivider } from './feed-divider'
import type { SectionDescriptor, EntityType } from '@/lib/entity-hubs/types'

interface HubSectionRendererProps {
  sections: SectionDescriptor[]
  entityType: EntityType
  entitySlug: string
}

export function HubSectionRenderer({ sections, entityType, entitySlug }: HubSectionRendererProps) {
  return (
    <>
      {sections.map((descriptor, index) => {
        const entry = SECTION_REGISTRY[descriptor.key]
        if (!entry) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[HubSectionRenderer] No registry entry for section key: "${descriptor.key}"`)
          }
          return null
        }

        const SectionComponent = entry.component

        return (
          <div key={descriptor.key}>
            {index > 0 && <FeedDivider />}
            <Suspense fallback={<SectionSkeleton variant={entry.skeleton} />}>
              <SectionComponent
                entityType={entityType}
                entitySlug={entitySlug}
                title={descriptor.title}
                subtitle={descriptor.subtitle}
                viewAllHref={descriptor.viewAllHref}
                viewAllLabel={descriptor.viewAllLabel}
                sectionProps={descriptor.props}
              />
            </Suspense>
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/hub/hub-section-renderer.tsx
git commit -m "feat(ota): add HubSectionRenderer with per-section Suspense"
```

---

### Task 9: HubContextPills

**Files:**
- Create: `apps/ota/src/components/hub/hub-context-pills.tsx`

- [ ] **Step 1: Create the scrollable pills component**

```typescript
// apps/ota/src/components/hub/hub-context-pills.tsx

import type { ContextPill } from '@/lib/entity-hubs/types'

interface HubContextPillsProps {
  pills: ContextPill[]
  children?: React.ReactNode  // Slot for AI prompt on desktop
}

export function HubContextPills({ pills, children }: HubContextPillsProps) {
  if (pills.length === 0 && !children) return null

  return (
    <div className="border-b border-[#E0E0E0]">
      <div className="mx-auto flex max-w-[1280px] items-center gap-2.5 overflow-x-auto px-4 py-3 sm:flex-wrap sm:overflow-visible sm:px-10 lg:px-[60px]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {pills.map((pill, i) => (
          <span
            key={i}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              pill.accent
                ? 'border-[#C59746]/35 bg-[#C59746]/12 text-[#C59746] font-semibold'
                : 'border-[#E0E0E0] bg-[#faf6f0] text-[#1A1A1A]'
            }`}
          >
            {pill.icon && <span>{pill.icon}</span>}
            {pill.label}
          </span>
        ))}
        {/* Desktop AI prompt slot */}
        {children && <div className="ml-auto hidden sm:block">{children}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/hub/hub-context-pills.tsx
git commit -m "feat(ota): add HubContextPills with scrollable mobile + wrap desktop"
```

---

### Task 10: HubScaffold

**Files:**
- Create: `apps/ota/src/components/hub/hub-scaffold.tsx`

- [ ] **Step 1: Create the shared scaffold**

```typescript
// apps/ota/src/components/hub/hub-scaffold.tsx

import { HubHero } from './hub-hero'
import { HubHeroMeta } from './hub-hero-meta'
import { HubHeroCta } from './hub-hero-cta'
import { HubContextPills } from './hub-context-pills'
import { HubSectionRenderer } from './hub-section-renderer'
import { PageContextBridge } from '@/components/page-context-bridge'
import type { HubScaffoldProps } from '@/lib/entity-hubs/types'

export function HubScaffold({
  hero,
  contextPills,
  sections,
  aiContext,
  entityType,
  entitySlug,
}: HubScaffoldProps) {
  return (
    <>
      <PageContextBridge
        type={entityType === 'cruise_line' ? 'cruise_line' : entityType}
        slug={entitySlug}
        name={hero.title}
      />

      <HubHero
        title={hero.title}
        badge={hero.badge}
        subtitle={hero.subtitle}
        imageUrl={hero.imageUrl}
        urgencyBadge={hero.urgencyBadge}
      >
        {hero.description && (
          <p className="mt-2 hidden max-w-xl text-sm text-white/80 lg:block">{hero.description}</p>
        )}
        <HubHeroCta
          primaryLabel={hero.ctaLabel ?? `Plan a Trip to ${hero.title}`}
          primaryPrompt={`Help me plan a trip to ${hero.title}`}
          entityType={entityType}
          entitySlug={entitySlug}
          entityName={hero.title}
        />
      </HubHero>

      <HubContextPills pills={contextPills} />

      <div className="py-8">
        <HubSectionRenderer
          sections={sections}
          entityType={entityType}
          entitySlug={entitySlug}
        />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/hub/hub-scaffold.tsx
git commit -m "feat(ota): add HubScaffold — shared entity page shell"
```

---

### Task 11: Destination Adapter

**Files:**
- Create: `apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts`

- [ ] **Step 1: Create the destination adapter**

```typescript
// apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts

import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext, BrowsingSignals } from '../types'

// Uses DestinationDetail from the fetcher response
interface DestinationEntity {
  name: string
  slug: string
  countryCode?: string
  heroImageUrl?: string | null
  summary?: string
  destinationType?: string
  enrichment?: {
    summary?: string
    averageRating?: number
    totalReviewCount?: number
    photos?: Array<{ url: string; caption?: string }>
    attractions?: Array<{ name: string; category?: string; rating?: number }>
  }
}

export const destinationAdapter: HubAdapter<DestinationEntity> = {
  heroData(dest): HeroData {
    const heroImage = dest.heroImageUrl ?? dest.enrichment?.photos?.[0]?.url ?? null
    return {
      imageUrl: heroImage,
      badge: dest.countryCode ? `${dest.countryCode} · DESTINATION` : 'DESTINATION',
      title: dest.name,
      subtitle: dest.enrichment?.averageRating
        ? `⭐ ${dest.enrichment.averageRating.toFixed(1)} · ${dest.enrichment.totalReviewCount?.toLocaleString() ?? ''} reviews`
        : undefined,
      description: dest.enrichment?.summary ?? dest.summary,
      ctaLabel: `Plan a Trip to ${dest.name}`,
    }
  },

  contextPills(dest, counts): ContextPill[] {
    const pills: ContextPill[] = []
    if (counts?.cruises) pills.push({ icon: '🚢', label: `${counts.cruises} Cruises` })
    if (counts?.flights) pills.push({ icon: '✈️', label: `${counts.flights} Flights` })
    if (counts?.hotels) pills.push({ icon: '🏨', label: `${counts.hotels} Hotels` })
    if (counts?.tours) pills.push({ icon: '🏞', label: `${counts.tours} Tours` })
    if (counts?.offers) pills.push({ icon: '⭐', label: `${counts.offers} Offers`, accent: true })
    if (dest.countryCode) pills.push({ icon: '📍', label: dest.countryCode })
    return pills
  },

  sections(dest, signals): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []

    // Cruises visiting this destination
    sections.push({
      key: 'cruises',
      title: `🚢 Cruises Visiting ${dest.name}`,
      viewAllHref: `/destinations/${dest.slug}/cruises`,
      props: {},
      priority: 'high',
    })

    // Activities from enrichment
    if (dest.enrichment?.attractions?.length) {
      sections.push({
        key: 'activities',
        title: `🏄 Things to Do in ${dest.name}`,
        props: { activities: dest.enrichment.attractions },
        priority: 'medium',
      })
    }

    // Photos from enrichment
    if (dest.enrichment?.photos?.length) {
      sections.push({
        key: 'photoMosaic',
        title: `📸 Photos of ${dest.name}`,
        props: { photos: dest.enrichment.photos },
        priority: 'low',
      })
    }

    // Future sections (Plan 2): flights, hotels, tours, nearby destinations

    return sections
  },

  aiContext(dest): AiPageContext {
    return {
      entityType: 'destination',
      entityName: dest.name,
      entitySlug: dest.slug,
    }
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts
git commit -m "feat(ota): add destination adapter for HubScaffold"
```

---

### Task 12: Migrate Destination Page

**Files:**
- Modify: `apps/ota/src/app/destinations/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the destination page as a thin route**

Replace the entire file:

```typescript
// apps/ota/src/app/destinations/[slug]/page.tsx

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchDestinationBySlug } from '@/lib/fetchers/destinations'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { destinationAdapter } from '@/lib/entity-hubs/adapters/destination.adapter'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description: dest.enrichment?.summary || dest.summary || `Explore ${dest.name}`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationHubPage({ params }: Props) {
  const { slug } = await params

  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  // Fetch counts for pills (non-blocking — pills render with what we have)
  let cruiseCount = 0
  try {
    const cruiseData = await fetchDestinationCruises(slug, 1, 1)
    cruiseCount = cruiseData.total
  } catch {
    // Non-critical — pills just won't show cruise count
  }

  const counts = { cruises: cruiseCount }
  const adapter = destinationAdapter

  return (
    <HubScaffold
      hero={adapter.heroData(destination)}
      contextPills={adapter.contextPills(destination, counts)}
      sections={adapter.sections(destination)}
      aiContext={adapter.aiContext(destination)}
      entityType="destination"
      entitySlug={slug}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Test in browser**

Run: `turbo dev` (if not already running)
Navigate to: `http://localhost:3100/destinations/cozumel`
Expected:
- Hero renders with destination image, badge, title, subtitle, CTA
- Context pills show cruise count (scrollable on mobile)
- Cruises section streams in via Suspense with unified CruiseProductCard
- Each cruise card has "+ Add to Trip" button
- Activities section shows if enrichment data exists
- Photos section shows if enrichment photos exist

- [ ] **Step 4: Verify AddToTrip works**

Click "+ Add to Trip" on a cruise card.
Expected: Button changes to "Added!", basket badge in nav increments.

- [ ] **Step 5: Commit**

```bash
git add apps/ota/src/app/destinations/[slug]/page.tsx
git commit -m "feat(ota): migrate destination page to HubScaffold architecture"
```

---

### Task 13: Cleanup (Optional)

Old destination-specific sections are no longer imported by the page but still exist on disk.

**Files:**
- Delete: `apps/ota/src/app/destinations/[slug]/sections/cruises-section.tsx`
- Delete: `apps/ota/src/app/destinations/[slug]/sections/activities-section.tsx`
- Delete: `apps/ota/src/app/destinations/[slug]/sections/photos-section.tsx`

- [ ] **Step 1: Verify no other files import the old sections**

Run: `grep -r "from.*destinations/\[slug\]/sections" apps/ota/src/`
Expected: No matches (the page.tsx no longer imports them)

- [ ] **Step 2: Delete old section files**

```bash
rm apps/ota/src/app/destinations/\[slug\]/sections/cruises-section.tsx
rm apps/ota/src/app/destinations/\[slug\]/sections/activities-section.tsx
rm apps/ota/src/app/destinations/\[slug\]/sections/photos-section.tsx
rmdir apps/ota/src/app/destinations/\[slug\]/sections/ 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add -A apps/ota/src/app/destinations/[slug]/sections/
git commit -m "chore(ota): remove old destination-specific sections (replaced by shared hub sections)"
```

---

## What This Plan Produces

After completing all 13 tasks:

1. **Foundation types** — `lib/entity-hubs/types.ts` with all shared interfaces
2. **Section registry** — Static imports, ready for new sections to be added
3. **HubScaffold** — Shared page shell with hero, pills, section renderer
4. **HubSectionRenderer** — Per-section Suspense with skeleton fallbacks
5. **CruiseProductCard** — Unified card with full/compact/mini + progressive price rendering + AddToTrip
6. **Destination page** — Migrated to thin route + adapter pattern
7. **4 shared sections** — Cruises, Activities, Photos, Destinations (nearby)

Navigate to `/destinations/cozumel` to see the complete architecture working.

## What Plan 2 Adds

- FlightProductCard with journey timeline
- HotelProductCard, TourProductCard, ActivityProductCard, PromotionCard, ShipCard
- FlightsSection, HotelsSection, ToursSection, OffersSection + browse-mode data
- NearbySection, SailingsSection, CabinCategoriesSection, DeckPlansSection, ItinerarySection, ShipsSection

## What Plan 3 Adds

- Ship, Sailing, CruiseLine, Region, Deal adapters + page migrations
- Geolocation service (server-first)
- Old card/component cleanup

## What Plan 4 Adds

- AI contextual prompts on entity pages
- AI product suggestion cards in chat
- Progressive auth flow (identity modal, board access gate)
- manageTripBasket + captureIdentity tool wiring
