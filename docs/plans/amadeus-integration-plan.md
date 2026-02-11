# Amadeus API Integration - Full Implementation

Extend the existing Amadeus integration (flights status + hotel search/pricing) with **Flight Offers Search**, **Transfer Search**, and **Tours & Activities Search**. All three add external search capabilities to existing UI forms that currently have no external data source.

---

## Scope

| API | Current State | What We Add |
|-----|--------------|-------------|
| **Flight Offers Search** | Flight status only (schedule lookup) | Price shopping across airlines → populate flight form with pricing |
| **Transfer Search** | No external API | Search transfers by route → populate transportation/transfer form |
| **Tours & Activities** | No external API | Search activities by location → populate tour form |
| Hotel Search/Pricing | ✅ Already complete | No changes needed |

**Out of scope** (future): Booking/Orders APIs (Flight Orders, Hotel Orders, Transfer Orders).

---

## Architecture Decisions (per Codex review)

1. **Controller placement**: Category controllers (like `hotels.controller.ts`), NOT provider-named controllers. Routes: `/external-apis/flights/offers`, `/external-apis/transfers/search`, `/external-apis/activities/search`
2. **OAuth2 token reuse**: Extract shared `AmadeusAuthService` from existing flight/hotel providers. All 5 Amadeus providers share one token cache.
3. **Rate limiting**: Use existing `RateLimiterService` pattern per provider. Add throttle guard on new endpoints.
4. **UI search panels**: Gated behind a "Search providers" toggle/button — not shown by default.

---

## 1. Shared Types

### `packages/shared-types/src/api/transfers.types.ts` (NEW)
```ts
TransferLocationType = 'airport' | 'hotel' | 'address' | 'railway_station' | 'port'

TransferSearchParams {
  pickupType: TransferLocationType
  pickupCode?: string           // IATA code for airport, hotel ID, etc.
  pickupLat?: number
  pickupLng?: number
  pickupAddress?: string
  dropoffType: TransferLocationType
  dropoffCode?: string
  dropoffLat?: number
  dropoffLng?: number
  dropoffAddress?: string
  date: string                  // YYYY-MM-DD
  time: string                  // HH:mm
  timezone?: string
  passengers: number
}

NormalizedTransferResult {
  id: string
  transferType: string          // PRIVATE, SHARED, TAXI, etc.
  provider: string
  vehicle: { type, description, maxPassengers, maxBags }
  price: { currency, total, base? }
  duration?: string             // ISO 8601 duration
  pickupLocation: { address, lat?, lng? }
  dropoffLocation: { address, lat?, lng? }
  cancellationPolicy?: { deadline, refundable, description }
}

TransferSearchResponse { results: NormalizedTransferResult[], provider: string }
```

### `packages/shared-types/src/api/tours-activities.types.ts` (NEW)
```ts
NormalizedTourActivity {
  id: string
  name: string
  description?: string
  price?: { currency, amount }  // nullable — Amadeus sometimes omits
  duration?: string             // ISO 8601 or "2 hours"
  location: { lat, lng, address? }
  rating?: number
  reviewCount?: number
  pictures?: string[]
  provider: string
  bookingLink?: string
}

TourActivitySearchParams { latitude: number, longitude: number, radius?: number, keyword?: string }
TourActivitySearchResponse { results: NormalizedTourActivity[], provider: string }
```

