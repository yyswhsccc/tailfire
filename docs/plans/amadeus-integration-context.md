# Amadeus Integration - Context Export

Session date: 2026-02-02
Branch: `feature/amadeus-integration` (created from main)

---

## Background

This plan was developed after completing CRM tenant isolation work on `fix/crm-and-passengers`. The user requested a full Amadeus API integration covering all 4 categories: Flight Search+Book, Hotel Booking, Transfers, and Tours & Activities.

---

## Existing Amadeus Code (Already Implemented)

### Amadeus Flights Provider
- **File**: `apps/api/src/external-apis/providers/amadeus/amadeus-flights.provider.ts` (572 lines)
- **API**: `/v2/schedule/flights` — flight status lookup by flight number + date
- **Auth**: OAuth2 client credentials with token caching (60s buffer), mutex for concurrent requests
- **Category**: `ApiCategory.FLIGHTS`, priority 2 (fallback to Aerodatabox at priority 1)
- **Rate limit**: configurable (default 60/min, 100/hour, 500/day)
- **Output**: `NormalizedFlightStatus` (shared with Aerodatabox)

### Amadeus Hotels Provider
- **File**: `apps/api/src/external-apis/providers/amadeus/amadeus-hotels.provider.ts` (612 lines)
- **APIs**: 
  - `/v1/reference-data/locations/hotels/by-city` — hotel list
  - `/v3/shopping/hotel-offers` — pricing/offers for top 10 hotels
- **Category**: `ApiCategory.HOTELS`, priority 2 (fallback to Google Places at priority 1)
- **Output**: `NormalizedHotelResult` with `HotelPriceOffer[]`

### Supporting Files
- `amadeus.types.ts` (278 lines) — OAuth2, flight response types
- `amadeus-hotels.types.ts` (278 lines) — Hotel list, offers, policies types
- `amadeus.module.ts` (21 lines) — NestJS module

---

## External API Architecture

### Provider Registry
- **File**: `apps/api/src/external-apis/core/services/external-api-registry.service.ts` (370 lines)
- Priority-based fallback chains per `ApiCategory`
- Credential loading via `CredentialResolverService` (Doppler env vars)
- `tryWithFallback(category, operation)` — tries providers in priority order

### ApiCategory Enum (current)
```ts
enum ApiCategory {
  FLIGHTS = 'flights',
  PLACES = 'places',
  HOTELS = 'hotels',
  CARS = 'cars',
  VISA = 'visa',
  IMAGES = 'images',
}
```

### Provider Interface
```ts
interface IExternalApiProvider<TSearchParams, TSearchResult> {
  readonly config: ExternalApiConfig
  search(params): Promise<ExternalApiResponse<TSearchResult[]>>
  getDetails(referenceId, additionalParams?): Promise<ExternalApiResponse<TSearchResult>>
  validateParams(params): { valid, errors }
  transformResponse(apiData): TSearchResult
  testConnection(): Promise<ConnectionTestResult>
  setCredentials(credentials): Promise<void>
}
```

### Existing Controllers
- **Flights**: `aerodatabox.controller.ts` — `/external-apis/flights` (search, airports/:code, :flightNumber, health/check)
- **Hotels**: `hotels.controller.ts` — `/external-apis/hotels` (search, lookup, :id, :placeId/enrich, photos/import)

---

## UI Forms (Trip Activities)

### Pattern: Auto-Save
All forms use 1500ms debounced auto-save via React Hook Form `useWatch` + refs to prevent infinite loops.

### Flight Form (`flight-form.tsx`, ~1958 lines)
- Multi-segment flights with expandable/collapsible cards
- Existing external search: Aerodatabox (primary) + Amadeus flight status (fallback via "More Results" button)
- `applyFlightData(index, flight)` → populates airline, times, airports, aircraft

### Lodging Form (`lodging-form.tsx`, ~1500 lines)
- Hotel search via `HotelSearchPanel` component (Google Places + Amadeus pricing)

### Transportation Form (`transportation-form.tsx`, ~1317 lines)
- 9 subtypes: transfer, car_rental, private_car, taxi, shuttle, train, ferry, bus, limousine
- **No external search integration** — all manual entry
- Transfer subtype has: pickup/dropoff address+date+time+timezone, flightNumber, isRoundTrip

### Tour Form (`tour-form.tsx`, ~1279 lines)
- **No external search integration** — all manual entry
- Tag-based inputs for inclusions/exclusions/whatToBring
- Provider info: name, phone, email, website

### Hotel Search Panel (`hotel-search-panel.tsx`, 226 lines)
- Debounced input (300ms, min 3 chars)
- Endpoint: `/external-apis/hotels/lookup`
- Results show name, rating, address, provider badge
- `onSelect(hotel)` callback populates parent form

---

## Shared Types

### flights.types.ts (80 lines)
- `NormalizedFlightStatus`, `FlightEndpoint`, `NormalizedTime`
- `FlightSearchParams`, `FlightSearchResponse`

### hotels.types.ts (171 lines)
- `NormalizedHotelResult` (unified from any provider)
- `HotelSearchParams`, `HotelPriceOffer`, `HotelSearchResponse`

---

## Database Schema Pattern

- Base table: `itinerary_activities` with `componentType` discriminator
- One-to-one detail tables: `flight_details`, `lodging_details`, `transportation_details`, `dining_details`, etc.
- `activity_pricing` table is authoritative for pricing (not activity.estimatedCost)
- No tour details table exists — tours use client-side form nesting only

---

## Codex Review Feedback (Incorporated into Plan)

1. **Controller placement**: Use category controllers (like `hotels.controller.ts`), not provider-named controllers
2. **OAuth2 token reuse**: Extract shared `AmadeusAuthService` — don't duplicate OAuth logic in 5 providers
3. **NormalizedFlightOffer gaps**: Missing baggage info, fare basis, per-traveler pricing — added
4. **Transfer params**: Need pickup/dropoff type (airport/hotel/address) + timezone — added
5. **Activities**: Handle missing price gracefully (nullable) — added
6. **Rate limiting**: Add throttle on new endpoints — noted
7. **UI panels**: Gate behind toggle button, not shown by default — added

---

## Amadeus API Credentials

Managed via Doppler. Existing credentials work for both flight status and hotel search APIs. The same OAuth2 client ID/secret works for all Amadeus Self-Service APIs (flight offers, transfers, activities use the same auth).

Test environment rate limits are lower (varies by API: 1-10 req/sec).

---

## What's NOT Being Built (Out of Scope)

- **Booking/Orders APIs**: Flight Orders, Hotel Orders, Transfer Orders — require PCI compliance
- **Flight Price Analysis** / Flight Delay Prediction
- **Airport City Search** / Airline Code Lookup (nice-to-have utilities)
- **Hotel Ratings/Sentiments** (endpoint exists in types but not prioritized)
