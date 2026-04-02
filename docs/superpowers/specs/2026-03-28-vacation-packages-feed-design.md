# Vacation Packages Feed — Design Spec

## Overview

Build a data pipeline from Softvoyage VCO (public widget) into Tailfire to provide all-inclusive vacation package search, pricing, and enrichment for the OTA storefront and admin dashboard.

**Key decision:** Use VCO (public-facing widget) exclusively — no login, no credentials, no password management. Sessions are auto-created on search submission.

## Architecture

### Module Structure

Four new NestJS modules in `apps/api/src/`, following existing cruise/tour patterns:

```
apps/api/src/
├── vacation-import/              ← Catalog sync (cron)
│   ├── vacation-import.module.ts
│   ├── vacation-import.controller.ts
│   ├── services/
│   │   ├── vacation-import-orchestrator.service.ts
│   │   ├── softvoyage-catalog-client.service.ts
│   │   └── change-detector.service.ts
│   └── dto/
│
├── vacation-repository/          ← Search/browse stored catalog
│   ├── vacation-repository.module.ts
│   ├── vacation-repository.controller.ts
│   ├── vacation-repository.service.ts
│   └── dto/
│
├── softvoyage/                   ← Real-time pricing proxy (BullMQ async)
│   ├── softvoyage.module.ts
│   ├── softvoyage.controller.ts
│   ├── softvoyage.service.ts
│   ├── softvoyage-browser-pool.service.ts
│   ├── softvoyage-search.processor.ts
│   └── softvoyage-result-parser.service.ts
│
└── vacation-enrichment/          ← Lazy per-user enrichment (BullMQ)
    ├── vacation-enrichment.module.ts
    ├── vacation-enrichment.controller.ts
    ├── services/
    │   ├── enrichment-dispatcher.service.ts
    │   ├── serpapi-client.service.ts
    │   ├── google-places-enricher.service.ts
    │   └── tripadvisor-enricher.service.ts
    └── dto/
```

### Data Sources

| Source | Transport | Auth | Data |
|--------|-----------|------|------|
| VCO `ajax.cgi` (JSON) | Plain HTTP | None | Gateways, destinations, hotels |
| VCO `resultspackage.cgi` (HTML) | Playwright headless | Auto-session | Live pricing, flights, room types |
| SerpAPI Google Maps | Plain HTTP | API key | Lat/lng, address, rating, reviews, photos |
| SerpAPI Google Search | Plain HTTP | API key | TripAdvisor ratings, reviews, links |

### VCO API Endpoints (Validated in PoC)

**Catalog (JSON, no session):**
- `GET ajax.cgi?action=getPackagesGateways&code_ag=VCO&alias=YAQ&language=en`
- `GET ajax.cgi?action=getPackagesDestinations&code_ag=VCO&alias=YAQ&gateway_dep={code}&language=en`
- `GET ajax.cgi?action=getPackagesHotels&code_ag=VCO&alias=YAQ&gateway_dep={code}&dest_dep={ids}&language=en`

**Search (HTML via Playwright, auto-session):**
- `POST resultspackage.cgi` with form fields: `code_ag`, `alias`, `gateway_dep`, `dest_dep`, `date_dep`, `duration`, `nb_adult`, `nb_rooms`, `all_inclusive`, etc.

### VCO Identifiers
- `code_ag=VCO`
- `alias=YAQ`
- Base URL: `https://vco.sax.softvoyage.com/cgi-bin/`

## Data Flow

### 1. Catalog Sync (Cron — Daily)

```
Cron trigger (daily, 4 AM Toronto — after cruise at 2 AM, tours at 3 AM)
  → Acquire distributed advisory lock (same pattern as cruise import)
  → softvoyage-catalog-client fetches gateways, destinations, hotels via HTTP
  → change-detector computes contentHash (SHA256) per record
  → For each record:
      NOT FOUND → insert, set lastSyncedAt
      FOUND + hash matches → touch lastSyncedAt only
      FOUND + hash differs → update changed fields, bump updatedAt
  → After sync: soft-delete records where lastSyncedAt < syncStartedAt
  → Rebuild vacation_gateway_destinations junction (full replace per gateway)
  → Record metrics in vacation_sync_history
  → Release advisory lock
```

