# OTA Content Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database schema, API endpoints, and destination enrichment pipeline that powers the content-rich OTA entity pages.

**Architecture:** Add normalized destinations table seeded from cruise ports + tour cities. Create API endpoints for all entity types (destinations, cruise lines, ships, sailings, tours, regions). Build cache-on-demand SerpAPI enrichment pipeline for destination content. Add `public_id` slugs to sailings and tours for stable URLs.

**Tech Stack:** PostgreSQL (Drizzle ORM), NestJS, SerpAPI (TripAdvisor), Zustand (client state store)

**Spec:** `docs/superpowers/specs/2026-03-27-ota-content-architecture-design.md`

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Database Schema** | New tables (destinations, cache, planning_sessions, mappings) + sailing public_ids | Nothing |
| **2. Destinations Bootstrap** | 7K+ seeded destinations from cruise ports + tour cities | Phase 1 |
| **3. API — Entity Endpoints** | Public endpoints for destinations, cruise lines, ships, sailings, tours, regions | Phases 1-2 |
| **4. SerpAPI Enrichment Pipeline** | Cache-on-demand destination enrichment from TripAdvisor | Phases 1-3 |
| **5. Sailing Public IDs** | Stable `public_id` slugs for all 54K sailings | Phase 1 |
| **6. OTA Client Store** | Zustand store for AI panel state + page context bridge | Nothing (parallel) |

---

## Phase 1: Database Schema

### Task 1.1: Create destinations table + mapping tables

**Files:**
- Create: `packages/database/src/schema/destinations.schema.ts`
- Create: `packages/database/src/schema/destination-aliases.schema.ts`
- Create: `packages/database/src/schema/destination-ports.schema.ts`
- Create: `packages/database/src/schema/destination-regions.schema.ts`
- Create: `packages/database/src/migrations/YYYYMMDD_destinations_tables.sql`
- Modify: `packages/database/src/schema/index.ts` (export new schemas)

- [ ] **Step 1:** Read existing schema files for patterns: `packages/database/src/schema/cruise-ports.schema.ts`, `packages/database/src/schema/cruise-regions.schema.ts`, `packages/database/src/schema/tours.schema.ts`

- [ ] **Step 2:** Create Drizzle schema for `destinations` table:
  - `id` UUID PK
  - `slug` TEXT UNIQUE NOT NULL
  - `name` TEXT NOT NULL
  - `normalizedName` TEXT NOT NULL
  - `destinationType` TEXT NOT NULL (city, port_city, island, region, country, resort_area)
  - `countryCode` CHAR(2)
  - `adminArea` TEXT
  - `latitude` NUMERIC(9,6)
  - `longitude` NUMERIC(9,6)
  - `parentDestinationId` UUID FK → destinations (self-referential)
  - `sourceStatus` TEXT DEFAULT 'seeded' (seeded, matched, reviewed, hidden)
  - `contentStatus` TEXT DEFAULT 'seeded' (seeded, enriched, reviewed, published)
  - `summary` TEXT
  - `heroImageUrl` TEXT
  - `metadata` JSONB DEFAULT '{}'
  - `createdAt`, `updatedAt` timestamps

- [ ] **Step 3:** Create Drizzle schema for `destination_aliases` table

- [ ] **Step 4:** Create Drizzle schema for `destination_ports` mapping table (destinations ↔ cruise_ports)

- [ ] **Step 5:** Create Drizzle schema for `destination_regions` mapping table (destinations ↔ cruise_regions)

- [ ] **Step 6:** Export all from `schema/index.ts`

- [ ] **Step 7:** Write migration SQL (hand-written per project conventions — `drizzle-kit generate` has interactive prompt issues)

- [ ] **Step 8:** Register migration in `meta/_journal.json`

- [ ] **Step 9:** Run migration: `cd apps/api && pnpm db:migrate`

- [ ] **Step 10:** Verify: `psql "$DATABASE_URL" -c "\dt destinations"` and `\dt destination_*`

- [ ] **Step 11:** Commit: `feat(db): add destinations normalization schema`

### Task 1.2: Create destination_cache table

**Files:**
- Create: `packages/database/src/schema/destination-cache.schema.ts`
- Modify: `packages/database/src/schema/index.ts`
- Add to migration from Task 1.1 (or create separate migration)

