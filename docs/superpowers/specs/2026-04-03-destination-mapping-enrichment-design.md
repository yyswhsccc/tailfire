# Destination Mapping & Enrichment Layer Design

**Goal:** Add cross-reference mapping fields to destinations so entity pages can fetch real flights, hotels, and activities using proper API codes instead of freeform names.

**Blocks:** Real flight data (needs IATA), real hotel data (needs city code/coords), geolocation-based "Flights from X" (needs airport mapping).

---

## 1. The Problem

Destinations have `name`, `slug`, `latitude`, `longitude`, but are missing the API-specific identifiers that external services need:

| What We Need | Why | Current State |
|---|---|---|
| Airport IATA code | Amadeus flight search needs 3-letter IATA | Not stored |
| Amadeus city code | Hotel search needs city code | Not stored |
| Country code | Filtering, display, tour search fallback | 60%+ are NULL |
| Google Place ID | Hotel photos, reviews, geocoding verification | Not stored |
| Timezone | Display departure/arrival times correctly | Not stored |

Cozumel example: has lat/lng (20.42, -86.92) but no country code, no airport IATA, no city code. Flight search passes "Cozumel, Mexico" as destination which Amadeus rejects.

## 2. Data Sources for Resolution

### Airport IATA — From Amadeus Airport & City Search API

The API already exists in the codebase: `apps/ota/src/app/api/airports/route.ts` proxies to `/ota/search/airports?keyword={query}`.

**Resolution strategy:** For each destination with lat/lng, search Amadeus for the nearest airport:
1. Use destination name + country as search keyword
2. Or use lat/lng with the Amadeus Airport Nearest Relevant API
3. Pick the closest result with type "AIRPORT"
4. Store IATA code

### Amadeus City Code — From Same API

Amadeus returns both airports and cities. The city code is the 3-letter code with subType "CITY" (e.g., CUN for Cancun).

### Country Code — From Reverse Geocoding

7,200+ destinations were seeded from cruise ports. Many have lat/lng but NULL countryCode.

**Resolution:** Use the existing `geocoding_cache` in the catalog schema, or a simple reverse-geocode API call (Google Geocoding or Nominatim/OpenStreetMap) to populate countryCode from lat/lng.

### Google Place ID — From Google Places Text Search

Already used by the hotel search system. Can search by destination name + coordinates to get the Place ID.

## 3. Schema Changes

Add columns to the `metadata` JSONB field (no migration needed — JSONB is flexible):

```typescript
// In metadata JSONB:
{
  airportIata: "CZM",           // Nearest airport IATA code
  airportName: "Cozumel Intl",  // Airport name for display
  airportDistance: 5.2,          // km from destination to airport
  amadeusCityCode: "CZM",       // Amadeus city code
  googlePlaceId: "ChIJ...",     // Google Places ID
  timezone: "America/Cancun",   // IANA timezone
  resolvedCountryCode: "MX",    // Resolved country code (if main field is NULL)
  mappingVersion: 1,            // Schema version for forward compat
  mappedAt: "2026-04-03T..."    // When mapping was last run
}
```

Also backfill the `country_code` column directly when it's NULL.

## 4. Resolution Service

A new service in the API that resolves mapping data for destinations:

```typescript
// apps/api/src/destinations/destination-mapping.service.ts

class DestinationMappingService {
  // Resolve all mapping data for a single destination
  async resolveMapping(destinationId: string): Promise<MappingResult>

  // Batch resolve for multiple destinations (for enrichment job)
  async batchResolve(destinationIds: string[], options?: { concurrency: number }): Promise<BatchResult>

  // Resolve airport IATA from lat/lng via Amadeus
  async resolveAirport(lat: number, lng: number, name: string): Promise<AirportResult | null>

  // Resolve country code from lat/lng via reverse geocoding
  async resolveCountryCode(lat: number, lng: number): Promise<string | null>

  // Resolve Amadeus city code from lat/lng
  async resolveCityCode(lat: number, lng: number, name: string): Promise<string | null>
}
```

### Resolution Priority

