# Entity Trip Hub Foundation — Implementation Plan (3A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable card library, hub shell components, image safety system, and the Destination hub page as the first working entity type — validating the entire Universal Trip Hub pattern.

**Architecture:** Mobile-first magazine-feed layout with Suspense streaming. Cruises stream in as async Server Components. Activities render text-only from cached enrichment (no image-by-index pairing). All image-bearing cards use SafeImage with error fallback. No tabs — one continuous scroll journey.

**Tech Stack:** Next.js 15 (App Router, Server Components, Suspense), Tailwind CSS, Zustand, next/image, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-28-entity-trip-hub-design.md`

**Scope:** This plan covers the foundation (Plan 3A). Plans 3B (remaining 5 entity types + flights + geolocation + hotels + tours + nearby) and 3C (deal integration) follow.

**Codex-validated (2 passes):**
- HubHero back button extracted to client child (no `window` in Server Component)
- SafeImage threaded through ALL image-bearing card components
- Flights, hotels, tours, nearby, geolocation ALL deferred to 3B (needs destination→airport mapping + reverse-geocode backend)
- Activity cards render text-only for 3A (no image-by-index pairing — violates image safety rule)
- Suspense pattern validated for Next.js 15 async Server Components

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Hub Shell** | HubHero, HubBackButton, HubContext, FeedSection, FeedDivider, SectionSkeleton | Nothing |
| **2. Image Safety** | SafeImage wrapper with onError fallback | Nothing (parallel) |
| **3. Card Library** | 5 reusable card components using SafeImage | Phases 1-2 |
| **4. Destination Hub Page** | Complete `/destinations/[slug]` rewrite using all new components | Phases 1-3 |

---

## Phase 1: Hub Shell Components

### Task 1.1: HubHero + HubBackButton

**Files:**
- Create: `apps/ota/src/components/hub/hub-hero.tsx` (Server Component)
- Create: `apps/ota/src/components/hub/hub-back-button.tsx` (Client Component)

- [ ] **Step 1:** Create HubBackButton — a tiny client component for the back navigation:

```tsx
// hub-back-button.tsx
'use client'

import { useRouter } from 'next/navigation'

export function HubBackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="flex size-10 items-center justify-center rounded-full bg-white/15 text-lg text-white backdrop-blur-md transition-colors hover:bg-white/25"
      aria-label="Go back"
    >
      ←
    </button>
  )
}
```

- [ ] **Step 2:** Create HubHero — Server Component with 3-layer text contrast. Uses HubBackButton as a client child:

```tsx
// hub-hero.tsx
import Image from 'next/image'
import { HubBackButton } from './hub-back-button'

interface HubHeroProps {
  title: string
  badge?: string
  subtitle?: string
  imageUrl?: string | null
  children?: React.ReactNode
  urgencyBadge?: string
}

export function HubHero({ title, badge, subtitle, imageUrl, children, urgencyBadge }: HubHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      )}
      {/* 3-layer contrast: gradient scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />

      {/* Back nav — client component */}
      <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-4 sm:px-10 sm:pt-5">
        <HubBackButton />
      </div>

      {/* Content at bottom (darkest gradient zone) */}
      <div className="relative mx-auto max-w-[1280px] px-4 pb-8 pt-48 sm:px-10 sm:pb-10 sm:pt-56 lg:px-[60px] lg:pb-10 lg:pt-64">
        {urgencyBadge && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
            {urgencyBadge}
          </span>
        )}
        {badge && (
          <p className="text-xs font-semibold uppercase tracking-[3px] text-[#C59746] [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {badge}
          </p>
        )}
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-4xl lg:text-[56px] lg:leading-[1.05]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-base">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): HubHero with 3-layer contrast + client HubBackButton`

### Task 1.2: HubHeroMeta, HubHeroCta, HubContext, FeedSection, FeedDivider, SectionSkeleton

**Files:**
- Create: `apps/ota/src/components/hub/hub-hero-meta.tsx` (Server Component)
- Create: `apps/ota/src/components/hub/hub-hero-cta.tsx` (Client Component — uses Zustand)
- Create: `apps/ota/src/components/hub/hub-context.tsx` (Server Component)
- Create: `apps/ota/src/components/hub/feed-section.tsx` (Server Component)
- Create: `apps/ota/src/components/hub/feed-divider.tsx` (Server Component)
- Create: `apps/ota/src/components/hub/section-skeleton.tsx` (Server Component)

- [ ] **Step 1:** Create HubHeroMeta — stats displayed in the hero:

