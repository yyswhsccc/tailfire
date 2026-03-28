# OTA Entity Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the consumer-facing entity pages that transform the OTA from a search tool into a content-rich travel discovery platform with interconnected cruise line, ship, sailing, destination, and region pages.

**Architecture:** Next.js 15 App Router pages in `apps/ota` consuming the entity API endpoints built in Plan 1. Server Components fetch data via `catalogFetch`/`publicFetch`, with ISR for catalog entities and cache-on-demand for destination enrichment. Shared card/section components are reused across entity pages. `PageContextBridge` pushes context to the Zustand AI panel store on every entity page.

**Tech Stack:** Next.js 15 (App Router, Server Components, ISR), Tailwind CSS, Lucide icons, `next/image`, existing `catalogFetch`/`publicFetch` API clients, Zustand (AI panel store from Plan 1)

**Spec:** `docs/superpowers/specs/2026-03-27-ota-content-architecture-design.md` (Sections 2-3)

**Scope:** Cruise lines, ships, sailing detail, destinations, regions. Tour detail pages deferred to Plan 3.

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Shared Components** | Reusable entity cards, hero sections, tab system, price bars | Nothing |
| **2. Cruise Line Pages** | `/cruise-lines` browse + `/cruise-lines/[slug]` detail | Phase 1 |
| **3. Ship Pages** | `/ships/[slug]` detail with sailings, photos, cabins | Phase 1 |
| **4. Sailing Detail** | `/cruises/[slug]` with itinerary, pricing, ship card | Phases 1-3 |
| **5. Destination Pages** | `/destinations/[slug]` hub + `/destinations/[slug]/cruises` | Phases 1-2 |
| **6. Region Pages** | `/destinations/regions` browse + region filtering | Phases 1, 5 |

---

## File Structure

```
apps/ota/src/
├── app/
│   ├── cruise-lines/
│   │   ├── page.tsx                         # Browse all cruise lines
│   │   └── [slug]/
│   │       └── page.tsx                     # Cruise line detail
│   ├── ships/
│   │   └── [slug]/
│   │       └── page.tsx                     # Ship detail
│   ├── cruises/
│   │   └── [slug]/
│   │       └── page.tsx                     # Sailing detail
│   ├── destinations/
│   │   ├── page.tsx                         # Destinations browse/search
│   │   └── [slug]/
│   │       ├── page.tsx                     # Destination hub
│   │       └── cruises/
│   │           └── page.tsx                 # Cruises at this destination
│   └── regions/
│       └── page.tsx                         # Region browse (cruise regions)
├── components/
│   ├── entity/
│   │   ├── entity-hero.tsx                  # Reusable hero banner
│   │   ├── entity-tabs.tsx                  # Tab navigation component
│   │   ├── stat-card.tsx                    # Quick stat pill (X cruises, etc.)
│   │   └── cta-bar.tsx                      # Inquire / Add to Wishlist bar
│   ├── cruise-lines/
│   │   └── cruise-line-card.tsx             # Card for line listings
│   ├── ships/
│   │   ├── ship-card.tsx                    # Card for ship listings
│   │   └── ship-gallery.tsx                 # Photo gallery
│   ├── cruises/
│   │   ├── itinerary-timeline.tsx           # Day-by-day itinerary
│   │   ├── cabin-price-grid.tsx             # 4-tier cabin pricing
│   │   └── sailing-card-compact.tsx         # Compact card for listings
│   ├── destinations/
│   │   ├── destination-card.tsx             # Card for destination listings
│   │   └── destination-hero.tsx             # Destination-specific hero with enrichment
│   └── regions/
│       └── region-card.tsx                  # Card for region listings
├── lib/
│   └── api/
│       ├── cruise-lines.ts                  # Cruise line API fetchers
│       ├── ships.ts                         # Ship API fetchers
│       ├── sailings.ts                      # Sailing API fetchers
│       ├── destinations.ts                  # Destination API fetchers
│       └── regions.ts                       # Region API fetchers
└── types/
    └── entities.ts                          # Shared TypeScript types for all entities
```

---

## Phase 1: Shared Components & Types

### Task 1.1: Entity TypeScript types

**Files:**
- Create: `apps/ota/src/types/entities.ts`

- [ ] **Step 1:** Create the shared types file with interfaces matching all API response shapes:

