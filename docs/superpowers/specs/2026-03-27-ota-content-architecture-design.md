# OTA Content Architecture & AI Companion Platform — Design Specification

**Date:** 2026-03-27
**Status:** Reviewed (Codex-validated 2026-03-27)
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

### Phase A: Content Architecture & AI Companion (this spec)
- Entity pages: destinations, regions, cruise lines, ships, sailings, tours
- Destinations normalization layer (seed from ports + tour cities)
- Destination cache with SerpAPI enrichment (stale-while-revalidate)
- AI companion panel redesign (Zustand store, journey tracker, insights, chat)
- Content-push layout (desktop side panel, mobile bottom sheet)
- Anonymous planning sessions with auto-save
- Optional magic-link auth with Supabase (minimal — Phase A)
- Contact creation and advisor handoff
- Planning session → inbound Trip conversion
- `public_id` slugs for sailings and tours
- Page context awareness for AI proactive insights

### Phase B: Full Consumer Accounts & Wishlist UX (future spec)
- Full consumer account dashboard
- Self-serve booking, deposit, and payment
- Multi-device saved travel library
- Sharing and collaboration
- Advanced personalization and recommendation feeds

### Phase C: Self-Serve Booking (future spec)
- Deposit payments via supplier APIs (Traveltek, Amadeus)
- Booking → Tailfire Trip with auto-assignment and payment

### Phase D: Client Portal Redesign (future spec)
- Rebuild with Phoenix Voyages OTA brand
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

---

## 10. Database Schema — Destinations Normalization Layer

The core architectural addition: a normalized `destinations` table that unifies cruise ports, tour cities, hotel cities, and enrichment data into a single addressable entity.

### Destinations Table

```sql
CREATE TABLE destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (
    destination_type IN ('city','port_city','island','region','country','resort_area')
  ),
  country_code CHAR(2),
  admin_area TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  parent_destination_id UUID REFERENCES destinations(id),
  source_status TEXT NOT NULL DEFAULT 'seeded' CHECK (
    source_status IN ('seeded','matched','reviewed','hidden')
  ),
  content_status TEXT NOT NULL DEFAULT 'seeded' CHECK (
    content_status IN ('seeded','enriched','reviewed','published')
  ),
  summary TEXT,
  hero_image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX destinations_name_idx ON destinations(normalized_name, country_code);
```

### Destination Aliases (multiple names per destination)

