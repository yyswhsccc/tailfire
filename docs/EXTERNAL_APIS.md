# External API Integrations

This document is the canonical reference for third-party APIs and feed providers currently wired into the Tailfire API. It is intended to answer three questions:

1. Which external services are actually in use?
2. Where are they used in the codebase?
3. How are credentials, routes, and operational expectations wired today?

Code remains the source of truth. For unresolved drift or broken integration paths, see [`REPOSITORY_REVIEW_ISSUES.md`](./REPOSITORY_REVIEW_ISSUES.md).

## Source Of Truth

- Runtime provider composition: `apps/api/src/external-apis/`
- Cruise integrations: `apps/api/src/cruise-booking/` and `apps/api/src/cruise-import/`
- Tour integrations: `apps/api/src/globus/` and `apps/api/src/tour-import/`
- Media search: `apps/api/src/unsplash/`
- OCR integration: `apps/api/src/ocr/` and `apps/api/src/ocr-import/`
- Env-backed provider credential policy: `apps/api/src/api-credentials/credential-resolver.service.ts`
- Admin-facing provider metadata: `apps/api/src/api-credentials/dto/provider-metadata.dto.ts`

## Integration Matrix

| Service | Current use in Tailfire | Main code paths | Current config source | Main entry points |
| --- | --- | --- | --- | --- |
| Traveltek FusionAPI | Real-time cruise shopping, cabin selection, basket, booking, and booking import flows | `apps/api/src/cruise-booking/` | Direct env via `ConfigService` | `/cruise-booking/*` |
| Traveltek FTP | Cruise catalog import into `catalog` tables | `apps/api/src/cruise-import/` | Direct env via `ConfigService` | `/cruise-import/*` |
| Globus WebAPI | Live tour search, departures, filters, and promotions | `apps/api/src/globus/` | Optional `GLOBUS_API_URL`; no credential handling in current code | `/globus/*` |
| Globus WebAPI export endpoints | Full tour catalog sync plus tour/hotel media fetches | `apps/api/src/tour-import/` | Optional `GLOBUS_API_URL`; no credential handling in current code | `/tour-import/*` |
| Amadeus | Flight status fallback, airport lookup, flight offers, hotel fallback/pricing, activities, transfers | `apps/api/src/external-apis/providers/amadeus/` | `CredentialResolverService` env-only policy | `/external-apis/flights/*`, `/external-apis/flights/offers/search`, `/external-apis/hotels/*`, `/external-apis/activities/search`, `/external-apis/transfers/search` |
| AeroDataBox | Primary flight-status provider and airport lookup by code | `apps/api/src/external-apis/providers/aerodatabox/` | `CredentialResolverService` env-only policy | `/external-apis/flights/*` |
| Google Places | Primary hotel search/lookup/details, photo import, and internal geocoding fallback | `apps/api/src/external-apis/providers/google-places/`, `apps/api/src/trips/geocoding.service.ts` | `CredentialResolverService` env-only policy for provider stack; direct env read in geocoding fallback | `/external-apis/hotels/*` plus internal geocoding use |
| Booking.com DataCrawler | Hotel amenity enrichment layered onto Google Places results | `apps/api/src/external-apis/providers/booking-com/` | Intended env-backed provider, but current enrich route still asks `ApiCredentialsService` for DB credentials | `/external-apis/hotels/:placeId/enrich` |
| Unsplash | Stock photo search for itinerary/activity media selection | `apps/api/src/unsplash/` | `CredentialResolverService` env-only policy | `/unsplash/status`, `/unsplash/search` |
| OpenAI | OCR document detection and structured extraction for booking confirmations and passports | `apps/api/src/external-apis/providers/openai/`, `apps/api/src/ocr/`, `apps/api/src/ocr-import/` | `CredentialResolverService` env-only policy | Internal provider use plus `/ocr-import/*` |

## Credential And Config Model

### Env-backed providers

