# Flight Search Backend — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend infrastructure for the Google Flights-style flight search: new Amadeus API providers, airport autocomplete fixes, round-trip data shape, flight request checkout endpoint, and rate limiter fix.

**Architecture:** New Amadeus providers follow the existing `BaseExternalApi` pattern (raw REST, not SDK). Each provider is a focused NestJS injectable with auth via `AmadeusAuthService`. The flight request endpoint creates an inbound trip in Tailfire. All enrichment APIs (cheapest dates, price analysis, direct destinations) are exposed via new OTA search controller endpoints with aggressive caching.

**Tech Stack:** NestJS, Amadeus REST APIs, Drizzle ORM, existing `BaseExternalApi` + `AmadeusAuthService` patterns

**Spec:** `docs/superpowers/specs/2026-03-29-flight-search-design.md`

**Scope:** Backend only (Plan A). Frontend (Plan B) follows.

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Airport Autocomplete Fixes** | Fix min chars, IATA validation, city subType | Nothing |
| **2. Flight Search Enhancements** | Children param, separate outbound/return searches | Nothing |
| **3. Amadeus Enrichment Providers** | Cheapest dates, price analysis, direct destinations, delay prediction | Nothing |
| **4. Amadeus Booking Providers** | Flight pricing confirmation, branded fares upsell | Nothing |
| **5. OTA Enrichment Endpoints** | New controller endpoints for all enrichment APIs | Phase 3 |
| **6. Flight Request Endpoint** | Checkout → inbound trip + flight activity in Tailfire | Nothing |
| **7. Rate Limiter Fix** | Fix request recording, add caching layer | Nothing |

---

## Phase 1: Airport Autocomplete Fixes

### Task 1.1: Fix airport autocomplete — min chars, IATA validation, city subType

**Files:**
- Modify: `apps/api/src/ota/ota-search.controller.ts` — lower min keyword from 3 to 2 chars, OR keep at 3
- Modify: `apps/api/src/ota/ota-search.service.ts` — add `subType=CITY,AIRPORT` to location query
- Modify: `apps/ota/src/components/search/airport-autocomplete.tsx` — change min chars to 3, validate IATA before submit

- [ ] **Step 1:** Read `apps/api/src/ota/ota-search.service.ts` and find the `searchAirports` method. Change the Amadeus query to include both CITY and AIRPORT subTypes:

```typescript
// Change: subType=AIRPORT
// To: subType=CITY,AIRPORT
const url = `${baseUrl}/v1/reference-data/locations?keyword=${encodeURIComponent(keyword)}&subType=CITY,AIRPORT&view=LIGHT`
```

- [ ] **Step 2:** Read `apps/ota/src/components/search/airport-autocomplete.tsx`. Fix:
1. Change debounce trigger from 2 chars to 3: `if (value.length < 3) return`
2. Ensure the hidden input only submits a valid IATA code (3 letters), not raw text. Add validation before form submit — if the value isn't a 3-letter code, prevent submission and show error.

- [ ] **Step 3:** Commit: `fix: airport autocomplete — 3 char min, IATA validation, city+airport subType`

---

## Phase 2: Flight Search Enhancements

### Task 2.1: Wire children parameter through to Amadeus API