- [ ] **Step 1:** Create Drizzle schema for `destination_cache`:
  - `id` UUID PK
  - `destinationId` UUID FK → destinations
  - `source` TEXT NOT NULL (tripadvisor, amadeus_activities, google_places)
  - `locale` TEXT DEFAULT 'en'
  - `status` TEXT DEFAULT 'fresh' (fresh, stale, refreshing, failed, disabled)
  - `cacheKey` TEXT NOT NULL
  - `rawPayload` JSONB
  - `normalizedPayload` JSONB
  - `summaryMd` TEXT
  - `sourceUrls` JSONB DEFAULT '[]'
  - `fetchedAt` TIMESTAMP
  - `lastSuccessAt` TIMESTAMP
  - `refreshAfterAt` TIMESTAMP
  - `expiresAt` TIMESTAMP
  - `lastHttpStatus` INTEGER
  - `lastErrorCode` TEXT
  - `lastErrorMessage` TEXT
  - `consecutiveFailures` INTEGER DEFAULT 0
  - `fetchCount` INTEGER DEFAULT 0
  - `payloadHash` TEXT
  - `version` INTEGER DEFAULT 1
  - `lockToken` UUID
  - `lockExpiresAt` TIMESTAMP
  - `costUnits` NUMERIC(10,4) DEFAULT 0
  - UNIQUE (destinationId, source, locale)

- [ ] **Step 2:** Add to migration and run

- [ ] **Step 3:** Commit: `feat(db): add destination_cache table`

### Task 1.3: Create planning session tables