- Plain HTTP (no Playwright needed)
- Environment guard: production only (dev/preview use FDW)
- Protected by InternalApiKeyGuard
- Distributed advisory lock prevents concurrent syncs across Railway replicas (same pattern as `ImportOrchestratorService.acquireSyncLock()`)

### 2. Live Pricing (On-Demand — Async via BullMQ)

Live pricing runs through a dedicated BullMQ queue (`VACATION_SEARCH`), NOT on the synchronous request path. This avoids tying Playwright browser instances to API request threads.

**Important caveat:** BullMQ processors run inside the same NestJS process/container, so the browser pool still shares CPU/RAM with the API. The async queue removes request-thread blocking and tail-latency risk, but does not fully isolate resource usage. If browser load becomes problematic, the scaling path (separate Railway worker service) provides true isolation.

```
User searches on OTA or admin dashboard
  → API receives search params (gateway, destination, date, duration, adults, rooms)
  → Check Redis cache (key: vco:search:{params_hash}, TTL: 15 min)
      → HIT: return cached results immediately with fetchedAt timestamp
      → MISS: create BullMQ job with jobId = `vco-search-${params_hash}-${timestamp_bucket}`
          → timestamp_bucket = Math.floor(Date.now() / (CACHE_TTL_MS)) to align job lifecycle with cache TTL
          → If job with same ID already active (waiting/active): return existing job ID + 202 (piggyback)
          → If job with same ID completed/failed: BullMQ treats as new job (different bucket after cache expiry)
          → Return job ID + 202 Accepted
  → Client polls GET /softvoyage/search/:jobId (short-poll, ~1-2 sec interval)
  → VACATION_SEARCH processor (background worker):
      → Acquire browser from pool (max 2 instances, launched on-demand, recycled every 50 uses)
      → Navigate to VCO querypackage.cgi (no sid needed)
      → Fill form fields, submit
      → VCO auto-creates session, returns results page
      → Parse HTML results (div#result-{hotelId}) using Cheerio
      → Extract: hotel, room type, nights, tour operator, flights, prices, amenities
      → Cache parsed results in Redis (TTL: 15 min) with fetchedAt timestamp
      → Mark job as completed with cache key
  → Next poll returns cached results
```

- Browser pool: 2 reusable Playwright instances, launched on-demand, recycled periodically
- Each search: ~3-5 seconds
- Redis cache prevents redundant searches; includes `fetchedAt` for staleness surface
- Falls back to VCM + browser headers if VCO fails
- Browser instances are NOT held open on the request path — only in the background worker

### 3. Lazy Enrichment (On-Demand — Per Hotel View)

Enrichment runs as a new job type (`vacation_hotel_enrichment`) within the existing BullMQ `ENRICHMENT` queue. No separate database table for queue state — BullMQ is the sole source of truth for job state.

```
User views hotel detail (OTA or admin)
  → vacation-repository checks vacation_hotel_enrichment table (public schema)
      → HIT + fresh (< 30 days): serve cached enrichment
      → HIT + stale (> 30 days): serve cached, dispatch re-enrichment job
      → MISS: serve base Softvoyage data, dispatch enrichment job
  → enrichment-dispatcher adds job to existing BullMQ ENRICHMENT queue
      → jobType: 'vacation_hotel_enrichment'
      → deduplication: jobId = `vacation-enrich-${hotelId}` (BullMQ deduplicates by jobId)
  → enrichment processor (existing enrichment.processor.ts, extended with new job type):
      → SerpAPI Google Maps: "{hotel_name} {destination}" → rating, reviews, lat/lng, address, photos, website, phone
      → SerpAPI Google Search: "{hotel_name} {destination} site:tripadvisor.com" → TA rating, reviews, link
      → Download top photos → upload to Cloudflare R2
      → Upsert single row in vacation_hotel_enrichment table
      → Job completion tracked via automation_job_history (existing pattern)
  → Next request for this hotel gets enriched data
```