```tsx
// hub-hero-meta.tsx
interface HubHeroMetaProps {
  items: Array<{ label: string }>
}

export function HubHeroMeta({ items }: HubHeroMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {items.map((item, i) => (
        <span key={i} className="text-sm text-white/80">
          {i > 0 && <span className="mr-3 text-white/30">·</span>}
          {item.label}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2:** Create HubHeroCta — client component with Inquire + Save:

```tsx
// hub-hero-cta.tsx
'use client'

import { Heart } from 'lucide-react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface HubHeroCtaProps {
  primaryLabel: string
  primaryPrompt: string
  entityType: string
  entitySlug: string
  entityName: string
}

export function HubHeroCta({ primaryLabel, primaryPrompt, entityType, entitySlug, entityName }: HubHeroCtaProps) {
  const { open, addJourneyItem } = useAiPanelStore()

  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <button
        onClick={() => open({ prefill: primaryPrompt })}
        className="rounded-[10px] bg-[#C59746] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:px-7"
      >
        ✨ {primaryLabel}
      </button>
      <button
        onClick={() => addJourneyItem({ type: entityType, slug: entitySlug, name: entityName })}
        className="rounded-[10px] border border-white/25 bg-white/15 px-4 py-3 text-sm text-white backdrop-blur-md transition-colors hover:bg-white/25"
      >
        <Heart className="mr-1.5 inline size-3.5" /> Save
      </button>
    </div>
  )
}
```

- [ ] **Step 3:** Create HubContext, FeedSection, FeedDivider, SectionSkeleton:

```tsx
// hub-context.tsx
interface HubContextProps {
  description?: string | null
  pills?: Array<{ emoji: string; label: string }>
}

