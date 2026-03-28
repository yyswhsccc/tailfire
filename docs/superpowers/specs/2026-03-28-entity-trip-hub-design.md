# Entity Trip Hub — Design Specification

**Date:** 2026-03-28
**Status:** Draft
**Author:** Claude + Alex Guertin
**Tagline:** Every entity is a journey. Every scroll is discovery.

## Overview

Redesign every entity page (Destination, Ship, Cruise Line, Sailing, Region, Deal) into a **Universal Trip Hub** — a visually rich, mobile-first, magazine-style scroll journey. The consumer scrolls through a curated feed of blended travel products (flights, cruises, hotels, tours, activities) with no tabs, no rigid sections — just a flowing journey of discovery.

**Core principles:**
- **Mobile-first** — designed for thumb-scrolling, adapted up to desktop
- **Magazine feed, not data tables** — content types blend together like Pinterest/Luma, not siloed into rigid sections
- **Images ARE the experience** — every card must have a verified image or it doesn't render
- **Instant + streaming** — cached data renders in <200ms, live API data streams in via Suspense
- **Geolocation-aware** — flights from the consumer's detected city, personalized to their location
- **Universal shell** — same visual rhythm across all entity types. Muscle memory from one page carries to all.
- **AI concierge context** — every page pushes entity context to the AI companion via PageContextBridge

**What makes this different from v1:**
- v1 had tabs, rigid sections, text-heavy layouts, no flights/hotels on destination pages
- v2 (this spec) is a continuous scroll journey with blended product cards, geolocation, streaming data, and deal integration

---

## 1. Universal Page Structure

Every entity hub follows the same zone structure. Content varies per entity type, but the visual rhythm is identical.

### Zone 1: Hero (instant — cached)
- Full-bleed image, entity-specific
- **Text contrast: 3-layer solution** — bottom-heavy gradient scrim (75%→15% opacity) + `text-shadow: 0 1px 3px rgba(0,0,0,0.5)` + text positioned at darkest part of gradient
- Badge (entity type / parent entity)
- Title (serif font, large)
- Meta stats (rating, counts, key metrics)
- Primary CTA ("Plan a Trip to X" / "Explore Sailings" / "Claim This Deal")
- Secondary CTA (Save / Heart)
- Back button + Save button (floating, top corners)

### Zone 2: Context (instant — cached)
- Description text (TripAdvisor enrichment, catalog data, or AI-generated)
- Quick fact pills (contextual per entity type)
- No section header needed — flows naturally from hero