- Only enriches hotels users actually look at
- Zero upfront SerpAPI cost
- Popular hotels enriched first (natural demand priority)
- Rate-limited: ~5 SerpAPI calls/sec
- No separate queue state table — BullMQ + automation_job_history is sufficient
- Deduplication via BullMQ jobId prevents duplicate enrichment jobs
- **Implementation prerequisite:** The existing enrichment processor must be updated to properly call `updateJobHistory()` on processing/completed events (currently only logs failures). This brings it up to the same standard as the trip-automation and client-care processors

## Database Schema

### Catalog Schema Tables (FDW-backed, production-only writes)

All catalog tables in the `catalog` schema. These are synced by the daily cron job on production only. Dev/preview environments read via FDW.

#### vacation_gateways
```sql
id              UUID PRIMARY KEY
provider        VARCHAR NOT NULL DEFAULT 'softvoyage'
providerIdentifier VARCHAR NOT NULL  -- airport code (YYZ, YUL, etc.)
name            VARCHAR NOT NULL     -- city name
airportCode     VARCHAR(4) NOT NULL
isActive        BOOLEAN DEFAULT true
lastSyncedAt    TIMESTAMP
contentHash     VARCHAR(64)
createdAt       TIMESTAMP DEFAULT now()
updatedAt       TIMESTAMP DEFAULT now()
UNIQUE(provider, providerIdentifier)
```

#### vacation_destinations
```sql
id              UUID PRIMARY KEY
provider        VARCHAR NOT NULL DEFAULT 'softvoyage'
providerIdentifier VARCHAR NOT NULL  -- individual VCO destination ID (e.g., "2" for Cancun)
name            VARCHAR NOT NULL     -- e.g., "Cancun", "Riviera Maya"
countryCode     VARCHAR(2)
countryName     VARCHAR
regionGroup     VARCHAR              -- "South", "Europe", "Asia", etc.
availableDurations INTEGER[]         -- [3,4,5,6,7,8,9,10]
isActive        BOOLEAN DEFAULT true
lastSyncedAt    TIMESTAMP
contentHash     VARCHAR(64)
createdAt       TIMESTAMP DEFAULT now()
updatedAt       TIMESTAMP DEFAULT now()
UNIQUE(provider, providerIdentifier)
```

Note: `providerIdentifier` stores individual destination IDs only (e.g., `"2"` for Cancun), not combined/composite ID strings. This ensures stable natural keys.

#### vacation_hotels
```sql
id              UUID PRIMARY KEY
provider        VARCHAR NOT NULL DEFAULT 'softvoyage'
providerIdentifier VARCHAR NOT NULL  -- VCO hotel ID
destinationId   UUID REFERENCES vacation_destinations(id)
name            VARCHAR NOT NULL
starRating      INTEGER              -- 1-5
hotelChain      VARCHAR              -- "All Barcelo", "All Riu", etc.
imageUrl        VARCHAR              -- softvoyage CDN URL
amenities       JSONB                -- {beach, spa, golf, wifi, pool, ...}
monarcRating    NUMERIC(3,2)
monarcReviewCount INTEGER
isActive        BOOLEAN DEFAULT true
lastSyncedAt    TIMESTAMP
contentHash     VARCHAR(64)
createdAt       TIMESTAMP DEFAULT now()
updatedAt       TIMESTAMP DEFAULT now()
UNIQUE(provider, providerIdentifier)
```

#### vacation_gateway_destinations
```sql
gatewayId       UUID REFERENCES vacation_gateways(id)
destinationId   UUID REFERENCES vacation_destinations(id)
lastSyncedAt    TIMESTAMP            -- lifecycle tracking for stale link cleanup
PRIMARY KEY(gatewayId, destinationId)
```

This junction table is fully rebuilt per-gateway during each catalog sync (delete + re-insert for the synced gateway). `lastSyncedAt` enables cleanup of stale links if a gateway is not synced.