### `packages/shared-types/src/api/flights.types.ts` (MODIFY)
```ts
FlightOfferSearchParams {
  origin: string               // IATA
  destination: string          // IATA
  departureDate: string        // YYYY-MM-DD
  returnDate?: string
  adults: number
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  nonStop?: boolean
  maxPrice?: number
  currencyCode?: string
}

NormalizedFlightOffer {
  id: string
  source: string
  segments: FlightOfferSegment[]
  price: {
    currency: string
    total: string
    perTraveler: string
    base?: string
    fees?: { amount: string, type: string }[]
  }
  validatingAirline: string
  fareClass?: string
  fareFamily?: string            // e.g., "LIGHT", "STANDARD", "FLEX"
  cabin?: string                 // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  fareRules?: { exchangeable: boolean, refundable: boolean }
  baggageAllowance?: { checked?: { quantity: number, weight?: string }, cabin?: { quantity: number } }
  bookingClass?: string
}

FlightOfferSegment {
  departure: { iataCode: string, terminal?: string, at: string }
  arrival: { iataCode: string, terminal?: string, at: string }
  carrier: string
  carrierName?: string         // resolved from dictionaries
  flightNumber: string
  aircraft?: string
  aircraftName?: string        // resolved from dictionaries
  duration: string             // ISO 8601
  stops: number
  cabin?: string
}

FlightOfferSearchResponse { results: NormalizedFlightOffer[], dictionaries?: Record<string, any> }
```

### `packages/shared-types/src/api/index.ts` (MODIFY)
- Export new type files

---

## 2. Backend - Shared Amadeus Auth

### `apps/api/src/external-apis/providers/amadeus/amadeus-auth.service.ts` (NEW)
- Extract OAuth2 token caching from `amadeus-flights.provider.ts`
- Single `getToken(): Promise<string>` method
- Mutex for concurrent token requests
- Token refresh with 60s buffer before expiry
- Injected into all 5 Amadeus providers

### `apps/api/src/external-apis/providers/amadeus/amadeus-flights.provider.ts` (MODIFY)
- Remove inline OAuth2 logic, inject `AmadeusAuthService`

### `apps/api/src/external-apis/providers/amadeus/amadeus-hotels.provider.ts` (MODIFY)
- Remove inline OAuth2 logic, inject `AmadeusAuthService`

---

## 3. Backend - ApiCategory Enum + Registry

### `apps/api/src/external-apis/core/interfaces/api-config.interface.ts` (MODIFY)
- Add `TRANSFERS = 'transfers'` and `ACTIVITIES = 'activities'` to `ApiCategory` enum

**Registry wiring required**: New providers must be explicitly registered via `ExternalApiRegistryService.registerProvider()` in their `onModuleInit()` (same pattern as existing Amadeus flights/hotels providers). The `amadeus.module.ts` must export all 5 providers so the registry can discover them.

---

## 4. Backend - New Amadeus Providers

### `apps/api/src/external-apis/providers/amadeus/amadeus-flight-offers.provider.ts` (NEW)
- Implements `IExternalApiProvider<FlightOfferSearchParams, NormalizedFlightOffer>`
- Endpoint: `POST /v2/shopping/flight-offers`
- Uses `AmadeusAuthService` for tokens
- Category: `ApiCategory.FLIGHTS`, provider: `amadeus_offers`
- Resolves dictionaries (carrier names, aircraft names) during transform
- Rate limit: 10/min (Amadeus test), 40/min (prod)

### `apps/api/src/external-apis/providers/amadeus/amadeus-transfers.provider.ts` (NEW)
- Implements `IExternalApiProvider<TransferSearchParams, NormalizedTransferResult>`
- Endpoint: `POST /v1/shopping/transfer-offers`
- Request body includes `startLocationCode` / `startGeoCode` / `startAddressLine` based on pickup type
- Validation: mutual exclusion — each location accepts EITHER code OR coordinates OR address (not multiple)
- Category: `ApiCategory.TRANSFERS`

### `apps/api/src/external-apis/providers/amadeus/amadeus-activities.provider.ts` (NEW)
- Implements `IExternalApiProvider<TourActivitySearchParams, NormalizedTourActivity>`
- Endpoint: `GET /v1/shopping/activities?latitude=...&longitude=...`
- Handles missing price gracefully (nullable)
- Default radius: 20km
- Category: `ApiCategory.ACTIVITIES`