export function HubContext({ description, pills }: HubContextProps) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-10 lg:px-[60px]">
      {description && (
        <p className="max-w-[680px] text-sm leading-relaxed text-[#444] sm:text-base sm:leading-[1.8]">{description}</p>
      )}
      {pills && pills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pills.map((pill, i) => (
            <span key={i} className="rounded-2xl border border-[#eee] bg-white px-3.5 py-1.5 text-xs text-[#666]">
              {pill.emoji} {pill.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

```tsx
// feed-section.tsx
import Link from 'next/link'

interface FeedSectionProps {
  title: string
  viewAllHref?: string
  viewAllLabel?: string
  subtitle?: string
  children: React.ReactNode
}

export function FeedSection({ title, viewAllHref, viewAllLabel, subtitle, children }: FeedSectionProps) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[#1A1A1A] sm:text-xl">{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm font-medium text-[#C59746] hover:underline">
            {viewAllLabel || 'View all →'}
          </Link>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-[#888] sm:text-sm">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}
```

```tsx
// feed-divider.tsx
export function FeedDivider() {
  return (
    <div className="mx-auto my-8 max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
      <div className="h-px bg-[#eee]" />
    </div>
  )
}
```

```tsx
// section-skeleton.tsx
export function SectionSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
      <div className="mb-4 h-6 w-48 animate-pulse rounded bg-[#eee]" />
      <div className={`grid gap-4 ${cardCount <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-[#f0f0f0]">
            <div className="h-40 animate-pulse bg-[#f0f0f0]" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-[#eee]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#eee]" />
              <div className="h-5 w-20 animate-pulse rounded bg-[#eee]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4:** Commit: `feat(ota): hub shell — meta, CTA, context, feed section, divider, skeleton`

---

## Phase 2: Image Safety

### Task 2.1: SafeImage component

**Files:**
- Create: `apps/ota/src/components/hub/safe-image.tsx` (Client Component)

- [ ] **Step 1:** Create SafeImage — wraps next/image with error handling:

```tsx
// safe-image.tsx
'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

interface SafeImageProps extends Omit<ImageProps, 'onError'> {
  fallback?: React.ReactNode
  hideOnError?: boolean
}

export function SafeImage({ fallback, hideOnError = false, alt, ...props }: SafeImageProps) {
  const [error, setError] = useState(false)

  if (error) {
    if (hideOnError) return null
    return fallback ? <>{fallback}</> : null
  }

  return <Image {...props} alt={alt} onError={() => setError(true)} />
}
```

- [ ] **Step 2:** Commit: `feat(ota): SafeImage component with error fallback`

---

## Phase 3: Card Library

### Task 3.1: CruiseCard v2

**Files:**
- Create: `apps/ota/src/components/hub/cards/cruise-card.tsx`

- [ ] **Step 1:** Create the magazine-style cruise card. Uses SafeImage. Returns null if no ship image (image rule):

```tsx
import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { formatPrice } from '@/lib/format'

interface CruiseCardProps {
  id: string
  name: string
  shipName: string
  shipImageUrl: string | null
  cruiseLineName: string
  sailDate: string
  nights: number
  route?: string
  cheapestPriceCents: number | null
  savingsLabel?: string
  originalPriceCents?: number | null
}

export function CruiseCard({
  id, name, shipName, shipImageUrl, cruiseLineName,
  sailDate, nights, route, cheapestPriceCents, savingsLabel, originalPriceCents,
}: CruiseCardProps) {
  if (!shipImageUrl) return null

  const dateStr = new Date(sailDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <Link
      href={`/cruises/${id}`}
      className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-48 overflow-hidden sm:h-52">
        <SafeImage
          src={shipImageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          hideOnError
        />
        <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
          🚢 {nights} Nights
        </span>
        <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
          {cruiseLineName}
        </span>
        {savingsLabel && (
          <span className="absolute left-2.5 top-2.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
            {savingsLabel}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{name}</h3>
        <p className="mt-1 text-sm text-[#888]">{shipName} · {dateStr}</p>
        {route && <p className="mt-1 text-xs text-[#aaa]">{route}</p>}
        {cheapestPriceCents != null && (
          <div className="mt-3">
            {originalPriceCents != null && (
              <span className="mr-2 text-sm text-[#aaa] line-through">{formatPrice(originalPriceCents)}</span>
            )}
            <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(cheapestPriceCents)}</span>
            <span className="ml-1 text-xs text-[#888]">/person</span>
          </div>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): CruiseCard v2 with SafeImage + image rules`

### Task 3.2: FlightCard + ActivityCard

**Files:**
- Create: `apps/ota/src/components/hub/cards/flight-card.tsx`
- Create: `apps/ota/src/components/hub/cards/activity-card.tsx`

- [ ] **Step 1:** Create FlightCard (no image needed — text-only card):

```tsx
interface FlightCardProps {
  airline: string
  origin: string
  destination: string
  duration: string
  stops: number
  frequency?: string
  priceCad: string
  priceLabel?: string
}

export function FlightCard({ airline, origin, destination, duration, stops, frequency, priceCad, priceLabel }: FlightCardProps) {
  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#1A1A1A]">{airline}</span>
        {stops === 0 ? (
          <span className="rounded-xl bg-[#edf7ee] px-2.5 py-0.5 text-[11px] font-medium text-[#2a9d3a]">Direct</span>
        ) : (
          <span className="text-[11px] text-[#888]">{stops} stop{stops > 1 ? 's' : ''}</span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-[#888]">{origin} → {destination} · {duration}</p>
      {frequency && <p className="mt-0.5 text-xs text-[#aaa]">{frequency}</p>}
      <p className="mt-2.5 text-xl font-bold text-[#C59746] sm:text-[22px]">{priceCad}</p>
      {priceLabel && <p className="text-[11px] text-[#aaa]">{priceLabel}</p>}
    </div>
  )
}
```

- [ ] **Step 2:** Create ActivityCard — TEXT-ONLY for 3A (no images, avoids image-by-index pairing that violates image safety rules). Images will be added in 3B when we have verified per-attraction images:

```tsx
interface ActivityCardProps {
  title: string
  rating?: number
  description?: string
}

export function ActivityCard({ title, rating, description }: ActivityCardProps) {
  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>
      {rating != null && rating > 0 && (
        <p className="mt-1 text-xs text-[#C59746]">{'★'.repeat(Math.round(rating))} {rating.toFixed(1)}</p>
      )}
      {description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-[#888]">{description}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): FlightCard + ActivityCard with SafeImage`

### Task 3.3: PhotoMosaic + NearbyScroll

**Files:**
- Create: `apps/ota/src/components/hub/cards/photo-mosaic.tsx`
- Create: `apps/ota/src/components/hub/cards/nearby-scroll.tsx`

- [ ] **Step 1:** Create PhotoMosaic with SafeImage:

```tsx
import { SafeImage } from '@/components/hub/safe-image'

interface PhotoMosaicProps {
  photos: Array<{ url: string; caption?: string }>
  totalCount: number
}

export function PhotoMosaic({ photos, totalCount }: PhotoMosaicProps) {
  if (photos.length === 0) return null
  const display = photos.slice(0, 5)
  const remaining = totalCount - display.length

  return (
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-2xl sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-2">
      {display.map((photo, i) => (
        <div
          key={i}
          className={`relative overflow-hidden ${
            i === 0 ? 'col-span-2 row-span-1 h-48 sm:col-span-1 sm:row-span-2 sm:h-auto' : 'h-24 sm:h-auto'
          }`}
        >
          <SafeImage
            src={photo.url}
            alt={photo.caption || 'Photo'}
            fill
            className="object-cover"
            sizes={i === 0 ? '50vw' : '25vw'}
            hideOnError
          />
          {i === display.length - 1 && remaining > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-base font-semibold text-white sm:text-lg">
              +{remaining} more
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2:** Create NearbyScroll with SafeImage:

```tsx
import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'

interface NearbyItem {
  slug: string
  href: string
  name: string
  imageUrl: string | null
  subtitle: string
}

interface NearbyScrollProps {
  title: string
  viewAllHref?: string
  items: NearbyItem[]
}

export function NearbyScroll({ title, viewAllHref, items }: NearbyScrollProps) {
  if (items.length === 0) return null

  return (
    <div className="bg-[#f4f3f0] px-4 py-10 sm:px-10 lg:px-[60px]">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-[#1A1A1A] sm:text-xl">{title}</h2>
          {viewAllHref && (
            <Link href={viewAllHref} className="text-sm font-medium text-[#C59746] hover:underline">View all →</Link>
          )}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((item) => (
            <Link
              key={item.slug}
              href={item.href}
              className="group w-48 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:w-52"
            >
              <div className="relative h-28 overflow-hidden sm:h-32">
                {item.imageUrl ? (
                  <SafeImage src={item.imageUrl} alt={item.name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="200px" hideOnError />
                ) : (
                  <div className="h-full bg-gradient-to-br from-[#e8e8e8] to-[#d8d8d8]" />
                )}
              </div>
              <div className="p-3">
                <h4 className="text-sm font-semibold text-[#1A1A1A]">{item.name}</h4>
                <p className="text-[11px] text-[#888]">{item.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): PhotoMosaic + NearbyScroll with SafeImage`

---

## Phase 4: Destination Hub Page (Full Rewrite)

### Task 4.1: Destination hub — hero + context + streaming feed

**Files:**
- Rewrite: `apps/ota/src/app/destinations/[slug]/page.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/cruises-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/activities-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/photos-section.tsx`

- [ ] **Step 1:** Rewrite the destination page as a streaming hub. Hero + context render instantly. Cruises and activities stream via Suspense. Flights are client-fetched:

```tsx
// page.tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchDestinationBySlug } from '@/lib/fetchers/destinations'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroMeta } from '@/components/hub/hub-hero-meta'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedDivider } from '@/components/hub/feed-divider'
import { SectionSkeleton } from '@/components/hub/section-skeleton'
import { PageContextBridge } from '@/components/page-context-bridge'
import { DestinationCruisesSection } from './sections/cruises-section'
import { DestinationActivitiesSection } from './sections/activities-section'
import { DestinationPhotosSection } from './sections/photos-section'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description: dest.enrichment?.summary || dest.summary || `Explore ${dest.name}`,
    }
  } catch { return { title: 'Destination Not Found' } }
}

export default async function DestinationHubPage({ params }: Props) {
  const { slug } = await params
  let destination
  try { destination = await fetchDestinationBySlug(slug) } catch { notFound() }

  const enrichment = destination.enrichment
  const description = enrichment?.summary || destination.summary
  const heroImage = destination.heroImageUrl || enrichment?.photos?.[0]?.url

  const pills: Array<{ emoji: string; label: string }> = []
  if (destination.countryCode) pills.push({ emoji: '📍', label: destination.countryCode })

  const metaItems: Array<{ label: string }> = []
  if (enrichment?.averageRating) metaItems.push({ label: `⭐ ${enrichment.averageRating.toFixed(1)}` })
  if (enrichment?.totalReviewCount) metaItems.push({ label: `${enrichment.totalReviewCount.toLocaleString()} reviews` })

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <HubHero title={destination.name} badge={destination.countryCode || undefined} imageUrl={heroImage}>
        {metaItems.length > 0 && <HubHeroMeta items={metaItems} />}
        <HubHeroCta
          primaryLabel={`Plan a Trip to ${destination.name}`}
          primaryPrompt={`Help me plan a trip to ${destination.name}`}
          entityType="destination"
          entitySlug={slug}
          entityName={destination.name}
        />
      </HubHero>

      <HubContext description={description} pills={pills.length > 0 ? pills : undefined} />

      {/* Cruises — SSR streamed via Suspense */}
      <Suspense fallback={<SectionSkeleton cardCount={2} />}>
        <DestinationCruisesSection slug={slug} destinationName={destination.name} />
      </Suspense>

      <FeedDivider />

      {/* Activities — from enrichment cache, instant */}
      <DestinationActivitiesSection destinationName={destination.name} enrichment={enrichment} />

      <FeedDivider />

      {/* Photos — from enrichment cache, instant */}
      <DestinationPhotosSection photos={enrichment?.photos || []} />
    </>
  )
}
```

- [ ] **Step 2:** Create cruises section (async Server Component):

```tsx
// sections/cruises-section.tsx
import { FeedSection } from '@/components/hub/feed-section'
import { CruiseCard } from '@/components/hub/cards/cruise-card'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'

interface Props { slug: string; destinationName: string }

export async function DestinationCruisesSection({ slug, destinationName }: Props) {
  let data
  try { data = await fetchDestinationCruises(slug, 1, 4) } catch { return null }
  if (data.sailings.length === 0) return null

  return (
    <FeedSection
      title={`🚢 Cruises Visiting ${destinationName}`}
      subtitle={`${data.total} sailings stopping here`}
      viewAllHref={`/destinations/${slug}/cruises`}
      viewAllLabel={`View all ${data.total} →`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {data.sailings.slice(0, 4).map((s: any) => (
          <CruiseCard
            key={s.id}
            id={s.id}
            name={s.name}
            shipName={s.shipName}
            shipImageUrl={s.shipImageUrl}
            cruiseLineName={s.cruiseLineName}
            sailDate={s.sailDate}
            nights={s.nights}
            cheapestPriceCents={s.cheapestInsideCents}
          />
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 3:** Create activities section and photos section:

```tsx
// sections/activities-section.tsx
import { FeedSection } from '@/components/hub/feed-section'
import { ActivityCard } from '@/components/hub/cards/activity-card'
import type { DestinationDetail } from '@/types/entities'

interface Props {
  destinationName: string
  enrichment: DestinationDetail['enrichment']
}

export function DestinationActivitiesSection({ destinationName, enrichment }: Props) {
  const activities = enrichment?.topAttractions || []
  if (activities.length === 0) return null

  return (
    <FeedSection title={`🎯 Things to Do in ${destinationName}`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {activities.slice(0, 8).map((activity, i) => (
          <ActivityCard
            key={i}
            title={activity.title}
            rating={activity.rating}
            description={activity.description}
          />
        ))}
      </div>
    </FeedSection>
  )
}

// sections/photos-section.tsx
import { FeedSection } from '@/components/hub/feed-section'
import { PhotoMosaic } from '@/components/hub/cards/photo-mosaic'

interface Props { photos: Array<{ url: string; caption?: string }> }

export function DestinationPhotosSection({ photos }: Props) {
  if (photos.length === 0) return null
  return (
    <FeedSection title="📸 Photos">
      <PhotoMosaic photos={photos} totalCount={photos.length} />
    </FeedSection>
  )
}
```

- [ ] **Step 4:** Commit: `feat(ota): destination hub page — streaming magazine-feed layout`

### Task 5.2: Type check + verify

- [ ] **Step 1:** Run `pnpm --filter @tailfire/ota exec tsc --noEmit` — must pass
- [ ] **Step 2:** Run `pnpm --filter @tailfire/api typecheck` — must pass
- [ ] **Step 3:** Start `turbo dev`, test `/destinations/miami-florida`:
  - Hero with image + 3-layer text contrast
  - Description + pills
  - Flights section (client-side, with input for origin)
  - Cruise cards streaming in via Suspense
  - Activity cards from enrichment
  - Photo mosaic
  - All responsive at 375px mobile viewport

---

## Deployment Checklist

- [ ] Both type checks pass
- [ ] Hero text readable on bright AND dark images
- [ ] Cards with no image don't render (SafeImage + null return)
- [ ] Flights section works as client component (no SSR hydration errors)
- [ ] Cruise section streams in via Suspense (skeleton → cards)
- [ ] Mobile layout tested at 375px
- [ ] PageContextBridge fires on page load
- [ ] No console errors

## Deferred to Plan 3B

- **Flights section** (needs destination → airport IATA code mapping + geolocation)
- **Geolocation auto-detect** (reverse geocoding backend — reuse existing `apps/api/src/geocoding/geocoding.service.ts`)
- **Hotels section** (needs destination → Amadeus city code mapping)
- **Tours section** (needs tour-destination linkage)
- **Nearby destinations section** (needs geo proximity query)
- **Activity card images** (need verified per-attraction image URLs, not index-based pairing)
- **Remaining 5 entity types** (Ship, Cruise Line, Sailing, Region, Deal)
- **Deal matching + banners**
