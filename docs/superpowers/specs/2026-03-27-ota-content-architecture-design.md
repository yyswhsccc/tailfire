# OTA Content Architecture & AI Companion Platform — Design Specification

**Date:** 2026-03-27
**Status:** Draft
**Author:** Claude + Alex Guertin
**Tagline:** Empowered Consumers, Informed Advisors, Happy Travelers

## Overview

Transform the Phoenix Voyages OTA from a search-and-inquire site into a **content-rich travel discovery platform** with an AI companion that guides consumers through their planning journey. Every entity (destination, cruise line, ship, sailing, tour) is an interconnected page. The AI concierge evolves from a chatbot into a **persistent travel planning companion** that watches the consumer's journey, offers proactive insights, and bridges the gap between self-serve exploration and advisor-assisted booking.

**Core philosophy:** Consumers explore freely, the AI companion adds context and recommendations along the way, and a human Travel Advisor is always available when the journey gets complex. The OTA, Client Portal, and Tailfire Admin work as one unified platform.

**What makes this different from Expedia/Kayak/TripAdvisor:**
- TripAdvisor's content depth + Expedia's booking capability + human advisor relationship + AI-powered discovery
- The AI-to-advisor pipeline: warm handoff with full journey context
- Wishlist-to-Tailfire: consumer builds, agent refines
- Content richness at agency scale (cache-on-demand, not manual curation)

---

## 1. Entity Model

### Core Entities

| Entity | Source | Count | URL Pattern | Cache Strategy |
|--------|--------|-------|-------------|----------------|
| **Destination** | TripAdvisor (SerpAPI) + cruise ports + hotel cities | Grows on-demand | `/destinations/[slug]` | Cache-on-demand, refresh weekly, prune after 90 days unused |
| **Region** | Traveltek catalog (43 regions) + curated | ~50 | `/destinations/[region-slug]` | Pre-populated, update monthly |
| **Cruise Line** | Traveltek catalog | 52 active | `/cruise-lines/[slug]` | From catalog, update with sync |
| **Ship** | Traveltek catalog | 596 | `/ships/[slug]` | From catalog + TripAdvisor enrichment |
| **Sailing** | Traveltek catalog | 54,250 | `/cruises/[slug]` | From catalog, live pricing via FusionAPI |
| **Tour** | Globus catalog | 1,260 | `/tours/[slug]` | From catalog |
| **Activity** | TripAdvisor + Amadeus Activities | On-demand | Sub-entity of destination | Cache-on-demand |
| **Deal** | VPS scraper + manual | Dynamic | `/deals/[slug]` | Existing system |
| **Planning Session** | Consumer-generated | Per-consumer | N/A (API-managed) | Persisted in DB |

### Entity Relationships

```
DESTINATION (universal hub)
├── has many Sailings (via sailing_stops — 633K records)
├── has many Activities (TripAdvisor + Amadeus)
├── has many Hotels (Amadeus search)
├── has many Restaurants (TripAdvisor)
├── has many Tours (Globus — destinations in itinerary)
├── has many Flights (Amadeus — nearest airport)
├── belongs to Region
├── has many related Destinations (nearby)

CRUISE LINE
├── has many Ships
├── has many Sailings (via ships)
├── has many Deals

SHIP
├── belongs to Cruise Line
├── has many Sailings
├── has many Ship Images (Traveltek)
├── has many Cabin Types
├── has TripAdvisor enrichment (reviews, rating)

SAILING
├── belongs to Ship → Cruise Line
├── has many Stops (day-by-day itinerary) → each Stop is a Destination
├── has Pricing (4 cabin tiers, in cents)
├── can be in Wishlist / Planning Session

TOUR
├── has many Destinations (itinerary days)
├── belongs to Operator
├── has Departures with pricing

REGION
├── has many Destinations
├── has many Sailings (via sailing regions)
├── has many Tours
```

### Data Sources

| Source | What it provides | API/Access |
|--------|-----------------|------------|
| **Traveltek Catalog** (DB) | Cruise lines, ships, sailings, ports, regions, sailing stops, cabin prices | cruise-repository API (existing) |
| **Traveltek FusionAPI** | Live cruise pricing/availability | FusionAPI (cruise-only access) |
| **Amadeus** | Flights, hotels, activities, airport search | Amadeus API (production credentials) |
| **Globus Catalog** (DB) | Tours, departures, itineraries, pricing | tour-repository API (existing) |
| **TripAdvisor via SerpAPI** | Destination photos, reviews, ratings, activities, restaurants, hotels | SerpAPI TripAdvisor Search + Place APIs |
| **SerpAPI General** | Google search results, images, maps, local business data | SerpAPI dashboard |
| **VPS Scraper** (existing) | Deals from TLN and supplier feeds | POST /api/v1/deals |