For each destination, resolve in this order:
1. **Country code** — fastest, most useful (reverse geocode from lat/lng)
2. **Airport IATA** — enables flight search (Amadeus nearest airport)
3. **Amadeus city code** — enables hotel search (from same Amadeus API)
4. **Google Place ID** — enables hotel photos (text search by name + coords)
5. **Timezone** — from coordinates (library-based, no API needed)

### Rate Limiting

- Amadeus: 10 req/min for airport search (already rate-limited in codebase)
- Google Geocoding: 50 req/sec (generous)
- Process: batch 50 destinations at a time, 1 sec between batches

## 5. Enrichment Job

Add a `DESTINATION_MAPPING` job type to the existing BullMQ enrichment queue:

```typescript
// In automation.types.ts
DESTINATION_MAPPING = 'destination.mapping'

// Job data
interface DestinationMappingJobData {
  destinationId: string
  fields?: ('airport' | 'countryCode' | 'cityCode' | 'googlePlaceId' | 'timezone')[]
}
```

**Batch enrichment strategy** (same priority as hero image enrichment):
1. Featured/popular destinations first (have hero images or high cruise count)
2. Port cities next (most likely to need flight/hotel search)
3. Islands and resort areas
4. Everything else

### Admin Trigger

`POST /admin/destinations/batch-mapping` — triggers batch resolution for unmapped destinations.

## 6. Consumer Usage

### FlightsSection

```typescript
// Before: passes destination name (fails silently)
fetch(`/api/flights/search?origin=YYZ&destination=Cozumel, Mexico&...`)

// After: reads airport IATA from destination metadata
const iata = sectionProps.airportIata || sectionProps.destinationName
fetch(`/api/flights/search?origin=YYZ&destination=${iata}&...`)
```

The destination adapter passes `airportIata` from the destination's metadata:
```typescript
props: {
  destinationName: dest.name,
  airportIata: dest.metadata?.airportIata,
  destinationImageUrl: dest.heroImageUrl,
}
```

### HotelsSection

```typescript
// Before: passes destination name (imprecise)
fetch(`/api/hotels/search?destination=Cozumel, Mexico&...`)

// After: passes coordinates for precise results
fetch(`/api/hotels/search?latitude=${lat}&longitude=${lng}&radius=10000&...`)
```

### Geolocation (User's Origin)

Same mapping system resolves the user's location to their nearest airport:
1. IP → approximate lat/lng (server-side from X-Forwarded-For)
2. lat/lng → nearest airport IATA (Amadeus API, cached)
3. Store in `travel_session` cookie as `origin`

## 7. Immediate Quick Win (No Migration)

Before the full enrichment pipeline, we can do a **one-time backfill** using existing data:

1. **Cruise ports already have IATA-like codes** — the `cruise_ports` table may have UNLOCODE or similar identifiers. Cross-reference via `destination_ports` join table.
2. **Country code from port data** — cruise ports have country info that can backfill NULL country codes.
3. **Timezone from lat/lng** — use a library like `geo-tz` (pure computation, no API calls).
4. **Airport search for top 100 destinations** — manually or via a script, resolve airports for the most-visited destinations first.

## 8. Implementation Order

1. **Quick win: backfill country codes from cruise port data** (SQL script, immediate)
2. **Quick win: resolve airports for top 50 destinations** (script using Amadeus API)
3. **Update FlightsSection to use airportIata from metadata** (frontend change)
4. **Update HotelsSection to use lat/lng** (frontend change)
5. **Build DestinationMappingService** (API service)
6. **Add DESTINATION_MAPPING enrichment job** (BullMQ job)
7. **Batch resolve remaining destinations** (background process)
8. **Geolocation: IP → airport resolution** (server middleware)

## Scope

### Build Now
- Backfill country codes from cruise port data
- Resolve airports for top 50 destinations (script)
- Update sections to use mapped codes
- DestinationMappingService with airport + country resolution
- DESTINATION_MAPPING enrichment job

### Deferred
- Google Place ID resolution (hotels work without it)
- Full batch resolution for all 9,728 destinations
- IP → airport geolocation middleware
- Timezone resolution