**Files:**
- Modify: `apps/api/src/ota/ota-search.controller.ts` — pass children to service
- Modify: `apps/api/src/ota/ota-search.service.ts` — pass children to Amadeus provider
- Modify: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-offers.provider.ts` — include children in API call

- [ ] **Step 1:** Read the controller. Find where `searchFlights` is called. The `children` param is accepted but discarded. Pass it through to the service and then to the Amadeus API call as `&children={children}`.

- [ ] **Step 2:** Commit: `fix: wire children parameter through flight search to Amadeus API`

### Task 2.2: Add one-way search support (separate outbound/return)

**Files:**
- Modify: `apps/api/src/ota/ota-search.controller.ts` — add `tripType` param
- Modify: `apps/api/src/ota/ota-search.service.ts` — handle one-way vs round-trip

- [ ] **Step 1:** Read the current flight search flow. For round trips, the spec says to use **separate searches** for outbound and return (not a single combined search). This means:

For the OTA frontend round-trip flow:
1. First search: `origin=YYZ&destination=CUN&departureDate=2026-06-15` (no returnDate) → returns outbound flights only
2. Second search: `origin=CUN&destination=YYZ&departureDate=2026-06-22` (no returnDate) → returns return flights only

The current API already supports this — just omit `returnDate` and each search returns one-way flights. No backend changes needed for this task.

The existing `returnDate` param can be removed from the OTA search or kept as optional. The frontend will make two separate calls.

- [ ] **Step 2:** Verify by testing: `curl "localhost:3101/api/v1/ota/search/flights?origin=YYZ&destination=CUN&departureDate=2026-06-15&adults=1" -H "x-ota-service-key: ..."` — should return one-way outbound flights only.

- [ ] **Step 3:** Commit: `docs: confirm one-way search works for round-trip outbound/return flow`

---

## Phase 3: Amadeus Enrichment Providers

### Task 3.1: Cheapest Date Search provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-dates.provider.ts`

- [ ] **Step 1:** Create a new Amadeus provider following the `AmadeusFlightOffersProvider` pattern. This provider calls `GET /v1/shopping/flight-dates` to get cheapest fares per departure date.

Key implementation details:
- Extends `BaseExternalApi`
- Uses `AmadeusAuthService.getAccessToken()` for auth
- Input: `{ origin: string, destination: string, departureDate?: string, oneWay?: boolean }`
- Amadeus endpoint: `GET /v1/shopping/flight-dates?origin={origin}&destination={destination}&departureDate={date}`
- Response: array of `{ type, origin, destination, departureDate, returnDate, price: { total } }`
- Normalize to: `Array<{ date: string, price: number, currency: string }>`
- Register in `AmadeusModule` providers

- [ ] **Step 2:** Commit: `feat(api): Amadeus Cheapest Date Search provider`

### Task 3.2: Flight Price Analysis provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-price-metrics.provider.ts`

- [ ] **Step 1:** Create provider for `GET /v1/analytics/itinerary-price-metrics`:
- Input: `{ originIataCode: string, destinationIataCode: string, departureDate: string }`
- Response: price percentiles (min, 1st quartile, median, 3rd quartile, max)
- Normalize to: `{ min: number, firstQuartile: number, median: number, thirdQuartile: number, max: number, currencyCode: string }`

- [ ] **Step 2:** Commit: `feat(api): Amadeus Flight Price Analysis provider`

### Task 3.3: Airport Direct Destinations provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-direct-destinations.provider.ts`

- [ ] **Step 1:** Create provider for `GET /v1/airport/direct-destinations`:
- Input: `{ departureAirportCode: string }`
- Response: list of direct destination airports with airlines
- Normalize to: `Array<{ destination: string, airlines: string[] }>`

- [ ] **Step 2:** Commit: `feat(api): Amadeus Airport Direct Destinations provider`

### Task 3.4: Flight Delay Prediction provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-delay.provider.ts`

- [ ] **Step 1:** Create provider for `GET /v1/travel/predictions/flight-delay`:
- Input: `{ originLocationCode: string, destinationLocationCode: string, departureDate: string, departureTime: string, arrivalDate: string, arrivalTime: string, aircraftCode: string, carrierCode: string, flightNumber: string, duration: string }`
- Response: delay probability percentages
- Normalize to: `{ onTimePercentage: number, delayLevel: 'LOW' | 'MEDIUM' | 'HIGH' }`

- [ ] **Step 2:** Commit: `feat(api): Amadeus Flight Delay Prediction provider`

---