---

## 2. URL Structure & Page Types

### URL Pattern

```
/search/{entity-type}              → Search/browse entities
/{entity-type}/{slug-or-id}        → Entity detail page
/destinations/{slug}/{sub-entity}  → Destination sub-pages
```

### Complete Route Map

```
# Search pages (existing, enhanced)
/search/cruises                    → Search cruise sailings
/search/flights                    → Search flights
/search/hotels                     → Search hotels
/search/tours                      → Search tours
/search/ports                      → Search/browse all cruise ports of call
/search/all-inclusives             → Softvoyage iframe (existing)

# Cruise entity pages (NEW)
/cruises/[slug]                    → Sailing detail (itinerary, cabins, pricing)
/cruise-lines                      → Browse all cruise lines
/cruise-lines/[slug]               → Cruise line detail (fleet, sailings, deals)
/ships/[slug]                      → Ship detail (photos, cabins, sailings)

# Destination pages (NEW)
/destinations/[slug]               → Destination detail (universal hub)
/destinations/[slug]/cruises       → Cruises stopping at this destination
/destinations/[slug]/activities    → Things to do
/destinations/[slug]/hotels        → Hotels at this destination
/destinations/[slug]/restaurants   → Where to eat
/destinations/[slug]/tours         → Tours that include this destination
/destinations/[slug]/ports         → Cruise port info for this destination

# Tour pages (NEW)
/tours/[slug]                      → Tour detail (itinerary, departures, pricing)

# Existing pages (unchanged)
/deals                             → Deals listing
/deals/[slug]                      → Deal landing page
/advisor/[slug]                    → Advisor micro-site
/advisors                          → Advisor directory
/join                              → Agent recruitment
```

---

## 3. Page Designs

### Destination Page (`/destinations/[slug]`)

The richest page type — the universal hub. Adapts based on available data.

**Content:**
- **Hero:** TripAdvisor photo + destination name + rating + review count
- **Quick stats:** X cruises, X tours, X activities, X hotels
- **CTA:** "Plan a trip to [Destination]" → opens AI concierge with context
- **Tabs:** Overview | Cruises | Activities | Hotels | Restaurants | Tours | Flights
- **Overview tab:** Description (TripAdvisor or AI-generated), best time to visit, weather info, photo gallery
- **Cruises tab:** Cards for sailings stopping here (from sailing_stops), link to `/search/cruises?port=[id]`
- **Activities tab:** Shore excursions, attractions, experiences (TripAdvisor + Amadeus Activities)
- **Hotels tab:** Hotel search results for this city (Amadeus)
- **Restaurants tab:** Top-rated restaurants (TripAdvisor)
- **Tours tab:** Globus tours that include this destination
- **Flights tab:** Flight search pre-filled with nearest airport
- **Related destinations:** Nearby destinations with thumbnails

**Data fetching:** Cache-on-demand. First visit triggers SerpAPI fetch, result cached in `destination_cache` table. Subsequent visits serve from cache. ISR with 7-day revalidation.

### Sailing Detail Page (`/cruises/[slug]`)

**Content:**
- **Hero:** Ship photo (Traveltek) + sailing name + cruise line + dates + nights
- **Pricing bar:** Cabin tier prices (Inside, Ocean, Balcony, Suite) + "Add to Wishlist" + "Inquire"
- **Day-by-day itinerary:** From `cruise_sailing_stops` table. Each port links to `/destinations/[slug]`
  - Day 1: Fort Lauderdale (embark) → link to destination
  - Day 2: At Sea
  - Day 3: Cozumel, Mexico → link to destination (with activities preview)
  - etc.
- **Ship info:** Card linking to `/ships/[slug]` with photo and key stats
- **Cabin categories:** Visual cards for each tier with price + description
- **More sailings:** Similar sailings on same ship or same route
- **Deals:** Any active deals for this cruise line or route
- **CTAs:** "Add to Wishlist" (saves to planning session), "Place Deposit" (Phase C), "Talk to Advisor"