### `apps/api/src/external-apis/providers/amadeus/amadeus.types.ts` (MODIFY)
- Add Amadeus API response types for transfer offers and activities

### `apps/api/src/external-apis/providers/amadeus/amadeus.module.ts` (MODIFY)
- Add `AmadeusAuthService`, new providers, export all

---

## 5. Backend - Category Controllers

Following the `hotels.controller.ts` pattern (category controller, not provider-named):

### `apps/api/src/external-apis/providers/flights/flights-offers.controller.ts` (NEW)
- Route: `/external-apis/flights/offers`
- `GET /search` — search flight offers (price shopping)
- Query: origin, destination, departureDate, returnDate?, adults, travelClass?, nonStop?
- Uses `amadeus_offers` provider directly (not fallback chain — different search type)
- Same auth guard as existing flight/hotel endpoints
- **Separate from aerodatabox.controller.ts** — keeps flight status and flight offers decoupled

### `apps/api/src/external-apis/providers/flights/flights-offers.module.ts` (NEW)

### `apps/api/src/external-apis/providers/transfers/transfers.controller.ts` (NEW)
- Route: `/external-apis/transfers`
- `GET /search` — search transfer offers
- Auth: same guard as hotels controller (Bearer)

### `apps/api/src/external-apis/providers/transfers/transfers.module.ts` (NEW)

### `apps/api/src/external-apis/providers/activities/activities.controller.ts` (NEW)
- Route: `/external-apis/activities`
- `GET /search` — search tours & activities
- Auth: same guard as hotels controller (Bearer)

### `apps/api/src/external-apis/providers/activities/activities.module.ts` (NEW)

### `apps/api/src/external-apis/external-apis.module.ts` (MODIFY)
- Import `TransfersModule`, `ActivitiesModule`

---

## 6. Frontend - React Query Hooks

### `apps/admin/src/hooks/use-external-apis.ts` (NEW)
```ts
useFlightOfferSearch(params, { enabled })
useTransferSearch(params, { enabled })
useActivitySearch(params, { enabled })
```
- staleTime: 5min, gcTime: 30min
- No retry on 4xx
- Rate limit toast on 429

---

## 7. Frontend - Search Panels

### `apps/admin/src/components/transfer-search-panel.tsx` (NEW)
- Pattern: `hotel-search-panel.tsx`
- Inputs: pickup type + address/code, dropoff type + address/code, date, time, passengers
- Results: vehicle type, price, duration, cancellation policy
- `onSelect(transfer)` callback

### `apps/admin/src/components/activity-search-panel.tsx` (NEW)
- Pattern: `hotel-search-panel.tsx`
- Inputs: location (geocoded), keyword filter
- Results: name, price, duration, rating, thumbnail
- `onSelect(activity)` callback
- Handle missing price (show "Price on request")

### `apps/admin/src/components/flight-offers-search-panel.tsx` (NEW)
- Inputs: origin IATA, destination IATA, date, passengers, class
- Results: airline, price (total + per traveler), duration, stops, baggage, fare rules
- `onSelect(offer)` populates multiple segments

---

## 8. Frontend - Form Integration

All search panels are **gated behind a toggle button** ("Search External Providers") — not shown by default.

### `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` (MODIFY)
- Add collapsible "Search Flight Offers" section below existing flight status search
- Trigger: button click after entering origin + destination + date
- Results as cards: airline logo, price, duration, stops, baggage
- Selection maps offer segments → flight form segments (multi-segment for connections)
- Mapping: `FlightOfferSegment.carrier` → `airline`, `flightNumber`, departure/arrival IATA → airport codes, times, terminals
- **Pricing mapping**: `NormalizedFlightOffer.price` → `activity_pricing` table (authoritative), NOT `activity.estimatedCost`

### `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` (MODIFY)
- When subtype is "transfer": show toggle for `TransferSearchPanel`
- Panel appears after pickup + dropoff addresses entered
- Selection populates: provider, vehicleType, estimated price, pickup/dropoff times, duration