## Phase 4: Amadeus Booking Providers

### Task 4.1: Flight Offers Pricing provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-pricing.provider.ts`

- [ ] **Step 1:** Create provider for `POST /v1/shopping/flight-offers/pricing`:
- Input: `{ flightOffers: FlightOffer[] }` (the raw Amadeus offer objects from search)
- Purpose: confirms live price for a selected flight before checkout
- Response: confirmed price, fare rules, payment requirements
- This is called when consumer selects a flight to confirm the price hasn't changed

- [ ] **Step 2:** Commit: `feat(api): Amadeus Flight Offers Pricing provider`

### Task 4.2: Branded Fares Upsell provider

**Files:**
- Create: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-upsell.provider.ts`

- [ ] **Step 1:** Create provider for `POST /v1/shopping/flight-offers/upselling`:
- Input: `{ flightOffers: FlightOffer[] }` (the cheapest economy offer)
- Response: premium cabin alternatives (Premium Economy, Business, First) with pricing
- Normalize to: `Array<{ cabinClass: string, price: number, currency: string, includedServices: string[] }>`

- [ ] **Step 2:** Commit: `feat(api): Amadeus Branded Fares Upsell provider`

---

## Phase 5: OTA Enrichment Endpoints

### Task 5.1: Add enrichment endpoints to OTA search controller

**Files:**
- Modify: `apps/api/src/ota/ota-search.controller.ts` — add 4 new endpoints
- Modify: `apps/api/src/ota/ota-search.service.ts` — add 4 new methods
- Modify: `apps/api/src/ota/ota.module.ts` — register new providers

- [ ] **Step 1:** Add the following endpoints to the OTA search controller:

```
GET /ota/search/flight-dates?origin=YYZ&destination=CUN
  → Returns cheapest fares per date for the route

GET /ota/search/flight-price-metrics?origin=YYZ&destination=CUN&departureDate=2026-06-15
  → Returns price percentiles for the route+date

GET /ota/search/direct-destinations?airport=YYZ
  → Returns direct destinations from airport with airlines

GET /ota/search/flight-delay?carrier=AC&flightNumber=1842&departureDate=2026-06-15&...
  → Returns delay prediction for a specific flight
```

All endpoints use `@Public()` + `OtaServiceKeyGuard` (matching existing pattern).

- [ ] **Step 2:** Add corresponding service methods that call the providers from Phase 3.

- [ ] **Step 3:** Register all new providers in `ota.module.ts` or `amadeus.module.ts`.

- [ ] **Step 4:** Commit: `feat(api): OTA enrichment endpoints — cheapest dates, price metrics, direct destinations, delay prediction`

### Task 5.2: Add upsell and pricing endpoints

**Files:**
- Modify: `apps/api/src/ota/ota-search.controller.ts`
- Modify: `apps/api/src/ota/ota-search.service.ts`

- [ ] **Step 1:** Add endpoints:

```
POST /ota/search/flight-pricing
  Body: { flightOffer: object }
  → Confirms live price for a selected flight

POST /ota/search/flight-upsell
  Body: { flightOffer: object }
  → Returns premium cabin alternatives
```

- [ ] **Step 2:** Commit: `feat(api): OTA flight pricing + upsell endpoints`

---

## Phase 6: Flight Request Endpoint

### Task 6.1: Create flight request DTO and endpoint

**Files:**
- Create: `apps/api/src/ota/dto/create-flight-request.dto.ts`
- Modify: `apps/api/src/ota/ota-leads.controller.ts` — add flight request endpoint
- Modify: `apps/api/src/ota/ota-leads.service.ts` — add flight request handler

- [ ] **Step 1:** Create the DTO:

```typescript
export class CreateFlightRequestDto {
  // Contact info (guest)
  name: string
  email: string
  phone: string