### Cruise Line Page (`/cruise-lines/[slug]`)

**Content:**
- **Hero:** Brand banner with logo + name + fleet size + sailing count
- **Tabs:** Overview | Ships | Sailings | Deals
- **Ships tab:** Card grid of fleet with photos → each links to `/ships/[slug]`
- **Sailings tab:** Upcoming sailings filtered to this line → links to `/search/cruises?line=[id]`
- **Deals tab:** Current deals for this cruise line

### Ship Page (`/ships/[slug]`)

**Content:**
- **Hero:** Ship photo (Traveltek) + name + cruise line + class + passenger count
- **Tabs:** Overview | Sailings | Cabins | Photos
- **Sailings tab:** Upcoming sailings on this ship
- **Cabins tab:** Cabin types with images (from `cruise_ship_cabin_types`)
- **Photos tab:** Ship image gallery (from Traveltek + TripAdvisor enrichment)
- **TripAdvisor enrichment:** Reviews and rating if available

### Tour Detail Page (`/tours/[slug]`)

**Content:**
- **Hero:** Tour image (Globus) + name + operator + duration + price from
- **Day-by-day itinerary:** Each day with description, destination links
- **Departures:** Available departure dates with pricing
- **Operator info:** About Globus/Cosmos/etc.
- **CTAs:** "Add to Wishlist", "Request Quote from Advisor"

### Region Page (`/destinations/[region-slug]`)

**Content:**
- **Hero:** Region photo + name + description
- **Top destinations:** Card grid of popular destinations in this region
- **Cruises:** Featured sailings in this region
- **Tours:** Tours in this region
- **Deals:** Active deals for this region

---

## 4. AI Concierge Companion Panel

The AI concierge evolves from a chat window into a **persistent travel planning companion** with three sections.

### Panel Layout

**Desktop (> 1024px):** Fixed side panel, 400px wide, pinned to the right. Content area **pushes left** (not overlay) — the main content reflows to accommodate the panel. Smooth 300ms transition. Panel can be collapsed to a floating button.

**Mobile (< 768px):** Draggable bottom sheet with three states:
- **Minimized:** Sticky bar at bottom showing trip context + AI notification dot
- **Half screen:** Journey items + AI insight visible, content scrollable behind
- **Full screen:** Complete AI chat + journey + insights

**Tablet (768px - 1024px):** Narrow side panel (320px) or bottom sheet depending on orientation.

### Panel Sections

**1. Journey Tracker (top)**
Shows the consumer's current exploration path:
- What sailing/trip they started from
- Which destinations/ports they've explored
- Which items they've hearted (♡)
- Clickable to navigate back to any point
- Heart toggle to save/unsave items to wishlist

**2. AI Insights (middle)**
Proactive, contextual recommendations that update as the consumer browses:
- Consumer visits a destination → AI shows top-rated activities
- Consumer looks at a cruise → AI shows port highlights
- Consumer compares sailings → AI suggests a comparison
- Consumer seems stuck → AI suggests connecting with an advisor
- Triggered by page navigation, not by consumer asking

**3. Chat (bottom)**
The existing conversational interface, but now with full journey context:
- AI knows what sailing they're looking at
- AI knows which ports they've explored
- AI knows what they've hearted
- AI can reference their journey in responses
- Tool results render as rich product cards (existing feature)

### Page Context Awareness

Every page navigation sends context to the AI companion:

```typescript
// When consumer navigates to a destination page
onPageContext({
  type: 'destination',
  slug: 'cozumel-mexico',
  name: 'Cozumel, Mexico',
  parentContext: { type: 'sailing', slug: 'harmony-7nt...' }
})
```

The AI system prompt includes this context so responses are relevant to what the consumer is currently viewing.

### Proactive Insight Triggers

| Consumer Action | AI Response |
|----------------|-------------|
| Views a sailing for the first time | "This 7-night Eastern Caribbean is one of Royal Caribbean's most popular routes. Highlights include..." |
| Clicks into a port/destination | "Cozumel's reef snorkeling is rated #1 on TripAdvisor. Best time is morning before the crowds." |
| Hearts 3+ items | "You're building a great itinerary! Want me to estimate the total cost?" |
| Goes back and forth between sailings | "I notice you're comparing options. Want me to put together a side-by-side comparison?" |
| Hasn't interacted in 5+ minutes | "Still exploring? I'm here if you have any questions." |
| Has 5+ journey items | "Ready to save this trip? I can create a wishlist so you can come back to it later." |
| Complex request or many questions | "This is getting detailed! Want me to connect you with a Travel Advisor who specializes in [topic]?" |