### Zone 3: The Feed (streams via Suspense)
- **Blended product cards** — different content types mixed together
- Each card has a type badge (🚢 Cruise, ✈️ Flight, 🏨 Hotel, 🗺️ Tour, 🎯 Activity)
- Cards vary in size: full-width, 2-up, 3-up, 4-up, horizontal (image-left)
- Photo mosaic breaks interspersed between content sections
- Thin dividers (1px #eee) between content groups — not heavy section headers
- Section labels are simple: "Cruises Visiting Rome" with "View all 635 →" link
- **Each product group is an independent Suspense boundary** — streams in as data arrives

### Zone 4: Related / Explore More (lazy-loaded on scroll)
- Horizontal scroll cards
- "Explore Nearby" for destinations, "More from Celebrity" for ships, "Similar Sailings" for sailings, "More Deals" for deals
- Subtle background shift (#f4f3f0) to signal end of main content

### Always Present
- Floating AI concierge button (bottom-right, dark circle with gold ✦)
- PageContextBridge pushing entity context to Zustand store

---

## 2. Entity-Specific Content

### Destination (e.g., Rome)
**Hero badge:** Country name
**Hero stats:** Rating · Review count · Cruise count · Tour count
**Hero CTA:** "Plan a Trip to Rome"

**Feed sections (order):**
1. ✈️ Flights from [consumer's city] — 3 airline cards with direct/stop, frequency, price. Geolocation-detected origin.
2. 🚢 Cruises visiting [destination] — Large visual cruise cards with ship images, route, price
3. 🏨 Hotels + 🎯 Activities (blended) — 2/3 hotels grid beside 1/3 stacked activity cards
4. 🗺️ Tours including [destination] — Horizontal cards (image-left, details-right)
5. 📸 Photo gallery — Masonry mosaic with "+N more"
6. 🧭 Explore Nearby — Destination cards with travel times

**Quick fact pills:** Airport (IATA), Currency, Best season, Timezone, Language

### Ship (e.g., Celebrity Beyond)
**Hero badge:** Cruise line name
**Hero stats:** Guest capacity · Tonnage · Upcoming sailing count
**Hero CTA:** "Explore Sailings on Beyond"

**Feed sections:**
1. 🚢 Upcoming sailings — Large visual cruise cards with routes, dates, pricing
2. ✨ Life Onboard — **Only if verified venue images exist** (see Image Rules). Large experience cards (3-up) + smaller cards (4-up). Omit entirely if no verified images.
3. 🛏️ Cabin categories — 4 tier cards (Inside → Ocean → Balcony → Suite) with Traveltek cabin photos, descriptions, price ranges
4. 📍 Destinations this ship visits — Destination cards linking to destination hubs
5. 📸 Ship gallery — Traveltek ship images in masonry mosaic
6. 🚢 More from [cruise line] — Horizontal scroll of sister ships

**Quick fact pills:** Built year, Ship class/series, Guest capacity, Crew count, Restaurants, Pools, Signature features

### Sailing (e.g., 7-Night Eastern Caribbean)
**Hero badge:** Cruise line · Ship name
**Hero stats:** Ship name · Port count · Starting price
**Hero CTA:** "Inquire About This Sailing"

**Feed sections:**
1. 💰 Deal banner — If an active deal applies, show urgency badge + savings + CTA (see Deal matching)
2. 📍 Day-by-day itinerary (left 2/3) + Ship card + Cabin pricing (right 1/3) — Itinerary timeline with port dots (gold) and sea day dots (blue). Each port has an inline destination preview card. Ship card links to ship hub. Cabin pricing as stacked tier cards with highlighted recommended tier.
3. 🌴 Port highlights — Destination cards for each port of call with ratings and preview text
4. ✈️ Flights to embark port — Geolocation-aware, date-aware (arrive day before embarkation)
5. 🏨 Hotels at embark port — "Stay the night before" — hotels near the departure port
6. 🔄 Similar sailings — Horizontal scroll (same ship diff dates, same route diff ships)

**Quick fact pills:** Embark/Disembark ports, Sea days count

### Cruise Line (e.g., Royal Caribbean)
**Hero badge:** "Cruise Line"
**Hero stats:** Fleet size · Sailing count · Region count
**Hero CTA:** "Explore Royal Caribbean"

**Feed sections:**
1. 🚢 Featured ships — Ship cards (image + name + class + sailing count)
2. 📅 Upcoming sailings — Large visual cruise cards (top sailings by date)
3. 💰 Current deals — Deal cards with savings badges
4. 🌍 Regions served — Region cards with sailing counts
5. 📸 Fleet gallery — Ship images mosaic

### Region (e.g., Mediterranean)
**Hero badge:** "Cruise Region"
**Hero stats:** Sailing count · Destination count
**Hero CTA:** "Explore the Mediterranean"

**Feed sections:**
1. 📍 Top destinations — Destination cards with images and ratings
2. 🚢 Featured cruises — Large cruise cards for this region
3. 🗺️ Tours in this region — Tour cards
4. 💰 Deals — Region-specific deals

### Deal / Offer (e.g., 40% Off Mediterranean)
**Hero badge:** Cruise line · Region
**Hero stats:** Countdown timer (days/hrs/min until expiry)
**Hero CTA:** "Claim This Deal"
**Urgency badge:** Red badge with "🔥 Limited Time Offer · Ends [date]"

**Feed sections:**
1. 💰 Savings highlight bar — Large savings amount + description + CTA
2. 🚢 Qualifying sailings — Cruise cards with strikethrough pricing + "SAVE $X" badges
3. 🎁 What's Included — Perk cards (drink package, onboard credit, WiFi, kids sail free) with values
4. 📋 Deal Terms (sidebar) + Advisor CTA — Terms list + "Talk to an Advisor" button
5. 📍 Destinations you'll visit — Destination cards from qualifying sailings
6. ✈️ Flights to embark port — Geolocation-aware
7. 💰 More deals — Horizontal scroll of related deals

---

## 3. Image Strategy — Hard Rules

**The cardinal rule: Never show an image that doesn't belong to the entity. A clean placeholder is infinitely better than a wrong photo.**

### Image Sources by Entity Type

| Entity | Primary Source | Secondary Source | Final Fallback |
|--------|---------------|-----------------|----------------|
| Destination | TripAdvisor (SerpAPI enrichment) | Unsplash stock photo by name | Gradient placeholder with icon — DON'T render card if no image |
| Ship (exterior) | Traveltek `cruise_ship_images` | None — only verified ship photos | Cruise line logo on branded background |
| Ship (cabins) | Traveltek `cruise_ship_cabin_types.image_url` (95% coverage) | Same cruise line + same tier from different ship | Tier label on cruise line brand color |
| Ship (onboard venues) | Phase 2: Cruise line press kits + website scraping | None for launch | Don't show "Life Onboard" section at all |
| Cruise Line (logo) | Traveltek `cruise_lines.metadata.logo_url` | None | First letter on brand color circle |
| Sailing | Use the sailing's ship exterior image | Ship fallback chain | Cruise line logo |
| Tour | Globus `tour_media` images | Unsplash by tour name | Don't render card |
| Hotel | Amadeus hotel images | None | Generic hotel category icon |
| Activity | TripAdvisor enrichment thumbnails | None | Don't render card |
| Deal | Match to cruise line or destination hero | Ship image if cruise deal | Brand-colored gradient |
| Region | Unsplash by region name (curated for 48 regions) | None | Gradient with region name |

### Enrichment Pipeline

**Tier 1 — Bulk backfill (top 500):**
- SerpAPI TripAdvisor enrichment for top 500 destinations by cruise/tour count
- Full content: photos, ratings, reviews, attractions, description
- Run once, refresh weekly

**Tier 2 — On-demand (long tail):**
- When a destination page is first visited and has no hero image
- Fetch from Unsplash by destination name
- Cache permanently in DB
- Costs nothing for unvisited pages

**Tier 3 — Manual curation:**
- 48 region hero images (Unsplash, curated once)
- Cruise line press kit images (Phase 2 project)

### Broken Image Prevention
- All `<Image>` components must handle `onError` — hide the card or show fallback
- API responses should include an `imageAvailable: boolean` flag
- Frontend only renders image cards where `imageAvailable` is true
- Skeleton loading states shown during Suspense — never empty white space

---

## 4. Performance & Speed

### Streaming Architecture

```
Page Load Timeline:
0ms     → Shell renders (nav, footer, layout)
50ms    → Hero renders (image from CDN cache, title from ISR cache)
100ms   → Context renders (description, pills — from ISR cache)
200ms   → Feed skeletons appear (Suspense boundaries)
500ms   → Local DB data streams in (tours, cached enrichment)
1-3s    → API data streams in (flights from Amadeus, hotels from Amadeus)
3-5s    → All sections filled
```

### Implementation

- **ISR for entity data**: `revalidate: 3600` for catalog entities (lines, ships, regions). `revalidate: 1800` for sailings (price-sensitive).
- **Suspense per product section**: Each section (Flights, Cruises, Hotels, Tours, Activities) is an independent async Server Component wrapped in `<Suspense fallback={<SectionSkeleton />}>`.
- **Parallel data fetching**: All section data fetched via `Promise.all` in the page component — no waterfalls.
- **No FDW in hot path**: The cruise count query was killing performance (10.8s via FDW). All cross-FDW counts are either pre-computed and cached, or fetched lazily client-side.
- **next/image with blur placeholders**: All hero images use `placeholder="blur"` with a tiny base64 preview.
- **Prefetch on hover**: Next.js `<Link>` prefetches entity pages when the card is hovered.
- **Route segment caching**: Shared layout (nav, footer) doesn't re-render on entity navigation.

### Geolocation

- Detect consumer location via browser `navigator.geolocation` API (with permission prompt)
- Fallback: IP-based geo via request headers (`x-forwarded-for` → GeoIP lookup)
- Store detected city + nearest airport IATA code in Zustand store
- Persist in cookie for return visits (no re-prompt)
- Flight sections pre-fill origin from detected location
- If no location available: show "Search flights" input instead of "Flights from Toronto"

---

## 5. Card Component Library

All cards are reusable across every entity hub. A cruise card on Rome's page is identical to a cruise card on Celebrity Beyond's page.

### Card Types

| Card | Sizes | Used On |
|------|-------|---------|
| **CruiseCard** | Full-width (2-up), Compact (horizontal) | Destination, Ship, Sailing, Deal, Region |
| **FlightCard** | 3-up grid | Destination, Sailing, Deal |
| **HotelCard** | 2-up grid, Small (in blended layout) | Destination, Sailing |
| **TourCard** | Horizontal (image-left), 2-up | Destination, Region |
| **ActivityCard** | Small (stacked), In blended layout | Destination, Ship (Phase 2) |
| **DestinationCard** | 3-up grid, 4-up grid | Ship, Sailing, Region, Deal |
| **ShipCard** | 3-up grid, 4-up grid, Sidebar | Cruise Line, Sailing |
| **DealCard** | With savings badge, Horizontal scroll | Cruise Line, Sailing, Region |
| **CabinTierCard** | 4-up grid, Stacked list | Ship, Sailing |
| **PhotoMosaic** | 2+1+1 grid with "+N more" | All entity types |
| **NearbyScroll** | Horizontal scroll container | All entity types (Related section) |

### Card Rules
- Every card has a type badge (top-right corner, pill shape)
- Every card with an image has hover zoom effect (scale 1.02, shadow increase)
- Price always in Phoenix Gold (#C59746), bold
- Cards link to their entity hub page
- All cards must have verified images — no rendering without image

---

## 6. Deal Integration

Every entity hub checks for matching deals/promotions:

### Deal Matching Logic
- **Sailing page**: Match by sailing ID, cruise line ID, or region
- **Ship page**: Match by cruise line ID
- **Cruise Line page**: Match by cruise line ID
- **Destination page**: Match by region or ports
- **Region page**: Match by region

### Deal Display
- If a matching deal exists: Show a **Deal Banner** below the hero — dark background, urgency badge, savings amount, "View Deal →" button
- On qualifying sailing cards: Show "SAVE $X" red badge + strikethrough original price
- Deals section in the feed: Full deal cards with savings, perks, terms

---

## 7. AI Concierge Integration

### Page Context
Every entity hub renders `<PageContextBridge>` with:
```typescript
{
  type: 'destination' | 'ship' | 'cruise_line' | 'sailing' | 'region' | 'deal',
  slug: string,
  name: string,
  parentContext?: { type: string; slug: string; name: string }
}
```

### "Plan a Trip" CTA
The primary hero CTA opens the AI concierge with a pre-filled prompt:
- Destination: "Help me plan a trip to Rome"
- Ship: "Tell me about sailing on Celebrity Beyond"
- Sailing: "I'm interested in the Eastern Caribbean on Freedom of the Seas departing May 2"
- Deal: "Tell me about this Mediterranean 40% off deal"

### Contextual Awareness
The AI concierge system prompt includes the current page context so responses are relevant. When on the Rome destination page, the AI knows:
- What destination the consumer is viewing
- What products are available (flights, cruises, hotels, tours)
- The consumer's detected location (for flight suggestions)
- Any items saved in the journey tracker

---

## 8. Mobile Design

### Mobile-First Layout (375px base)
- Hero: Full-bleed, taller on mobile (420px vs 480px desktop)
- Cards: Single column, full-width
- 2-up grids on mobile only for small cards (Activity + Hotel pairs)
- Horizontal scroll for: Nearby, Related, More Deals
- Touch targets: Minimum 44px
- Card padding: 16px on mobile, 20px on desktop
- Feed padding: 16px on mobile, 60px on desktop

### Desktop Adaptation (1280px max-width)
- Hero: Same full-bleed, but content area constrained to 1280px
- Cards: 2-up, 3-up, or 4-up grids depending on card type
- Blended layouts: 2/3 + 1/3 for Hotels + Activities
- Sidebar layouts: Itinerary (2/3) + Ship/Pricing (1/3) on Sailing page

---

## 9. Scope & Phasing

### This Spec Covers (Implementation Scope)
- Universal page shell with hero, context, feed, related zones
- All 6 entity types: Destination, Ship, Cruise Line, Sailing, Region, Deal
- Card component library (10 card types)
- Geolocation detection + storage
- Suspense streaming architecture
- Image fallback chain (using existing sources)
- Deal matching and display
- AI concierge context integration
- Text contrast solution for hero images

### Deferred to Future Specs
- Onboard venue images (cruise line press kit pipeline)
- Planning session persistence (save to DB, not just Zustand)
- Wishlist → Tailfire trip conversion
- Consumer authentication (magic link / Supabase)
- Full AI companion panel redesign (content-push layout, journey tracker)
- Hotel booking / flight booking (self-serve)

---

## 10. Design Mockups

Visual mockups created during brainstorming are saved at:
`.superpowers/brainstorm/40440-1774708864/content/`

| Mockup | Entity | Key Features |
|--------|--------|-------------|
| `universal-hub-v4-desktop.html` | Destination (Rome) | Full desktop feed with flights, cruises, hotels, tours, activities, photos, nearby |
| `universal-hub-v4-mobile.html` | Destination (Rome) | Mobile-first magazine feed |
| `ship-hub-beyond.html` | Ship (Celebrity Beyond) | Sailings, Life Onboard, Cabins, Ports, Fleet |
| `sailing-hub-caribbean.html` | Sailing (Eastern Caribbean) | Itinerary, Deal banner, Flights to embark, Hotels, Similar sailings |
| `deal-hub-entity.html` | Deal (40% Off Mediterranean) | Urgency, Savings, Qualifying sailings, Perks, Terms, Destinations |