```typescript
// === Cruise Lines ===
export interface CruiseLine {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  websiteUrl: string | null
  shipCount: number
  sailingCount: number
}

export interface CruiseLineDetail extends CruiseLine {
  ships: Array<{
    id: string
    name: string
    slug: string
    imageUrl: string | null
    shipClass: string | null
  }>
  upcomingSailingCount: number
}

// === Ships ===
export interface ShipSummary {
  id: string
  name: string
  slug: string
  imageUrl: string | null
  shipClass: string | null
  cruiseLine: { id: string; name: string; slug: string }
  sailingCount: number
}

export interface ShipDetail extends ShipSummary {
  metadata: {
    yearBuilt?: number
    tonnage?: number
    passengerCapacity?: number
    crewCount?: number
    amenities?: string[]
  }
  cruiseLine: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
  }
  upcomingSailingCount: number
}

export interface ShipImage {
  id: string
  imageUrl: string
  caption: string | null
  imageType: string | null
}

// === Sailings ===
export interface SailingDetail {
  id: string
  name: string
  sailDate: string
  endDate: string
  nights: number
  voyageCode: string | null
  ship: { id: string; name: string; slug: string; imageUrl: string | null; shipClass: string | null }
  cruiseLine: { id: string; name: string; slug: string; logoUrl: string | null }
  embarkPort: { id: string | null; name: string }
  disembarkPort: { id: string | null; name: string }
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
  itinerary: Array<{
    dayNumber: number
    portName: string
    isSeaDay: boolean
    arrivalTime: string | null
    departureTime: string | null
    destinationSlug: string | null
  }>
}

// === Destinations ===
export interface DestinationSummary {
  id: string
  slug: string
  name: string
  destinationType: string
  countryCode: string | null
  heroImageUrl: string | null
  summary: string | null
  latitude: string | null
  longitude: string | null
}

export interface DestinationDetail extends DestinationSummary {
  ports: Array<{ portId: string; portName: string; isPrimary: boolean }>
  aliases: string[]
  enrichment: {
    summary: string | null
    photos: Array<{ url: string; caption?: string }>
    topAttractions: Array<{ title: string; rating: number; description: string }>
    averageRating: number | null
    totalReviewCount: number | null
    lastEnrichedAt: string | null
  } | null
  stats: { cruiseCount: number; tourCount: number }
}

export interface DestinationCruisesResponse {
  destination: { id: string; name: string; slug: string }
  sailings: Array<{
    id: string
    name: string
    sailDate: string
    endDate: string
    nights: number
    shipName: string
    shipImageUrl: string | null
    cruiseLineName: string
    cruiseLineSlug: string
    cheapestInsideCents: number | null
    cheapestBalconyCents: number | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// === Regions ===
export interface Region {
  id: string
  name: string
  slug: string
  sailingCount: number
}

export interface RegionDetail extends Region {
  description: string | null
  upcomingSailingCount: number
  destinations: Array<{
    portId: string
    portName: string
    country: string | null
  }>
}
```

- [ ] **Step 2:** Commit: `feat(ota): add entity TypeScript types`

### Task 1.2: API fetcher modules

**Files:**
- Create: `apps/ota/src/lib/api/cruise-lines.ts`
- Create: `apps/ota/src/lib/api/ships.ts`
- Create: `apps/ota/src/lib/api/sailings.ts`
- Create: `apps/ota/src/lib/api/destinations.ts`
- Create: `apps/ota/src/lib/api/regions.ts`

- [ ] **Step 1:** Create cruise-lines fetcher:

```typescript
import { catalogFetch } from '@/lib/api'
import type { CruiseLine, CruiseLineDetail } from '@/types/entities'

export async function fetchCruiseLines(): Promise<CruiseLine[]> {
  return catalogFetch<CruiseLine[]>('/cruise-repository/lines', {
    next: { revalidate: 3600, tags: ['cruise-lines'] },
  })
}

export async function fetchCruiseLineBySlug(slug: string): Promise<CruiseLineDetail> {
  return catalogFetch<CruiseLineDetail>(`/cruise-repository/lines/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['cruise-lines', `cruise-line-${slug}`] },
  })
}
```

- [ ] **Step 2:** Create ships fetcher:

```typescript
import { catalogFetch } from '@/lib/api'
import type { ShipSummary, ShipDetail, ShipImage } from '@/types/entities'

export async function fetchShips(lineId?: string): Promise<ShipSummary[]> {
  const params = lineId ? `?lineId=${lineId}` : ''
  return catalogFetch<ShipSummary[]>(`/cruise-repository/ships${params}`, {
    next: { revalidate: 3600, tags: ['ships'] },
  })
}

export async function fetchShipBySlug(slug: string): Promise<ShipDetail> {
  return catalogFetch<ShipDetail>(`/cruise-repository/ships/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['ships', `ship-${slug}`] },
  })
}

export async function fetchShipImages(shipId: string, page = 1, pageSize = 12): Promise<{ images: ShipImage[]; total: number; page: number; totalPages: number }> {
  return catalogFetch(`/cruise-repository/ships/${shipId}/images?page=${page}&pageSize=${pageSize}`, {
    next: { revalidate: 86400, tags: ['ship-images', `ship-images-${shipId}`] },
  })
}
```

- [ ] **Step 3:** Create sailings fetcher:

```typescript
import { catalogFetch } from '@/lib/api'
import type { SailingDetail } from '@/types/entities'

export async function fetchSailingById(id: string): Promise<SailingDetail> {
  return catalogFetch<SailingDetail>(`/cruise-repository/sailings/${id}`, {
    next: { revalidate: 1800, tags: ['sailings', `sailing-${id}`] },
  })
}
```

- [ ] **Step 4:** Create destinations fetcher:

```typescript
import { catalogFetch } from '@/lib/api'
import type { DestinationSummary, DestinationDetail, DestinationCruisesResponse } from '@/types/entities'

export async function fetchDestinations(params?: {
  search?: string
  type?: string
  page?: number
  pageSize?: number
}): Promise<{ destinations: DestinationSummary[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.type) searchParams.set('type', params.type)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
  const qs = searchParams.toString()
  return catalogFetch(`/destinations${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 3600, tags: ['destinations'] },
  })
}