---

## 5. Planning Sessions & Persistence

### Consumer Journey Persistence

Planning sessions are auto-saved as consumers browse. Each session captures:
- Journey items (explored entities)
- Wishlist items (hearted entities)
- AI conversation history
- AI-generated trip summary
- Session metadata (time spent, pages visited)

### Data Model

```sql
planning_sessions
├── id                    UUID PK
├── consumerId            UUID FK → contacts / portal users
├── title                 TEXT — auto-generated or consumer-named
├── status                TEXT — "exploring" | "ready" | "submitted" | "converted"
├── tripType              TEXT — "cruise" | "flight_hotel" | "tour" | "custom" | null
├── journeyItems          JSONB — ordered list of explored entities
├── wishlistItems         JSONB — hearted items only
├── aiConversation        JSONB — full AI chat message history
├── aiSummary             TEXT — AI-generated summary of consumer's intent
├── metadata              JSONB — { lastPageVisited, totalTimeSpent, referrerUrl }
├── convertedToTripId     UUID FK → trips (null until submitted to advisor)
├── assignedAdvisorId     UUID FK → users (null until assigned)
├── agencyId              UUID FK → agencies
├── createdAt             TIMESTAMP
├── updatedAt             TIMESTAMP
├── lastActiveAt          TIMESTAMP — for sorting by recency
```

### Destination Content Cache

```sql
destination_cache
├── id                    UUID PK
├── slug                  TEXT UNIQUE — URL-safe identifier
├── name                  TEXT
├── country               TEXT
├── region                TEXT
├── tripadvisorPlaceId    TEXT — for re-fetching
├── description           TEXT
├── photos                JSONB — [{url, caption, source}]
├── rating                DECIMAL — TripAdvisor rating
├── reviewCount           INTEGER
├── activities            JSONB — top activities
├── restaurants           JSONB — top restaurants
├── nearestAirport        TEXT — IATA code
├── coordinates           JSONB — {lat, lng}
├── relatedDestinations   TEXT[] — slugs of nearby destinations
├── sourceData            JSONB — raw SerpAPI response (for re-processing)
├── lastFetchedAt         TIMESTAMP — when data was last fetched from SerpAPI
├── lastVisitedAt         TIMESTAMP — when a consumer last viewed this page
├── visitCount            INTEGER — for popularity ranking
├── createdAt             TIMESTAMP
├── updatedAt             TIMESTAMP
```

### Cache-on-Demand Flow

```
Consumer visits /destinations/cozumel-mexico
  → Check destination_cache by slug
  → If exists AND lastFetchedAt < 7 days ago:
    → Serve from cache (fast)
  → If missing OR stale:
    → Fetch TripAdvisor data via SerpAPI Search + Place APIs
    → Parse: photos, reviews, rating, activities, restaurants
    → Upsert into destination_cache
    → Serve the page
  → Update lastVisitedAt + increment visitCount
```

### Cleanup/Update Process

- **Weekly refresh job:** Re-fetch destinations where `lastVisitedAt > 7 days ago AND visitCount > 10` (popular + stale)
- **Monthly cleanup:** Delete destinations where `lastVisitedAt > 90 days ago AND visitCount < 5` (unused + unpopular)
- **On-demand refresh:** Admin trigger or API endpoint to force-refresh a destination

### Cross-Surface Continuity

```
OTA (consumer explores)
  → planning_session auto-saved to DB
    → Consumer submits wishlist
      → Tailfire Trip created (activities from wishlist, AI summary for advisor)
        → Agent notified, picks up trip
          → Client Portal: consumer reviews proposals
            → "Continue Planning" → back to OTA with session restored
```

**"Continue Planning" from Client Portal:**
- Client Portal shows planning sessions with "Continue Planning" button
- Button links to OTA with session token: `phoenixvoyages.ca?session=[id]`
- OTA loads session: restores journey items, AI conversation, wishlist
- AI concierge greets: "Welcome back! Last time you were exploring the Harmony of the Seas sailing..."

---

## 6. Consumer Scenarios

### Scenario A: Jane (Experienced Cruiser)
Jane knows what she wants. She browses cruise lines, finds a Harmony of the Seas sailing, explores ports, hearts activities. She places a deposit to lock her cabin. Her booking flows into Tailfire. Jim, her advisor, validates everything and they collaborate through the client portal on excursions and flights.