```sql
CREATE TABLE destination_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Mapping Tables

```sql
-- Cruise ports → Destinations
CREATE TABLE destination_ports (
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  port_id UUID NOT NULL REFERENCES catalog.cruise_ports(id) ON DELETE CASCADE,
  match_method TEXT NOT NULL CHECK (match_method IN ('seed','exact','geo','manual')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (destination_id, port_id),
  UNIQUE (port_id)
);

-- Tour cities → Destinations
CREATE TABLE tour_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country_code CHAR(2),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  source_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE destination_tour_cities (
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  tour_city_id UUID NOT NULL REFERENCES tour_cities(id) ON DELETE CASCADE,
  match_method TEXT NOT NULL CHECK (match_method IN ('exact','geo','manual')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (destination_id, tour_city_id),
  UNIQUE (tour_city_id)
);

-- Regions → Destinations
CREATE TABLE destination_regions (
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  cruise_region_id UUID NOT NULL REFERENCES catalog.cruise_regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (destination_id, cruise_region_id)
);
```

### Bootstrap Strategy

1. **Seed** one destination per `cruise_ports` entry (7,203 ports → destinations)
2. **Extract** distinct tour-city candidates from `tours.startCity`, `tours.endCity`, and `tour_itinerary_days.overnightCity` into `tour_cities`
3. **Match** tour cities to seeded destinations by normalized name + country, then by geo distance (<50km)
4. **Create** new destinations only for unmatched tour cities
5. **Admin workflow** for ambiguous matches (manual override)

---

## 11. Enhanced Destination Cache

Stale-while-revalidate with explicit status tracking, error handling, and cost monitoring.

```sql
CREATE TABLE destination_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,               -- 'tripadvisor', 'amadeus_activities', 'google_places'
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'fresh' CHECK (
    status IN ('fresh','stale','refreshing','failed','disabled')
  ),
  cache_key TEXT NOT NULL,
  raw_payload JSONB,                  -- original SerpAPI response
  normalized_payload JSONB,           -- processed/cleaned data
  summary_md TEXT,                    -- markdown summary for AI
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  refresh_after_at TIMESTAMPTZ,       -- when to re-fetch
  expires_at TIMESTAMPTZ,             -- hard expiry
  last_http_status INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT,                  -- detect if content changed
  version INTEGER NOT NULL DEFAULT 1,
  lock_token UUID,                    -- prevent concurrent fetches
  lock_expires_at TIMESTAMPTZ,
  cost_units NUMERIC(10,4) NOT NULL DEFAULT 0,  -- SerpAPI credit tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (destination_id, source, locale)
);
```

### Operational Rules
- Serve cached content if `status IN ('fresh', 'stale')`
- If stale and unlocked → enqueue background refresh
- Never block page render on live SerpAPI fetch (unless cache is completely missing for first visit)
- Backoff on failures: 1h → 6h → 24h → 72h
- Track `cost_units` for SerpAPI budget monitoring
- `payload_hash` detects if enrichment data actually changed (avoid unnecessary cache updates)

---

## 12. Identity & Authentication Model

### Auth Strategy
Use **Supabase Auth** — same system as the existing client portal. Do NOT introduce a second auth provider.

### Anonymous → Authenticated Flow

```
1. Anonymous visitor arrives
   → Middleware sets ota_vid (visitor ID) + ota_sid (session ID) cookies
   → Anonymous planning session created tied to ota_vid

2. Consumer provides email (AI lead capture, contact form, newsletter)
   → Upsert Contact in Tailfire (existing contacts table)
   → Link planning_session.contact_id to the Contact
   → Status: "claimed"

3. Consumer signs in (magic link via Supabase Auth)
   → Upsert client_portal_users record
   → Merge: reassign ALL planning_sessions from ota_vid to authenticated user
   → Deduplicate saved items by (session_id, item_type, entity_key)
   → Consumer can now resume sessions from Client Portal

4. Consumer submits wishlist to advisor
   → planning_session.status = "converted"
   → Create Trip in Tailfire with activities from wishlist
   → Assign advisor (attribution chain or round-robin)
   → Agent notified
```

### Merge Rules
- Match Contact by normalized email + agencyId
- Reassign all `planning_sessions`, `planning_session_items`, and `ota_referrals` from `ota_vid` to `contact_id` and `client_portal_user_id`
- Deduplicate saved items by `(session_id, item_type, entity_key)`

### Phase Boundary
- **Phase A:** Anonymous sessions + email capture + magic-link auth + session→trip conversion
- **Phase B:** Full consumer account dashboard, multi-device sync, sharing

---

## 13. Planning Sessions — Hybrid Data Model

JSONB for AI transcript/context. Relational tables for saved entities (queryable, dedupable).

### Main Session Table

```sql
CREATE TABLE planning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  visitor_token TEXT,                           -- anonymous ota_vid
  contact_id UUID REFERENCES contacts(id),      -- after email capture
  client_portal_user_id UUID REFERENCES client_portal_users(id),  -- after sign-in
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active','claimed','converted','archived')
  ),
  title TEXT,                                   -- auto-generated or consumer-named
  summary TEXT,                                 -- AI-generated trip summary
  source_channel TEXT NOT NULL DEFAULT 'ota',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,   -- budget, dates, travelers, mobility
  session_context JSONB NOT NULL DEFAULT '{}'::jsonb, -- current page, last interaction
  ai_memory JSONB NOT NULL DEFAULT '{}'::jsonb,      -- AI's accumulated understanding
  converted_trip_id UUID REFERENCES trips(id),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### AI Message History (relational — queryable, token-tracked)

```sql
CREATE TABLE planning_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content JSONB NOT NULL,
  tool_name TEXT,
  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Saved Entities (relational — queryable, dedupable, ordered)

```sql
CREATE TABLE planning_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (
    item_type IN ('destination','region','sailing','tour','hotel','flight','deal','activity','published_trip')
  ),
  entity_table TEXT,                    -- e.g., 'cruise_sailings', 'tours'
  entity_id UUID,                       -- FK to the entity (not enforced — cross-table)
  entity_public_id TEXT,                -- slug or public ID for URL
  display_name TEXT NOT NULL,
  thumbnail_url TEXT,
  state TEXT NOT NULL DEFAULT 'saved' CHECK (
    state IN ('suggested','saved','dismissed','selected')
  ),
  rank INTEGER NOT NULL DEFAULT 0,      -- display order
  notes TEXT,                           -- consumer's notes
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- price, dates, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 14. AI Companion Panel — Technical Architecture

### State Management: Zustand Store

Use Zustand (not React Context) for cross-route panel state. Keeps the layout server-rendered while the panel is a thin client shell.

```typescript
type AiPanelState = {
  isOpen: boolean
  sessionId?: string
  prefill?: string
  pageContext?: {
    type: string          // 'destination', 'sailing', 'ship', 'tour', etc.
    slug: string
    name: string
    parentContext?: { type: string; slug: string; name: string }
  }
  journeyItems: JourneyItem[]
  open: (opts?: { prefill?: string }) => void
  close: () => void
  setPageContext: (ctx: PageContext) => void
  addJourneyItem: (item: JourneyItem) => void
  toggleHeart: (itemId: string) => void
}
```