  // Flight details
  outboundFlight: {
    airline: string
    flightNumber: string
    origin: string
    destination: string
    departureTime: string
    arrivalTime: string
    duration: string
    stops: number
    fareClass: string
    price: number
    currency: string
  }

  returnFlight?: {
    // Same shape as outbound
    airline: string
    flightNumber: string
    origin: string
    destination: string
    departureTime: string
    arrivalTime: string
    duration: string
    stops: number
    fareClass: string
    price: number
    currency: string
  }

  travelers: number
  travelClass: string
  specialRequests?: string

  // Amadeus reference (for re-pricing)
  amadeusOfferId?: string
}
```

- [ ] **Step 2:** Add endpoint `POST /ota/flight-requests` to the leads controller. The handler should:
1. Create or find a contact from name/email/phone
2. Create an inbound trip with status `planning`
3. Create an itinerary day for the departure date
4. Create a flight activity with the selected flight details
5. If return flight, create another itinerary day + flight activity
6. Assign to advisor queue (or default advisor)
7. Send notification to advisor
8. Send confirmation email to consumer
9. Return `{ requestId, message: "Your flight request has been submitted" }`

- [ ] **Step 3:** Commit: `feat(api): flight request endpoint — creates inbound trip with flight activities`

---

## Phase 7: Rate Limiter Fix

### Task 7.1: Fix request recording in rate limiter

**Files:**
- Modify: `apps/api/src/external-apis/core/services/rate-limiter.service.ts`
- Modify: `apps/api/src/external-apis/providers/amadeus/amadeus-flight-offers.provider.ts`

- [ ] **Step 1:** Read the rate limiter service. Find where `canMakeRequest()` is called but `recordRequest()` is never called after a successful request. Fix by ensuring all Amadeus providers call `recordRequest()` after a successful API call.

- [ ] **Step 2:** Read the flight offers provider. Add `this.rateLimiter.recordRequest(this.config.provider)` after successful Amadeus response.

- [ ] **Step 3:** Apply the same fix to all new providers created in Phases 3-4.

- [ ] **Step 4:** Commit: `fix(api): rate limiter — record successful requests for proper quota enforcement`

### Task 7.2: Add caching for enrichment API responses

**Files:**
- Create: `apps/api/src/ota/ota-search-cache.service.ts`

- [ ] **Step 1:** Create a simple in-memory cache service for enrichment API responses:

```typescript
@Injectable()
export class OtaSearchCacheService {
  private cache = new Map<string, { data: any; expiresAt: number }>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  set(key: string, data: any, ttlSeconds: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 })
  }
}
```

Cache TTLs:
- Cheapest dates: 1 hour per route
- Price metrics: 6 hours per route+date
- Direct destinations: 24 hours per airport
- Delay predictions: 1 hour per flight

- [ ] **Step 2:** Inject into `OtaSearchService` and wrap enrichment calls with cache checks.

- [ ] **Step 3:** Commit: `feat(api): in-memory cache for flight enrichment API responses`

---

## Verification Checklist

After all phases:
- [ ] `pnpm --filter @tailfire/api typecheck` passes
- [ ] Airport autocomplete returns cities AND airports
- [ ] One-way flight search returns single-direction results
- [ ] Children parameter reaches Amadeus API
- [ ] `GET /ota/search/flight-dates?origin=YYZ&destination=CUN` returns cheapest dates
- [ ] `GET /ota/search/flight-price-metrics?origin=YYZ&destination=CUN&departureDate=2026-06-15` returns price percentiles
- [ ] `GET /ota/search/direct-destinations?airport=YYZ` returns direct routes
- [ ] `POST /ota/flight-requests` creates a trip with flight activities
- [ ] Rate limiter records successful requests
- [ ] Enrichment responses are cached

## Deferred to Plan B (Frontend)
- Flight search page redesign
- Price calendar component
- Filter sidebar
- Flight result cards with indicators
- Round-trip selection flow UI
- Flight request form UI
- Mobile responsive layout