The provider stack under `apps/api/src/external-apis/`, `apps/api/src/unsplash/`, and `apps/api/src/ocr/` is designed around `CredentialResolverService`.

Current env-only providers:

- `UNSPLASH` -> `UNSPLASH_ACCESS_KEY`
- `AERODATABOX` -> `AERODATABOX_RAPIDAPI_KEY`
- `AMADEUS`, `AMADEUS_ACTIVITIES`, `AMADEUS_HOTELS`, `AMADEUS_OFFERS`, `AMADEUS_TRANSFERS` -> `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`
- `GOOGLE_PLACES` -> `GOOGLE_PLACES_API_KEY`
- `BOOKING_COM` -> `BOOKING_RAPIDAPI_KEY`
- `OPEN_AI` -> `OPENAI_API_KEY`

These providers are treated as Doppler-managed secrets in the current code. The admin credentials UI still exposes status metadata for them, but the create dialog filters out `env-only` providers and directs operators to Doppler instead of database credential entry.

### Direct `ConfigService` integrations

Traveltek and Globus do not use `CredentialResolverService` today.

- Traveltek FusionAPI reads `TRAVELTEK_API_URL`, `TRAVELTEK_USERNAME`, `TRAVELTEK_PASSWORD`, and `TRAVELTEK_SID`.
- Traveltek FTP import reads `TRAVELTEK_FTP_HOST`, `TRAVELTEK_FTP_USER`, `TRAVELTEK_FTP_PASSWORD`, and `TRAVELTEK_FTP_SECURE`.
- Globus live and import modules read `GLOBUS_API_URL` if set, otherwise default to `https://webapi.globusandcosmos.com/gvitawapi.asmx`.

### Rate-limit and base URL tuning

The external provider modules also read optional tuning vars directly from `process.env`.

Common examples:

- `AERODATABOX_API_URL`
- `AERODATABOX_RATE_LIMIT_PER_MINUTE`
- `AERODATABOX_RATE_LIMIT_PER_HOUR`
- `AERODATABOX_RATE_LIMIT_PER_DAY`
- `AMADEUS_API_URL`
- `AMADEUS_RATE_LIMIT_PER_MINUTE`
- `AMADEUS_RATE_LIMIT_PER_HOUR`
- `AMADEUS_RATE_LIMIT_PER_DAY`
- `AMADEUS_OFFERS_RATE_LIMIT_PER_MINUTE`
- `GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE`
- `GOOGLE_PLACES_RATE_LIMIT_PER_HOUR`
- `BOOKING_COM_RATE_LIMIT_PER_MINUTE`
- `BOOKING_COM_RATE_LIMIT_PER_HOUR`
- `CRUISE_FTP_SYNC_CRON`

The current `apps/api/.env.example` does not fully reflect all of the vars above. Treat the code paths listed in this document as the more reliable setup reference.

## Provider Notes

### Traveltek

Tailfire uses two separate Traveltek integration patterns.

FusionAPI:

- Module: `apps/api/src/cruise-booking/`
- Purpose: real-time cruise search, rate codes, cabin grades, specific cabins, basket operations, booking creation, and booking import preview/confirm
- Current controller routes:
  - `POST /cruise-booking/search`
  - `GET /cruise-booking/rates`
  - `GET /cruise-booking/cabin-grades`
  - `GET /cruise-booking/cabins`
  - `POST /cruise-booking/basket`
  - `GET /cruise-booking/basket/:sessionId`
  - `DELETE /cruise-booking/basket/:sessionId/:itemkey`
  - `POST /cruise-booking/book`
  - `GET /cruise-booking/proposal/:activityId`
  - `DELETE /cruise-booking/session/:sessionId`
  - `POST /cruise-booking/import/preview`
  - `POST /cruise-booking/import/confirm`
- Auth model: guarded API routes for authenticated back-office users; controller comments also describe planned agent/client/OTA flows
- Operational detail: `TraveltekAuthService` caches OAuth tokens and passes the returned token as `requestid` alongside `sid`