### Component Architecture

```
app/layout.tsx (Server Component — unchanged)
  └── AiPanelShell (Client Component — thin wrapper)
      ├── Reads Zustand store for isOpen, sessionId, pageContext
      ├── Renders panel UI (journey tracker + insights + chat)
      ├── useChat lives HERE (not app-wide)
      └── Manages bottom sheet on mobile, side panel on desktop

Detail pages (Server Components):
  └── PageContextBridge (tiny Client Component)
      └── useEffect → store.setPageContext({ type, slug, name })
      └── No UI — just pushes context into Zustand on mount
```

### Content Push Layout

```tsx
// In layout.tsx or a layout wrapper:
<div className="flex min-h-screen">
  <main className={cn(
    "flex-1 transition-all duration-300 ease-in-out",
    panelOpen && "lg:mr-[400px]"
  )}>
    {children}
  </main>
  <AiPanelShell />
</div>
```

The panel is `fixed right-0` with width 400px. When open, `main` gets `margin-right: 400px` so content reflows. Transition is smooth (300ms ease-in-out).

---

## 15. URL Structure — Refined (Codex-validated)

### Slug Strategy

**Sailings and tours use `slug--publicId` pattern:**
- `public_id`: 8-12 char ULID/Crockford string, created once, immutable
- `slug_base`: auto-generated from name + date + ship/operator
- URL: `/sailings/harmony-of-the-seas-2026-11-14-7n-from-miami--7K2M4Q9D`
- **Resolver:** parse `publicId` from URL, fetch by `public_id`, ignore slug for lookup, 301 redirect if slug changed

**New columns needed:**
```sql
ALTER TABLE cruise_sailings ADD COLUMN public_id TEXT UNIQUE;
ALTER TABLE cruise_sailings ADD COLUMN slug_base TEXT;
CREATE INDEX cruise_sailings_public_id_idx ON cruise_sailings(public_id);
```

### Complete Route Map (Revised)

```
# Search pages
/search/cruises                    → Search cruise sailings
/search/flights                    → Search flights
/search/hotels                     → Search hotels
/search/tours                      → Search tours
/search/destinations               → Search/browse destinations (NEW)
/search/ports                      → Search/browse cruise ports of call
/search/all-inclusives             → Softvoyage iframe

# Entity detail pages
/destinations/[slug]               → Destination detail (universal hub)
/destinations/[slug]/cruises       → Cruises at this destination
/destinations/[slug]/activities    → Things to do
/destinations/[slug]/hotels        → Hotels
/destinations/[slug]/restaurants   → Where to eat
/destinations/[slug]/tours         → Tours including this destination
/destinations/[slug]/ports         → Cruise port info

/regions/[slug]                    → Region detail (separate from destinations)
/cruise-lines/[slug]               → Cruise line detail
/ships/[slug]                      → Ship detail
/sailings/[slug]--[publicId]       → Sailing detail (itinerary, cabins, pricing)
/tours/[slug]--[publicId]          → Tour detail (itinerary, departures)

# Existing pages (unchanged)
/deals, /deals/[slug]              → Deals
/advisor/[slug]                    → Advisor micro-site
/advisors                          → Advisor directory
/join                              → Agent recruitment
```

---

## 16. Phase Boundaries (Codex-validated)

### Phase A: Content Architecture & AI Companion (this spec)
- Entity pages: destinations, regions, cruise lines, ships, sailings, tours
- Destinations normalization layer (seed from ports + tour cities)
- Destination cache with SerpAPI enrichment
- AI companion panel redesign (Zustand store, journey tracker, insights, chat)
- Content-push layout (desktop side panel, mobile bottom sheet)
- Anonymous planning sessions with auto-save
- Optional magic-link auth with Supabase
- Contact creation and advisor handoff
- Planning session → inbound Trip conversion
- `public_id` slugs for sailings and tours
- Page context awareness for AI proactive insights

### Phase B: Full Consumer Accounts & Wishlist UX (future spec)
- Full consumer account dashboard
- Self-serve booking, deposit, and payment
- Multi-device saved travel library
- Sharing and collaboration
- Advanced personalization and recommendation feeds

### Phase C: Self-Serve Booking (future spec)
- Deposit payments via supplier APIs (Traveltek, Amadeus)
- Booking → Tailfire Trip with auto-assignment and payment

### Phase D: Client Portal Redesign (future spec)
- Rebuild with Phoenix Voyages OTA brand
- "Continue Planning" → OTA handoff
- Seamless advisor collaboration UX