#### vacation_tour_operators
```sql
id              UUID PRIMARY KEY
provider        VARCHAR NOT NULL DEFAULT 'softvoyage'
providerIdentifier VARCHAR NOT NULL  -- operator code
code            VARCHAR(10) NOT NULL -- VAT, SWG, WJV, SQV, VAC, WJS
name            VARCHAR
supplierId      UUID                 -- optional link to public.suppliers (no FK for FDW)
isActive        BOOLEAN DEFAULT true
UNIQUE(provider, providerIdentifier)
```

#### vacation_sync_history
```sql
id              UUID PRIMARY KEY
provider        VARCHAR DEFAULT 'softvoyage'
status          VARCHAR NOT NULL     -- running, completed, failed, cancelled
startedAt       TIMESTAMP NOT NULL
completedAt     TIMESTAMP
metrics         JSONB                -- {gatewaysFound, hotelsInserted, hotelsUpdated, hotelsUnchanged, hotelsSoftDeleted}
errors          JSONB                -- bounded array, max 100
```

### Public Schema Tables (writable in all environments)

Enrichment and bridging tables live in the `public` schema so they can be written from any environment (dev, preview, production). This matches the existing `destination_cache` pattern.

#### vacation_hotel_enrichment
```sql
id              UUID PRIMARY KEY
hotelId         UUID NOT NULL        -- references catalog.vacation_hotels (no FK for FDW)
googlePlaceId   VARCHAR
latitude        NUMERIC(9,6)
longitude       NUMERIC(9,6)
formattedAddress VARCHAR
googleRating    NUMERIC(2,1)
googleReviewCount INTEGER
tripadvisorRating NUMERIC(2,1)
tripadvisorReviewCount INTEGER
tripadvisorLink VARCHAR
website         VARCHAR
phone           VARCHAR
photos          JSONB                -- array of R2 URLs
rawData         JSONB                -- full SerpAPI response for debugging
enrichedAt      TIMESTAMP NOT NULL
expiresAt       TIMESTAMP NOT NULL   -- enrichedAt + 30 days
createdAt       TIMESTAMP DEFAULT now()
updatedAt       TIMESTAMP DEFAULT now()
UNIQUE(hotelId)
```

One row per hotel with all enrichment fields. No `source` column — Google Places and TripAdvisor data are written together in a single upsert. This avoids half-populated rows and merge complexity.

#### destination_vacation_destinations (bridging table)
```sql
destinationId            UUID REFERENCES destinations(id)
vacationDestinationId    UUID NOT NULL  -- references catalog.vacation_destinations (no FK for FDW)
matchMethod              VARCHAR NOT NULL  -- 'exact', 'geo', 'manual'
confidence               NUMERIC(5,4) DEFAULT 1.0
isPrimary                BOOLEAN DEFAULT true
PRIMARY KEY(destinationId, vacationDestinationId)
```

Follows the same pattern as `destination_ports` and `destination_regions` bridging tables, with a composite primary key for uniqueness.

## API Endpoints

### Vacation Repository (Catalog Browse)

```
GET  /vacation-repository/gateways           → list departure airports
GET  /vacation-repository/destinations       → list destinations (filterable by gateway)
GET  /vacation-repository/hotels             → search hotels (filters, pagination)
GET  /vacation-repository/hotels/:id         → hotel detail + enrichment
GET  /vacation-repository/filters            → dynamic filter options
```

Guards: CatalogAuthGuard (JWT | API key), CatalogThrottleGuard

### Softvoyage (Live Pricing)

```
POST /softvoyage/search                      → submit search, returns jobId + 202 Accepted (or cached results + 200)
GET  /softvoyage/search/:jobId               → poll for results (returns 200 with results or 202 still processing)
```

Guards: CatalogAuthGuard, CatalogThrottleGuard