FTP catalog import:

- Module: `apps/api/src/cruise-import/`
- Purpose: ingest Traveltek cruise catalog files into the catalog schema
- Current controller routes:
  - `POST /cruise-import/sync`
  - `POST /cruise-import/sync/dry-run`
  - `GET /cruise-import/sync/status`
  - `GET /cruise-import/sync/history`
  - `POST /cruise-import/sync/cancel`
  - `GET /cruise-import/test-connection`
  - `GET /cruise-import/available-years`
  - `POST /cruise-import/purge`
  - `GET /cruise-import/storage-stats`
  - `GET /cruise-import/cache-stats`
  - `POST /cruise-import/cache/clear`
  - `GET /cruise-import/cleanup/preview`
  - `POST /cruise-import/cleanup`
  - `GET /cruise-import/stubs-report`
  - `GET /cruise-import/coverage-stats`
- Auth model: `@Public()` plus `InternalApiKeyGuard` using `x-internal-api-key`
- Operational detail: the importer supports delta sync, cancellation, cleanup, and a scheduled cron-driven sync path

### Globus

Tailfire uses Globus in two ways.

Live WebAPI proxy:

- Module: `apps/api/src/globus/`
- Purpose: real-time search, departures, filter keywords, and promotions
- Routes:
  - `GET /globus/search`
  - `GET /globus/tours`
  - `GET /globus/tours/:tourCode/departures`
  - `GET /globus/filters/locations`
  - `GET /globus/filters/styles`
  - `GET /globus/promotions`
- Auth model: `@Public()` with `CatalogAuthGuard` and `CatalogThrottleGuard`; supports catalog JWT or `x-catalog-api-key`
- Operational detail: no DB persistence in this layer; responses are cached in memory with 5-minute, 10-minute, or 24-hour TTLs depending on endpoint

Catalog import:

- Module: `apps/api/src/tour-import/`
- Purpose: full tour sync plus tour media and hotel media hydration
- Routes:
  - `POST /tour-import/sync`
  - `POST /tour-import/sync/dry-run`
  - `GET /tour-import/sync/status`
  - `GET /tour-import/brands`
- Auth model: `@Public()` plus `InternalApiKeyGuard`
- Import provider behavior:
  - `GetExternalContentApiFile` for full catalog payloads
  - `GetTourMedia` for long-form tour content
  - `GetBasicHotelMedia` for hotel data

### Amadeus

Amadeus is the broadest single provider family in the current codebase. One client ID and secret pair is reused across multiple provider registrations.

Current Amadeus-backed surfaces:

- Flight status fallback and airport keyword search under `apps/api/src/external-apis/providers/aerodatabox/aerodatabox.controller.ts`
- Flight offers search under `apps/api/src/external-apis/providers/flights/flights-offers.controller.ts`
- Hotel fallback search and pricing merge under `apps/api/src/external-apis/providers/hotels/hotels.controller.ts`
- Activities search under `apps/api/src/external-apis/providers/activities/activities.controller.ts`
- Transfers search under `apps/api/src/external-apis/providers/transfers/transfers.controller.ts`

Current routes:

- `GET /external-apis/flights/search`
- `GET /external-apis/flights/airports/search`
- `GET /external-apis/flights/offers/search`
- `GET /external-apis/hotels/search`
- `GET /external-apis/hotels/lookup`
- `GET /external-apis/hotels/:id`
- `GET /external-apis/activities/search`
- `GET /external-apis/transfers/search`

Operational detail:

- `AmadeusAuthService` performs OAuth client-credentials token exchange and token caching.
- The hotel stack composes Amadeus with Google Places rather than exposing it as the only hotel provider.
- Flight status is secondary to AeroDataBox in the provider fallback chain, but Amadeus is still used directly for airport keyword search and offer shopping.

### AeroDataBox

