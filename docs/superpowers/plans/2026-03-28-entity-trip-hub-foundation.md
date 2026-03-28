# Entity Trip Hub Foundation — Implementation Plan (3A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable card library, hub shell components, geolocation service, image safety system, and the Destination hub page as the first working entity type — validating the entire Universal Trip Hub pattern.

**Architecture:** Mobile-first magazine-feed layout with Suspense streaming. Each product section (flights, cruises, hotels, tours) is an independent async Server Component that streams in as data arrives. Geolocation detects the consumer's city for personalized flight results. Image safety ensures no card renders without a verified image.

**Tech Stack:** Next.js 15 (App Router, Server Components, Suspense), Tailwind CSS, Zustand, next/image, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-28-entity-trip-hub-design.md`

**Scope:** This plan covers the foundation (Plan 3A). Plans 3B (remaining 5 entity types) and 3C (deal integration) follow.

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Hub Shell** | HubHero, HubContext, FeedSection, FeedDivider, SectionSkeleton | Nothing |
| **2. Card Library** | 8 reusable card components matching mockup designs | Phase 1 |
| **3. Geolocation** | Location detection, Zustand store, cookie persistence, airport lookup | Nothing (parallel) |
| **4. Image Safety** | SafeImage wrapper, image fallback logic, broken image prevention | Nothing (parallel) |
| **5. Flight/Hotel Fetchers** | Destination-aware flight + hotel search via existing Amadeus APIs | Phase 3 |
| **6. Destination Hub Page** | Complete `/destinations/[slug]` rewrite using all new components | Phases 1-5 |

---

## Phase 1: Hub Shell Components

### Task 1.1: HubHero component

**Files:**
- Create: `apps/ota/src/components/hub/hub-hero.tsx`

- [ ] **Step 1:** Create the universal hero with 3-layer text contrast:

```tsx
import Image from 'next/image'

interface HubHeroProps {
  title: string
  badge?: string
  subtitle?: string
  imageUrl?: string | null
  children?: React.ReactNode       // slot for stats + CTAs
  urgencyBadge?: string            // for deals: "🔥 Limited Time · Ends Apr 30"
}

