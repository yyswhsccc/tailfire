# Entity Hub Pages — Implementation Plan (3B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the 5 remaining entity pages (Cruise Line, Ship, Sailing, Region, Deal) to use the Universal Trip Hub shell from Plan 3A — magazine-feed scroll journey with HubHero, streaming sections, and consistent visual rhythm.

**Architecture:** Each page is a rewrite of an existing v1 page. All use the hub shell components from `@/components/hub/` (HubHero, HubContext, FeedSection, FeedDivider, SectionSkeleton) and card library (`@/components/hub/cards/`). Existing components (ItineraryTimeline, CabinPriceGrid, ShipGallery) are reused inside the hub shell. Each page follows the same zone pattern: Hero → Context → Feed sections → Related.

**Tech Stack:** Next.js 15 (App Router, Server Components, Suspense), hub components from Plan 3A, existing fetchers from Plan 2

**Spec:** `docs/superpowers/specs/2026-03-28-entity-trip-hub-design.md` (Section 2)

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Cruise Line Hub** | Rewrite `/cruise-lines/[slug]` | Plan 3A hub shell |
| **2. Ship Hub** | Rewrite `/ships/[slug]` | Plan 3A hub shell |
| **3. Sailing Hub** | Rewrite `/cruises/[slug]` | Plan 3A hub shell |
| **4. Region Hub** | Rewrite `/regions` (add detail page) | Plan 3A hub shell |
| **5. Deal Hub** | Rewrite `/deals/[slug]` | Plan 3A hub shell |

All 5 are independent — any can be implemented in any order.

---

## Shared Patterns

Every entity hub page follows this structure:

```tsx
<>
  <PageContextBridge type={entityType} slug={slug} name={name} />
  <HubHero title={name} badge={badge} imageUrl={imageUrl}>
    <HubHeroMeta items={metaItems} />
    <HubHeroCta primaryLabel={cta} primaryPrompt={prompt} entityType={type} entitySlug={slug} entityName={name} />
  </HubHero>
  <HubContext description={description} pills={pills} />
  {/* Feed sections with Suspense where async */}
  <FeedDivider />
  {/* More sections... */}
  <NearbyScroll title="Related" items={related} />
</>
```

**Imports all pages need:**
```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'
```

---

## Phase 1: Cruise Line Hub

### Task 1.1: Rewrite cruise line detail page

**Files:**
- Rewrite: `apps/ota/src/app/cruise-lines/[slug]/page.tsx`

- [ ] **Step 1:** Read the existing page, then rewrite using hub shell. The cruise line page shows: hero with first ship's image, fleet grid using existing ShipCard, and sailing count stats.

Key data from `fetchCruiseLineBySlug(slug)` → `CruiseLineDetail`:
- `name`, `slug`, `logoUrl`, `shipCount`, `sailingCount`
- `ships: [{ id, name, slug, imageUrl, shipClass }]`
- `upcomingSailingCount`

Hub zones:
- **Hero:** First ship image as background. Badge: "Cruise Line". Stats: X ships, X sailings.
- **CTA:** "Explore [Line Name]"
- **Context:** Description from API (if available via `description` field). Pills: fleet size, regions.
- **Feed 1:** Fleet — grid of ShipCard components (reuse `@/components/ships/ship-card`)
- **No Suspense needed** — all data comes from the single `fetchCruiseLineBySlug` call