### Scenario B: Judy (First-Time Cruiser)
Judy chats with the AI concierge, which recommends a Holland America Caribbean cruise. She adds it to her wishlist and submits for an advisor. Mimi picks up the intake, realizes a Princess cruise is better, and sends an alternative proposal through the client portal. Judy approves and Mimi handles the booking.

### Scenario C: Corporate Quick Booker
Fast flight and hotel bookings with receipts in the client portal for expenses. Agent provides passive oversight and flight delay notifications.

### Scenario D: Exploratory Family
Family chats with AI about family-friendly options. AI gathers preferences (budget, motion sickness concern, flight distance). AI builds a wishlist of recommendations. When questions get complex, warm handoff to an advisor who receives the full AI conversation and wishlist.

---

## 7. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Content enrichment | SerpAPI (TripAdvisor Search + Place APIs) | Reviews, photos, ratings, activities for destinations |
| Content caching | `destination_cache` table with TTL | Cache-on-demand, weekly refresh, 90-day cleanup |
| AI companion state | React Context + localStorage (anonymous), DB (authenticated) | Instant for browsing, persistent for logged-in users |
| Panel layout | CSS flexbox with `margin-right` transition | Content pushes left, not overlay |
| Mobile panel | Draggable bottom sheet (3 states) | Proven pattern (Google Maps, Uber) |
| Planning sessions | PostgreSQL JSONB columns | Flexible schema for journey/wishlist items |
| Session → Trip | API endpoint converts session to Tailfire Trip | Preserves AI summary, wishlist items, attribution |

---

## 8. Implementation Phases

This spec covers **Phase A (Content Architecture)** which is the first of four phases:

### Phase A: Content Architecture (this spec)
- Entity pages: destinations, cruise lines, ships, sailings, tours
- Cache-on-demand enrichment via SerpAPI
- AI companion panel redesign (journey tracker + insights + chat)
- Content push layout (desktop side panel, mobile bottom sheet)
- Planning session data model
- Page context awareness for AI

### Phase B: Wishlist & Consumer Accounts (future spec)
- Consumer authentication
- Heart/save items to wishlist
- Planning session persistence across visits
- Resume from client portal

### Phase C: Self-Serve Booking (future spec)
- Deposit payments via supplier APIs
- Booking → Tailfire Trip with auto-assignment
- Payment integration

### Phase D: Client Portal Redesign (future spec)
- Rebuild with Phoenix Voyages OTA brand
- Planning sessions view
- "Continue Planning" → OTA handoff
- Seamless advisor collaboration UX

---

## 9. Data Available (Inventory)

| Data Source | Entity | Count | Key Fields |
|------------|--------|-------|------------|
| Traveltek Catalog | Cruise Lines | 52 active (138 total) | Name, logo URL |
| Traveltek Catalog | Ships | 596 | Name, image URL, line association |
| Traveltek Catalog | Sailings | 54,250 | Dates, nights, embark/disembark, 4-tier pricing |
| Traveltek Catalog | Ports of Call | 7,203 | Port names |
| Traveltek Catalog | Regions | 43 | Region names |
| Traveltek Catalog | Sailing Stops | 633,209 | Day-by-day port calls for each sailing |
| Traveltek Catalog | Ship Images | Via URLs | `static.traveltek.net/cruisepics/...` |
| Traveltek Catalog | Cruise Line Logos | Via URLs | `static.traveltek.net/images/logos/...` |
| Traveltek Catalog | Sailing date range | Mar 2026 - Apr 2029 | 3+ years of inventory |
| Traveltek Catalog | Price range | $69 - $71,619 /person | All cabin tiers |
| Globus Catalog | Tours | 1,260 | Name, operator, days, pricing, images, itineraries |
| Amadeus API | Flights | Live search | Routes, pricing, airlines, schedules |
| Amadeus API | Hotels | Live search | Properties, pricing, amenities |
| Amadeus API | Activities | Live search | Tours, excursions by location |
| Amadeus API | Airports | 7,000+ | IATA codes, names, cities |
| SerpAPI/TripAdvisor | Destinations | On-demand | Photos, reviews, ratings, activities, restaurants |
| SerpAPI/TripAdvisor | Place types | Restaurants, hotels, attractions, destinations | Full place detail |
