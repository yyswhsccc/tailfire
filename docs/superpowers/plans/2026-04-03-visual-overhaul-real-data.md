# Visual Overhaul + Real Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign product cards to match the Dream Board aesthetic, add a travel date session for real flight/hotel data on entity pages, and implement preemptive image caching.

**Architecture:** A `TravelSessionStore` persists travel dates in cookies across pages. When dates exist, FlightsSection and HotelsSection fetch real Amadeus/Google Places data server-side. All `full` variant cards are redesigned to use a shared `ImageCardFrame` matching the Dream Board's image-forward visual treatment.

**Tech Stack:** Next.js 15 App Router, Zustand (persisted to cookies), Amadeus Flight Offers API, Google Places + Amadeus Hotels API, Tailwind CSS, `next/image`

**Spec:** `docs/superpowers/specs/2026-04-03-visual-overhaul-real-data-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `apps/ota/src/stores/travel-session-store.ts` | Zustand store for travel dates, origin, adults — persisted to cookie |
| `apps/ota/src/components/hub/travel-date-prompt.tsx` | Date range prompt bar shown when no dates set |
| `apps/ota/src/components/cards/image-card-frame.tsx` | Shared visual chrome for image-forward cards (Dream Board style) |

### Modified Files

| File | Change |
|------|--------|
| `apps/ota/src/components/cards/cruise-product-card.tsx` | Redesign `full` variant using ImageCardFrame |
| `apps/ota/src/components/cards/flight-product-card.tsx` | Redesign `full` variant using ImageCardFrame + destination image |
| `apps/ota/src/components/cards/hotel-product-card.tsx` | Redesign `full` variant using ImageCardFrame |
| `apps/ota/src/components/cards/tour-product-card.tsx` | Redesign `full` variant using ImageCardFrame |
| `apps/ota/src/components/cards/activity-product-card.tsx` | Redesign `full` variant using ImageCardFrame |
| `apps/ota/src/components/cards/promotion-card.tsx` | Redesign `full` variant using ImageCardFrame |
| `apps/ota/src/components/hub/hub-scaffold.tsx` | Add TravelDatePrompt between AI prompt and sections |
| `apps/ota/src/components/hub/sections/flights-section.tsx` | Fetch real Amadeus data when travel dates exist |
| `apps/ota/src/components/hub/sections/hotels-section.tsx` | Fetch real hotel data when travel dates exist |
| `apps/ota/src/lib/entity-hubs/types.ts` | Add TravelSession to AiPageContext |

---

### Task 1: Travel Session Store

**Files:**
- Create: `apps/ota/src/stores/travel-session-store.ts`

- [ ] **Step 1: Create the Zustand store with cookie persistence**

```typescript
// apps/ota/src/stores/travel-session-store.ts
'use client'

import { create } from 'zustand'

export interface TravelSession {
  departureDate: string | null
  returnDate: string | null
  origin: string | null
  originCity: string | null
  originSource: 'user' | 'geolocation' | 'crm' | 'default'
  adults: number
  dismissedDatePrompt: boolean
}

interface TravelSessionState extends TravelSession {
  setDates: (departure: string, returnDate: string) => void
  setOrigin: (iata: string, city: string, source: TravelSession['originSource']) => void
  setAdults: (n: number) => void
  dismissPrompt: () => void
  clearDates: () => void
  hasDates: () => boolean
}

const COOKIE_NAME = 'travel_session'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

function readCookie(): Partial<TravelSession> {
  if (typeof document === 'undefined') return {}
  try {
    const match = document.cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
    return match ? JSON.parse(decodeURIComponent(match[1])) : {}
  } catch {
    return {}
  }
}