```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchCruiseLineBySlug } from '@/lib/fetchers/cruise-lines'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ShipCard } from '@/components/ships/ship-card'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const line = await fetchCruiseLineBySlug(slug)
    return { title: line.name, description: `Explore ${line.name} — ${line.shipCount} ships, ${line.sailingCount.toLocaleString()} sailings.` }
  } catch { return { title: 'Cruise Line Not Found' } }
}

export default async function CruiseLineHubPage({ params }: Props) {
  const { slug } = await params
  let line
  try { line = await fetchCruiseLineBySlug(slug) } catch { notFound() }

  const heroImage = line.ships[0]?.imageUrl || null

  return (
    <>
      <PageContextBridge type="cruise_line" slug={slug} name={line.name} />

      <HubHero title={line.name} badge="Cruise Line" imageUrl={heroImage}>
        <HubHeroMeta items={[
          { label: `🚢 ${line.shipCount} ships` },
          { label: `📅 ${line.sailingCount.toLocaleString()} sailings` },
        ]} />
        <HubHeroCta
          primaryLabel={`Explore ${line.name}`}
          primaryPrompt={`Tell me about ${line.name} cruises`}
          entityType="cruise_line" entitySlug={slug} entityName={line.name}
        />
      </HubHero>

      <HubContext description={null} pills={[
        { emoji: '🚢', label: `${line.shipCount} ships in fleet` },
        { emoji: '📅', label: `${line.upcomingSailingCount} upcoming sailings` },
      ]} />

      <FeedSection title={`🚢 ${line.name} Fleet`}>
        {line.ships.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {line.ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-[#888]">No ships listed yet.</p>
        )}
      </FeedSection>
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): cruise line hub page rewrite`

---

## Phase 2: Ship Hub

### Task 2.1: Rewrite ship detail page

**Files:**
- Rewrite: `apps/ota/src/app/ships/[slug]/page.tsx`

- [ ] **Step 1:** Read existing page, then rewrite. The ship page shows: hero with ship image, specs, gallery, and cruise line link. Reuses `ShipGallery` from `@/components/ships/ship-gallery`.

Key data from `fetchShipBySlug(slug)` → `ShipDetail`:
- `name`, `slug`, `imageUrl`, `shipClass`
- `yearBuilt`, `tonnage`, `passengerCapacity`, `crewCount`, `amenities`
- `cruiseLine: { id, name, slug, logoUrl }`
- `upcomingSailingCount`

Also fetches: `fetchShipImages(ship.id)` for gallery

Hub zones:
- **Hero:** Ship exterior image. Badge: cruise line name. Stats: guests, sailings, tonnage.
- **CTA:** "Explore Sailings on [Ship]"
- **Context:** Description (not available from API yet — use a generic one). Pills: year built, class, crew, restaurants.
- **Feed 1:** Specs grid (reuse InfoItem pattern)
- **Feed 2:** Ship gallery (reuse `ShipGallery`)
- **Link:** "Part of the [Line] fleet" with link

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchShipBySlug, fetchShipImages } from '@/lib/fetchers/ships'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ShipGallery } from '@/components/ships/ship-gallery'
import type { ShipImage } from '@/types/entities'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const ship = await fetchShipBySlug(slug)
    return { title: `${ship.name} — ${ship.cruiseLine.name}`, description: `Explore ${ship.name} by ${ship.cruiseLine.name}. ${ship.upcomingSailingCount} upcoming sailings.` }
  } catch { return { title: 'Ship Not Found' } }
}