### `apps/admin/src/app/trips/[id]/_components/tour-form.tsx` (MODIFY)
- Add toggle for "Search Activities" section
- Uses tour location for geocoding → lat/lng
- Results: available tours/activities nearby
- Selection populates: tourName, providerName, price (→ activity pricing), duration, description, inclusions

---

## Files Summary

| File | Action |
|------|--------|
| `packages/shared-types/src/api/transfers.types.ts` | NEW |
| `packages/shared-types/src/api/tours-activities.types.ts` | NEW |
| `packages/shared-types/src/api/flights.types.ts` | MODIFY |
| `packages/shared-types/src/api/index.ts` | MODIFY |
| `apps/api/src/external-apis/core/interfaces/api-config.interface.ts` | MODIFY |
| `apps/api/src/external-apis/providers/amadeus/amadeus-auth.service.ts` | NEW |
| `apps/api/src/external-apis/providers/amadeus/amadeus-flights.provider.ts` | MODIFY (use shared auth) |
| `apps/api/src/external-apis/providers/amadeus/amadeus-hotels.provider.ts` | MODIFY (use shared auth) |
| `apps/api/src/external-apis/providers/amadeus/amadeus-flight-offers.provider.ts` | NEW |
| `apps/api/src/external-apis/providers/amadeus/amadeus-transfers.provider.ts` | NEW |
| `apps/api/src/external-apis/providers/amadeus/amadeus-activities.provider.ts` | NEW |
| `apps/api/src/external-apis/providers/amadeus/amadeus.types.ts` | MODIFY |
| `apps/api/src/external-apis/providers/amadeus/amadeus.module.ts` | MODIFY |
| `apps/api/src/external-apis/providers/flights/flights-offers.controller.ts` | NEW |
| `apps/api/src/external-apis/providers/flights/flights-offers.module.ts` | NEW |
| `apps/api/src/external-apis/providers/transfers/transfers.controller.ts` | NEW |
| `apps/api/src/external-apis/providers/transfers/transfers.module.ts` | NEW |
| `apps/api/src/external-apis/providers/activities/activities.controller.ts` | NEW |
| `apps/api/src/external-apis/providers/activities/activities.module.ts` | NEW |
| `apps/api/src/external-apis/external-apis.module.ts` | MODIFY |
| `apps/admin/src/hooks/use-external-apis.ts` | NEW |
| `apps/admin/src/components/transfer-search-panel.tsx` | NEW |
| `apps/admin/src/components/activity-search-panel.tsx` | NEW |
| `apps/admin/src/components/flight-offers-search-panel.tsx` | NEW |
| `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` | MODIFY |
| `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` | MODIFY |
| `apps/admin/src/app/trips/[id]/_components/tour-form.tsx` | MODIFY |

---

## Implementation Order

1. **Shared types** (transfers, activities, flight offers)
2. **ApiCategory enum** update
3. **AmadeusAuthService** — extract shared OAuth2
4. **Refactor existing providers** — use shared auth
5. **New Amadeus providers** (flight-offers, transfers, activities)
6. **Category controllers + modules** (transfers, activities) + extend flights controller
7. **Module wiring** (external-apis.module.ts)
8. **React Query hooks**
9. **Search panels** (3 new components)
10. **Form integration** (3 form modifications)

---

## Verification

1. `turbo dev` — no build errors
2. Existing flight status search still works (regression check after auth refactor)
3. Existing hotel search still works (regression check after auth refactor)
4. `curl` each new endpoint with test params → valid JSON responses
5. Open flight form → toggle "Search Offers" → search → select → segments populate
6. Open transportation form → "transfer" subtype → toggle search → select → fields populate
7. Open tour form → toggle "Search Activities" → search → select → fields populate
8. Auto-save works after external data populates forms
9. No console errors, no 500s