export async function fetchDestinationBySlug(slug: string): Promise<DestinationDetail> {
  return catalogFetch<DestinationDetail>(`/destinations/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['destinations', `destination-${slug}`] },
  })
}

export async function fetchDestinationCruises(slug: string, page = 1, pageSize = 12): Promise<DestinationCruisesResponse> {
  return catalogFetch<DestinationCruisesResponse>(
    `/destinations/by-slug/${slug}/cruises?page=${page}&pageSize=${pageSize}`,
    { next: { revalidate: 1800, tags: ['destinations', `destination-${slug}-cruises`] } },
  )
}
```

- [ ] **Step 5:** Create regions fetcher:

```typescript
import { catalogFetch } from '@/lib/api'
import type { Region, RegionDetail } from '@/types/entities'

export async function fetchRegions(): Promise<Region[]> {
  return catalogFetch<Region[]>('/cruise-repository/regions', {
    next: { revalidate: 3600, tags: ['regions'] },
  })
}

export async function fetchRegionBySlug(slug: string): Promise<RegionDetail> {
  return catalogFetch<RegionDetail>(`/cruise-repository/regions/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['regions', `region-${slug}`] },
  })
}
```

- [ ] **Step 6:** Commit: `feat(ota): add entity API fetcher modules`

### Task 1.3: Shared entity components

**Files:**
- Create: `apps/ota/src/components/entity/entity-hero.tsx`
- Create: `apps/ota/src/components/entity/entity-tabs.tsx`
- Create: `apps/ota/src/components/entity/stat-card.tsx`
- Create: `apps/ota/src/components/entity/cta-bar.tsx`

- [ ] **Step 1:** Create EntityHero — a reusable full-width hero banner:

```tsx
import Image from 'next/image'

interface EntityHeroProps {
  title: string
  subtitle?: string
  imageUrl?: string | null
  badge?: string         // e.g. cruise line name, region
  badgeColor?: string
  children?: React.ReactNode  // slot for stats, CTAs below title
}