export default async function ShipHubPage({ params }: Props) {
  const { slug } = await params
  let ship
  try { ship = await fetchShipBySlug(slug) } catch { notFound() }

  let images: { images: ShipImage[] } = { images: [] }
  try { images = await fetchShipImages(ship.id, 1, 12) } catch {}

  const metaItems: Array<{ label: string }> = []
  if (ship.passengerCapacity) metaItems.push({ label: `👥 ${ship.passengerCapacity.toLocaleString()} guests` })
  metaItems.push({ label: `📅 ${ship.upcomingSailingCount} sailings` })
  if (ship.tonnage) metaItems.push({ label: `⚓ ${Math.round(ship.tonnage / 1000)}K GT` })

  const pills: Array<{ emoji: string; label: string }> = []
  if (ship.yearBuilt) pills.push({ emoji: '🏗️', label: `Built ${ship.yearBuilt}` })
  if (ship.shipClass) pills.push({ emoji: '🚢', label: `${ship.shipClass} Class` })
  if (ship.crewCount) pills.push({ emoji: '👨‍✈️', label: `${ship.crewCount.toLocaleString()} crew` })
  if (ship.tonnage) pills.push({ emoji: '⚓', label: `${ship.tonnage.toLocaleString()} GT` })

  return (
    <>
      <PageContextBridge type="ship" slug={slug} name={ship.name}
        parentContext={{ type: 'cruise_line', slug: ship.cruiseLine.slug, name: ship.cruiseLine.name }} />

      <HubHero title={ship.name} badge={ship.cruiseLine.name} imageUrl={ship.imageUrl}>
        <HubHeroMeta items={metaItems} />
        <HubHeroCta
          primaryLabel={`Explore Sailings on ${ship.name}`}
          primaryPrompt={`Tell me about the ${ship.name}`}
          entityType="ship" entitySlug={slug} entityName={ship.name}
        />
      </HubHero>

      <HubContext description={null} pills={pills.length > 0 ? pills : undefined} />

      {/* Cruise line link */}
      <div className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-10 lg:px-[60px]">
        <p className="text-sm text-[#888]">
          Part of the{' '}
          <Link href={`/cruise-lines/${ship.cruiseLine.slug}`} className="font-medium text-[#C59746] hover:underline">
            {ship.cruiseLine.name}
          </Link>{' '}
          fleet.
        </p>
      </div>

      <FeedDivider />

      {/* Gallery */}
      {images.images.length > 0 && (
        <FeedSection title="📸 Ship Gallery">
          <ShipGallery images={images.images} />
        </FeedSection>
      )}
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): ship hub page rewrite`

---

## Phase 3: Sailing Hub

### Task 3.1: Rewrite sailing detail page

**Files:**
- Rewrite: `apps/ota/src/app/cruises/[slug]/page.tsx`

- [ ] **Step 1:** Read existing page, then rewrite. This is the most complex hub — it has the itinerary timeline + pricing sidebar layout. Reuses `ItineraryTimeline` from `@/components/cruises/itinerary-timeline` and `CabinPriceGrid` from `@/components/cruises/cabin-price-grid`.

Key data from `fetchSailingById(id)` → `SailingDetail`:
- `name`, `sailDate`, `endDate`, `nights`
- `ship: { id, name, slug, imageUrl }`, `cruiseLine: { id, name, slug }`
- `embarkPort`, `disembarkPort`
- `prices: { inside, oceanview, balcony, suite }`
- `itinerary: [{ dayNumber, portName, isSeaDay, arrivalTime, departureTime }]`

Hub zones:
- **Hero:** Ship image. Badge: "Cruise line · Ship name". Stats: nights, ship name, from price.
- **CTA:** "Inquire About This Sailing"
- **Context:** Subtitle with dates. Pills: embark/disembark, sea days.
- **Feed 1:** Itinerary (2/3 width) + Ship card + Pricing (1/3 width) — use CSS grid `lg:grid-cols-[2fr_1fr]`
- **Feed 2:** Cabin pricing via CabinPriceGrid

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchSailingById } from '@/lib/fetchers/sailings'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'
import { ItineraryTimeline } from '@/components/cruises/itinerary-timeline'
import { CabinPriceGrid } from '@/components/cruises/cabin-price-grid'
import { formatPrice } from '@/lib/format'

export const revalidate = 1800

interface Props { params: Promise<{ slug: string }> }

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const s = await fetchSailingById(slug)
    return { title: `${s.name} — ${s.ship.name}`, description: `${s.nights}-night ${s.name} on ${s.ship.name} departing ${fmtDate(s.sailDate)}.` }
  } catch { return { title: 'Sailing Not Found' } }
}

export default async function SailingHubPage({ params }: Props) {
  const { slug } = await params
  let sailing
  try { sailing = await fetchSailingById(slug) } catch { notFound() }

  const cheapest = [sailing.prices.inside, sailing.prices.oceanview, sailing.prices.balcony, sailing.prices.suite]
    .filter((p): p is number => p != null)
  const lowestPrice = cheapest.length > 0 ? Math.min(...cheapest) : null
  const seaDays = sailing.itinerary.filter((s) => s.isSeaDay).length

  return (
    <>
      <PageContextBridge type="sailing" slug={slug} name={sailing.name}
        parentContext={{ type: 'ship', slug: sailing.ship.slug, name: sailing.ship.name }} />

      <HubHero
        title={sailing.name}
        badge={`${sailing.cruiseLine.name} · ${sailing.ship.name}`}
        subtitle={`${fmtDate(sailing.sailDate)} — ${fmtDate(sailing.endDate)}`}
        imageUrl={sailing.ship.imageUrl}
      >
        <HubHeroMeta items={[
          { label: `🌙 ${sailing.nights} nights` },
          { label: `🚢 ${sailing.ship.name}` },
          ...(lowestPrice ? [{ label: `From ${formatPrice(lowestPrice)}/person` }] : []),
        ]} />
        <HubHeroCta
          primaryLabel="Inquire About This Sailing"
          primaryPrompt={`I'm interested in the ${sailing.name} on ${sailing.ship.name} departing ${fmtDate(sailing.sailDate)}`}
          entityType="sailing" entitySlug={slug} entityName={sailing.name}
        />
      </HubHero>

      <HubContext description={null} pills={[
        { emoji: '🚢', label: `Departs ${sailing.embarkPort.name}` },
        { emoji: '🏁', label: `Returns ${sailing.disembarkPort.name}` },
        ...(seaDays > 0 ? [{ emoji: '🌊', label: `${seaDays} sea day${seaDays > 1 ? 's' : ''}` }] : []),
      ]} />

      {/* Itinerary + Ship/Pricing sidebar */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          {/* Left: Itinerary */}
          <div>
            <h2 className="mb-6 text-lg font-bold text-[#1A1A1A] sm:text-xl">📍 Day-by-Day Itinerary</h2>
            <ItineraryTimeline stops={sailing.itinerary} />
          </div>

          {/* Right: Ship card + Pricing */}
          <div>
            <Link
              href={`/ships/${sailing.ship.slug}`}
              className="mb-4 block overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {sailing.ship.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img src={sailing.ship.imageUrl} alt={sailing.ship.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <p className="text-xs text-[#888]">{sailing.cruiseLine.name}</p>
                <p className="text-base font-semibold text-[#1A1A1A]">{sailing.ship.name}</p>
                <p className="mt-1 text-xs text-[#C59746]">View ship details →</p>
              </div>
            </Link>

            <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5">
              <h3 className="mb-4 text-sm font-bold text-[#1A1A1A]">Cabin Pricing</h3>
              <CabinPriceGrid prices={sailing.prices} />
              <p className="mt-3 text-[11px] text-[#aaa]">Per person in CAD · Subject to availability</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): sailing hub page rewrite with itinerary + pricing`

---

## Phase 4: Region Hub

### Task 4.1: Create region detail page

**Files:**
- Create: `apps/ota/src/app/regions/[slug]/page.tsx` (NEW — currently only `/regions` browse exists)

- [ ] **Step 1:** Create a new region detail page. Uses `fetchRegionBySlug(slug)` → `RegionDetail`.

Key data:
- `name`, `slug`, `sailingCount`
- `description`, `upcomingSailingCount`
- `destinations: [{ portId, portName, country }]`

Hub zones:
- **Hero:** No image for now (regions don't have hero images yet). Use brand gradient.
- **CTA:** "Explore the [Region]"
- **Context:** Description. Pills: sailing count, destination count.
- **Feed 1:** Destinations in this region — list of port names linking to destination search

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchRegionBySlug } from '@/lib/fetchers/regions'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { PageContextBridge } from '@/components/page-context-bridge'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const region = await fetchRegionBySlug(slug)
    return { title: region.name, description: `Explore ${region.name} — ${region.sailingCount} cruises.` }
  } catch { return { title: 'Region Not Found' } }
}

export default async function RegionHubPage({ params }: Props) {
  const { slug } = await params
  let region
  try { region = await fetchRegionBySlug(slug) } catch { notFound() }

  return (
    <>
      <PageContextBridge type="region" slug={slug} name={region.name} />

      <HubHero title={region.name} badge="Cruise Region">
        <HubHeroMeta items={[
          { label: `🚢 ${region.sailingCount.toLocaleString()} sailings` },
          { label: `📍 ${region.destinations.length} ports` },
        ]} />
        <HubHeroCta
          primaryLabel={`Explore the ${region.name}`}
          primaryPrompt={`Tell me about cruising in the ${region.name}`}
          entityType="region" entitySlug={slug} entityName={region.name}
        />
      </HubHero>

      <HubContext
        description={region.description}
        pills={[
          { emoji: '🚢', label: `${region.upcomingSailingCount} upcoming sailings` },
          { emoji: '📍', label: `${region.destinations.length} destinations` },
        ]}
      />

      {region.destinations.length > 0 && (
        <FeedSection title={`📍 Destinations in the ${region.name}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {region.destinations.map((dest, i) => (
              <div key={i} className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">{dest.portName}</p>
                {dest.country && <p className="mt-0.5 text-xs text-[#888]">{dest.country}</p>}
              </div>
            ))}
          </div>
        </FeedSection>
      )}
    </>
  )
}
```

- [ ] **Step 2:** Update the region card on `/regions` browse page to link to `/regions/[slug]` instead of `/search/cruises?regionId=`:

In `apps/ota/src/components/regions/region-card.tsx`, change the `href`:
```tsx
// Change: href={`/search/cruises?regionId=${region.id}`}
// To: href={`/regions/${region.slug}`}
```

- [ ] **Step 3:** Commit: `feat(ota): region hub detail page + update region card link`

---

## Phase 5: Deal Hub

### Task 5.1: Rewrite deal detail page

**Files:**
- Rewrite: `apps/ota/src/app/deals/[slug]/page.tsx`

- [ ] **Step 1:** Read the existing deal detail page. The deal page uses data from the existing deals API. Read the Deal type at `apps/ota/src/types/deal.ts` to understand the data shape. Then rewrite using hub shell.

Key approach: The deal page uses `publicFetch` to get deal data. The hero should use the deal's image. The urgencyBadge prop on HubHero shows the expiration. The body shows the deal description, terms, and a CTA to contact an advisor.

Read the existing page first to understand the data shape, then rewrite it to use:
- `HubHero` with `urgencyBadge` for expiration date
- `HubContext` with deal description
- `FeedSection` for deal details/terms
- Keep the existing deal data fetching logic

Since deal data shapes vary, the implementer should READ the existing page and Deal type first, then adapt the hub shell to fit. The key change is visual — same data, new layout.

- [ ] **Step 2:** Commit: `feat(ota): deal hub page rewrite`

---

## Verification Checklist

After all 5 pages are rewritten:

- [ ] `pnpm --filter @tailfire/ota exec tsc --noEmit` passes
- [ ] `/cruise-lines/royal-caribbean` — hub hero with ship image, fleet grid
- [ ] `/ships/harmony-of-the-seas-3597` — hub hero with ship photo, specs pills, gallery
- [ ] `/cruises/{uuid}` — hub hero, itinerary timeline, cabin pricing sidebar
- [ ] `/regions/{slug}` — hub hero (gradient), destinations list
- [ ] `/deals/{slug}` — hub hero with urgency badge, deal description
- [ ] All pages have PageContextBridge
- [ ] All pages have HubHeroCta wired to AI panel
- [ ] Mobile responsive at 375px
- [ ] No console errors