function writeCookie(state: TravelSession) {
  if (typeof document === 'undefined') return
  const val = encodeURIComponent(JSON.stringify(state))
  document.cookie = `${COOKIE_NAME}=${val}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

const DEFAULTS: TravelSession = {
  departureDate: null,
  returnDate: null,
  origin: 'YYZ',
  originCity: 'Toronto',
  originSource: 'default',
  adults: 2,
  dismissedDatePrompt: false,
}

export const useTravelSession = create<TravelSessionState>((set, get) => {
  const persisted = readCookie()
  const initial = { ...DEFAULTS, ...persisted }

  return {
    ...initial,

    setDates(departure, returnDate) {
      set({ departureDate: departure, returnDate })
      writeCookie({ ...get(), departureDate: departure, returnDate })
    },

    setOrigin(iata, city, source) {
      set({ origin: iata, originCity: city, originSource: source })
      writeCookie({ ...get(), origin: iata, originCity: city, originSource: source })
    },

    setAdults(n) {
      set({ adults: n })
      writeCookie({ ...get(), adults: n })
    },

    dismissPrompt() {
      set({ dismissedDatePrompt: true })
      writeCookie({ ...get(), dismissedDatePrompt: true })
    },

    clearDates() {
      set({ departureDate: null, returnDate: null })
      writeCookie({ ...get(), departureDate: null, returnDate: null })
    },

    hasDates() {
      const s = get()
      return !!(s.departureDate && s.returnDate)
    },
  }
})

/**
 * Read travel session from cookie on the server side (for Server Components).
 * Import `cookies` from 'next/headers' and pass cookie value.
 */
export function parseTravelSessionCookie(cookieValue: string | undefined): TravelSession {
  if (!cookieValue) return DEFAULTS
  try {
    return { ...DEFAULTS, ...JSON.parse(decodeURIComponent(cookieValue)) }
  } catch {
    return DEFAULTS
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/stores/travel-session-store.ts
git commit -m "feat(ota): add TravelSessionStore with cookie persistence"
```

---

### Task 2: Travel Date Prompt Bar

**Files:**
- Create: `apps/ota/src/components/hub/travel-date-prompt.tsx`
- Modify: `apps/ota/src/components/hub/hub-scaffold.tsx`

- [ ] **Step 1: Create the date prompt component**

```typescript
// apps/ota/src/components/hub/travel-date-prompt.tsx
'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { useTravelSession } from '@/stores/travel-session-store'

interface TravelDatePromptProps {
  entityName: string
}

export function TravelDatePrompt({ entityName }: TravelDatePromptProps) {
  const { departureDate, returnDate, dismissedDatePrompt, setDates, dismissPrompt } = useTravelSession()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Don't show if dates already set or prompt dismissed
  if ((departureDate && returnDate) || dismissedDatePrompt) return null

  function handleSubmit() {
    if (startDate && endDate) {
      setDates(startDate, endDate)
    }
  }

  // Default start date: 2 weeks from now
  const defaultStart = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  return (
    <div className="mx-4 my-4 rounded-xl border border-[#C59746]/25 bg-[#faf6f0] p-4 sm:mx-10 lg:mx-[60px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2 text-[#C59746]">
          <Calendar className="size-5" />
          <p className="text-sm font-semibold">When are you traveling to {entityName}?</p>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <input
            type="date"
            value={startDate}
            min={defaultStart}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder="Start"
          />
          <span className="text-xs text-[#888]">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate || defaultStart}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746]"
            placeholder="End"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!startDate || !endDate}
            className="h-9 shrink-0 rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] disabled:opacity-40"
          >
            Show options
          </button>
        </div>

        <button
          type="button"
          onClick={dismissPrompt}
          className="shrink-0 text-xs text-[#888] underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into HubScaffold**

Read `apps/ota/src/components/hub/hub-scaffold.tsx` and add `TravelDatePrompt` between the AI prompt and sections div.

Add import:
```typescript
import { TravelDatePrompt } from './travel-date-prompt'
```

Add component after `<AiContextualPrompt>` and before `<div className="py-8">`:
```tsx
<TravelDatePrompt entityName={hero.title} />
```

- [ ] **Step 3: Verify TypeScript and test in browser**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Navigate to `http://localhost:3102/destinations/cozumel-mexico` — should see date prompt bar.

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/hub/travel-date-prompt.tsx apps/ota/src/components/hub/hub-scaffold.tsx
git commit -m "feat(ota): add travel date prompt bar to entity hub pages"
```

---

### Task 3: ImageCardFrame (Shared Visual Chrome)

**Files:**
- Create: `apps/ota/src/components/cards/image-card-frame.tsx`

- [ ] **Step 1: Create the shared frame component**

This extracts the Dream Board card visual treatment from `board-functional-card.tsx` into a reusable frame for all product cards.

```typescript
// apps/ota/src/components/cards/image-card-frame.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'

interface ImageCardFrameProps {
  imageUrl: string | null
  fallbackGradient: string       // Tailwind gradient classes e.g. "from-indigo-500 to-indigo-700"
  typeBadge: string              // "🚢 Cruise", "✈️ Flight"
  price?: string | null          // Formatted price "$849/pp"
  priceLoading?: boolean
  priceLabel?: string            // "/pp", "/night"
  href?: string                  // Link target (optional — flights have no detail page)
  tripComponent?: TripComponent  // For AddToTrip button
  height?: number                // Pixel height (default 280)
  children: React.ReactNode      // Title + subtitle + details at bottom
}

export function ImageCardFrame({
  imageUrl,
  fallbackGradient,
  typeBadge,
  price,
  priceLoading,
  priceLabel,
  href,
  tripComponent,
  height = 280,
  children,
}: ImageCardFrameProps) {
  const [imgError, setImgError] = useState(false)
  const hasImage = imageUrl && !imgError

  const card = (
    <div
      className="group relative overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl"
      style={{ height: `${height}px` }}
    >
      {/* Background: image or gradient */}
      {hasImage ? (
        <SafeImage
          src={imageUrl}
          alt=""
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          hideOnError
          onError={() => setImgError(true)}
        />
      ) : null}
      {/* Always render gradient bg — visible when no image or as tint over image */}
      {!hasImage && <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient}`} />}

      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Type badge — frosted glass pill top-left */}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
        {typeBadge}
      </span>

      {/* Price badge — white pill top-right */}
      <div className="absolute right-3 top-3">
        {priceLoading ? (
          <PriceShimmer className="h-6 w-16 rounded-full" />
        ) : price ? (
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#1A1A1A] shadow-sm">
            {price}{priceLabel && <span className="font-normal text-[#888]">{priceLabel}</span>}
          </span>
        ) : null}
      </div>

      {/* Content at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        {children}

        {/* AddToTrip button — integrated into bottom area */}
        {tripComponent && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <AddToTripButton
              component={tripComponent}
              size="sm"
              className="bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
            />
          </div>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} className="block">{card}</Link>
  }
  return card
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/cards/image-card-frame.tsx
git commit -m "feat(ota): add ImageCardFrame — Dream Board style shared card chrome"
```

---

### Task 4: Redesign CruiseProductCard Full Variant

**Files:**
- Modify: `apps/ota/src/components/cards/cruise-product-card.tsx`

- [ ] **Step 1: Read the current CruiseFull implementation**

Read `apps/ota/src/components/cards/cruise-product-card.tsx` completely.

- [ ] **Step 2: Replace CruiseFull with ImageCardFrame**

Replace the `CruiseFull` function (keeping `CruiseCompact` and `CruiseMini` unchanged):

```typescript
function CruiseFull(props: CruiseProductCardProps) {
  const dateStr = new Date(props.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const priceLoading = props.priceLoading || (props.priceCents === undefined)
  const priceStr = props.priceCents != null ? formatPrice(props.priceCents) : null

  return (
    <ImageCardFrame
      imageUrl={props.shipImageUrl}
      fallbackGradient="from-indigo-500 to-indigo-700"
      typeBadge={`🚢 ${props.nights}N`}
      price={priceStr}
      priceLoading={priceLoading}
      priceLabel="/pp"
      href={`/cruises/${props.id}`}
      tripComponent={buildTripComponent(props)}
      height={300}
    >
      <p className="text-base font-bold leading-tight text-white">{props.name}</p>
      <p className="mt-1 text-sm text-white/80">{props.cruiseLineName} · {props.shipName}</p>
      <p className="mt-0.5 text-xs text-white/60">{dateStr}{props.route ? ` · ${props.route}` : ''}</p>
      {props.savingsLabel && (
        <span className="mt-1 inline-block rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
          {props.savingsLabel}
        </span>
      )}
    </ImageCardFrame>
  )
}
```

Add import at the top:
```typescript
import { ImageCardFrame } from '@/components/cards/image-card-frame'
```

- [ ] **Step 3: Verify TypeScript and test visually**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Check `http://localhost:3102/destinations/cozumel-mexico` — cruise cards should now be image-forward.

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/cards/cruise-product-card.tsx
git commit -m "feat(ota): redesign CruiseProductCard full variant with ImageCardFrame"
```

---

### Task 5: Redesign Remaining Card Full Variants

**Files:**
- Modify: `apps/ota/src/components/cards/hotel-product-card.tsx`
- Modify: `apps/ota/src/components/cards/tour-product-card.tsx`
- Modify: `apps/ota/src/components/cards/activity-product-card.tsx`
- Modify: `apps/ota/src/components/cards/promotion-card.tsx`
- Modify: `apps/ota/src/components/cards/flight-product-card.tsx`

- [ ] **Step 1: Read each card file and redesign its Full variant**

For EACH card, replace the Full variant function to use `ImageCardFrame`. Keep Compact and Mini unchanged.

**HotelProductCard Full:**
```typescript
// Import ImageCardFrame at top
// Replace HotelFull:
function HotelFull(props: HotelProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)
  const priceStr = props.priceCents != null ? formatPrice(props.priceCents) : null
  const stars = props.starRating ? '⭐'.repeat(Math.min(props.starRating, 5)) : ''

  return (
    <ImageCardFrame
      imageUrl={props.imageUrl}
      fallbackGradient="from-amber-500 to-amber-700"
      typeBadge={`🏨 Hotel${stars ? ` ${stars}` : ''}`}
      price={priceStr}
      priceLoading={priceLoading}
      priceLabel="/night"
      href="/search/hotels"
      tripComponent={buildTripComponent(props)}
      height={280}
    >
      <p className="text-base font-bold leading-tight text-white">{props.name}</p>
      {props.location && <p className="mt-0.5 text-sm text-white/80">{props.location}</p>}
      {props.boardType && <p className="mt-0.5 text-xs text-white/60">{props.boardType}</p>}
      {props.amenities && props.amenities.length > 0 && (
        <div className="mt-1 flex gap-1">
          {props.amenities.slice(0, 3).map((a, i) => (
            <span key={i} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">{a}</span>
          ))}
        </div>
      )}
    </ImageCardFrame>
  )
}
```

**TourProductCard Full:**
- `fallbackGradient="from-emerald-500 to-emerald-700"`
- `typeBadge="🏞 {durationDays}D Tour"`
- `priceLabel="/pp"`
- `href="/search/tours"`
- Show operator name, first 2 highlights

**ActivityProductCard Full:**
- `fallbackGradient="from-rose-500 to-pink-400"`
- `typeBadge="🏄 Activity"`
- `priceLabel="/pp"`
- Show category, duration, rating

**PromotionCard Full:**
- `fallbackGradient="from-violet-500 to-purple-400"`
- `typeBadge="⭐ Offer"`
- Show supplier, savings badge, valid dates

**FlightProductCard Full — Special Case:**
The flight card has a journey timeline that doesn't fit the image card pattern as naturally. Keep the journey timeline but wrap it in an image-forward container:
- Accept new prop: `destinationImageUrl?: string | null`
- Use ImageCardFrame with the destination image as background
- Render the journey timeline (airport codes, lines, layover badges) over the gradient
- This gives flights a visual identity tied to where you're going

For the flight card, the redesign is more complex — the journey timeline SVG rendering needs to work over an image background. The simplest approach: keep the FlightFull mostly as-is but add ImageCardFrame as a wrapper for the airline/price header, with the timeline below in a semi-transparent card area.

Actually, given the complexity, for flights: add `destinationImageUrl` prop and use it as a subtle background behind the existing flight card design with increased contrast. This is a lighter touch that preserves the journey timeline readability.

- [ ] **Step 2: Read each file, make the changes**

Read each card file. For Hotel, Tour, Activity, Promotion: replace the Full function with ImageCardFrame pattern. For Flight: add `destinationImageUrl` prop and use as subtle background.

- [ ] **Step 3: Verify TypeScript**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/cards/hotel-product-card.tsx apps/ota/src/components/cards/tour-product-card.tsx apps/ota/src/components/cards/activity-product-card.tsx apps/ota/src/components/cards/promotion-card.tsx apps/ota/src/components/cards/flight-product-card.tsx
git commit -m "feat(ota): redesign all card full variants with ImageCardFrame (Dream Board aesthetic)"
```

---

### Task 6: FlightsSection with Real Amadeus Data

**Files:**
- Modify: `apps/ota/src/components/hub/sections/flights-section.tsx`

- [ ] **Step 1: Read the current flights section and the API pattern**

Read:
- `apps/ota/src/components/hub/sections/flights-section.tsx`
- `apps/ota/src/lib/api.ts` (serviceFetch function)
- `apps/ota/src/stores/travel-session-store.ts` (parseTravelSessionCookie)

- [ ] **Step 2: Update FlightsSection to fetch real data when dates exist**

The section is a Server Component. Read the `travel_session` cookie on the server side to check for dates:

```typescript
import { cookies } from 'next/headers'
import { parseTravelSessionCookie } from '@/stores/travel-session-store'
import { serviceFetch } from '@/lib/api'
```

Logic:
1. Read `travel_session` cookie via `cookies().get('travel_session')?.value`
2. Parse with `parseTravelSessionCookie()`
3. If `departureDate` and `origin` exist, fetch: `serviceFetch<any>(\`/ota/search/flights?origin=\${session.origin}&destination=\${destinationName}&departureDate=\${session.departureDate}&adults=\${session.adults}&currencyCode=CAD\`, { next: { revalidate: 1800 } })`
4. Map results to `FlightProductCardProps[]` (segments, pricing, airline)
5. Render FlightProductCard full variant with `destinationImageUrl` from sectionProps
6. If no dates or fetch fails, fall back to CTA card (current behavior)

Show max 3 flights. Pass `sectionProps.destinationImageUrl` to each card.

- [ ] **Step 3: Update destination adapter to pass destinationImageUrl**

Read and modify `apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts`. In the flights section props, add:
```typescript
props: {
  destinationName: dest.name,
  destinationImageUrl: dest.heroImageUrl || dest.enrichment?.photos?.[0]?.url || null,
}
```

- [ ] **Step 4: Verify TypeScript and test**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`
Set travel dates in browser, verify flights section shows real data.

- [ ] **Step 5: Commit**

```bash
git add apps/ota/src/components/hub/sections/flights-section.tsx apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts
git commit -m "feat(ota): FlightsSection fetches real Amadeus data when travel dates are set"
```

---

### Task 7: HotelsSection with Real Data

**Files:**
- Modify: `apps/ota/src/components/hub/sections/hotels-section.tsx`

- [ ] **Step 1: Read the current hotels section**

Read `apps/ota/src/components/hub/sections/hotels-section.tsx`

- [ ] **Step 2: Update HotelsSection to fetch real data when dates exist**

Same pattern as FlightsSection:
1. Read `travel_session` cookie
2. If dates exist, fetch: `serviceFetch<any>(\`/ota/search/hotels?destination=\${destinationName}&checkIn=\${session.departureDate}&checkOut=\${session.returnDate}&adults=\${session.adults}\`, { next: { revalidate: 7200 } })`
3. Map results to `HotelProductCardProps[]` (name, photos, rating, pricing)
4. Render HotelProductCard full variant
5. No dates → CTA fallback

Show max 4 hotels.

- [ ] **Step 3: Verify TypeScript and test**

Run: `cd apps/ota && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/hub/sections/hotels-section.tsx
git commit -m "feat(ota): HotelsSection fetches real hotel data when travel dates are set"
```

---

### Task 8: Image Preloading for Above-the-Fold Cards

**Files:**
- Modify: `apps/ota/src/components/hub/hub-section-renderer.tsx`

- [ ] **Step 1: Add preload hints for high-priority section images**

Read and modify `apps/ota/src/components/hub/hub-section-renderer.tsx`.

For the first section (index 0) that has `priority: 'high'`, add a `<link rel="preload">` hint in the head for its images. This requires wrapping the first section's cards with preload metadata.

Actually, the simplest approach: use Next.js `<Image priority>` on above-the-fold card images. The `ImageCardFrame` already uses `SafeImage` — update it to accept a `priority` prop that gets passed through to the underlying `Image` component.

Modify `apps/ota/src/components/cards/image-card-frame.tsx`:
- Add `priority?: boolean` to props
- Pass to SafeImage: `priority={priority}`

Then in `hub-section-renderer.tsx`, pass `sectionProps.__isFirstSection = true` for index 0, and let sections pass `priority={true}` to their first card's ImageCardFrame.

This is lightweight and uses Next.js's built-in image optimization.

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/cards/image-card-frame.tsx apps/ota/src/components/hub/hub-section-renderer.tsx
git commit -m "feat(ota): add image priority loading for above-the-fold cards"
```

---

## What This Plan Produces

After all 8 tasks:

1. **Travel Date Session** — Users set travel dates via a prompt bar. Dates persist in cookies across all pages. Sections react to dates.
2. **ImageCardFrame** — All `full` variant cards share the Dream Board visual treatment (image-forward, gradient overlay, frosted badges)
3. **Real Flight Data** — When dates are set, FlightsSection shows actual Amadeus flight offers with journey timelines and real prices
4. **Real Hotel Data** — When dates are set, HotelsSection shows actual hotels with photos, ratings, and real nightly prices
5. **CTA Fallback** — When no dates, sections still show attractive CTA cards linking to search
6. **Image Preloading** — Above-the-fold card images load with priority

## What's Deferred

- Geolocation auto-detection (using default YYZ for now)
- CRM contact → airport mapping
- R2 background image caching for external photos
- Hotel detail page with Amadeus availability calendar
- SerpAPI price level indicators on flight cards