export function EntityHero({ title, subtitle, imageUrl, badge, children }: EntityHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {/* Background image */}
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover opacity-40"
          sizes="100vw"
          priority
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/60 to-transparent" />

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pb-14 lg:pt-32">
        {badge && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-[#C59746]">
            {badge}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-base text-white/70 md:text-lg">{subtitle}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2:** Create EntityTabs — a client component tab switcher:

```tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Tab {
  label: string
  href: string
  count?: number
}

interface EntityTabsProps {
  tabs: Tab[]
}

export function EntityTabs({ tabs }: EntityTabsProps) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="border-b border-border">
      <nav className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={cn(
                'shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-[#C59746] text-[#C59746]'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className="ml-1.5 text-xs text-muted-foreground">({tab.count})</span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
```

- [ ] **Step 3:** Create StatCard — a small stat pill:

```tsx
interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-white/70">{label}</span>
    </div>
  )
}
```

- [ ] **Step 4:** Create CtaBar — Inquire / Wishlist action bar:

```tsx
'use client'

import { Heart, MessageCircle } from 'lucide-react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface CtaBarProps {
  entityType: string
  entitySlug: string
  entityName: string
  inquirePrompt?: string
}

export function CtaBar({ entityType, entitySlug, entityName, inquirePrompt }: CtaBarProps) {
  const { open, addJourneyItem } = useAiPanelStore()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => open({ prefill: inquirePrompt ?? `Tell me more about ${entityName}` })}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
      >
        <MessageCircle className="size-4" />
        Inquire
      </button>
      <button
        onClick={() => addJourneyItem({ type: entityType, slug: entitySlug, name: entityName })}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/30 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <Heart className="size-4" />
        Save
      </button>
    </div>
  )
}
```

- [ ] **Step 5:** Commit: `feat(ota): add shared entity components (hero, tabs, stats, CTA)`

---

## Phase 2: Cruise Line Pages

### Task 2.1: Cruise line card component

**Files:**
- Create: `apps/ota/src/components/cruise-lines/cruise-line-card.tsx`

- [ ] **Step 1:** Create the cruise line card used in browse listings:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { Ship, Anchor } from 'lucide-react'
import type { CruiseLine } from '@/types/entities'

export function CruiseLineCard({ line }: { line: CruiseLine }) {
  return (
    <Link
      href={`/cruise-lines/${line.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Logo */}
      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
        {line.logoUrl ? (
          <Image src={line.logoUrl} alt={line.name} width={56} height={56} className="object-contain" />
        ) : (
          <Anchor className="size-6 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {line.name}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Ship className="size-3.5" />
            {line.shipCount} ship{line.shipCount !== 1 ? 's' : ''}
          </span>
          <span>{line.sailingCount.toLocaleString()} sailings</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): cruise line card component`

### Task 2.2: Cruise lines browse page

**Files:**
- Create: `apps/ota/src/app/cruise-lines/page.tsx`

- [ ] **Step 1:** Create the browse page — Server Component with ISR:

```tsx
import type { Metadata } from 'next'
import { fetchCruiseLines } from '@/lib/api/cruise-lines'
import { CruiseLineCard } from '@/components/cruise-lines/cruise-line-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Cruise Lines',
  description: 'Browse all cruise lines — compare fleets, find sailings, and discover your perfect cruise.',
}

export default async function CruiseLinesPage() {
  const lines = await fetchCruiseLines()

  // Sort by sailing count descending (most popular first)
  const sorted = [...lines].sort((a, b) => b.sailingCount - a.sailingCount)
  // Split into featured (has sailings) and other
  const featured = sorted.filter((l) => l.sailingCount > 0)
  const other = sorted.filter((l) => l.sailingCount === 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          CRUISE LINES
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {featured.length} cruise lines with upcoming sailings
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((line) => (
          <CruiseLineCard key={line.id} line={line} />
        ))}
      </div>

      {other.length > 0 && (
        <>
          <h2 className="mb-4 mt-12 text-lg font-semibold text-muted-foreground">
            Other Cruise Lines
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {other.map((line) => (
              <CruiseLineCard key={line.id} line={line} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): cruise lines browse page`

### Task 2.3: Cruise line detail page

**Files:**
- Create: `apps/ota/src/app/cruise-lines/[slug]/page.tsx`
- Create: `apps/ota/src/components/ships/ship-card.tsx`

- [ ] **Step 1:** Create ship card (needed for the cruise line fleet section):

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { Ship as ShipIcon, Calendar } from 'lucide-react'

interface ShipCardProps {
  ship: {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    shipClass: string | null
  }
  sailingCount?: number
}

export function ShipCard({ ship, sailingCount }: ShipCardProps) {
  return (
    <Link
      href={`/ships/${ship.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden bg-muted">
        {ship.imageUrl ? (
          <Image
            src={ship.imageUrl}
            alt={ship.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShipIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {ship.name}
        </h3>
        {ship.shipClass && (
          <p className="mt-0.5 text-xs text-muted-foreground">{ship.shipClass} Class</p>
        )}
        {sailingCount != null && sailingCount > 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            {sailingCount} upcoming sailing{sailingCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Create cruise line detail page:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchCruiseLineBySlug } from '@/lib/api/cruise-lines'
import { fetchShips } from '@/lib/api/ships'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { ShipCard } from '@/components/ships/ship-card'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Ship, Calendar } from 'lucide-react'

export const revalidate = 3600

interface CruiseLinePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CruiseLinePageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const line = await fetchCruiseLineBySlug(slug)
    return {
      title: line.name,
      description: `Explore ${line.name} — ${line.shipCount} ships, ${line.sailingCount.toLocaleString()} upcoming sailings. Browse fleet, compare prices.`,
    }
  } catch {
    return { title: 'Cruise Line Not Found' }
  }
}

export default async function CruiseLineDetailPage({ params }: CruiseLinePageProps) {
  const { slug } = await params
  let line
  try {
    line = await fetchCruiseLineBySlug(slug)
  } catch {
    notFound()
  }

  return (
    <>
      <PageContextBridge type="cruise_line" slug={slug} name={line.name} />

      <EntityHero
        title={line.name}
        badge="Cruise Line"
        imageUrl={line.ships[0]?.imageUrl}
      >
        <div className="flex flex-wrap gap-3">
          <StatCard label="ships" value={line.shipCount} icon={<Ship className="size-3.5" />} />
          <StatCard label="sailings" value={line.sailingCount.toLocaleString()} icon={<Calendar className="size-3.5" />} />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Fleet */}
        <h2 className="mb-6 text-xl font-bold text-[#1A1A1A]">Fleet</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {line.ships.map((ship) => (
            <ShipCard key={ship.id} ship={ship} />
          ))}
        </div>

        {line.ships.length === 0 && (
          <p className="rounded-xl border border-border bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            No ships listed for {line.name} yet.
          </p>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): cruise line detail page with fleet grid`

---

## Phase 3: Ship Pages

### Task 3.1: Ship detail page

**Files:**
- Create: `apps/ota/src/app/ships/[slug]/page.tsx`
- Create: `apps/ota/src/components/ships/ship-gallery.tsx`

- [ ] **Step 1:** Create ship gallery component:

```tsx
'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { ShipImage } from '@/types/entities'

export function ShipGallery({ images }: { images: ShipImage[] }) {
  const [selected, setSelected] = useState(0)

  if (images.length === 0) return null

  return (
    <div>
      {/* Main image */}
      <div className="relative mb-3 aspect-video overflow-hidden rounded-xl">
        <Image
          src={images[selected]!.imageUrl}
          alt={images[selected]!.caption || 'Ship photo'}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 60vw"
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelected(i)}
              className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === selected ? 'border-[#C59746]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={img.imageUrl} alt={img.caption || ''} fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2:** Create ship detail page:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchShipBySlug, fetchShipImages } from '@/lib/api/ships'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { CtaBar } from '@/components/entity/cta-bar'
import { ShipGallery } from '@/components/ships/ship-gallery'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Users, Calendar, Anchor } from 'lucide-react'

export const revalidate = 3600

interface ShipPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ShipPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const ship = await fetchShipBySlug(slug)
    return {
      title: `${ship.name} — ${ship.cruiseLine.name}`,
      description: `Explore ${ship.name} by ${ship.cruiseLine.name}. ${ship.upcomingSailingCount} upcoming sailings. Photos, cabin types, and deck plans.`,
    }
  } catch {
    return { title: 'Ship Not Found' }
  }
}

export default async function ShipDetailPage({ params }: ShipPageProps) {
  const { slug } = await params
  let ship
  try {
    ship = await fetchShipBySlug(slug)
  } catch {
    notFound()
  }

  let images = { images: [] as any[], total: 0, page: 1, totalPages: 0 }
  try {
    images = await fetchShipImages(ship.id, 1, 12)
  } catch { /* images optional */ }

  const meta = ship.metadata || {}

  return (
    <>
      <PageContextBridge
        type="ship"
        slug={slug}
        name={ship.name}
        parentContext={{ type: 'cruise_line', slug: ship.cruiseLine.slug, name: ship.cruiseLine.name }}
      />

      <EntityHero title={ship.name} badge={ship.cruiseLine.name} imageUrl={ship.imageUrl}>
        <div className="flex flex-wrap gap-3">
          {meta.passengerCapacity && (
            <StatCard label="guests" value={meta.passengerCapacity.toLocaleString()} icon={<Users className="size-3.5" />} />
          )}
          <StatCard label="sailings" value={ship.upcomingSailingCount} icon={<Calendar className="size-3.5" />} />
          {meta.tonnage && <StatCard label="GT" value={`${(meta.tonnage / 1000).toFixed(0)}K`} icon={<Anchor className="size-3.5" />} />}
        </div>
        <div className="mt-4">
          <CtaBar entityType="ship" entitySlug={slug} entityName={ship.name} inquirePrompt={`Tell me about the ${ship.name}`} />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Left: Details */}
          <div className="lg:col-span-3">
            {/* Quick info */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {meta.yearBuilt && <InfoItem label="Built" value={String(meta.yearBuilt)} />}
              {ship.shipClass && <InfoItem label="Class" value={ship.shipClass} />}
              {meta.crewCount && <InfoItem label="Crew" value={meta.crewCount.toLocaleString()} />}
              {meta.tonnage && <InfoItem label="Tonnage" value={`${meta.tonnage.toLocaleString()} GT`} />}
            </div>

            {/* Cruise line link */}
            <p className="text-sm text-muted-foreground">
              Part of the{' '}
              <Link href={`/cruise-lines/${ship.cruiseLine.slug}`} className="font-medium text-[#C59746] hover:underline">
                {ship.cruiseLine.name}
              </Link>{' '}
              fleet.
            </p>
          </div>

          {/* Right: Gallery */}
          <div className="lg:col-span-2">
            <ShipGallery images={images.images} />
          </div>
        </div>
      </div>
    </>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): ship detail page with gallery and specs`

---

## Phase 4: Sailing Detail Page

### Task 4.1: Sailing sub-components

**Files:**
- Create: `apps/ota/src/components/cruises/itinerary-timeline.tsx`
- Create: `apps/ota/src/components/cruises/cabin-price-grid.tsx`

- [ ] **Step 1:** Create itinerary timeline — day-by-day cruise route:

```tsx
import Link from 'next/link'
import { MapPin, Waves } from 'lucide-react'

interface ItineraryStop {
  dayNumber: number
  portName: string
  isSeaDay: boolean
  arrivalTime: string | null
  departureTime: string | null
  destinationSlug: string | null
}

export function ItineraryTimeline({ stops }: { stops: ItineraryStop[] }) {
  return (
    <div className="space-y-0">
      {stops.map((stop, i) => (
        <div key={i} className="flex gap-4">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`size-3 shrink-0 rounded-full ${stop.isSeaDay ? 'bg-sky-300' : 'bg-[#C59746]'}`} />
            {i < stops.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>

          {/* Content */}
          <div className="pb-5">
            <p className="text-xs font-medium text-muted-foreground">Day {stop.dayNumber}</p>
            <div className="flex items-center gap-1.5">
              {stop.isSeaDay ? (
                <>
                  <Waves className="size-3.5 text-sky-400" />
                  <p className="text-sm italic text-muted-foreground">At Sea</p>
                </>
              ) : stop.destinationSlug ? (
                <>
                  <MapPin className="size-3.5 text-[#C59746]" />
                  <Link
                    href={`/destinations/${stop.destinationSlug}`}
                    className="text-sm font-medium text-[#1A1A1A] hover:text-[#C59746] hover:underline"
                  >
                    {stop.portName}
                  </Link>
                </>
              ) : (
                <>
                  <MapPin className="size-3.5 text-muted-foreground" />
                  <p className="text-sm text-[#1A1A1A]">{stop.portName}</p>
                </>
              )}
            </div>
            {!stop.isSeaDay && (stop.arrivalTime || stop.departureTime) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stop.arrivalTime && `Arrive ${stop.arrivalTime}`}
                {stop.arrivalTime && stop.departureTime && ' · '}
                {stop.departureTime && `Depart ${stop.departureTime}`}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2:** Create cabin price grid:

```tsx
import { formatPrice } from '@/lib/format'

interface CabinPriceGridProps {
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
}

const CABIN_TIERS = [
  { key: 'inside' as const, label: 'Inside', color: 'bg-slate-100 text-slate-700' },
  { key: 'oceanview' as const, label: 'Ocean View', color: 'bg-sky-50 text-sky-700' },
  { key: 'balcony' as const, label: 'Balcony', color: 'bg-amber-50 text-amber-700' },
  { key: 'suite' as const, label: 'Suite', color: 'bg-violet-50 text-violet-700' },
]

export function CabinPriceGrid({ prices }: CabinPriceGridProps) {
  const available = CABIN_TIERS.filter((t) => prices[t.key] != null)

  if (available.length === 0) {
    return <p className="text-sm text-muted-foreground">Contact for pricing</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {available.map((tier) => (
        <div key={tier.key} className={`rounded-xl border border-border p-4 ${tier.color}`}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">{tier.label}</p>
          <p className="mt-1 text-xl font-bold">{formatPrice(prices[tier.key]!)}</p>
          <p className="text-xs opacity-60">per person</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): sailing itinerary timeline + cabin price grid`

### Task 4.2: Sailing detail page

**Files:**
- Create: `apps/ota/src/app/cruises/[slug]/page.tsx`

- [ ] **Step 1:** Create the sailing detail page. Note: since `public_id` is not yet populated, this page uses the sailing UUID for now. The `[slug]` param will be the sailing UUID until public_ids are generated on production:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchSailingById } from '@/lib/api/sailings'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { CtaBar } from '@/components/entity/cta-bar'
import { ItineraryTimeline } from '@/components/cruises/itinerary-timeline'
import { CabinPriceGrid } from '@/components/cruises/cabin-price-grid'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Calendar, Moon, Ship } from 'lucide-react'

export const revalidate = 1800

interface SailingPageProps {
  params: Promise<{ slug: string }>
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export async function generateMetadata({ params }: SailingPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const sailing = await fetchSailingById(slug)
    return {
      title: `${sailing.name} — ${sailing.ship.name}`,
      description: `${sailing.nights}-night ${sailing.name} on ${sailing.ship.name} departing ${formatDate(sailing.sailDate)}. View itinerary, cabin prices, and book.`,
    }
  } catch {
    return { title: 'Sailing Not Found' }
  }
}

export default async function SailingDetailPage({ params }: SailingPageProps) {
  const { slug } = await params
  let sailing
  try {
    sailing = await fetchSailingById(slug)
  } catch {
    notFound()
  }

  return (
    <>
      <PageContextBridge
        type="sailing"
        slug={slug}
        name={sailing.name}
        parentContext={{ type: 'ship', slug: sailing.ship.slug, name: sailing.ship.name }}
      />

      <EntityHero
        title={sailing.name}
        badge={sailing.cruiseLine.name}
        imageUrl={sailing.ship.imageUrl}
        subtitle={`${formatDate(sailing.sailDate)} — ${formatDate(sailing.endDate)}`}
      >
        <div className="flex flex-wrap gap-3">
          <StatCard label="nights" value={sailing.nights} icon={<Moon className="size-3.5" />} />
          <StatCard label="" value={sailing.ship.name} icon={<Ship className="size-3.5" />} />
        </div>
        <div className="mt-4">
          <CtaBar
            entityType="sailing"
            entitySlug={slug}
            entityName={sailing.name}
            inquirePrompt={`I'm interested in the ${sailing.name} on ${sailing.ship.name} departing ${formatDate(sailing.sailDate)}`}
          />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Left: Itinerary */}
          <div className="lg:col-span-2">
            <h2 className="mb-6 text-xl font-bold text-[#1A1A1A]">Day-by-Day Itinerary</h2>
            <ItineraryTimeline stops={sailing.itinerary} />
          </div>

          {/* Right: Ship + quick info */}
          <div>
            {/* Ship card */}
            <Link
              href={`/ships/${sailing.ship.slug}`}
              className="mb-6 block overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {sailing.ship.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img src={sailing.ship.imageUrl} alt={sailing.ship.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{sailing.cruiseLine.name}</p>
                <p className="text-base font-semibold text-[#1A1A1A]">{sailing.ship.name}</p>
              </div>
            </Link>

            {/* Embark/Disembark */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Departs</p>
                  <p className="font-medium text-[#1A1A1A]">{sailing.embarkPort.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Returns</p>
                  <p className="font-medium text-[#1A1A1A]">{sailing.disembarkPort.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Cabin Pricing</h2>
          <CabinPriceGrid prices={sailing.prices} />
          <p className="mt-3 text-xs text-muted-foreground">
            Prices per person in CAD. Subject to availability. Contact an advisor for the best rate.
          </p>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): sailing detail page with itinerary and pricing`

---

## Phase 5: Destination Pages

### Task 5.1: Destination card + hero components

**Files:**
- Create: `apps/ota/src/components/destinations/destination-card.tsx`
- Create: `apps/ota/src/components/destinations/destination-hero.tsx`

- [ ] **Step 1:** Create destination card:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Ship, Star } from 'lucide-react'
import type { DestinationSummary } from '@/types/entities'

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 overflow-hidden bg-muted">
        {destination.heroImageUrl ? (
          <Image
            src={destination.heroImageUrl}
            alt={destination.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-100 to-teal-50">
            <MapPin className="size-8 text-muted-foreground/30" />
          </div>
        )}
        {destination.countryCode && (
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {destination.countryCode}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {destination.name}
        </h3>
        {destination.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{destination.summary}</p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Create destination hero with enrichment data:

```tsx
import Image from 'next/image'
import { Star, MessageSquare, MapPin } from 'lucide-react'
import type { DestinationDetail } from '@/types/entities'

export function DestinationHero({ destination }: { destination: DestinationDetail }) {
  const enrichment = destination.enrichment
  const heroImage = destination.heroImageUrl || enrichment?.photos?.[0]?.url

  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {heroImage && (
        <Image
          src={heroImage}
          alt={destination.name}
          fill
          className="object-cover opacity-50"
          sizes="100vw"
          priority
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/50 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pb-14 lg:pt-32">
        {destination.countryCode && (
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-[#C59746]">
            <MapPin className="size-3" />
            {destination.destinationType.replace('_', ' ')}
            {destination.countryCode && ` · ${destination.countryCode}`}
          </p>
        )}

        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
          {destination.name}
        </h1>

        {/* TripAdvisor rating */}
        {enrichment?.averageRating && enrichment.averageRating > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="size-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-semibold text-white">{enrichment.averageRating.toFixed(1)}</span>
            </div>
            {enrichment.totalReviewCount && enrichment.totalReviewCount > 0 && (
              <span className="text-sm text-white/60">
                ({enrichment.totalReviewCount.toLocaleString()} reviews)
              </span>
            )}
          </div>
        )}

        {/* Quick stats */}
        <div className="mt-4 flex flex-wrap gap-3">
          {destination.stats.cruiseCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {destination.stats.cruiseCount} cruises
            </span>
          )}
          {destination.stats.tourCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {destination.stats.tourCount} tours
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): destination card + hero components`

### Task 5.2: Destinations browse page

**Files:**
- Create: `apps/ota/src/app/destinations/page.tsx`

- [ ] **Step 1:** Create destinations browse with search:

```tsx
import type { Metadata } from 'next'
import { fetchDestinations } from '@/lib/api/destinations'
import { DestinationCard } from '@/components/destinations/destination-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Destinations',
  description: 'Explore cruise destinations worldwide. Browse ports of call, discover things to do, and plan your perfect cruise.',
}

interface DestinationsPageProps {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>
}

export default async function DestinationsPage({ searchParams }: DestinationsPageProps) {
  const { search, type, page } = await searchParams
  const data = await fetchDestinations({
    search,
    type: type || 'port_city',
    page: page ? parseInt(page) : 1,
    pageSize: 24,
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          DESTINATIONS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {data.total.toLocaleString()} cruise destinations worldwide
        </p>
      </div>

      {/* Search form */}
      <form className="mb-8 flex max-w-lg gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search destinations..."
          className="h-10 flex-1 rounded-lg border border-border bg-white px-4 text-sm outline-none focus:border-[#C59746] focus:ring-1 focus:ring-[#C59746]"
        />
        <button
          type="submit"
          className="h-10 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white hover:bg-[#B08638]"
        >
          Search
        </button>
      </form>

      {data.destinations.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {data.destinations.map((dest) => (
            <DestinationCard key={dest.id} destination={dest} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium text-[#1A1A1A]">No destinations found</p>
          <p className="mt-2 text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: Math.min(data.totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/destinations?${new URLSearchParams({ ...(search ? { search } : {}), page: String(p) }).toString()}`}
              className={`inline-flex size-10 items-center justify-center rounded-lg text-sm font-medium ${
                p === data.page ? 'bg-[#C59746] text-white' : 'border border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): destinations browse page with search`

### Task 5.3: Destination detail page

**Files:**
- Create: `apps/ota/src/app/destinations/[slug]/page.tsx`

- [ ] **Step 1:** Create destination hub page:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { fetchDestinationBySlug, fetchDestinationCruises } from '@/lib/api/destinations'
import { DestinationHero } from '@/components/destinations/destination-hero'
import { CtaBar } from '@/components/entity/cta-bar'
import { PageContextBridge } from '@/components/page-context-bridge'
import { CruiseResultCard } from '@/components/search/cruise-result-card'
import type { CruiseSailing } from '@/components/search/cruise-result-card'

export const revalidate = 3600

interface DestinationPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: DestinationPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description: dest.enrichment?.summary || dest.summary || `Explore ${dest.name} — cruises, tours, and things to do.`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationDetailPage({ params }: DestinationPageProps) {
  const { slug } = await params
  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  // Fetch first page of cruises at this destination
  let cruises = { sailings: [] as any[], total: 0 }
  try {
    cruises = await fetchDestinationCruises(slug, 1, 6)
  } catch { /* cruises optional */ }

  const enrichment = destination.enrichment
  const description = enrichment?.summary || destination.summary

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <DestinationHero destination={destination} />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* CTA */}
        <div className="mb-8">
          <CtaBar
            entityType="destination"
            entitySlug={slug}
            entityName={destination.name}
            inquirePrompt={`Help me plan a trip to ${destination.name}`}
          />
        </div>

        {/* Description */}
        {description && (
          <div className="mb-10">
            <h2 className="mb-3 text-xl font-bold text-[#1A1A1A]">About {destination.name}</h2>
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{description}</p>
          </div>
        )}

        {/* Top Attractions */}
        {enrichment?.topAttractions && enrichment.topAttractions.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Things to Do</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enrichment.topAttractions.slice(0, 6).map((attraction, i) => (
                <div key={i} className="rounded-xl border border-border bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#1A1A1A]">{attraction.title}</h3>
                  {attraction.rating > 0 && (
                    <p className="mt-1 text-xs text-[#C59746]">{'★'.repeat(Math.round(attraction.rating))} {attraction.rating.toFixed(1)}</p>
                  )}
                  {attraction.description && (
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{attraction.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo Gallery */}
        {enrichment?.photos && enrichment.photos.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-[#1A1A1A]">Photos</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {enrichment.photos.slice(0, 8).map((photo, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                  <Image src={photo.url} alt={photo.caption || destination.name} fill className="object-cover" sizes="25vw" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cruises stopping here */}
        {cruises.total > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#1A1A1A]">Cruises Visiting {destination.name}</h2>
              {cruises.total > 6 && (
                <a
                  href={`/destinations/${slug}/cruises`}
                  className="text-sm font-medium text-[#C59746] hover:underline"
                >
                  View all {cruises.total} →
                </a>
              )}
            </div>
            <div className="space-y-4">
              {cruises.sailings.slice(0, 3).map((s: any) => (
                <a key={s.id} href={`/cruises/${s.id}`} className="block">
                  <div className="rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{s.cruiseLineName}</p>
                        <p className="text-sm font-semibold text-[#1A1A1A]">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.shipName} · {s.nights} nights · {new Date(s.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      {s.cheapestInsideCents && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">from</p>
                          <p className="text-lg font-bold text-[#C59746]">${(s.cheapestInsideCents / 100).toFixed(0)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): destination detail page with enrichment, attractions, cruises`

### Task 5.4: Destination cruises sub-page

**Files:**
- Create: `apps/ota/src/app/destinations/[slug]/cruises/page.tsx`

- [ ] **Step 1:** Create paginated cruises-at-destination page:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchDestinationBySlug, fetchDestinationCruises } from '@/lib/api/destinations'
import { PageContextBridge } from '@/components/page-context-bridge'
import { formatPrice } from '@/lib/format'

export const revalidate = 1800

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: `Cruises to ${dest.name}`,
      description: `Browse ${dest.stats.cruiseCount} cruises stopping at ${dest.name}. Compare prices and itineraries.`,
    }
  } catch {
    return { title: 'Destination Not Found' }
  }
}

export default async function DestinationCruisesPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const page = pageParam ? parseInt(pageParam) : 1

  let destination
  try {
    destination = await fetchDestinationBySlug(slug)
  } catch {
    notFound()
  }

  const data = await fetchDestinationCruises(slug, page, 20)

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">
            <a href={`/destinations/${slug}`} className="text-[#C59746] hover:underline">{destination.name}</a> &rsaquo; Cruises
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-[#1A1A1A] md:text-3xl">
            Cruises Visiting {destination.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} sailing{data.total !== 1 ? 's' : ''} found
          </p>
        </div>

        <div className="space-y-4">
          {data.sailings.map((s) => (
            <a key={s.id} href={`/cruises/${s.id}`} className="block rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[#C59746]">{s.cruiseLineName}</p>
                  <p className="text-base font-semibold text-[#1A1A1A]">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {s.shipName} · {s.nights} nights · {new Date(s.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {s.cheapestInsideCents != null && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">from</p>
                    <p className="text-xl font-bold text-[#C59746]">{formatPrice(s.cheapestInsideCents)}</p>
                    <p className="text-xs text-muted-foreground">/person</p>
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: Math.min(data.totalPages, 10) }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/destinations/${slug}/cruises?page=${p}`}
                className={`inline-flex size-10 items-center justify-center rounded-lg text-sm font-medium ${
                  p === data.page ? 'bg-[#C59746] text-white' : 'border border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): destination cruises sub-page with pagination`

---

## Phase 6: Region Pages

### Task 6.1: Region browse page

**Files:**
- Create: `apps/ota/src/app/regions/page.tsx`
- Create: `apps/ota/src/components/regions/region-card.tsx`

- [ ] **Step 1:** Create region card:

```tsx
import Link from 'next/link'
import { Globe, Ship } from 'lucide-react'
import type { Region } from '@/types/entities'

export function RegionCard({ region }: { region: Region }) {
  return (
    <Link
      href={`/search/cruises?regionId=${region.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#C59746]/10">
        <Globe className="size-5 text-[#C59746]" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-[#1A1A1A] group-hover:text-[#C59746]">
          {region.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <Ship className="size-3.5" />
          {region.sailingCount.toLocaleString()} sailing{region.sailingCount !== 1 ? 's' : ''}
        </p>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Create region browse page:

```tsx
import type { Metadata } from 'next'
import { fetchRegions } from '@/lib/api/regions'
import { RegionCard } from '@/components/regions/region-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Cruise Regions',
  description: 'Explore cruise regions worldwide — Caribbean, Mediterranean, Alaska, and more.',
}

export default async function RegionsPage() {
  const regions = await fetchRegions()
  const sorted = [...regions].sort((a, b) => b.sailingCount - a.sailingCount)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          CRUISE REGIONS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {regions.length} cruise regions around the world
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((region) => (
          <RegionCard key={region.id} region={region} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): region browse page with cards`

---

## Phase 7: Navigation & Image Config

### Task 7.1: Update nav with entity page links

**Files:**
- Modify: `apps/ota/src/components/layout/nav.tsx`

- [ ] **Step 1:** Read the current nav component and add links for Cruise Lines, Destinations, Regions to the navigation. Add them alongside existing links (Deals, Search, etc.). Follow the exact existing pattern for navigation items.

- [ ] **Step 2:** Commit: `feat(ota): add entity page links to navigation`

### Task 7.2: Update next.config image domains

**Files:**
- Modify: `apps/ota/next.config.mjs`

- [ ] **Step 1:** Read the current next.config.mjs. Ensure `dynamic-media-cdn.tripadvisor.com` is in the `images.remotePatterns` array (for TripAdvisor enrichment photos). If not already present, add it.

- [ ] **Step 2:** Commit: `chore(ota): add TripAdvisor CDN to image remote patterns`

---

## Deployment Checklist

After all phases complete:

- [ ] Run `pnpm --filter @tailfire/ota exec tsc --noEmit` — must pass
- [ ] Start dev server: `turbo dev`
- [ ] Test `/cruise-lines` — shows 138 cruise lines
- [ ] Test `/cruise-lines/royal-caribbean-international` (or valid slug) — shows fleet
- [ ] Test `/ships/{slug}` — shows ship detail with gallery
- [ ] Test `/cruises/{sailing-uuid}` — shows itinerary and pricing
- [ ] Test `/destinations` — shows search + grid
- [ ] Test `/destinations/cozumel` — shows enrichment, cruises, photos
- [ ] Test `/destinations/cozumel/cruises` — paginated sailings
- [ ] Test `/regions` — shows all cruise regions
- [ ] Verify PageContextBridge fires on each entity page (check Zustand devtools or console)
- [ ] Verify nav links work
