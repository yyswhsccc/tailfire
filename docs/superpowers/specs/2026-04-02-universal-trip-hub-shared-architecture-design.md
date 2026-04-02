# Universal Trip Hub — Shared Architecture Design

**Goal:** Unify all 6 entity pages (destination, ship, sailing, cruise line, region, deal/offers) into a shared HubScaffold + section registry architecture with unified product cards, AI concierge integration, trip basket on every page, and progressive authentication — all mobile-first and performance-optimized.

**Supersedes / builds on:**
- `2026-03-28-entity-trip-hub-design.md` — Original entity hub vision (section types, image strategy, deals integration)
- `2026-03-27-ota-content-architecture-design.md` — Content architecture, AI companion, destinations normalization
- `2026-04-01-consumer-trip-builder-design.md` — Dream board, trip basket, submit flow, AI tools

**Key distinction:** This spec defines the *shared component architecture* — how the 6 entity pages and dream board share visual DNA, cards, and AI integration while remaining fundamentally different systems (informative discovery vs interactive planning tool).

---

## Architecture Overview

### Two Systems, Shared DNA

| | Entity Pages (6 types) | Dream Board |
|---|---|---|
| **Purpose** | Informative discovery | Interactive planning tool |
| **Layout** | HubScaffold + section registry | Masonry board + AI panel |
| **Cards** | Shared product cards (AddToTrip) | Same cards + inspiration + notes |
| **Sections** | Data-driven, entity-specific order | User-arranged, drag-and-drop |
| **AI** | Contextual prompts → expand to chat | Full side panel / bottom sheet |
| **Auth** | Anonymous browse + AddToTrip | Name board + email to view |