- Module: `apps/api/src/external-apis/providers/aerodatabox/`
- Purpose: primary flight-status provider plus airport lookup by IATA/ICAO code
- Routes:
  - `GET /external-apis/flights/search`
  - `GET /external-apis/flights/airports/:code`
  - `GET /external-apis/flights/:flightNumber`
  - `GET /external-apis/flights/health/check`
- Auth model: `@AdminOnly()`
- Operational detail: the provider registers in the `flights` category and can be selected explicitly or through the registry fallback chain

### Google Places

- Module: `apps/api/src/external-apis/providers/google-places/`
- Purpose: primary hotel search, hotel lookup, hotel details, hotel photo import, and non-provider geocoding fallback
- Routes:
  - `GET /external-apis/hotels/search`
  - `GET /external-apis/hotels/lookup`
  - `GET /external-apis/hotels/:id`
  - `POST /external-apis/hotels/photos/import`
- Internal use:
  - `apps/api/src/trips/geocoding.service.ts` uses Google Places text search as the last location-resolution fallback
  - `apps/api/src/automation/processors/enrichment.processor.ts` resolves Google Places credentials for enrichment workflows
- Operational detail: `HotelsController` treats Google Places as the primary hotel provider, with Amadeus layered in for fallback and pricing merge

### Booking.com DataCrawler

- Module: `apps/api/src/external-apis/providers/booking-com/`
- Purpose: amenity enrichment for a hotel already identified through Google Places
- Route:
  - `GET /external-apis/hotels/:placeId/enrich`
- Operational detail:
  - the provider does not drive primary hotel search
  - matching is coordinate- and name-based before Tailfire pulls facilities, policies, and check-in/check-out data
  - current route wiring still asks `ApiCredentialsService` for a database credential record instead of using `CredentialResolverService`

### Unsplash

- Module: `apps/api/src/unsplash/`
- Purpose: stock-photo search for itinerary/activity media workflows
- Routes:
  - `GET /unsplash/status`
  - `GET /unsplash/search`
- Primary consumer:
  - `apps/admin/src/components/unsplash-picker.tsx`
- Operational detail: the service keeps a short in-memory cache and assumes the default Unsplash production limit is low enough that callers should avoid chatty query patterns

### OpenAI

- Modules:
  - provider: `apps/api/src/external-apis/providers/openai/`
  - OCR orchestration: `apps/api/src/ocr/`
  - import workflow: `apps/api/src/ocr-import/`
- Purpose: document-type detection and structured extraction for flight, hotel, cruise, transportation, dining, package, and passport documents
- User-facing API entry points:
  - `POST /ocr-import/preview`
  - `POST /ocr-import/confirm`
  - `GET /ocr-import/status/:jobId`
  - `GET /ocr-import/runbooks`
  - `POST /ocr-import/runbooks`
- Operational detail:
  - `OpenAiProvider` calls the OpenAI SDK directly and currently hardcodes model `gpt-4o`
  - `OcrService` converts PDFs to page images, detects the document type, then runs type-specific extraction prompts with Zod validation

## Current Consumers In This Repo

Admin app usage confirmed in the current tree:

- `apps/admin/src/hooks/use-flights.ts`
- `apps/admin/src/hooks/use-hotels.ts`
- `apps/admin/src/hooks/use-external-apis.ts`
- `apps/admin/src/hooks/use-tour-library.ts`
- `apps/admin/src/hooks/use-cruise-sync.ts`
- `apps/admin/src/hooks/use-import-booking.ts`
- `apps/admin/src/components/unsplash-picker.tsx`
- `apps/admin/src/app/settings/api-credentials/`

These hooks and pages are the most useful frontend-side reference when you need to understand how a provider is consumed in practice.

## What This Doc Does Not Cover

This document is limited to the currently wired external provider surface. It does not attempt to document every vendor account, contract, or business process outside the codebase, and it does not treat historical plan/spec files as canonical setup instructions.
