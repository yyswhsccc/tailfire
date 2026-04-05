# Visual Overhaul + Real Data Pipeline Design

**Goal:** Redesign product cards to match the Dream Board aesthetic, show real flight/hotel data on entity pages driven by user's travel dates, and implement preemptive caching for instant navigation.

**Builds on:** `2026-04-02-universal-trip-hub-shared-architecture-design.md`

---

## 1. Travel Date Session

The single biggest unlock for showing real data. Before we can fetch flights and hotels, we need to know WHEN the user wants to travel.

### Date Prompt Bar

A persistent bar that appears on entity pages when no travel dates are set. Positioned between the AI contextual prompt and the first section.

**Visual treatment:**
- Warm ivory background (#faf6f0) with gold border
- Calendar emoji + "When are you thinking of traveling?"
- Date range picker (start date + end date)
- "Show me options" gold CTA button
- "Skip for now" dismiss link (subtle, gray)

**Behavior:**
- Appears on every entity page until dates are set
- Dismissing hides it for the session (cookie flag)
- Setting dates triggers section re-render with real data
- Dates persist across ALL entity pages via session

### Session Storage

```typescript
interface TravelSession {
  departureDate: string | null   // ISO date "2026-05-15"
  returnDate: string | null      // ISO date "2026-05-22"
  origin: string | null          // IATA "YYZ"
  originSource: 'user' | 'geolocation' | 'crm' | 'default'
  adults: number                 // Default 2
  dismissedDatePrompt: boolean
}
```

**Storage:** Zustand store persisted to `travel_session` cookie (30-day expiry). Hydrated from cookie on server render, updated on client interaction.

**Origin resolution chain:**
1. Logged-in user → CRM contact address → nearest airport
2. `geo_location` cookie → IP-detected airport (server-side, set on first request)
3. Default: YYZ (Toronto)

### Integration Points

- **Sections:** FlightsSection and HotelsSection read from travel session. If dates exist, fetch real data. If not, show CTA or date prompt.
- **AI context:** Travel dates included in AiPageContext so AI can reference them: "I see you're traveling May 15-22. Here are the best flights..."
- **AI prompt bar:** When dates are set, the contextual prompt updates: "Traveling May 15-22? I found 3 direct flights from Toronto starting at $389"
- **Trip basket:** When adding a flight/hotel, travel dates pre-fill the component data
- **URL params:** `?from=2026-05-15&to=2026-05-22` can set dates (for sharing/bookmarking)

---

## 2. Card Visual Redesign

### The Problem

Current entity page cards use white backgrounds with #E0E0E0 borders — functional but generic. The Dream Board uses image-forward Pinterest-style cards that are visually striking. The two systems look like different products.

### The Solution: Image-Forward Cards

Redesign the `full` variant of all product cards to match the Dream Board aesthetic from `board-functional-card.tsx`:

**Design language:**
- Full-bleed image or vibrant gradient (no white card body)
- Gradient overlay from bottom (`from-black/80 via-black/30 to-transparent`) for text legibility
- Type badge: frosted glass pill top-left (`bg-black/40 backdrop-blur-md`)
- Price badge: white pill top-right (`bg-white/90 text-[#1A1A1A]`)
- Title + subtitle at bottom over gradient
- `rounded-2xl`, shadow, `hover:scale-[1.03]` + `hover:-translate-y-1`
- AddToTrip button integrated into bottom area

**What changes per card type:**

| Card | Image Source | Gradient Fallback |
|------|-------------|-------------------|
| CruiseProductCard | Ship photo (Traveltek) | `from-indigo-500 to-indigo-700` |
| FlightProductCard | Destination photo (enrichment/Unsplash) | `from-sky-500 to-sky-700` |
| HotelProductCard | Property photo (Google Places) | `from-amber-500 to-amber-700` |
| TourProductCard | Tour photo (Globus) | `from-emerald-500 to-emerald-700` |
| ActivityProductCard | Activity photo (TripAdvisor) | `from-rose-500 to-pink-400` |
| PromotionCard | Deal image (VPS/supplier) | `from-violet-500 to-purple-400` |

**FlightProductCard special case:** Flights don't have images naturally. Use the DESTINATION's hero image as the card background. The adapter passes `destinationImageUrl` in sectionProps, and the flights section passes it to each card.

**What stays the same:**
- `compact` variant: horizontal thumbnail layout (unchanged — used in rails, AI suggestions)
- `mini` variant: icon + text (unchanged — used in basket, confirmations)
- Progressive pricing: shimmer → real price (unchanged)
- AddToTrip behavior (unchanged)

### Shared CardFrame

Extract the visual chrome into a shared `ImageCardFrame` component:

```typescript
interface ImageCardFrameProps {
  imageUrl: string | null
  fallbackGradient: string     // Tailwind gradient classes
  typeBadge: string            // "🚢 Cruise", "✈️ Flight"
  priceBadge?: string | null   // "$849/pp"
  priceLoading?: boolean
  href?: string                // Link target
  children: React.ReactNode    // Title + subtitle + details at bottom
  onAddToTrip?: () => void
  isAdded?: boolean
}
```

All `full` variant cards use `ImageCardFrame` for consistent visual treatment.

---

## 3. Real Flight Data on Entity Pages

### Data Flow

```
User sets travel dates (or has them in session)
  → FlightsSection reads dates + origin from TravelSession
  → Server-side fetch: /ota/search/flights?origin={origin}&destination={iata}&departureDate={date}&adults={adults}
  → Returns FlightOffer[] with segments, pricing, airlines
  → Render FlightProductCard full variant with destination image background
  → Cards show real prices, airlines, journey timelines
  → No dates? Show CTA fallback (current behavior)
```

### API Params

```
GET /ota/search/flights
  ?origin=YYZ
  &destination=CUN         (Cozumel's nearest airport)
  &departureDate=2026-05-15
  &adults=2
  &travelClass=ECONOMY
  &currencyCode=CAD
```

**Destination → IATA mapping:** The destination detail may include an airport IATA code (from cruise port data). If not available, use the destination name for search. The Amadeus API handles city name → airport resolution.

### Caching

- Cache flight results per (origin, destination, date) for **30 minutes** via ISR
- Stale results are better than no results — show cached prices with "prices may vary" disclaimer
- If API fails, gracefully fall back to CTA card

### Section Behavior

| Travel dates set? | Origin known? | Behavior |
|---|---|---|
| Yes | Yes | Fetch real flights, show FlightProductCards |
| Yes | No | Show CTA: "Where are you flying from?" with airport picker |
| No | Yes/No | Show date prompt bar + CTA fallback |

---

## 4. Real Hotel Data on Entity Pages

### Data Flow

```
User sets travel dates (or has them in session)
  → HotelsSection reads dates from TravelSession
  → Server-side fetch: /external-apis/hotels/search?destination={name}&checkIn={date}&checkOut={date}&adults={adults}
  → Returns NormalizedHotelResult[] with photos, ratings, pricing
  → Render HotelProductCard full variant with property photo background
  → Cards show real prices, star ratings, amenities
  → No dates? Show CTA fallback
```

### Hotel Discovery Sources

The existing hotel API uses **Google Places (primary) + Amadeus (pricing)**:
1. Google Places provides: name, photos, ratings, reviews, location, amenities
2. Amadeus provides: pricing, availability for specific dates
3. Booking.com DataCrawler provides: detailed amenities enrichment

### Caching Strategy

- Cache hotel search results per (destination, checkIn, checkOut) for **2 hours**
- Cache hotel photos in R2 storage (already supported via photo import endpoint)
- On click → detail page fetches fresh Amadeus pricing with the user's exact dates
- `destination_cache` table supports `source: 'google_places'` — use it for hotel discovery data

### Cross-Reference for Booking

When user clicks a hotel card:
1. Navigate to `/search/hotels?destination={name}&checkIn={date}&checkOut={date}&hotelName={name}`
2. Search page shows full results with Amadeus pricing
3. User can add to trip from there

Future: dedicated hotel detail page with Amadeus availability calendar.

---

## 5. Preemptive Caching Strategy

### Principle

Everything we present should be ready to display if the user clicks on it. No loading screens after a click.

### Next.js Built-In Prefetching

- `<Link>` components automatically prefetch the RSC payload for linked routes when they enter the viewport
- Entity pages use ISR (`revalidate: 1800-3600`) so data is pre-cached on the CDN
- Combined: clicking a cruise card renders the cruise detail page instantly from cache

### Image Preloading

For above-the-fold cards (first 2-4 visible), preload hero images:

```html
<link rel="preload" as="image" href="{cardImageUrl}" />
```

This can be added to the section renderer for `priority: 'high'` sections.

### Data Prefetching

For cards that link to pages with dynamic data:
- ISR handles most cases (entity detail pages are cached)
- For price-sensitive data (sailings, flights), the detail page fetches fresh on load but renders the cached shell instantly

### Image Caching in R2

When we fetch hotel/activity images from external sources (Google Places, TripAdvisor):
1. First display: use the external URL directly
2. Background job: download and upload to R2 CDN (`cdn.tailfire.ca`)
3. Subsequent displays: use the R2 URL (faster, no external dependency)
4. Already supported: `POST /external-apis/hotels/photos/import` endpoint exists

---

## 6. Section Updates

### FlightsSection (Updated)

Currently shows a CTA fallback card. Updated behavior:

**With travel dates:**
- Fetch real Amadeus flight offers (server-side, ISR cached 30min)
- Show up to 3 FlightProductCards with journey timeline, real prices
- Background image: destination hero image
- "View all flights →" links to full search with pre-filled params

**Without travel dates:**
- Show date prompt bar (if not dismissed)
- Below: CTA fallback card (current behavior)

### HotelsSection (Updated)

Currently shows a CTA fallback card. Updated behavior:

**With travel dates:**
- Fetch real hotel results via Google Places + Amadeus pricing
- Show up to 4 HotelProductCards with property photos, real prices
- Star ratings, user ratings visible
- "View all hotels →" links to full search

**Without travel dates:**
- Show date prompt bar (if not dismissed)
- Below: CTA fallback card

### NearbySection (Updated)

Currently shows gradient-only cards for sailing stops. Fix:
- When destination has `heroImageUrl`, use it as card background
- For lightweight destinations (ports), use the same image-forward gradient cards but with more visual interest (destination type icon, country flag)

---

## 7. Implementation Order

1. **Travel date session** — Zustand store + cookie, date prompt bar component
2. **ImageCardFrame** — shared visual chrome for image-forward cards
3. **Redesign CruiseProductCard full variant** — first card to get the new look
4. **Redesign remaining card full variants** — flight, hotel, tour, activity, promotion
5. **FlightsSection with real data** — Amadeus integration when dates exist
6. **HotelsSection with real data** — Google Places + Amadeus when dates exist
7. **Image preloading** — for above-the-fold cards
8. **R2 image caching** — background job for external images

---

## Scope

### Build Now
- Travel date session (store + cookie + prompt bar)
- ImageCardFrame shared component
- Redesign all full-variant product cards
- FlightsSection real data (with date fallback)
- HotelsSection real data (with date fallback)
- NearbySection image improvements
- Image preloading for high-priority sections

### Deferred
- Geolocation auto-detection (start with default YYZ + user override)
- CRM contact address → airport mapping
- R2 background image caching (use external URLs first)
- Hotel detail page with Amadeus availability calendar
- Flight price insights overlay (SerpAPI price level indicators)