export function HubHero({ title, badge, subtitle, imageUrl, children, urgencyBadge }: HubHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {/* Background image */}
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

      {/* Back + Save nav */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pt-4 sm:px-10 sm:pt-5">
        <button
          onClick={() => window.history.back()}
          className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md"
        >
          ←
        </button>
      </div>

      {/* Content — positioned at bottom (darkest part of gradient) */}
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

- [ ] **Step 2:** Commit: `feat(ota): HubHero component with 3-layer text contrast`

### Task 1.2: HubContext, FeedSection, FeedDivider, SectionSkeleton

**Files:**
- Create: `apps/ota/src/components/hub/hub-context.tsx`
- Create: `apps/ota/src/components/hub/feed-section.tsx`
- Create: `apps/ota/src/components/hub/feed-divider.tsx`
- Create: `apps/ota/src/components/hub/section-skeleton.tsx`

- [ ] **Step 1:** Create HubContext — description + quick fact pills:

```tsx
interface HubContextProps {
  description?: string | null
  pills?: Array<{ emoji: string; label: string }>
}

export function HubContext({ description, pills }: HubContextProps) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-10 lg:px-[60px]">
      {description && (
        <p className="max-w-[680px] text-sm leading-relaxed text-[#444] sm:text-base sm:leading-[1.8]">
          {description}
        </p>
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

- [ ] **Step 2:** Create FeedSection — section label + "View all" link:

```tsx
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

- [ ] **Step 3:** Create FeedDivider and SectionSkeleton:

```tsx
// feed-divider.tsx
export function FeedDivider() {
  return <div className="mx-auto my-8 h-px max-w-[1280px] bg-[#eee] sm:px-10 lg:px-[60px]"><div className="h-px bg-[#eee]" /></div>
}

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

- [ ] **Step 4:** Commit: `feat(ota): hub shell — context, feed section, divider, skeleton`

### Task 1.3: HubHeroMeta and HubHeroCta components

**Files:**
- Create: `apps/ota/src/components/hub/hub-hero-meta.tsx`
- Create: `apps/ota/src/components/hub/hub-hero-cta.tsx`

- [ ] **Step 1:** Create HubHeroMeta — stats row rendered inside HubHero children slot:

```tsx
interface HubHeroMetaProps {
  items: Array<{ label: string; icon?: string }>
}

export function HubHeroMeta({ items }: HubHeroMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 text-sm text-white/80">
          {i > 0 && <span className="text-white/30">·</span>}
          {item.label}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2:** Create HubHeroCta — primary + secondary CTA buttons:

```tsx
'use client'

import { useAiPanelStore } from '@/stores/ai-panel-store'
import { Heart } from 'lucide-react'

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
        <Heart className="mr-1.5 inline size-3.5" />
        Save
      </button>
    </div>
  )
}
```

- [ ] **Step 3:** Commit: `feat(ota): hub hero meta stats + CTA components`

---

## Phase 2: Card Library

### Task 2.1: CruiseCard v2

**Files:**
- Create: `apps/ota/src/components/hub/cards/cruise-card.tsx`

- [ ] **Step 1:** Create the magazine-style cruise card matching the mockup — image top, cruise line badge on image, sailing name, ship, dates, route, price:

```tsx
import Image from 'next/image'
import Link from 'next/link'
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
  savingsLabel?: string          // "SAVE $1,200" for deal pages
  originalPriceCents?: number | null
}

export function CruiseCard({
  id, name, shipName, shipImageUrl, cruiseLineName,
  sailDate, nights, route, cheapestPriceCents, savingsLabel, originalPriceCents,
}: CruiseCardProps) {
  if (!shipImageUrl) return null  // Image rule: no image = no card

  const dateStr = new Date(sailDate + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <Link
      href={`/cruises/${id}`}
      className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-48 overflow-hidden sm:h-52">
        <Image
          src={shipImageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
        <div className="mt-3 flex items-baseline justify-between">
          {cheapestPriceCents != null ? (
            <div>
              {originalPriceCents != null && (
                <span className="mr-2 text-sm text-[#aaa] line-through">{formatPrice(originalPriceCents)}</span>
              )}
              <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(cheapestPriceCents)}</span>
              <span className="ml-1 text-xs text-[#888]">/person</span>
            </div>
          ) : (
            <span className="text-sm text-[#888]">Contact for pricing</span>
          )}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): CruiseCard v2 — magazine-style with image rules`

### Task 2.2: FlightCard, HotelCard, TourCard

**Files:**
- Create: `apps/ota/src/components/hub/cards/flight-card.tsx`
- Create: `apps/ota/src/components/hub/cards/hotel-card.tsx`
- Create: `apps/ota/src/components/hub/cards/tour-card.tsx`

- [ ] **Step 1:** Create FlightCard — airline, route, direct/stops, price:

```tsx
interface FlightCardProps {
  airline: string
  origin: string
  destination: string
  duration: string
  stops: number
  frequency?: string
  priceCad: string           // e.g. "$712"
  priceLabel?: string        // e.g. "roundtrip from"
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

- [ ] **Step 2:** Create HotelCard — image, name, rating, price/night:

```tsx
import Image from 'next/image'

interface HotelCardProps {
  name: string
  imageUrl: string | null
  rating?: number
  location?: string
  pricePerNight: string       // e.g. "$320"
  starRating?: number
}

export function HotelCard({ name, imageUrl, rating, location, pricePerNight, starRating }: HotelCardProps) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-36 overflow-hidden sm:h-40">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, 50vw" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#f5f5f0] text-2xl text-[#ccc]">🏨</div>
        )}
        <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">🏨 Hotel</span>
      </div>
      <div className="p-3.5 sm:p-4">
        <h3 className="truncate text-sm font-semibold text-[#1A1A1A]">{name}</h3>
        <p className="mt-0.5 text-xs text-[#888]">
          {rating && `⭐ ${rating}`}
          {rating && location && ' · '}
          {location}
          {starRating && ` · ${starRating}-star`}
        </p>
        <p className="mt-2 text-lg font-bold text-[#C59746]">
          {pricePerNight} <span className="text-[11px] font-normal text-[#888]">/night</span>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Create TourCard — horizontal layout (image-left, details-right):

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/lib/format'

interface TourCardProps {
  id: string
  name: string
  operator: string
  days: number
  route?: string
  imageUrl: string | null
  lowestPriceCents: number | null
  inclusions?: string
}

export function TourCard({ id, name, operator, days, route, imageUrl, lowestPriceCents, inclusions }: TourCardProps) {
  if (!imageUrl) return null  // Image rule

  return (
    <Link
      href={`/tours/${id}`}
      className="group flex overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative w-28 shrink-0 overflow-hidden sm:w-48">
        <Image src={imageUrl} alt={name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="200px" />
      </div>
      <div className="flex-1 p-4 sm:p-5">
        <p className="text-[11px] font-semibold text-[#C59746]">{operator}</p>
        <h3 className="mt-1 text-base font-semibold text-[#1A1A1A] sm:text-[16px]">{name}</h3>
        <p className="mt-1 text-sm text-[#888]">{days} days{route ? ` · ${route}` : ''}</p>
        {inclusions && <p className="mt-0.5 text-xs text-[#aaa]">{inclusions}</p>}
        {lowestPriceCents != null && (
          <p className="mt-3 text-lg font-bold text-[#C59746] sm:text-xl">from {formatPrice(lowestPriceCents)}</p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 4:** Commit: `feat(ota): FlightCard, HotelCard, TourCard components`

### Task 2.3: ActivityCard, DestinationCard v2, PhotoMosaic, NearbyScroll

**Files:**
- Create: `apps/ota/src/components/hub/cards/activity-card.tsx`
- Create: `apps/ota/src/components/hub/cards/destination-card-v2.tsx`
- Create: `apps/ota/src/components/hub/cards/photo-mosaic.tsx`
- Create: `apps/ota/src/components/hub/cards/nearby-scroll.tsx`

- [ ] **Step 1:** Create ActivityCard — small card for blended layouts:

```tsx
import Image from 'next/image'

interface ActivityCardProps {
  title: string
  imageUrl: string | null
  rating?: number
  reviewCount?: string
}

export function ActivityCard({ title, imageUrl, rating, reviewCount }: ActivityCardProps) {
  if (!imageUrl) return null  // Image rule

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-24 overflow-hidden sm:h-28">
        <Image src={imageUrl} alt={title} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="(max-width: 640px) 50vw, 25vw" />
        <span className="absolute right-2 top-2 rounded-md bg-white/92 px-2 py-0.5 text-[9px] font-semibold text-[#C59746] backdrop-blur">🎯 Activity</span>
      </div>
      <div className="p-2.5 sm:p-3">
        <h3 className="line-clamp-1 text-xs font-semibold text-[#1A1A1A] sm:text-sm">{title}</h3>
        {rating && (
          <p className="mt-0.5 text-[11px] text-[#888]">⭐ {rating.toFixed(1)}{reviewCount ? ` · ${reviewCount}` : ''}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2:** Create DestinationCardV2 — richer version for hub feeds with image + name + rating + preview:

```tsx
import Image from 'next/image'
import Link from 'next/link'

interface DestinationCardV2Props {
  slug: string
  name: string
  imageUrl: string | null
  rating?: number
  subtitle?: string
  badge?: string               // "Day 2" on sailing pages
  linkLabel?: string           // "Explore destination →"
}

export function DestinationCardV2({ slug, name, imageUrl, rating, subtitle, badge, linkLabel }: DestinationCardV2Props) {
  return (
    <Link
      href={`/destinations/${slug}`}
      className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-36 overflow-hidden sm:h-44">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, 33vw" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-100 to-teal-50 text-2xl text-[#ccc]">📍</div>
        )}
        {badge && (
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">{badge}</span>
        )}
      </div>
      <div className="p-3.5 sm:p-4">
        <h3 className="text-sm font-semibold text-[#1A1A1A] sm:text-[15px]">{name}</h3>
        {(rating || subtitle) && (
          <p className="mt-1 text-xs text-[#888]">
            {rating ? `⭐ ${rating.toFixed(1)}` : ''}
            {rating && subtitle ? ' · ' : ''}
            {subtitle}
          </p>
        )}
        {linkLabel && (
          <p className="mt-2 text-xs font-medium text-[#C59746]">{linkLabel}</p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 3:** Create PhotoMosaic — masonry grid with "+N more":

```tsx
import Image from 'next/image'

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
            i === 0 ? 'col-span-2 row-span-2 h-48 sm:col-span-1 sm:h-auto' : 'h-24 sm:h-auto'
          } ${i === display.length - 1 && remaining > 0 ? '' : ''}`}
        >
          <Image
            src={photo.url}
            alt={photo.caption || 'Photo'}
            fill
            className="object-cover"
            sizes={i === 0 ? '50vw' : '25vw'}
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

- [ ] **Step 4:** Create NearbyScroll — horizontal scroll container:

```tsx
import Image from 'next/image'
import Link from 'next/link'

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
                  <Image src={item.imageUrl} alt={item.name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="200px" />
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

- [ ] **Step 5:** Commit: `feat(ota): ActivityCard, DestinationCardV2, PhotoMosaic, NearbyScroll`

---

## Phase 3: Geolocation

### Task 3.1: Geolocation store + hook

**Files:**
- Create: `apps/ota/src/stores/geolocation-store.ts`
- Create: `apps/ota/src/hooks/use-geolocation.ts`

- [ ] **Step 1:** Create Zustand geolocation store with cookie persistence:

```typescript
// geolocation-store.ts
import { create } from 'zustand'

interface GeoState {
  city: string | null
  airportCode: string | null     // nearest IATA code
  countryCode: string | null
  latitude: number | null
  longitude: number | null
  status: 'idle' | 'detecting' | 'detected' | 'denied' | 'error'
  setLocation: (loc: { city: string; airportCode: string; countryCode?: string; latitude?: number; longitude?: number }) => void
  setStatus: (status: GeoState['status']) => void
}

export const useGeoStore = create<GeoState>((set) => {
  // Read from cookie on init
  let initial: Partial<GeoState> = {}
  if (typeof document !== 'undefined') {
    const cookie = document.cookie.split('; ').find((c) => c.startsWith('ota_geo='))
    if (cookie) {
      try { initial = JSON.parse(decodeURIComponent(cookie.split('=')[1]!)) } catch {}
    }
  }

  return {
    city: initial.city ?? null,
    airportCode: initial.airportCode ?? null,
    countryCode: initial.countryCode ?? null,
    latitude: initial.latitude ?? null,
    longitude: initial.longitude ?? null,
    status: initial.city ? 'detected' : 'idle',

    setLocation: (loc) => {
      set({
        city: loc.city,
        airportCode: loc.airportCode,
        countryCode: loc.countryCode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        status: 'detected',
      })
      // Persist to cookie (90 day expiry)
      if (typeof document !== 'undefined') {
        const val = encodeURIComponent(JSON.stringify(loc))
        document.cookie = `ota_geo=${val}; path=/; max-age=${90 * 86400}; SameSite=Lax`
      }
    },

    setStatus: (status) => set({ status }),
  }
})
```

- [ ] **Step 2:** Create useGeolocation hook that auto-detects on mount:

```typescript
// use-geolocation.ts
'use client'

import { useEffect } from 'react'
import { useGeoStore } from '@/stores/geolocation-store'

export function useGeolocation() {
  const { city, airportCode, status, setLocation, setStatus } = useGeoStore()

  useEffect(() => {
    // Skip if already detected or denied
    if (status !== 'idle') return

    // Try browser geolocation
    if ('geolocation' in navigator) {
      setStatus('detecting')
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            // Reverse geocode via our API
            const res = await fetch(`/api/geolocation?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
            if (res.ok) {
              const data = await res.json()
              setLocation({
                city: data.city,
                airportCode: data.airportCode,
                countryCode: data.countryCode,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              })
            }
          } catch {
            setStatus('error')
          }
        },
        () => setStatus('denied'),
        { timeout: 5000, maximumAge: 86400000 },
      )
    }
  }, [status, setLocation, setStatus])

  return { city, airportCode, status }
}
```

- [ ] **Step 3:** Commit: `feat(ota): geolocation store + auto-detection hook`

### Task 3.2: Geolocation API route

**Files:**
- Create: `apps/ota/src/app/api/geolocation/route.ts`

- [ ] **Step 1:** Create reverse geocode route that maps lat/lng to city + nearest airport:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { serviceFetch } from '@/lib/api'

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get('lat')
  const lng = request.nextUrl.searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    // Use Amadeus airport search to find nearest airport
    const airports = await serviceFetch<Array<{ code: string; name: string; city: string; country: string }>>(
      `/ota/search/airports?keyword=${lat},${lng}&subType=AIRPORT`,
    ).catch(() => [])

    // Fallback: use a simple mapping for major cities
    // In production, this would use a proper geocoding service
    const nearest = airports[0]

    if (nearest) {
      return NextResponse.json({
        city: nearest.city,
        airportCode: nearest.code,
        countryCode: nearest.country,
      })
    }

    return NextResponse.json({ city: null, airportCode: null }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Geolocation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2:** Commit: `feat(ota): geolocation API route for reverse geocoding`

---

## Phase 4: Image Safety

### Task 4.1: SafeImage component

**Files:**
- Create: `apps/ota/src/components/hub/safe-image.tsx`

- [ ] **Step 1:** Create a wrapper around next/image that handles errors:

```tsx
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

  return (
    <Image
      {...props}
      alt={alt}
      onError={() => setError(true)}
    />
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): SafeImage component with error fallback`

---

## Phase 5: Flight + Hotel Fetchers for Destinations

### Task 5.1: Destination-aware flight and hotel fetchers

**Files:**
- Create: `apps/ota/src/lib/fetchers/destination-flights.ts`
- Create: `apps/ota/src/lib/fetchers/destination-hotels.ts`

- [ ] **Step 1:** Create flight fetcher that searches flights to a destination's nearest airport:

```typescript
import { serviceFetch } from '@/lib/api'
import type { FlightOffer } from '@/components/search/flight-result-card'

export async function fetchFlightsToDestination(
  originCode: string,
  destinationCode: string,
  departureDate?: string,
): Promise<{ results: FlightOffer[]; warning?: string }> {
  const date = departureDate || getNextMonth()
  try {
    return await serviceFetch<{ results: FlightOffer[]; warning?: string }>(
      `/ota/search/flights?origin=${originCode}&destination=${destinationCode}&departureDate=${date}&adults=1`,
    )
  } catch {
    return { results: [], warning: 'Flight search unavailable' }
  }
}

function getNextMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2:** Create hotel fetcher:

```typescript
import { serviceFetch } from '@/lib/api'
import type { HotelOffer } from '@/components/search/hotel-result-card'

export async function fetchHotelsAtDestination(
  cityCode: string,
  checkIn?: string,
  checkOut?: string,
): Promise<{ results: HotelOffer[]; warning?: string }> {
  const params = new URLSearchParams({ destination: cityCode })
  if (checkIn) params.set('checkIn', checkIn)
  if (checkOut) params.set('checkOut', checkOut)

  try {
    return await serviceFetch<{ results: HotelOffer[]; warning?: string }>(
      `/ota/search/hotels?${params}`,
    )
  } catch {
    return { results: [], warning: 'Hotel search unavailable' }
  }
}
```

- [ ] **Step 3:** Commit: `feat(ota): destination-aware flight and hotel fetchers`

---

## Phase 6: Destination Hub Page (Full Rewrite)

### Task 6.1: Destination hub page — hero + context + feed

**Files:**
- Rewrite: `apps/ota/src/app/destinations/[slug]/page.tsx`

- [ ] **Step 1:** Rewrite the destination detail page using all new hub components. The page is a Server Component that renders the hero + context instantly, then wraps each product section in Suspense:

```tsx
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
import { DestinationFlightsSection } from './sections/flights-section'
import { DestinationCruisesSection } from './sections/cruises-section'
import { DestinationHotelsActivitiesSection } from './sections/hotels-activities-section'
import { DestinationToursSection } from './sections/tours-section'
import { DestinationPhotosSection } from './sections/photos-section'
import { DestinationNearbySection } from './sections/nearby-section'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const dest = await fetchDestinationBySlug(slug)
    return {
      title: dest.name,
      description: dest.enrichment?.summary || dest.summary || `Explore ${dest.name} — flights, cruises, hotels, tours, and things to do.`,
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

  // Build quick fact pills
  const pills: Array<{ emoji: string; label: string }> = []
  if (destination.countryCode) pills.push({ emoji: '📍', label: destination.countryCode })
  // Airport, currency, timezone could come from enrichment metadata in the future

  // Hero meta items
  const metaItems: Array<{ label: string }> = []
  if (enrichment?.averageRating) metaItems.push({ label: `⭐ ${enrichment.averageRating.toFixed(1)}` })
  if (enrichment?.totalReviewCount) metaItems.push({ label: `${enrichment.totalReviewCount.toLocaleString()} reviews` })
  if (destination.stats.cruiseCount > 0) metaItems.push({ label: `${destination.stats.cruiseCount} cruises` })
  if (destination.stats.tourCount > 0) metaItems.push({ label: `${destination.stats.tourCount} tours` })

  return (
    <>
      <PageContextBridge type="destination" slug={slug} name={destination.name} />

      <HubHero
        title={destination.name}
        badge={destination.countryCode || undefined}
        imageUrl={heroImage}
      >
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

      {/* Flights — streams in via Suspense */}
      <Suspense fallback={<SectionSkeleton cardCount={3} />}>
        <DestinationFlightsSection destinationName={destination.name} />
      </Suspense>

      <FeedDivider />

      {/* Cruises */}
      <Suspense fallback={<SectionSkeleton cardCount={2} />}>
        <DestinationCruisesSection slug={slug} destinationName={destination.name} />
      </Suspense>

      <FeedDivider />

      {/* Hotels + Activities blended */}
      <Suspense fallback={<SectionSkeleton cardCount={3} />}>
        <DestinationHotelsActivitiesSection
          destinationName={destination.name}
          enrichment={enrichment}
        />
      </Suspense>

      <FeedDivider />

      {/* Tours */}
      <Suspense fallback={<SectionSkeleton cardCount={2} />}>
        <DestinationToursSection slug={slug} destinationName={destination.name} />
      </Suspense>

      <FeedDivider />

      {/* Photos */}
      <DestinationPhotosSection photos={enrichment?.photos || []} />

      <FeedDivider />

      {/* Nearby */}
      <DestinationNearbySection />
    </>
  )
}
```

- [ ] **Step 2:** Commit: `feat(ota): destination hub page with Suspense streaming sections`

### Task 6.2: Destination feed sections (flights, cruises, hotels+activities, tours, photos, nearby)

**Files:**
- Create: `apps/ota/src/app/destinations/[slug]/sections/flights-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/cruises-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/hotels-activities-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/tours-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/photos-section.tsx`
- Create: `apps/ota/src/app/destinations/[slug]/sections/nearby-section.tsx`

- [ ] **Step 1:** Create flights section — async Server Component that reads geolocation from cookies and fetches flights:

```tsx
// flights-section.tsx
import { cookies } from 'next/headers'
import { FeedSection } from '@/components/hub/feed-section'
import { FlightCard } from '@/components/hub/cards/flight-card'
import { fetchFlightsToDestination } from '@/lib/fetchers/destination-flights'

interface Props {
  destinationName: string
  destinationAirportCode?: string  // IATA code for nearest airport
}

export async function DestinationFlightsSection({ destinationName, destinationAirportCode }: Props) {
  // Read geolocation from cookie
  const cookieStore = await cookies()
  const geoCookie = cookieStore.get('ota_geo')
  let originCode: string | null = null
  let originCity: string | null = null

  if (geoCookie) {
    try {
      const geo = JSON.parse(decodeURIComponent(geoCookie.value))
      originCode = geo.airportCode
      originCity = geo.city
    } catch {}
  }

  // Can't show flights without origin or destination airport
  if (!originCode || !destinationAirportCode) return null

  const { results } = await fetchFlightsToDestination(originCode, destinationAirportCode)
  if (results.length === 0) return null

  // Map API results to card props (take top 3)
  const flights = results.slice(0, 3).map((offer) => {
    const firstSeg = offer.segments[0]!
    const lastSeg = offer.segments[offer.segments.length - 1]!
    const totalStops = offer.segments.reduce((sum, s) => sum + s.stops, 0) + (offer.segments.length - 1)
    return {
      airline: firstSeg.carrierName || firstSeg.carrier,
      origin: firstSeg.departure.iataCode,
      destination: lastSeg.arrival.iataCode,
      duration: firstSeg.duration.replace('PT', '').replace('H', 'h ').replace('M', 'm'),
      stops: totalStops,
      priceCad: `$${parseFloat(offer.price.total).toFixed(0)}`,
      priceLabel: 'roundtrip from',
    }
  })

  return (
    <FeedSection
      title={`✈️ Flights to ${destinationName}`}
      subtitle={`From ${originCity} (${originCode}) · Detected from your location`}
      viewAllHref={`/search/flights?destination=${destinationAirportCode}&origin=${originCode}`}
      viewAllLabel="Search all flights →"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flights.map((f, i) => <FlightCard key={i} {...f} />)}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 2:** Create cruises section — fetches paginated cruises at destination:

```tsx
// cruises-section.tsx
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

- [ ] **Step 3:** Create hotels+activities blended section — 2/3 hotels + 1/3 activities on desktop:

```tsx
// hotels-activities-section.tsx
import { FeedSection } from '@/components/hub/feed-section'
import { HotelCard } from '@/components/hub/cards/hotel-card'
import { ActivityCard } from '@/components/hub/cards/activity-card'
import type { DestinationDetail } from '@/types/entities'

interface Props {
  destinationName: string
  enrichment: DestinationDetail['enrichment']
}

export async function DestinationHotelsActivitiesSection({ destinationName, enrichment }: Props) {
  const activities = enrichment?.topAttractions || []
  // Hotels would come from Amadeus — for now show activities only
  // Hotels integration can be added when we wire up the hotel fetcher with city codes

  if (activities.length === 0) return null

  return (
    <FeedSection title={`🎯 Things to Do in ${destinationName}`}>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {activities.slice(0, 8).map((activity, i) => (
          <ActivityCard
            key={i}
            title={activity.title}
            imageUrl={enrichment?.photos?.[i]?.url || null}
            rating={activity.rating}
          />
        ))}
      </div>
    </FeedSection>
  )
}
```

- [ ] **Step 4:** Create tours, photos, nearby sections:

```tsx
// tours-section.tsx
import { FeedSection } from '@/components/hub/feed-section'
import { TourCard } from '@/components/hub/cards/tour-card'
import { fetchDestinationBySlug } from '@/lib/fetchers/destinations'

interface Props { slug: string; destinationName: string }

export async function DestinationToursSection({ slug, destinationName }: Props) {
  // Tours at destination — placeholder until tour-destination linkage is built
  return null
}

// photos-section.tsx
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

// nearby-section.tsx
import { NearbyScroll } from '@/components/hub/cards/nearby-scroll'

export function DestinationNearbySection() {
  // Nearby destinations — requires geo proximity query
  // For now, render nothing. Will be wired in Plan 3B.
  return null
}
```

- [ ] **Step 5:** Commit: `feat(ota): destination hub feed sections — flights, cruises, activities, photos`

### Task 6.3: Update next.config for new image domains

**Files:**
- Modify: `apps/ota/next.config.mjs`

- [ ] **Step 1:** Ensure all required image domains are in `images.remotePatterns`. Check and add if missing: `images.unsplash.com` (for Unsplash-sourced destination images).

- [ ] **Step 2:** Commit: `chore(ota): add Unsplash image domain to next.config`

### Task 6.4: Type check + browser test

- [ ] **Step 1:** Run `pnpm --filter @tailfire/ota exec tsc --noEmit` — must pass clean
- [ ] **Step 2:** Run `pnpm --filter @tailfire/api typecheck` — must pass clean
- [ ] **Step 3:** Start dev server: `turbo dev`
- [ ] **Step 4:** Test `/destinations/miami-florida` — verify: hero with image + contrast, description + pills, flights section (if geo detected), cruises section with CruiseCard v2, activities with cards, photo mosaic
- [ ] **Step 5:** Test mobile viewport (375px) — verify cards stack properly, hero is taller, padding is tighter

---

## Deployment Checklist

After all phases complete:
- [ ] Both type checks pass
- [ ] Destination hub renders with all sections streaming
- [ ] Hero text is readable on bright AND dark images
- [ ] Cruise cards respect image rule (no image = no card)
- [ ] Activity cards respect image rule
- [ ] Photo mosaic renders correctly with "+N more"
- [ ] Geolocation prompts and stores in cookie
- [ ] Flights section appears when geolocation is available
- [ ] Mobile layout tested at 375px
- [ ] PageContextBridge fires on page load
- [ ] No console errors