**Files:**
- Create: `packages/database/src/schema/planning-sessions.schema.ts`
- Create: `packages/database/src/schema/planning-session-messages.schema.ts`
- Create: `packages/database/src/schema/planning-session-items.schema.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1:** Create `planning_sessions` schema:
  - `id` UUID PK
  - `agencyId` UUID FK → agencies
  - `visitorToken` TEXT (anonymous ota_vid)
  - `contactId` UUID FK → contacts (nullable)
  - `clientPortalUserId` UUID FK → client_portal_users (nullable)
  - `status` TEXT DEFAULT 'active' (active, claimed, converted, archived)
  - `title` TEXT
  - `summary` TEXT
  - `sourceChannel` TEXT DEFAULT 'ota'
  - `preferences` JSONB DEFAULT '{}'
  - `sessionContext` JSONB DEFAULT '{}'
  - `aiMemory` JSONB DEFAULT '{}'
  - `convertedTripId` UUID FK → trips (nullable)
  - `lastActivityAt` TIMESTAMP
  - timestamps

- [ ] **Step 2:** Create `planning_session_messages` schema (relational AI transcript)

- [ ] **Step 3:** Create `planning_session_items` schema (relational saved entities)

- [ ] **Step 4:** Write migration SQL, register, run

- [ ] **Step 5:** Commit: `feat(db): add planning session tables`

### Task 1.4: Add public_id and slug_base to cruise_sailings

**Files:**
- Create migration: `packages/database/src/migrations/YYYYMMDD_sailing_public_ids.sql`
- Modify: `packages/database/src/schema/cruise-sailings.schema.ts` (add columns)

- [ ] **Step 1:** Add columns to Drizzle schema:
  ```typescript
  publicId: text('public_id').unique(),
  slugBase: text('slug_base'),
  ```

- [ ] **Step 2:** Write migration SQL:
  ```sql
  ALTER TABLE cruise_sailings ADD COLUMN public_id TEXT UNIQUE;
  ALTER TABLE cruise_sailings ADD COLUMN slug_base TEXT;
  CREATE INDEX cruise_sailings_public_id_idx ON cruise_sailings(public_id);
  ```

- [ ] **Step 3:** Run migration

- [ ] **Step 4:** Commit: `feat(db): add public_id and slug_base to cruise_sailings`

---

## Phase 2: Destinations Bootstrap

### Task 2.1: Seed destinations from cruise ports

**Files:**
- Create: `apps/api/src/destinations/destinations.module.ts`
- Create: `apps/api/src/destinations/destinations.service.ts`
- Create: `apps/api/src/destinations/destinations.controller.ts`
- Create: `apps/api/src/destinations/destinations-bootstrap.service.ts`
- Modify: `apps/api/src/app.module.ts` (register DestinationsModule)

- [ ] **Step 1:** Create `DestinationsBootstrapService` with method `seedFromCruisePorts()`:
  - Query all cruise_ports from the catalog (7,203 ports)
  - For each port: generate slug from name, normalize name, extract country code if possible
  - Create destination record with `destinationType: 'port_city'`, `sourceStatus: 'seeded'`
  - Create `destination_ports` mapping record
  - Deduplicate by normalized_name + approximate location (ports within 50km of each other should map to the same destination)
  - Log progress: "Seeded X destinations from Y cruise ports"

- [ ] **Step 2:** Create admin endpoint: `POST /api/v1/destinations/bootstrap/cruise-ports` (AdminOnly guard)

- [ ] **Step 3:** Create `DestinationsService` with public read methods:
  - `findBySlug(slug)` — returns destination + cached enrichment if available
  - `findAll(filters)` — list with pagination, filter by type/region/country
  - `findCruisesAtDestination(destinationId)` — joins sailing_stops → sailings
  - `findToursAtDestination(destinationId)` — joins tour cities → tours

- [ ] **Step 4:** Create `DestinationsController`:
  - `GET /api/v1/destinations` — public, paginated list
  - `GET /api/v1/destinations/by-slug/:slug` — public, single by slug
  - `GET /api/v1/destinations/by-slug/:slug/cruises` — cruises at this destination
  - `GET /api/v1/destinations/by-slug/:slug/tours` — tours at this destination
  - `POST /api/v1/destinations/bootstrap/cruise-ports` — admin only

- [ ] **Step 5:** Register in `app.module.ts`

- [ ] **Step 6:** Run bootstrap: `curl -X POST localhost:3101/api/v1/destinations/bootstrap/cruise-ports -H "Authorization: Bearer $TOKEN"`

- [ ] **Step 7:** Verify: `curl localhost:3101/api/v1/destinations?pageSize=5` returns seeded destinations

- [ ] **Step 8:** Commit: `feat(api): destinations module with cruise port bootstrap`

### Task 2.2: Seed destinations from tour cities

**Files:**
- Modify: `apps/api/src/destinations/destinations-bootstrap.service.ts`

- [ ] **Step 1:** Add method `seedFromTourCities()`:
  - Extract distinct city names from tours table (startCity, endCity) and tour_itinerary_days (overnightCity)
  - Normalize names
  - Match against existing seeded destinations (from cruise ports) by normalized name + country
  - For matches: create `destination_tour_cities` mapping
  - For unmatched: create new destination with `destinationType: 'city'`
  - Log: "Matched X tour cities to existing destinations, created Y new destinations"

- [ ] **Step 2:** Add admin endpoint: `POST /api/v1/destinations/bootstrap/tour-cities`

- [ ] **Step 3:** Run and verify

- [ ] **Step 4:** Commit: `feat(api): seed destinations from tour cities`

---

## Phase 3: API — Entity Endpoints

### Task 3.1: Cruise Lines public endpoint

**Files:**
- Create: `apps/api/src/cruise-repository/cruise-lines.controller.ts` (or add to existing controller)

- [ ] **Step 1:** Read existing `cruise-repository.controller.ts` to understand patterns

- [ ] **Step 2:** Add endpoints (public via catalog key or @Public decorator):
  - `GET /api/v1/cruise-repository/lines` — all cruise lines with logo URLs
  - `GET /api/v1/cruise-repository/lines/:id` — single cruise line with ship count, sailing count

- [ ] **Step 3:** Commit: `feat(api): public cruise lines endpoint`

### Task 3.2: Ships public endpoint

**Files:**
- Modify: `apps/api/src/cruise-repository/cruise-repository.controller.ts` (or new controller)

- [ ] **Step 1:** Add endpoints:
  - `GET /api/v1/cruise-repository/ships` — all ships with image URLs, cruise line
  - `GET /api/v1/cruise-repository/ships/:id` — single ship with upcoming sailings count

- [ ] **Step 2:** Commit: `feat(api): public ships endpoint`

### Task 3.3: Sailing detail endpoint (with itinerary stops)

**Files:**
- Modify: `apps/api/src/cruise-repository/cruise-repository.controller.ts`

- [ ] **Step 1:** Add endpoint:
  - `GET /api/v1/cruise-repository/sailings/:id` — full sailing detail with:
    - Ship info (name, image)
    - Cruise line info (name, logo)
    - Embark/disembark ports
    - All 4 cabin tier prices
    - Day-by-day itinerary stops (from `cruise_sailing_stops` — join with port names)
    - Each stop includes port name and linked destination slug if mapped

- [ ] **Step 2:** Also support lookup by `public_id`: `GET /api/v1/cruise-repository/sailings/by-public-id/:publicId`

- [ ] **Step 3:** Commit: `feat(api): sailing detail endpoint with itinerary stops`

### Task 3.4: Regions public endpoint

**Files:**
- Modify: `apps/api/src/cruise-repository/cruise-repository.controller.ts`

- [ ] **Step 1:** Add endpoints:
  - `GET /api/v1/cruise-repository/regions` — all regions with sailing counts
  - `GET /api/v1/cruise-repository/regions/:id` — single region with destinations

- [ ] **Step 2:** Commit: `feat(api): public regions endpoint`

### Task 3.5: Tour detail endpoint

**Files:**
- Modify: `apps/api/src/tour-repository/tour-repository.controller.ts`

- [ ] **Step 1:** Add endpoint:
  - `GET /api/v1/tour-repository/tours/:id` — full tour detail with:
    - Itinerary days (from `tour_itinerary_days`)
    - Departure dates with pricing (from `tour_departures` + `tour_departure_pricing`)
    - Hotels (from `tour_hotels`)
    - Inclusions (from `tour_inclusions`)
    - Images (from `tour_media`)

- [ ] **Step 2:** Commit: `feat(api): tour detail endpoint with itinerary`

---

## Phase 4: SerpAPI Enrichment Pipeline

### Task 4.1: SerpAPI integration service

**Files:**
- Create: `apps/api/src/destinations/serpapi.service.ts`
- Create: `apps/api/src/destinations/destination-enrichment.service.ts`

- [ ] **Step 1:** Create `SerpApiService`:
  - Reads `SERPAPI_API_KEY` from config
  - Method `searchTripAdvisor(query, location)` → calls SerpAPI TripAdvisor Search endpoint
  - Method `getPlaceDetails(placeId)` → calls SerpAPI TripAdvisor Place endpoint
  - Rate limiting: max 1 request per second
  - Error handling: returns null on failure, logs error

- [ ] **Step 2:** Create `DestinationEnrichmentService`:
  - Method `enrichDestination(destinationId)`:
    1. Check `destination_cache` for existing fresh data → return if fresh
    2. Acquire lock (set `lockToken` + `lockExpiresAt`)
    3. Call `SerpApiService.searchTripAdvisor(destination.name)`
    4. Parse response: extract photos, rating, review count, description, top activities, restaurants
    5. Store in `destination_cache` with `status: 'fresh'`, `refreshAfterAt: now + 7 days`
    6. Update destination: `contentStatus: 'enriched'`, `heroImageUrl`, `summary`
    7. Release lock
    8. Track `costUnits`
  - Method `refreshStaleDestinations()`:
    - Query destinations where `destination_cache.status = 'stale'` and unlocked
    - Re-enrich each (with backoff on failures)
  - Method `cleanupUnusedDestinations()`:
    - Delete cache where `lastVisitedAt > 90 days` and `visitCount < 5`

- [ ] **Step 3:** Add `SERPAPI_API_KEY` to Doppler (all envs)

- [ ] **Step 4:** Commit: `feat(api): SerpAPI enrichment pipeline for destinations`

### Task 4.2: Enrichment admin endpoints + cron jobs

**Files:**
- Modify: `apps/api/src/destinations/destinations.controller.ts`

- [ ] **Step 1:** Add admin endpoints:
  - `POST /api/v1/destinations/:id/enrich` — trigger enrichment for a single destination
  - `POST /api/v1/destinations/enrich/stale` — trigger refresh of all stale destinations
  - `POST /api/v1/destinations/cleanup` — run cleanup job

- [ ] **Step 2:** Add cron job for weekly stale refresh (BullMQ queue or NestJS @Cron)

- [ ] **Step 3:** Commit: `feat(api): destination enrichment admin endpoints + cron`

---

## Phase 5: Sailing Public IDs

### Task 5.1: Generate public_ids for all sailings

**Files:**
- Create: `apps/api/src/cruise-repository/sailing-slugs.service.ts`
- Modify: `apps/api/src/cruise-repository/cruise-repository.module.ts`

- [ ] **Step 1:** Create `SailingSlugService`:
  - Method `generatePublicIds()`:
    - Query all sailings where `public_id IS NULL`
    - For each: generate 8-char ULID/Crockford ID
    - Generate `slug_base` from: ship-slug + sail-date + nights + embark-port
    - Batch update
  - Method `generateSlugBase(sailing)`:
    - Format: `harmony-of-the-seas-2026-11-14-7n-from-miami`
    - Lowercase, hyphenated, trimmed

- [ ] **Step 2:** Add admin endpoint: `POST /api/v1/cruise-repository/generate-slugs` (AdminOnly)

- [ ] **Step 3:** Run: generate public_ids for all 54K sailings

- [ ] **Step 4:** Verify: `curl localhost:3101/api/v1/cruise-repository/sailings/by-public-id/7K2M4Q9D`

- [ ] **Step 5:** Commit: `feat(api): generate public_ids for cruise sailings`

### Task 5.2: Update cruise sync to generate public_ids for new sailings

**Files:**
- Modify: `apps/api/src/cruise-import/cruise-import.service.ts` (or wherever new sailings are created)

- [ ] **Step 1:** After inserting a new sailing, generate `public_id` and `slug_base`

- [ ] **Step 2:** Commit: `feat(api): auto-generate public_id on cruise sync`

---

## Phase 6: OTA Client Store (Zustand)

### Task 6.1: Install Zustand + create AI panel store

**Files:**
- Create: `apps/ota/src/stores/ai-panel-store.ts`
- Modify: `apps/ota/package.json` (add zustand)

- [ ] **Step 1:** Install Zustand: `cd apps/ota && pnpm add zustand`

- [ ] **Step 2:** Create the store:
  ```typescript
  import { create } from 'zustand'

  interface PageContext {
    type: string          // 'destination', 'sailing', 'ship', 'tour', etc.
    slug: string
    name: string
    parentContext?: { type: string; slug: string; name: string }
  }

  interface JourneyItem {
    id: string
    type: string
    slug: string
    name: string
    thumbnailUrl?: string
    hearted: boolean
    addedAt: string
  }

  interface AiPanelState {
    isOpen: boolean
    sessionId?: string
    prefill?: string
    pageContext?: PageContext
    journeyItems: JourneyItem[]
    open: (opts?: { prefill?: string }) => void
    close: () => void
    toggle: () => void
    setPageContext: (ctx: PageContext) => void
    addJourneyItem: (item: Omit<JourneyItem, 'id' | 'addedAt' | 'hearted'>) => void
    toggleHeart: (itemId: string) => void
    removeJourneyItem: (itemId: string) => void
  }

  export const useAiPanelStore = create<AiPanelState>((set) => ({
    isOpen: false,
    journeyItems: [],
    open: (opts) => set({ isOpen: true, prefill: opts?.prefill }),
    close: () => set({ isOpen: false, prefill: undefined }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    setPageContext: (ctx) => set({ pageContext: ctx }),
    addJourneyItem: (item) => set((s) => ({
      journeyItems: [...s.journeyItems, {
        ...item,
        id: crypto.randomUUID(),
        hearted: false,
        addedAt: new Date().toISOString(),
      }]
    })),
    toggleHeart: (itemId) => set((s) => ({
      journeyItems: s.journeyItems.map((i) =>
        i.id === itemId ? { ...i, hearted: !i.hearted } : i
      )
    })),
    removeJourneyItem: (itemId) => set((s) => ({
      journeyItems: s.journeyItems.filter((i) => i.id !== itemId)
    })),
  }))
  ```

- [ ] **Step 3:** Commit: `feat(ota): Zustand AI panel store for journey tracking`

### Task 6.2: Create PageContextBridge component

**Files:**
- Create: `apps/ota/src/components/page-context-bridge.tsx`

- [ ] **Step 1:** Create a tiny client component that pushes page context into the Zustand store:
  ```tsx
  'use client'
  import { useEffect } from 'react'
  import { useAiPanelStore } from '@/stores/ai-panel-store'

  interface PageContextBridgeProps {
    type: string
    slug: string
    name: string
    parentContext?: { type: string; slug: string; name: string }
  }

  export function PageContextBridge({ type, slug, name, parentContext }: PageContextBridgeProps) {
    const setPageContext = useAiPanelStore((s) => s.setPageContext)

    useEffect(() => {
      setPageContext({ type, slug, name, parentContext })
    }, [type, slug, name, parentContext, setPageContext])

    return null // No UI — just pushes context
  }
  ```

- [ ] **Step 2:** Commit: `feat(ota): PageContextBridge component for AI panel context`

---

## Deployment Checklist

After all phases complete:

- [ ] Run all migrations on local dev DB
- [ ] Run destinations bootstrap (cruise ports → destinations)
- [ ] Run destinations bootstrap (tour cities → destinations)
- [ ] Generate sailing public_ids
- [ ] Test destination enrichment with SerpAPI for 2-3 destinations
- [ ] Verify all API endpoints return data
- [ ] Verify Zustand store works with existing AI panel
- [ ] Push to preview branch for CI/CD
- [ ] Run migrations on Preview DB
- [ ] Run bootstrap on Preview