**Throttle note:** OTA server-side requests all use a single shared `CATALOG_API_KEY`, which means per-key throttling still collapses all OTA users into one bucket. This is acceptable at current moderate traffic levels, but not real per-user isolation. Mitigations:
- Set a high limit for API-key auth on vacation search endpoints (e.g., 300 req/min per key)
- The async polling model naturally reduces request volume (one job per unique search, multiple users piggyback)
- Redis cache hit rate further reduces actual Playwright invocations
- If per-user isolation is needed later, pass a client identifier header from OTA for throttle bucketing

### Vacation Import (Admin)

```
POST /vacation-import/sync                   → trigger catalog sync
POST /vacation-import/sync/dry-run           → preview sync changes
GET  /vacation-import/sync/status            → current sync status
```

Guards: InternalApiKeyGuard

### Vacation Enrichment (Admin)

```
POST /vacation-enrichment/enrich/:hotelId    → trigger enrichment for specific hotel
GET  /vacation-enrichment/stats              → enrichment coverage statistics
```

Guards: InternalApiKeyGuard

## Infrastructure

### Deployment

Everything runs in the existing Railway API container:

| Component | Resource Impact | Notes |
|-----------|----------------|-------|
| Catalog sync (cron) | Negligible | ~50 HTTP calls daily |
| Playwright browser pool | +300-500MB RAM | 2 instances, launched on-demand via BullMQ worker, recycled every 50 uses |
| SerpAPI enrichment | Negligible | Background HTTP calls via existing BullMQ ENRICHMENT queue |
| Redis pricing cache | Low | Short-lived keys (15 min TTL). Monitor alongside BullMQ on same Redis instance |
| Database catalog tables | ~35MB | 5,000 hotels + enrichment |

### BullMQ Queue Configuration

**New queue: `VACATION_SEARCH`**
- Registered in `automation.module.ts` alongside existing queues
- Processor: `softvoyage-search.processor.ts`
- Concurrency: 2 (matches browser pool size)
- Job retention: `removeOnComplete` 15 minutes (aligned with pricing cache TTL), `removeOnFail` 1 hour
- Registered in Bull Board for monitoring

**Existing queue: `ENRICHMENT`**
- New job type: `vacation_hotel_enrichment`
- Added to existing `enrichment.processor.ts` as a new case
- Job deduplication via BullMQ jobId: `vacation-enrich-${hotelId}`
- Job history tracked via existing `automation_job_history` table

### Environment Variables (Doppler)

```
# VCO Configuration
SOFTVOYAGE_VCO_BASE_URL=https://vco.sax.softvoyage.com/cgi-bin
SOFTVOYAGE_VCO_CODE_AG=VCO
SOFTVOYAGE_VCO_ALIAS=YAQ

# VCM Fallback (optional, for agent-level data)
SOFTVOYAGE_VCM_BASE_URL=https://vcm.sax.softvoyage.com/cgi-bin
SOFTVOYAGE_VCM_CODE_AG=VCM
SOFTVOYAGE_VCM_ALIAS=DJW

# SerpAPI
SERPAPI_KEY=<from Doppler>

# Feature Flags
ENABLE_VACATION_CATALOG_SYNC=true
ENABLE_VACATION_LIVE_PRICING=true
ENABLE_VACATION_ENRICHMENT=true
VACATION_CATALOG_SYNC_CRON=0 4 * * *   # Daily at 4 AM Toronto (after cruise 2AM, tours 3AM)
VACATION_PRICING_CACHE_TTL=900          # 15 minutes in seconds
VACATION_ENRICHMENT_EXPIRY_DAYS=30
VACATION_BROWSER_POOL_SIZE=2
```

### Cron Schedule

```
2:00 AM Toronto — Cruise catalog sync (existing)
3:00 AM Toronto — Tour catalog sync (existing)
4:00 AM Toronto — Vacation catalog sync (NEW, with advisory lock)
```

### Scaling Path

Start with everything in the existing API container. If live pricing traffic exceeds capacity:
1. Increase Railway container memory
2. If still insufficient: extract `VACATION_SEARCH` queue processor into a separate Railway service with its own Playwright instances, communicating via Redis/BullMQ

## OTA/Admin UI Considerations