**Shared across both:**
- Product card family (8 types × 3 variants)
- AI concierge context awareness + product suggestion cards
- Trip basket (Zustand store backed by `ota_trip_requests`)
- Image strategy (enriched → Unsplash → local fallback)
- Visual language (Phoenix Voyages brand: white body, dark hero, Cinzel/Lato, Phoenix Gold #C59746)
- Progressive auth flow

### Component Hierarchy

```
apps/ota/src/
├── components/
│   ├── hub/
│   │   ├── hub-scaffold.tsx          # Shared page shell (hero + pills + sections + AI prompt)
│   │   ├── hub-hero.tsx              # Full-bleed hero with gradient overlay (exists, extend)
│   │   ├── hub-context-pills.tsx     # Scrollable pills bar with counts
│   │   ├── hub-section-renderer.tsx  # Maps section descriptors → components via registry
│   │   ├── section-skeleton.tsx      # Per-section Suspense fallback (exists, extend)
│   │   ├── feed-divider.tsx          # Section divider (exists)
│   │   └── sections/                 # Reusable section components
│   │       ├── cruises-section.tsx
│   │       ├── flights-section.tsx
│   │       ├── hotels-section.tsx
│   │       ├── tours-section.tsx
│   │       ├── activities-section.tsx
│   │       ├── offers-section.tsx
│   │       ├── sailings-section.tsx
│   │       ├── cabin-categories-section.tsx
│   │       ├── deck-plans-section.tsx
│   │       ├── itinerary-section.tsx
│   │       ├── photo-mosaic-section.tsx
│   │       ├── nearby-section.tsx
│   │       ├── ships-section.tsx
│   │       └── destinations-section.tsx
│   ├── cards/                        # Unified product card family
│   │   ├── cruise-product-card.tsx
│   │   ├── flight-product-card.tsx
│   │   ├── hotel-product-card.tsx
│   │   ├── tour-product-card.tsx
│   │   ├── activity-product-card.tsx
│   │   ├── destination-card.tsx      # Navigation card (links to hub, no AddToTrip)
│   │   ├── ship-card.tsx             # Navigation card (links to hub, no AddToTrip)
│   │   └── promotion-card.tsx
│   ├── ai/
│   │   ├── ai-contextual-prompt.tsx  # Suggestion bar below pills
│   │   ├── ai-hero-cta.tsx           # "Plan a Trip" button in hero
│   │   ├── ai-chat-input.tsx         # Fixed bottom input (mobile)
│   │   └── ai-product-suggestion.tsx # Product cards rendered in chat
│   └── trip-builder/                 # Existing basket + board components
├── lib/
│   ├── entity-hubs/
│   │   ├── types.ts                  # HubAdapter, SectionDescriptor, HeroData types
│   │   ├── section-registry.ts       # Maps section keys → lazy components
│   │   └── adapters/
│   │       ├── destination.adapter.ts
│   │       ├── ship.adapter.ts
│   │       ├── sailing.adapter.ts
│   │       ├── cruise-line.adapter.ts
│   │       ├── region.adapter.ts
│   │       └── deal.adapter.ts       # Route stays /deals, UI label "Offers & Promotions"
│   └── geolocation/
│       └── use-geolocation.ts        # Browser API + IP fallback, cached in cookie
└── app/
    ├── destinations/[slug]/page.tsx  # Thin route: fetch → adapter → HubScaffold
    ├── ships/[slug]/page.tsx
    ├── cruises/[slug]/page.tsx
    ├── cruise-lines/[slug]/page.tsx
    ├── regions/[slug]/page.tsx
    └── deals/[slug]/page.tsx
```

---

## 1. HubScaffold

The shared page shell that every entity page renders. Entity pages become thin route files that fetch data, run it through an adapter, and pass the result to `HubScaffold`.

### Props

```typescript
interface HubScaffoldProps {
  hero: HeroData
  contextPills: ContextPill[]
  sections: SectionDescriptor[]
  aiContext: AiPageContext
  entityType: EntityType
  entitySlug: string
}

interface HeroData {
  imageUrl: string | null
  fallbackGradient: string        // CSS gradient for when no image
  badge: string                   // "DESTINATION", "SHIP", etc.
  urgencyBadge?: string           // "SAVE $200", "LAST 3 CABINS"
  title: string
  subtitle?: string
  description?: string            // Desktop only, below subtitle
  ctaLabel?: string               // Override "Plan a Trip to {title}"
}

interface ContextPill {
  label: string                   // "42 Cruises"
  icon?: string                   // Emoji prefix
  accent?: boolean                // Gold highlight for offers
  href?: string                   // Scroll-to section or navigate
}

interface SectionDescriptor {
  key: string                     // Registry key: 'cruises', 'flights', etc.
  title: string                   // "Cruises visiting Cozumel"
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string           // "View all 42 cruises →"
  props: Record<string, unknown>  // Section-specific data/params
  priority: 'high' | 'medium' | 'low'  // Affects fetch priority
}
```

### Layout (4 Zones)

1. **Zone 1: Hero** (instant from ISR cache) — Full-bleed image with 3-layer text contrast (gradient scrim + text shadow + badge contrast). Entity type badge in Phoenix Gold. "Plan a Trip" CTA button.

2. **Zone 2: Context Pills** (instant) — Horizontally scrollable on mobile (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`). Wraps on desktop with AI contextual prompt inline at the end. Warm ivory (#faf6f0) background pills with #E0E0E0 border. Offers pill uses gold accent.

3. **Zone 3: Feed** (streams via Suspense) — Each section is an independent `<Suspense>` boundary with `<SectionSkeleton>` fallback. Sections render in adapter-specified order. Gradient dividers between sections.

4. **Zone 4: Related / Explore More** (lazy) — Horizontal scroll of compact cards. Subtle background shift to signal "end of main content."

### Performance Contract

| Metric | Target | How |
|--------|--------|-----|
| Shell + Hero | < 200ms | ISR cached (1h destinations/ships/cruise-lines/regions, 30m sailings) |
| Card shells visible | < 500ms | Cards render instantly with cached/static data (name, image, description) |
| All card shells | < 2s | Every section's card grid visible with shimmer placeholders on prices |
| Live prices filled | 1-3s | Prices stream in per-card as live APIs respond; shimmer → real price |
| LCP | < 1.5s | Hero image with `priority` prop via `next/image` |
| CLS | < 0.05 | Fixed-height hero and card shells; price area is fixed-width to prevent shift |
| Client JS | < 100KB per page | Code-split per section, AI chat lazy-loaded |

**Critical UX principle:** Cards never wait for full data. A card renders instantly with whatever is available (entity name, image, cruise line, duration, ports, rating). Prices and availability show a shimmer/spinner until the live API responds. The page feels complete and fast; numbers fill in progressively. State management must handle partial data gracefully.

---

## 2. Entity Adapters

Each adapter transforms raw entity data into `HubScaffoldProps`. Adapters are pure functions — no React, no side effects.

### Adapter Interface

```typescript
interface HubAdapter<T> {
  heroData: (entity: T) => HeroData
  contextPills: (entity: T, counts: SectionCounts) => ContextPill[]
  sections: (entity: T, signals: BrowsingSignals) => SectionDescriptor[]
}

interface BrowsingSignals {
  basketComponentTypes: string[]  // What product types are in the basket
  recentEntityTypes: string[]     // What entity types user browsed recently
  detectedAirport?: string        // Geolocation-derived IATA code
}
```

### Section Ordering per Entity Type

Default order (modified by browsing signals — see Personalization section):

| Section | Destination | Ship | Sailing | Cruise Line | Region | Deal (Offers) |
|---------|-------------|------|---------|-------------|--------|---------------|
| Offers Banner | - | - | 1 | - | - | 1 |
| Cruises | 1* | - | - | 2 | 2 | - |
| Flights | 2* | - | 4 | - | - | 5 |
| Hotels | 3 | - | 5 | - | - | - |
| Tours | 4 | - | - | - | 3 | - |
| Activities | 5 | - | - | - | - | - |
| Sailings | - | 1 | - | 3 | - | 2 |
| Cabins | - | 2 | 3 | - | - | - |
| Deck Plans | - | 3 | - | - | - | - |
| Itinerary | - | - | 2 | - | - | - |
| Destinations | - | 4 | - | - | 1 | 3 |
| Ships | - | - | - | 1 | - | - |
| Perks/Terms | - | - | - | - | - | 4 |
| Photos | 6 | 5 | - | - | - | - |
| Nearby/Related | 7 | 6 | 6 | 4 | 4 | 6 |

\* = personalized: order swaps based on browsing signals

### Personalization Rules

Section ordering adjusts based on what the user has been doing:

1. If basket contains cruises → cruise sections move up on destination/region pages
2. If basket contains flights → flight sections move up
3. If user has been browsing hotels → hotel sections move up on destination pages
4. If user is on a destination that's a port on a sailing in their basket → show "Your cruise stops here" banner, move hotels/activities to top
5. Geolocation-detected airport populates "Flights from {IATA}" sections automatically

These are soft reorders of the adapter's default list, not arbitrary rearrangements. The adapter produces the default; a `personalizeOrder()` utility reorders based on signals.

---

## 3. Section Registry

Maps section keys to statically imported async Server Components. Each section is wrapped in its own `<Suspense>` boundary by the renderer. **Do not use `React.lazy()`** — it's a client-side API and doesn't work with async Server Components in the App Router.

```typescript
// section-registry.ts
import { CruisesSection } from './sections/cruises-section'
import { FlightsSection } from './sections/flights-section'
import { HotelsSection } from './sections/hotels-section'
import { ToursSection } from './sections/tours-section'
import { ActivitiesSection } from './sections/activities-section'
import { OffersSection } from './sections/offers-section'
import { SailingsSection } from './sections/sailings-section'
import { CabinCategoriesSection } from './sections/cabin-categories-section'
import { DeckPlansSection } from './sections/deck-plans-section'
import { ItinerarySection } from './sections/itinerary-section'
import { PhotoMosaicSection } from './sections/photo-mosaic-section'
import { NearbySection } from './sections/nearby-section'
import { ShipsSection } from './sections/ships-section'
import { DestinationsSection } from './sections/destinations-section'

const SECTION_REGISTRY: Record<string, SectionEntry> = {
  cruises:          { component: CruisesSection,          skeleton: 'grid-2' },
  flights:          { component: FlightsSection,          skeleton: 'grid-3' },
  hotels:           { component: HotelsSection,           skeleton: 'grid-2' },
  tours:            { component: ToursSection,            skeleton: 'grid-2' },
  activities:       { component: ActivitiesSection,       skeleton: 'grid-3' },
  offers:           { component: OffersSection,           skeleton: 'banner' },
  sailings:         { component: SailingsSection,         skeleton: 'grid-2' },
  cabinCategories:  { component: CabinCategoriesSection,  skeleton: 'grid-4' },
  deckPlans:        { component: DeckPlansSection,        skeleton: 'single' },
  itinerary:        { component: ItinerarySection,        skeleton: 'timeline' },
  photoMosaic:      { component: PhotoMosaicSection,      skeleton: 'mosaic' },
  nearby:           { component: NearbySection,           skeleton: 'scroll' },
  ships:            { component: ShipsSection,            skeleton: 'grid-3' },
  destinations:     { component: DestinationsSection,     skeleton: 'grid-3' },
}
```

Use `next/dynamic` only for genuinely client-only sections (e.g., deck plan viewer with interactive canvas).

### Section Component Contract

Every section component receives a standard interface:

```typescript
interface SectionProps {
  entityType: EntityType
  entitySlug: string
  title: string
  subtitle?: string
  viewAllHref?: string
  viewAllLabel?: string
  sectionProps: Record<string, unknown>  // Type-narrowed per section
}
```

Sections fetch their own data (Server Component async). This means each section can have independent caching, error handling, and streaming timing.

### Grid Layouts (Mobile-First)

| Layout | Mobile | sm (640px) | lg (1024px) |
|--------|--------|------------|-------------|
| grid-2 | 1 col full-width | 2 col | 2 col |
| grid-3 | 1 col full-width | 2 col | 3 col |
| grid-4 | 2 col | 2 col | 4 col |
| banner | full-width | full-width | full-width |
| timeline | vertical | vertical | 2/3 + 1/3 sidebar |
| mosaic | 2+1 | 2+1+1 | 2+1+1 with "+N more" |
| scroll | horizontal scroll | horizontal scroll | horizontal scroll |
| single | full-width | full-width | centered max-w |

---

## 4. Unified Product Card Family

### The Problem

Current codebase has two parallel card systems:
- **Hub cards** (`components/hub/cards/`) — read-only, no AddToTrip
- **Search result cards** (`components/search/`) — shoppable, AddToTrip, but different markup

This split means entity pages can't be "Trip Hubs" — they show products but you can't act on them.

### The Solution

One card component per product type with 3 size variants. Every `full` and `compact` variant has "+ Add to Trip."

### 8 Product Card Types

| Card | Image | Key Data | AddToTrip | Variants |
|------|-------|----------|-----------|----------|
| **CruiseProductCard** | Ship photo | Cruise line, ship, nights, ports, price/pp | Yes (full, compact) | full, compact, mini |
| **FlightProductCard** | None (journey viz) | Airport codes, times, legs, layovers, airline, price | Yes (full, compact) | full, compact, mini |
| **HotelProductCard** | Property photo | Name, rating, amenities, price/night | Yes (full, compact) | full, compact, mini |
| **TourProductCard** | Tour photo | Operator, duration, highlights, price/pp | Yes (full, compact) | full, compact, mini |
| **ActivityProductCard** | Activity photo | Duration, rating, inclusions, price/pp | Yes (full, compact) | full, compact, mini |
| **DestinationCard** | Destination photo | Country, summary, counts | No (navigation) | full, compact, mini |
| **ShipCard** | Ship photo | Cruise line, tonnage, capacity | No (navigation) | full, compact, mini |
| **PromotionCard** | Promo image | Supplier, savings, dates, promo code | Yes (full, compact) | full, compact, mini |

### Variant Usage

| Variant | Used In | AddToTrip | Image |
|---------|---------|-----------|-------|
| **full** | Entity page sections, search results, promotion detail | Yes | Hero image |
| **compact** | Related/nearby rails, AI suggestion cards, mobile horizontal scroll | Yes | Thumbnail |
| **mini** | Trip basket list, board summary, submit review, AI confirmations | No (already in basket) | Icon only |

### FlightProductCard Full Variant — Journey Timeline

The `full` variant uses the same journey visualization as Tailfire admin's `flight-journey-display.tsx`:

- **Visual timeline**: Origin airport → gold gradient line with rotated plane icon (45deg clockwise) → connection airports → destination airport
- **Airport blocks**: IATA code (bold), time, city name
- **Layover badges**: Color-coded by connection risk:
  - Red (#fee2e2 bg, #991b1b text): Tight (< 1h)
  - Amber (#fef3c7 bg, #92400e text): Comfortable (1-3h)
  - Gray (#f0f0f0 bg, #555 text): Long (> 3h)
- **Segment detail**: Airline badge, flight number, aircraft type, duration per leg
- **Tags**: Direct/stops badge, cabin class, baggage inclusion
- **Total duration**: Sum of all legs + layovers

The `compact` and `mini` variants use the simple "YOW → CZM" text format.

### Progressive Rendering (Two-Phase Cards)

Cards never wait for full data. They render instantly with cached/static data, then live data streams in:

**Phase 1 — Instant (cached entity data):**
- Entity name, image, description, ratings, duration, ports, cruise line, operator
- AddToTrip button is immediately interactive
- Price area shows shimmer placeholder (fixed-width to prevent layout shift)

**Phase 2 — Streamed (live API data):**
- Price fills in (shimmer → real price with animation)
- Availability status (e.g., "Last 3 cabins")
- Deal/savings badges appear if applicable

**Data source per card type:**
| Card Type | Phase 1 (cached/instant) | Phase 2 (live/streamed) |
|-----------|--------------------------|-------------------------|
| Cruise | Ship, cruise line, nights, ports, itinerary | Price from catalog or FusionAPI |
| Flight | Route, airline, journey timeline, duration | Price from Amadeus |
| Hotel | Property name, rating, amenities, location | Price/night from search API |
| Tour | Operator, duration, highlights, destinations | Price from Globus catalog |
| Activity | Name, duration, rating, inclusions | Price from TripAdvisor/Amadeus |

**State management:** Each card manages its own price-loading state. The section component fetches entity data (server, cached) and renders cards immediately, then triggers price fetches (client-side or streamed) that update individual cards via Zustand or React Query.

### Card States

- **Default**: "+ Add to Trip" button in Phoenix Gold, price area may show shimmer
- **Price Loading**: Card fully visible with shimmer on price area only
- **Price Loaded**: Shimmer replaced with real price (subtle fade-in animation)
- **Added**: Green "Added ✓" badge, card muted slightly, "Remove" on hover
- **In basket**: For mini variant, shown with green checkmark
- **Error**: Price fetch failed → show "Check price →" CTA linking to search page

### AddToTrip Button Behavior

1. **No basket exists**: Creates draft `ota_trip_requests` row, adds component, shows confirmation animation
2. **Active basket**: Adds component directly, basket badge count increments
3. **Multiple drafts**: Shows picker dropdown to choose which trip
4. **Already in basket**: Shows "Added ✓", hover reveals "Remove"

---

## 5. AI Concierge Integration

### Three Touchpoints on Every Entity Page

**1. Hero CTA — "Plan a Trip to {Entity}"**
- Always visible in the hero area
- Opens full AI chat with entity context pre-loaded
- System prompt includes: entity type, name, available products, user's detected location, basket contents

**2. Contextual Suggestion Bar**
- Below the context pills
- Proactive, page-aware suggestions that change based on browsing signals
- Tapping expands to full chat with the suggestion as the opening message
- Trigger examples:
  - First visit to destination: "I found 3 direct flights from Ottawa"
  - Has cruise in basket that stops here: "Your cruise stops here — need hotels for the night before?"
  - Browsed 3+ destinations: "Comparing options? I can help narrow it down"
  - Idle 30s+: "Want me to build a sample itinerary?"
  - 5+ items in basket: "Ready to save your trip? I can create your Dream Board"

**3. Fixed Bottom Chat Input (Mobile) / Nav CTA (Desktop)**
- Mobile: Always-visible input bar at bottom, tapping opens bottom sheet (half → full screen)
- Desktop: "Talk to AI" button in nav, opens side panel (40% width, content reflows to 60%)
- Pre-filled placeholder reflects current page context: "Ask about Cozumel..."

### AI Product Suggestion Cards

The AI suggests real products as interactive cards within the chat conversation. These use the same unified product card components (typically `full` variant for suggestions, `mini` variant for confirmations).

**Two ways to add products from AI:**

1. **Tap the card's "+ Add to Trip" button** — Same interaction as entity page cards. Instant add with animation. Card state changes to "Added ✓."

2. **Tell the AI in natural language** — "Add the snorkeling tour to my trip." AI uses `manageTripBasket` tool (add_component action), confirms with mini cards showing what was added.

### AI Context System

The `<PageContextBridge>` component (already exists) pushes entity context to the Zustand-backed AI panel store. Extended to include:

```typescript
interface AiPageContext {
  entityType: EntityType
  entityName: string
  entitySlug: string
  availableProducts: { type: string; count: number }[]
  detectedAirport?: string
  basketSummary: { type: string; title: string; price: number }[]
  browsingHistory: string[]  // Recent entity slugs this session
}
```

### AI Tools (Extending Phase 1)

- **manageTripBasket** — actions: `add_component`, `remove_component`, `get_basket`, `set_title`
- **captureIdentity** — collect name/email, CRM lookup, link contact, generate share token
- Product suggestion cards rendered via the same unified card components

---

## 6. Progressive Authentication Flow

### 5 Stages

**Stage 1: Browse (Anonymous)**
- View all entity pages, search everything, talk to AI, see prices
- Tracked via existing `ota_session` cookie
- No login required

**Stage 2: Add to Trip (Still Anonymous)**
- Click "+ Add to Trip" on any product card or tell AI to add
- Auto-creates draft `ota_trip_requests` row linked to session
- Basket badge in nav shows item count
- No login required

**Stage 3: View Dream Board (Identity Capture)**
- Triggered when user taps basket indicator to view their board
- Modal: Name your board + provide name and email
- Board name auto-suggested from first destination
- CRM lookup: existing contact → link; new → create in Tailfire CRM
- All session drafts linked to this contact
- Share token generated for board URL
- AI can also capture identity conversationally using `captureIdentity` tool

**Stage 4: Submit Trip (Full Details)**
- Name all passengers, confirm travel dates, date flexibility, travel style
- Special requests (freeform text)
- Review summary (functional components with prices, disclaimer about approximate pricing)
- Share option (generate read-only link for travel companions)
- Submit triggers Phase 1 promotion pipeline → Tailfire inbound trip

**Stage 5: Account Created (Automatic)**
- User account created from submit details
- Client Portal access granted
- Linked to Tailfire CRM contact
- Advisor assigned via owner resolution chain: CRM > referral > group > round-robin
- Advisor notified

### Behavior Change from Phase 2

Current Phase 2 code allows session-based board access without identity capture (`my-trip/[id]/page.tsx` checks session OR contact OR share token). This spec changes that: viewing the full Dream Board requires identity capture (name + email). Anonymous users can still add items via the basket, but tapping the basket indicator to view the board triggers the identity modal.

### Expiry

- Unnamed/unidentified drafts: 30-day auto-expiry (`expires_at` field)
- Named boards with email: persist indefinitely
- AI reminds users to name their board when basket has 3+ items

---

## 7. Visual Design System

### Brand Treatment

- **Background**: White (#FFFFFF) body with dark (#1A1A1A) hero
- **Typography**: Cinzel (serif) for display headings, Lato (sans-serif) for body text
- **Primary accent**: Phoenix Gold (#C59746)
- **Secondary accent**: Golden Hour (#E89E4A)
- **Muted background**: Warm Ivory (#faf6f0)
- **Borders**: Ash Gray (#E0E0E0)
- **Destructive**: Ember Red (#B33939)
- **Border radius**: 10px (0.625rem)
- **Max content width**: 1280px
- **Responsive padding**: `px-4 sm:px-10 lg:px-[60px]`

### Mobile-First Responsive

Base CSS = mobile. Breakpoints add complexity upward:

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Base | < 640px | Single column, full-width cards, 16px padding, hamburger nav |
| sm | 640px | 2-column grids, scrollable pills wrap |
| lg | 1024px | 3-column grids, desktop nav visible, AI side panel option |
| xl | 1280px | Max content width, 60px padding |

- Touch targets: minimum 44px everywhere
- Context pills: horizontally scrollable on mobile, wrapping on desktop
- Cards: full-bleed on mobile, grid on tablet/desktop
- AI: bottom sheet on mobile, side panel on desktop
- Hero: 260px mobile, 320px+ desktop

### Image Strategy

All images use `next/image` with responsive `sizes` attribute:
- Hero: `priority` prop (above-fold), `sizes="100vw"`
- Card hero: `loading="lazy"`, `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- Fallback chain: enriched image → Unsplash API → local category SVG (never blank)
- Traveltek cabin/ship images: dedicated resize proxy (originals can be 15MB+)
- Broken image: `onError` handler → local SVG fallback by entity/product type

---

## 8. Browse-Mode Product Data Strategy

Hub entity pages show product sections in **browse mode** — lighter than full search, designed for discovery. Current APIs are search-driven (require dates, origin, etc.), so hub sections need a different data approach.

### Browse vs Search

| | Browse Mode (entity pages) | Search Mode (search pages) |
|---|---|---|
| **Flights** | Price insights: "Flights from YOW starting at $389" | Full Amadeus offers with specific dates |
| **Hotels** | Top-rated properties with cached prices | Live availability for specific dates |
| **Tours** | Catalog data with published pricing | Same (tours are catalog-driven) |
| **Cruises** | Catalog sailings with published pricing | Same (catalog-driven) |
| **Activities** | Cached TripAdvisor data with pricing | Same (cached) |

**Flights browse strategy:** Use Amadeus Flight Inspiration / Cheapest Dates API (already available as SerpAPI price insights). Show "Flights from {origin}" with lowest-price indicator per airline. Cards show route + airline + "from $X" — tapping goes to full search with pre-filled origin/destination.

**Hotels browse strategy:** Cache top-rated properties per destination from search API. Show property card with cached nightly rate + "prices vary by date" disclaimer. Tapping goes to full search with pre-filled destination.

**Tours/Cruises/Activities:** Already catalog-driven with published pricing — render directly from cached data. No browse-mode distinction needed.

### Geolocation (Server-First)

Required for "Flights from X" sections. **Do not use browser Geolocation API** on browse pages — it triggers a permission popup and doesn't work on first SSR.

```typescript
interface GeoLocation {
  airportIata: string    // Nearest airport IATA code
  cityName: string       // "Ottawa"
  countryCode: string    // "CA"
  source: 'cookie' | 'ip' | 'default'
}
```

**Resolution chain (server-side only):**
1. Check `geo_location` cookie (cached from previous detection)
2. IP-based geo from request headers (X-Forwarded-For → API-side geolocation cascade service already exists)
3. Default: agency's home airport (YOW for Phoenix Voyages)

**Cache:** Store result in `geo_location` cookie (30-day expiry). Set on first server render.

**User override:** "Not in Ottawa? Change →" link in flight section header opens airport picker. Selection updates cookie.

**Note:** The API already has a `geolocation-cascade.service.ts` that can be reused for IP → airport resolution.

---

## 9. Route Pages (Thin Shells)

Each route page becomes a thin async function:

```typescript
// destinations/[slug]/page.tsx
export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const destination = await fetchDestinationBySlug(slug)
  if (!destination) notFound()

  const counts = await fetchDestinationCounts(slug)
  const adapter = destinationAdapter
  const signals = await getBrowsingSignals()

  return (
    <HubScaffold
      hero={adapter.heroData(destination)}
      contextPills={adapter.contextPills(destination, counts)}
      sections={adapter.sections(destination, signals)}
      aiContext={buildAiContext('destination', destination, counts)}
      entityType="destination"
      entitySlug={slug}
    />
  )
}

export const revalidate = 3600
export async function generateMetadata({ params }) { /* ... */ }
```

The page file owns: data fetching, ISR config, metadata generation, and 404 handling. It does NOT own layout, section rendering, or visual treatment.

---

## 10. Migration Strategy

### What Stays

- `components/hub/hub-hero.tsx` — extended, not replaced
- `components/hub/feed-section.tsx` — becomes part of section-renderer
- `components/hub/feed-divider.tsx` — kept as-is
- `components/hub/section-skeleton.tsx` — extended with skeleton variants
- `components/hub/safe-image.tsx` — kept as-is
- `components/hub/page-context-bridge.tsx` — extended with richer context
- `components/trip-builder/*` — kept as-is (dream board is separate system)
- `components/chat/*` — extended with product suggestion cards

### What Gets Replaced (4 card systems → 1)

There are currently **four** separate card implementations that must be unified:

1. **Hub cards** (`components/hub/cards/`) — read-only display
   - `cruise-card.tsx` → merged into `cards/cruise-product-card.tsx`
   - `flight-card.tsx` → merged into `cards/flight-product-card.tsx`

2. **Search result cards** (`components/search/`) — shoppable with AddToTrip
   - `cruise-result-card.tsx` → merged into `cards/cruise-product-card.tsx`
   - `flight-result-card.tsx` → merged into `cards/flight-product-card.tsx`
   - `hotel-result-card.tsx` → merged into `cards/hotel-product-card.tsx`
   - `tour-result-card.tsx` → merged into `cards/tour-product-card.tsx`

3. **Flight search card** (`components/flights/flight-card.tsx`) — separate implementation with 3-zone layout
   - → merged into `cards/flight-product-card.tsx`

4. **Chat product cards** (`components/chat/chat-product-cards.tsx`) — AI suggestion rendering
   - → uses unified card components with `compact` variant

Also replaced:
- `app/destinations/[slug]/sections/*` → `components/hub/sections/*` (shared)
- Individual page layouts → declarative adapter + HubScaffold

### What Gets Deleted

- `components/entity/*` — legacy entity layer, unused by current hub pages

### Important: page-context-bridge.tsx

The existing `PageContextBridge` is at `components/page-context-bridge.tsx` (NOT `components/hub/page-context-bridge.tsx`). It will be extended with richer `AiPageContext` but stays at its current path.

### Migration Order

1. **Unified card family** — build new cards, keep old ones until pages migrate
2. **HubScaffold + section registry** — build the shared shell
3. **Entity adapters** — one per type
4. **Migrate destination + region first** — biggest visual gap, most page views
5. **Migrate ship, sailing, cruise-line, deal** — in that order
6. **Geolocation** — needed for "Flights to X" sections
7. **AI product suggestions in chat** — extend chat widget with card rendering
8. **Personalized section ordering** — browsing signal tracking + reorder utility
9. **Remove old components** — once all pages migrated

---

## 11. Terminology

- **Consumer-facing**: "Offers & Promotions" (not "Deals")
- **Route**: `/deals` (kept for SEO continuity with WordPress)
- **Database table**: `deals` (unchanged)
- **Entity type in adapters**: `deal` (code) / "Offers & Promotions" (UI label)
- **Nav item**: "Offers" (replaces "Deals" in navigation)

---

## Scope

### Build Now

- HubScaffold with 4 zones
- 6 entity adapters
- Section registry with 14 section types
- 8 product card types × 3 variants each
- Flight journey timeline (full variant)
- AI contextual prompt + suggestion bar + product cards in chat
- Progressive auth (5 stages)
- Geolocation abstraction
- Migrate all 6 entity pages to shared architecture
- Performance targets (< 200ms shell, < 500ms first section, < 2s complete)

### Deferred

- Personalized section ordering based on ML/analytics (start with rule-based signals)
- Onboard venue images for ship pages (requires cruise line press kits)
- Real-time advisor collaboration on dream boards
- Map/timeline/calendar views for trip builder
- Social sharing with OG image generation per board
- Published trip → dream board on client portal