The async polling model for live pricing requires a different client-side pattern than existing OTA catalog pages (which use SSR with revalidation). Vacation package search pages will need:

- **Loading state:** Show a skeleton/spinner while polling for results (1-2 sec intervals, ~3-5 sec total)
- **Client-side polling:** Use `useEffect` + `setInterval` or React Query's polling to check job status
- **Optimistic cache:** If the same search was done recently, show cached results immediately (200 response from cache hit)
- **Error handling:** Timeout after ~30 seconds, show a retry option

This is similar to how a flight search UX works — the user expects a brief loading period. The admin dashboard itinerary builder would use the same API but could show a more compact loading indicator.

## PoC Validation Results

All components were validated against live Softvoyage systems on 2026-03-28:

| Test | Result |
|------|--------|
| VCO catalog JSON APIs | 44 gateways, 47 destinations (YYZ), 83 hotels (Cancun) — plain HTTP, no auth |
| VCO search + pricing | 20 hotels with full pricing — Playwright, auto-session, no credentials |
| VCM search + pricing | 20 hotels, 117 package options parsed from HTML — HTTP with browser headers |
| SerpAPI Google Places | 3/3 hotels matched — ratings, reviews, addresses, photos, websites |
| SerpAPI TripAdvisor | 3/3 hotels matched — ratings, reviews, links |
| VCO session management | Auto-created on form submit, no login required |
| DataDome bot protection | Bypassed by Playwright (VCO) and browser headers (VCM) |

## Monitoring & Scaling Runbook

### New Health Provider: Softvoyage VCO

Add `softvoyage_vco` to the existing `HEALTH_PROVIDERS` array in `api-health.types.ts`. The health check should:
- Hit `GET ajax.cgi?action=getPackagesGateways&code_ag=VCO&alias=YAQ&language=en`
- Verify JSON response with `gateways` array
- Alert on 2 consecutive failures (existing pattern)

This integrates with the existing API health dashboard at `/admin/api-health` and triggers admin notifications on failure.

### Metrics to Monitor

| Metric | Where to Check | Warning Threshold | Action |
|--------|---------------|-------------------|--------|
| **Railway container memory** | Railway dashboard | > 80% of plan limit | Increase Railway plan memory |
| **VACATION_SEARCH queue depth** | Bull Board (`/admin/queues`) | > 10 waiting jobs | Browser pool may be undersized or VCO is slow |
| **VACATION_SEARCH job duration** | Bull Board job details | > 15 seconds per job | VCO may be throttling or DataDome blocking |
| **VACATION_SEARCH failure rate** | Bull Board failed jobs | > 20% failures in 1 hour | VCO may be down, check health provider |
| **ENRICHMENT queue depth** | Bull Board | > 50 waiting enrichment jobs | SerpAPI rate limit may be hit |
| **Redis memory usage** | Railway Redis dashboard | > 70% of plan limit | Reduce cache TTL or separate Redis instance |
| **Catalog sync duration** | `vacation_sync_history` table | > 10 minutes | VCO may be throttling catalog requests |
| **VCO health check** | Admin API health dashboard | 2 consecutive failures | Fall back to VCM, investigate VCO |

### Scaling Decision Tree

```
Is Railway memory > 80%?
  └─ YES → Increase Railway plan memory
       └─ Still > 80% after increase?
            └─ YES → Split to separate worker service (see below)
            └─ NO → Done

Is VACATION_SEARCH queue backing up (> 10 jobs waiting)?
  └─ YES → Is it during peak hours?
       └─ YES → Increase VACATION_BROWSER_POOL_SIZE to 3
            └─ Still backing up?
                 └─ YES → Split to separate worker service
                 └─ NO → Done
       └─ NO → Check VCO availability (health provider)

Is API response latency increasing (p95 > 2x baseline)?
  └─ YES → Is it correlated with VACATION_SEARCH processor activity?
       └─ YES → Split to separate worker service
       └─ NO → Investigate other causes
```

### How to Split: Separate Railway Worker Service

When monitoring indicates the need, extract the Playwright browser pool into a separate Railway service:

1. Create `apps/vacation-worker/` — a minimal NestJS app that only runs `SoftvoyageModule`
2. It connects to the same Redis instance and processes `VACATION_SEARCH` jobs
3. Remove `SoftvoyageSearchProcessor` and `SoftvoyageBrowserPoolService` from the main API's providers
4. The API still enqueues jobs and reads Redis cache — zero API code changes
5. Deploy as a second Railway service with its own memory allocation

This is a **deployment change only** — no architecture changes needed. The BullMQ + Redis boundary is already the split point.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| VCO HTML structure changes | Parser tests against saved HTML snapshots. Firecrawl as fallback extraction strategy |
| DataDome blocks Playwright | Fall back to VCM with browser headers (validated working). Monitor from Railway egress IP |
| VCO rate limiting | Redis cache reduces requests. Browser pool limits concurrency. BullMQ queue absorbs bursts |
| SerpAPI credit exhaustion | Lazy enrichment (only on view). 30-day cache. Monitor credit usage via Doppler alerts |
| Playwright memory pressure | Browser pool capped at 2 instances, recycled every 50 uses, launched on-demand not at startup. Runs in BullMQ worker, not on request thread |
| Softvoyage downtime | Cached catalog + last-known pricing served with staleness indicator (fetchedAt timestamp) |
| Redis contention (BullMQ + cache) | Monitor Redis memory. Pricing cache keys are small (~5-10KB each) with 15 min TTL. Consider separate Redis instance if contention observed |
| OTA throttle collapse | OTA requests use API key auth. Throttle guard uses per-key limits, not per-IP, for API key auth. Consider higher limit for vacation search |
| VCO is least contractual integration | Accepted risk. Dual fallback strategy (VCO primary, VCM secondary). Health check endpoint monitors VCO availability |

## Codex Review — Issues Addressed

### Round 1 (Architectural)

| Issue | Resolution |
|-------|------------|
| Enrichment tables in catalog schema breaks FDW | Moved `vacation_hotel_enrichment` and bridge table to `public` schema. Matches `destination_cache` pattern |
| Enrichment row model inconsistent (hotelId, source) | Changed to one row per hotel, all enrichment fields together. Dropped `source` column |
| 3 AM cron collision with tour sync | Moved to 4 AM Toronto. Added advisory lock requirement |
| Playwright on synchronous API path | Moved to async BullMQ `VACATION_SEARCH` queue. Client polls for results via jobId |
| ENRICHMENT queue immaturity + split-brain state | Dropped `vacation_enrichment_queue` table. BullMQ + `automation_job_history` is sole truth. Added new job type to existing processor |
| Destination providerIdentifier unstable | Individual IDs only, not combined strings. Bridge table has composite PK. Gateway-destinations has `lastSyncedAt` |
| Redis contention with BullMQ | Documented as monitoring concern. Small cache payloads + short TTL mitigate |
| OTA throttle collapse on Vercel egress IPs | Per-key throttle limits for API key auth. Higher tier for vacation search |
| VCO fragility | Dual fallback (VCO + VCM). Health monitoring. Accepted as known risk |

### Round 2 (Practical)

| Issue | Resolution |
|-------|------------|
| BullMQ workers share container with API — not true isolation | Documented caveat explicitly. Scaling path (separate worker service) provides true isolation if needed |
| Cold-miss pricing deduplication unspecified | Added jobId-based dedup with time-bucketed IDs (`vco-search-${params_hash}-${timestamp_bucket}`). Aligns job lifecycle with cache TTL so stale completed jobs don't block fresh searches. Multiple users piggyback on in-flight searches within the same bucket |
| Enrichment processor doesn't update job history on completion | Documented as implementation prerequisite. Must update enrichment processor to call `updateJobHistory()` on processing/completed |
| Per-key throttle still collapses all OTA users into one bucket | Documented with mitigations: high limit (300 req/min), async model reduces volume, future option for client identifier header |
| OTA UI needs different pattern for async pricing | Added OTA/Admin UI Considerations section: polling, loading states, error handling |
