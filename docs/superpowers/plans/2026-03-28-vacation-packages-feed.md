# Vacation Packages Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data pipeline from Softvoyage VCO into Tailfire, providing all-inclusive vacation package catalog, real-time pricing via Playwright, and SerpAPI enrichment — consumed by both the OTA storefront and admin dashboard.

**Architecture:** Four NestJS modules (vacation-import, vacation-repository, softvoyage, vacation-enrichment) following existing cruise/tour catalog patterns. Catalog data from VCO JSON APIs synced via daily cron. Live pricing via async BullMQ queue + Playwright headless browser. Lazy per-hotel enrichment via existing ENRICHMENT queue + SerpAPI.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL (Supabase, catalog schema + public schema), BullMQ, Redis, Playwright, Cheerio, SerpAPI

**Spec:** `docs/superpowers/specs/2026-03-28-vacation-packages-feed-design.md`

**PoC Reference:** `/Users/alguertin/Development/tailfire-project/all-inclusive-feed/src/` contains validated PoC scripts.

---

## Phase 1: Database Schema + Migration

### Task 1: Catalog Schema Tables (Drizzle)

Creates all vacation catalog tables in the `catalog` schema, following the exact pattern from `tours.schema.ts` and `cruise-sailings.schema.ts`.

**Files:**
- Create: `packages/database/src/schema/vacation-gateways.schema.ts`
- Create: `packages/database/src/schema/vacation-destinations.schema.ts`
- Create: `packages/database/src/schema/vacation-hotels.schema.ts`
- Create: `packages/database/src/schema/vacation-gateway-destinations.schema.ts`
- Create: `packages/database/src/schema/vacation-tour-operators.schema.ts`
- Create: `packages/database/src/schema/vacation-sync-history.schema.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create vacation-gateways.schema.ts**

```typescript
import { uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationGateways = catalogSchema.table(
  'vacation_gateways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    airportCode: varchar('airport_code', { length: 4 }).notNull(),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_gateways_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationGateway = typeof vacationGateways.$inferSelect
export type NewVacationGateway = typeof vacationGateways.$inferInsert
```

Import `unique` from `drizzle-orm/pg-core` at the top.

- [ ] **Step 2: Create vacation-destinations.schema.ts**

```typescript
import { uuid, varchar, boolean, timestamp, integer } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationDestinations = catalogSchema.table(
  'vacation_destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    name: varchar('name', { length: 500 }).notNull(),
    countryCode: varchar('country_code', { length: 2 }),
    countryName: varchar('country_name', { length: 255 }),
    regionGroup: varchar('region_group', { length: 100 }),
    availableDurations: integer('available_durations').array(),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_destinations_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationDestination = typeof vacationDestinations.$inferSelect
export type NewVacationDestination = typeof vacationDestinations.$inferInsert
```

- [ ] **Step 3: Create vacation-hotels.schema.ts**

```typescript
import { uuid, varchar, integer, boolean, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'
import { vacationDestinations } from './vacation-destinations.schema'

export const vacationHotels = catalogSchema.table(
  'vacation_hotels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    destinationId: uuid('destination_id').references(() => vacationDestinations.id),
    name: varchar('name', { length: 500 }).notNull(),
    starRating: integer('star_rating'),
    hotelChain: varchar('hotel_chain', { length: 255 }),
    imageUrl: varchar('image_url', { length: 1000 }),
    amenities: jsonb('amenities').$type<Record<string, boolean>>(),
    monarcRating: numeric('monarc_rating', { precision: 3, scale: 2 }),
    monarcReviewCount: integer('monarc_review_count'),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_hotels_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationHotel = typeof vacationHotels.$inferSelect
export type NewVacationHotel = typeof vacationHotels.$inferInsert
```

- [ ] **Step 4: Create vacation-gateway-destinations.schema.ts**

```typescript
import { uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'
import { vacationGateways } from './vacation-gateways.schema'
import { vacationDestinations } from './vacation-destinations.schema'

export const vacationGatewayDestinations = catalogSchema.table(
  'vacation_gateway_destinations',
  {
    gatewayId: uuid('gateway_id').notNull().references(() => vacationGateways.id),
    destinationId: uuid('destination_id').notNull().references(() => vacationDestinations.id),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.gatewayId, table.destinationId] }),
  })
)
```

- [ ] **Step 5: Create vacation-tour-operators.schema.ts**

```typescript
import { uuid, varchar, boolean } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationTourOperators = catalogSchema.table(
  'vacation_tour_operators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    code: varchar('code', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }),
    supplierId: uuid('supplier_id'),
    isActive: boolean('is_active').default(true),
  },
  (table) => ({
    providerUnique: unique('vacation_tour_operators_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationTourOperator = typeof vacationTourOperators.$inferSelect
export type NewVacationTourOperator = typeof vacationTourOperators.$inferInsert
```

- [ ] **Step 6: Create vacation-sync-history.schema.ts**

```typescript
import { uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationSyncHistory = catalogSchema.table(
  'vacation_sync_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).default('softvoyage'),
    status: varchar('status', { length: 50 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metrics: jsonb('metrics').$type<{
      gatewaysFound?: number
      gatewaysSynced?: number
      destinationsFound?: number
      destinationsSynced?: number
      hotelsFound?: number
      hotelsInserted?: number
      hotelsUpdated?: number
      hotelsUnchanged?: number
      hotelsSoftDeleted?: number
    }>(),
    errors: jsonb('errors').$type<Array<{ message: string; context?: string }>>(),
  }
)

export type VacationSyncHistoryRecord = typeof vacationSyncHistory.$inferSelect
```

- [ ] **Step 7: Add exports to schema/index.ts**

Add these lines in the catalog section of `packages/database/src/schema/index.ts`:

```typescript
// Vacation package catalog
export * from './vacation-gateways.schema'
export * from './vacation-destinations.schema'
export * from './vacation-hotels.schema'
export * from './vacation-gateway-destinations.schema'
export * from './vacation-tour-operators.schema'
export * from './vacation-sync-history.schema'
```

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/schema/vacation-*.schema.ts packages/database/src/schema/index.ts
git commit -m "feat(database): add vacation catalog schema tables"
```

### Task 2: Public Schema Tables (Drizzle)

Enrichment and bridging tables in the `public` schema (writable in all environments).

**Files:**
- Create: `packages/database/src/schema/vacation-hotel-enrichment.schema.ts`
- Create: `packages/database/src/schema/destination-vacation-destinations.schema.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create vacation-hotel-enrichment.schema.ts**

```typescript
import { uuid, varchar, integer, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { pgTable, unique } from 'drizzle-orm/pg-core'

export const vacationHotelEnrichment = pgTable(
  'vacation_hotel_enrichment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    googlePlaceId: varchar('google_place_id', { length: 255 }),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    formattedAddress: varchar('formatted_address', { length: 1000 }),
    googleRating: numeric('google_rating', { precision: 2, scale: 1 }),
    googleReviewCount: integer('google_review_count'),
    tripadvisorRating: numeric('tripadvisor_rating', { precision: 2, scale: 1 }),
    tripadvisorReviewCount: integer('tripadvisor_review_count'),
    tripadvisorLink: varchar('tripadvisor_link', { length: 1000 }),
    website: varchar('website', { length: 1000 }),
    phone: varchar('phone', { length: 100 }),
    photos: jsonb('photos').$type<string[]>(),
    rawData: jsonb('raw_data'),
    enrichedAt: timestamp('enriched_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    hotelIdUnique: unique('vacation_hotel_enrichment_hotel_unique').on(table.hotelId),
  })
)

export type VacationHotelEnrichmentRecord = typeof vacationHotelEnrichment.$inferSelect
export type NewVacationHotelEnrichmentRecord = typeof vacationHotelEnrichment.$inferInsert
```

Note: `hotelId` has no FK constraint because the referenced table is in the `catalog` schema (FDW). This matches the `destination_ports` pattern.

- [ ] **Step 2: Create destination-vacation-destinations.schema.ts**

```typescript
import { uuid, varchar, numeric, boolean, primaryKey } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { destinations } from './destinations.schema'

export const destinationVacationDestinations = pgTable(
  'destination_vacation_destinations',
  {
    destinationId: uuid('destination_id').notNull().references(() => destinations.id),
    vacationDestinationId: uuid('vacation_destination_id').notNull(),
    matchMethod: varchar('match_method', { length: 50 }).notNull(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).default('1.0'),
    isPrimary: boolean('is_primary').default(true),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.destinationId, table.vacationDestinationId] }),
  })
)
```

- [ ] **Step 3: Add exports to schema/index.ts**

Add in the appropriate section of `packages/database/src/schema/index.ts`:

```typescript
// Vacation enrichment and bridging (public schema)
export * from './vacation-hotel-enrichment.schema'
export * from './destination-vacation-destinations.schema'
```

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/schema/vacation-hotel-enrichment.schema.ts packages/database/src/schema/destination-vacation-destinations.schema.ts packages/database/src/schema/index.ts
git commit -m "feat(database): add vacation enrichment and bridging tables (public schema)"
```

### Task 3: Generate and Run Migration

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_create_vacation_package_tables.sql` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
cd apps/api && pnpm db:generate
```

Review the generated SQL migration file. It should create:
- `catalog.vacation_gateways`
- `catalog.vacation_destinations`
- `catalog.vacation_hotels`
- `catalog.vacation_gateway_destinations`
- `catalog.vacation_tour_operators`
- `catalog.vacation_sync_history`
- `public.vacation_hotel_enrichment`
- `public.destination_vacation_destinations`

- [ ] **Step 2: Run migration locally**

```bash
cd apps/api && pnpm db:migrate
```

Verify no errors.

- [ ] **Step 3: Commit migration**

```bash
git add packages/database/src/migrations/
git commit -m "feat(database): migration for vacation package tables"
```

---

## Phase 2: VCO Catalog Client + Import Module

### Task 4: Softvoyage Catalog Client Service

HTTP client for VCO JSON APIs. Fetches gateways, destinations, hotels. No session needed. Reference the PoC at `all-inclusive-feed/src/poc-vco-catalog.ts` for validated parsing logic.

**Files:**
- Create: `apps/api/src/vacation-import/services/softvoyage-catalog-client.service.ts`

- [ ] **Step 1: Create the service**

The service must:
- Inject `ConfigService` and `HttpService` (from `@nestjs/axios`)
- Read `SOFTVOYAGE_VCO_BASE_URL`, `SOFTVOYAGE_VCO_CODE_AG`, `SOFTVOYAGE_VCO_ALIAS` from config
- Implement `fetchGateways()`: calls `ajax.cgi?action=getPackagesGateways`, parses `"CityName--xx--AirportCode"` format, returns `{ name, airportCode }[]`
- Implement `fetchDestinations(gatewayCode)`: calls `ajax.cgi?action=getPackagesDestinations`, parses the complex `"Name--xx--Name xxxIDSxxxCOUNTRY_CODES--xx--DURATIONS"` format, returns `{ name, id, countryCode, durations, regionGroup, isGroup }[]`
- Implement `fetchHotels(gatewayCode, destIds)`: calls `ajax.cgi?action=getPackagesHotels`, parses `"Name--xx--ID"` format, returns `{ name, id }[]`

Use `firstValueFrom` from `rxjs` with `this.httpService.get()`. Parse responses as JSON. Reference PoC parsing logic for the `--xx--` and `xxx` delimiters.

- [ ] **Step 2: Write tests for the parsing logic**

Create `apps/api/src/vacation-import/services/__tests__/softvoyage-catalog-client.service.spec.ts`. Test each parser with sample VCO responses saved from the PoC. Focus on:
- Gateway parsing: input `[{"gateways":["Toronto--xx--YYZ","Montreal--xx--YUL"]}]` → correct objects
- Destination parsing: individual vs. group entries, country code extraction
- Hotel parsing: simple name/id extraction

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm test -- --testPathPattern=softvoyage-catalog-client
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/vacation-import/
git commit -m "feat(api): softvoyage catalog client service with VCO JSON API integration"
```

### Task 5: Change Detector Service

Computes SHA256 content hashes and determines insert/update/skip/soft-delete actions.

**Files:**
- Create: `apps/api/src/vacation-import/services/change-detector.service.ts`

- [ ] **Step 1: Create the service**

The service must:
- `computeHash(data: Record<string, unknown>): string` — JSON.stringify + createHash('sha256')
- `detectChanges<T>(incoming: T[], existing: Map<string, { id: string; contentHash: string }>, hashFn: (item: T) => string, keyFn: (item: T) => string): { toInsert: T[]; toUpdate: { item: T; existingId: string }[]; unchanged: string[]; toDeactivate: string[] }`

The `toDeactivate` set is the existing IDs not seen in the incoming set.

- [ ] **Step 2: Write tests**

Test with sample data: 3 existing records (one unchanged, one changed, one missing from incoming), plus 1 new incoming record. Verify correct categorization.

- [ ] **Step 3: Run tests, commit**

```bash
cd apps/api && pnpm test -- --testPathPattern=change-detector
git add apps/api/src/vacation-import/
git commit -m "feat(api): change detector service for vacation catalog sync"
```

### Task 6: Import Orchestrator Service

Orchestrates the full catalog sync: acquire lock, fetch data, detect changes, upsert/deactivate, record metrics.

**Files:**
- Create: `apps/api/src/vacation-import/services/vacation-import-orchestrator.service.ts`

- [ ] **Step 1: Create the orchestrator**

Follow the pattern from `import-orchestrator.service.ts` (cruise) and `tour-import.service.ts`. The service must:
- Inject `DatabaseService`, `ConfigService`, `SoftvoyageCatalogClientService`, `ChangeDetectorService`
- Implement `runSync(options?: { dryRun?: boolean })`:
  1. Check environment guard (`API_URL` must include `api.tailfire.ca` unless `BYPASS_SYNC_ENVIRONMENT_GUARD`)
  2. Acquire advisory lock via `SELECT pg_try_advisory_lock(hashtext('vacation_catalog_sync'))` — if lock fails, log and return (another instance is running)
  3. Create `vacation_sync_history` record with status `'running'`
  4. Fetch all gateways via catalog client
  5. For each gateway: fetch destinations, then hotels per destination
  6. Use change detector to compute inserts/updates/deactivations
  7. If not dry run: execute upserts via Drizzle `onConflictDoUpdate`
  8. Rebuild `vacation_gateway_destinations` junction per gateway (delete + re-insert)
  9. Soft-delete stale records (set `isActive = false`)
  10. Update sync history with status `'completed'` and metrics
  11. Release advisory lock via `SELECT pg_advisory_unlock(hashtext('vacation_catalog_sync'))`
  12. On error: update sync history to `'failed'`, release lock, log error
- Implement `getSyncStatus()`: returns latest sync history record
- Decorate scheduled method with `@Cron('0 4 * * *', { timeZone: 'America/Toronto' })` — gated by `ENABLE_VACATION_CATALOG_SYNC` config

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/vacation-import/
git commit -m "feat(api): vacation import orchestrator with advisory lock and change detection"
```

### Task 7: Import Controller + Module Wiring

**Files:**
- Create: `apps/api/src/vacation-import/vacation-import.controller.ts`
- Create: `apps/api/src/vacation-import/vacation-import.module.ts`
- Modify: `apps/api/src/app.module.ts` — import `VacationImportModule`

- [ ] **Step 1: Create controller**

Three endpoints, all guarded by `InternalApiKeyGuard`:
- `POST /vacation-import/sync` → calls `orchestrator.runSync()`
- `POST /vacation-import/sync/dry-run` → calls `orchestrator.runSync({ dryRun: true })`
- `GET /vacation-import/sync/status` → calls `orchestrator.getSyncStatus()`

Reference `apps/api/src/cruise-import/cruise-import.controller.ts` for exact patterns.

- [ ] **Step 2: Create module**

```typescript
@Module({
  imports: [ConfigModule, HttpModule.register({ timeout: 30000, maxRedirects: 3 })],
  controllers: [VacationImportController],
  providers: [VacationImportOrchestratorService, SoftvoyageCatalogClientService, ChangeDetectorService],
  exports: [VacationImportOrchestratorService],
})
export class VacationImportModule {}
```

- [ ] **Step 3: Register in app.module.ts**

Add `VacationImportModule` to the imports array in `apps/api/src/app.module.ts`.

- [ ] **Step 4: Test the sync endpoint manually**

```bash
cd apps/api && pnpm dev
# In another terminal:
curl -X POST http://localhost:3101/api/v1/vacation-import/sync/dry-run -H 'x-internal-api-key: <your-key>'
```

Verify it returns sync metrics (dry run — no DB writes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/vacation-import/ apps/api/src/app.module.ts
git commit -m "feat(api): vacation import controller, module, and app.module wiring"
```

---

## Phase 3: Vacation Repository Module

### Task 8: Vacation Repository Service

Read-only query layer over catalog tables. Follows `cruise-repository.service.ts` pattern.

**Files:**
- Create: `apps/api/src/vacation-repository/vacation-repository.service.ts`
- Create: `apps/api/src/vacation-repository/dto/vacation-search.dto.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// vacation-search.dto.ts
export class VacationHotelSearchDto {
  q?: string
  page?: number        // default 1
  pageSize?: number    // max 50
  gatewayCode?: string
  destinationId?: string
  minStars?: number
  maxStars?: number
  amenities?: string[] // e.g., ['beach', 'spa']
  sortBy?: 'name' | 'starRating' | 'monarcRating'
  sortDir?: 'asc' | 'desc'
}

export class VacationHotelSearchResponseDto {
  items: VacationHotelSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface VacationHotelSummary {
  id: string
  name: string
  destination: string
  starRating: number
  imageUrl: string
  amenities: Record<string, boolean>
  monarcRating: string | null
  monarcReviewCount: number | null
}

export interface VacationHotelDetail extends VacationHotelSummary {
  hotelChain: string | null
  enrichment: VacationEnrichmentData | null
}

export interface VacationEnrichmentData {
  googleRating: string | null
  googleReviewCount: number | null
  tripadvisorRating: string | null
  tripadvisorReviewCount: number | null
  tripadvisorLink: string | null
  latitude: string | null
  longitude: string | null
  address: string | null
  website: string | null
  phone: string | null
  photos: string[]
  enrichedAt: string | null
  isStale: boolean
}
```

- [ ] **Step 2: Create repository service**

The service must:
- Inject `DatabaseService`
- `listGateways()`: SELECT from `vacationGateways` WHERE `isActive = true`, ordered by name
- `listDestinations(gatewayId?)`: SELECT from `vacationDestinations` WHERE `isActive = true`, optionally filtered via `vacationGatewayDestinations` join
- `searchHotels(dto: VacationHotelSearchDto)`: paginated search with ILIKE text search, star/amenity/destination filters, capped at 50 per page. Follow `cruise-repository.service.ts` query building pattern
- `getHotelDetail(id: string)`: LEFT JOIN with `vacationHotelEnrichment` to include enrichment data. Check `expiresAt` to set `isStale` flag. If enrichment missing or stale, return the data anyway (enrichment is dispatched separately)
- `getFilterOptions()`: distinct star ratings, destinations, amenities from active hotels

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/vacation-repository/
git commit -m "feat(api): vacation repository service with search, filters, and enrichment merge"
```

### Task 9: Vacation Repository Controller + Module

**Files:**
- Create: `apps/api/src/vacation-repository/vacation-repository.controller.ts`
- Create: `apps/api/src/vacation-repository/vacation-repository.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create controller**

Five endpoints, all guarded by `CatalogAuthGuard` and `CatalogThrottleGuard`:
- `GET /vacation-repository/gateways`
- `GET /vacation-repository/destinations` (query param: `?gatewayId=`)
- `GET /vacation-repository/hotels` (search params as query)
- `GET /vacation-repository/hotels/:id`
- `GET /vacation-repository/filters`

Reference `cruise-repository.controller.ts` for exact guard decorators.

- [ ] **Step 2: Create module and register in app.module**

```typescript
@Module({
  imports: [ConfigModule],
  controllers: [VacationRepositoryController],
  providers: [VacationRepositoryService],
  exports: [VacationRepositoryService],
})
export class VacationRepositoryModule {}
```

Add to `app.module.ts` imports.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/vacation-repository/ apps/api/src/app.module.ts
git commit -m "feat(api): vacation repository controller and module with catalog browse endpoints"
```

---

## Phase 4: Live Pricing (Softvoyage + Playwright + BullMQ)

### Task 10: Add Playwright Dependency

**Files:**
- Modify: `apps/api/package.json`
- Modify: `Dockerfile` (if Playwright needs different Chromium setup than puppeteer-core)

- [ ] **Step 1: Install Playwright**

```bash
cd apps/api && pnpm add playwright-core
```

Note: The Dockerfile already installs Chromium via puppeteer. Playwright can use the same Chromium binary via `executablePath`. Check the current Chromium path in `puppeteer-pdf.service.ts` — it uses `process.env.PUPPETEER_EXECUTABLE_PATH` or `/usr/bin/chromium`. Playwright will use the same path.

- [ ] **Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add playwright-core dependency for vacation pricing"
```

### Task 11: Softvoyage Result Parser Service

Parses VCO HTML search results into structured data using Cheerio. This is the validated PoC logic from `all-inclusive-feed/src/poc-parse-results.ts` adapted for NestJS.

**Files:**
- Create: `apps/api/src/softvoyage/softvoyage-result-parser.service.ts`

- [ ] **Step 1: Create parser service**

The service must:
- Be `@Injectable()`
- Implement `parseResults(html: string): VacationSearchResult[]`
- Parse `div[id^="result-"]` elements (VCO structure, NOT `table[id^="hotel-"]` which is VCM)
- Extract per hotel: id, name, destination, starRating, imageUrl, monarcRating, monarcReviewCount, amenities
- Extract per package option: roomType, mealPlan, nights, tourOperator, departureDate, flightNumber, departureTime, arrivalTime, baggage, basePrice, taxes, totalPrice, grandTotal
- Return typed `VacationSearchResult[]`

Reference the PoC at `all-inclusive-feed/src/poc-parse-results.ts` for the exact Cheerio selectors that work against VCM HTML. Adapt for VCO structure (which uses `div#result-{id}` instead of `table#hotel-{id}`).

Add `cheerio` as dependency: `cd apps/api && pnpm add cheerio`

- [ ] **Step 2: Write parser tests with saved HTML snapshots**

Save a copy of VCO results HTML (from `all-inclusive-feed/debug-vcm-results.html`) as a test fixture. Write tests verifying:
- Correct number of hotels parsed
- First hotel has expected name, destination, star rating
- Package options have prices extracted correctly

- [ ] **Step 3: Run tests, commit**

```bash
cd apps/api && pnpm test -- --testPathPattern=softvoyage-result-parser
git add apps/api/src/softvoyage/
git commit -m "feat(api): softvoyage HTML result parser with Cheerio"
```

### Task 12: Browser Pool Service

Manages a pool of reusable Playwright browser instances.

**Files:**
- Create: `apps/api/src/softvoyage/softvoyage-browser-pool.service.ts`

- [ ] **Step 1: Create browser pool service**

The service must:
- Inject `ConfigService`
- Read `VACATION_BROWSER_POOL_SIZE` (default 2) and `ENABLE_VACATION_LIVE_PRICING`
- Maintain an array of `{ browser: Browser; page: Page; useCount: number }` instances
- `acquireBrowser(): Promise<Page>` — return an available page from the pool. If none available and pool < max, launch a new one. If pool full, wait (bounded queue)
- `releaseBrowser(page: Page)` — mark page as available, increment useCount, recycle if useCount > 50
- `onModuleDestroy()` — close all browsers
- Launch Chromium with `executablePath` from env (same as puppeteer-pdf.service.ts uses), headless mode, `--no-sandbox`, `--disable-gpu`
- DO NOT launch browsers at startup. Only launch on first `acquireBrowser()` call

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/softvoyage/
git commit -m "feat(api): playwright browser pool service for VCO pricing"
```

### Task 13: VACATION_SEARCH Queue + Processor

Register the new queue and create the search processor.

**Files:**
- Modify: `apps/api/src/automation/automation.types.ts` — add `VACATION_SEARCH` to `QUEUES` and new job type
- Modify: `apps/api/src/automation/automation.module.ts` — register new queue
- Modify: `apps/api/src/automation/admin/bull-board.setup.ts` — add queue to Bull Board
- Create: `apps/api/src/softvoyage/softvoyage-search.processor.ts`

- [ ] **Step 1: Add queue and job type constants**

In `automation.types.ts`, add to `QUEUES`:
```typescript
VACATION_SEARCH: 'vacation-search',
```

Add to `JOB_TYPES`:
```typescript
VACATION_SEARCH: 'vacation_search',
VACATION_HOTEL_ENRICHMENT: 'vacation_hotel_enrichment',
```

Add job data interface:
```typescript
export interface VacationSearchJobData {
  gatewayCode: string
  destDep: string
  dateDep: string // YYYYMMDD
  duration: string
  nbAdults: number
  nbRooms: number
  allInclusive: boolean
  cacheKey: string
}
```

- [ ] **Step 2: Register queue in automation.module.ts**

Add to `BullModule.registerQueue()`:
```typescript
{
  name: QUEUES.VACATION_SEARCH,
  defaultJobOptions: {
    removeOnComplete: { age: 900 }, // 15 min, aligned with cache TTL
    removeOnFail: { age: 3600 },    // 1 hour
  },
},
```

Add `SoftvoyageSearchProcessor` to providers.

- [ ] **Step 3: Add to Bull Board**

In `bull-board.setup.ts`, add the new queue to the board registration alongside existing queues.

- [ ] **Step 4: Create search processor**

The processor must:
- `@Processor(QUEUES.VACATION_SEARCH)` + extends `WorkerHost`
- Inject `SoftvoyageBrowserPoolService`, `SoftvoyageResultParserService`, `ConfigService`, and Redis client (via `@InjectRedis()` or `ConfigService` + `ioredis`)
- `async process(job: Job<VacationSearchJobData>)`:
  1. Acquire page from browser pool
  2. Navigate to `${VCO_BASE_URL}/querypackage.cgi?code_ag=${CODE_AG}&alias=${ALIAS}&language=en`
  3. Use `page.evaluate()` to set form values and submit (same pattern as PoC)
  4. Wait for results page to load (`page.waitForSelector('[id^="result-"]', { timeout: 15000 })`)
  5. Get page HTML via `page.content()`
  6. Release page back to pool
  7. Parse HTML via `SoftvoyageResultParserService`
  8. Store results in Redis with key `job.data.cacheKey` and TTL from config
  9. Return `{ cacheKey: job.data.cacheKey, resultCount: results.length }`
- Error handling: release browser page in `finally` block, fall back to VCM if VCO fails

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/automation/ apps/api/src/softvoyage/
git commit -m "feat(api): VACATION_SEARCH queue, processor, and Bull Board registration"
```

### Task 14: Softvoyage Controller + Service + Module

The REST API layer for submitting searches and polling results.

**Files:**
- Create: `apps/api/src/softvoyage/softvoyage.service.ts`
- Create: `apps/api/src/softvoyage/softvoyage.controller.ts`
- Create: `apps/api/src/softvoyage/softvoyage.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create softvoyage service**

The service must:
- Inject `@InjectQueue(QUEUES.VACATION_SEARCH)` and Redis client
- `async submitSearch(params): Promise<{ cached: true; results } | { cached: false; jobId: string }>`:
  1. Compute `paramsHash` = SHA256 of sorted params JSON
  2. Compute `timestampBucket` = `Math.floor(Date.now() / (CACHE_TTL_MS))`
  3. Check Redis for key `vco:search:${paramsHash}` — if hit, return cached results
  4. Compute `jobId` = `vco-search-${paramsHash}-${timestampBucket}`
  5. Check if job already exists and is active (waiting/active state)
  6. If exists: return `{ cached: false, jobId }`
  7. If not: add job to queue with the jobId, return `{ cached: false, jobId }`
- `async getSearchResults(jobId): Promise<{ status: 'processing' | 'completed' | 'failed'; results? }>`:
  1. Get job from queue by ID
  2. If completed: read cached results from Redis using the cacheKey from job return value
  3. If active/waiting: return `{ status: 'processing' }`
  4. If failed: return `{ status: 'failed' }`

- [ ] **Step 2: Create controller**

- `POST /softvoyage/search` — calls `submitSearch()`. Returns 200 with results if cache hit, 202 with `{ jobId }` if queued
- `GET /softvoyage/search/:jobId` — calls `getSearchResults()`. Returns 200 with results if done, 202 if still processing

Guards: `CatalogAuthGuard`, `CatalogThrottleGuard`

- [ ] **Step 3: Create module and register**

```typescript
@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: QUEUES.VACATION_SEARCH })],
  controllers: [SoftvoyageController],
  providers: [SoftvoyageService, SoftvoyageBrowserPoolService, SoftvoyageResultParserService, SoftvoyageSearchProcessor],
  exports: [SoftvoyageService],
})
export class SoftvoyageModule {}
```

Add to `app.module.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/softvoyage/ apps/api/src/app.module.ts
git commit -m "feat(api): softvoyage live pricing module with async search and polling"
```

---

## Phase 5: Enrichment Integration

### Task 15: Update Existing Enrichment Processor (Prerequisite)

The existing enrichment processor must properly track job history.

**Files:**
- Modify: `apps/api/src/automation/processors/enrichment.processor.ts`

- [ ] **Step 1: Add job history tracking**

Add `@OnWorkerEvent('completed')` handler that calls `automationService.updateJobHistory()` with success status. Reference `trip-automation.processor.ts` for the exact pattern. Also inject `AutomationService` if not already injected.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/automation/processors/enrichment.processor.ts
git commit -m "fix(api): add job history tracking to enrichment processor on completion"
```

### Task 16: Vacation Enrichment Services

**Files:**
- Create: `apps/api/src/vacation-enrichment/services/serpapi-client.service.ts`
- Create: `apps/api/src/vacation-enrichment/services/google-places-enricher.service.ts`
- Create: `apps/api/src/vacation-enrichment/services/tripadvisor-enricher.service.ts`
- Create: `apps/api/src/vacation-enrichment/services/enrichment-dispatcher.service.ts`

- [ ] **Step 1: Create SerpAPI client**

The service must:
- Inject `ConfigService` and `HttpService`
- Read `SERPAPI_KEY` from config
- `searchGoogleMaps(query: string, ll?: string): Promise<GoogleMapsResult>` — calls `https://serpapi.com/search.json?engine=google_maps&q=...`
- `searchGoogle(query: string): Promise<GoogleSearchResult>` — calls `https://serpapi.com/search.json?engine=google&q=...`
- Reference the PoC at `all-inclusive-feed/src/poc-enrichment.ts` for exact API parameters

- [ ] **Step 2: Create Google Places enricher**

Takes hotel name + destination, calls SerpAPI Google Maps, extracts: placeId, rating, reviewCount, lat/lng, address, photos, website, phone.

- [ ] **Step 3: Create TripAdvisor enricher**

Takes hotel name + destination, searches Google for `"site:tripadvisor.com"`, extracts: rating, reviewCount, link from rich snippets.

- [ ] **Step 4: Create enrichment dispatcher**

The service must:
- Inject `@InjectQueue(QUEUES.ENRICHMENT)` queue
- `dispatchEnrichment(hotelId: string, hotelName: string, destination: string)`:
  1. Add job to ENRICHMENT queue with:
     - name: `JOB_TYPES.VACATION_HOTEL_ENRICHMENT`
     - jobId: `vacation-enrich-${hotelId}` (dedup)
     - data: `{ hotelId, hotelName, destination }`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/vacation-enrichment/
git commit -m "feat(api): vacation enrichment services (SerpAPI, Google Places, TripAdvisor, dispatcher)"
```

### Task 17: Add Vacation Enrichment to Existing Processor

**Files:**
- Modify: `apps/api/src/automation/processors/enrichment.processor.ts`
- Modify: `apps/api/src/automation/automation.module.ts` (add new providers)

- [ ] **Step 1: Add new job type handler**

In `enrichment.processor.ts`, add a new case in the `process()` switch:

```typescript
case JOB_TYPES.VACATION_HOTEL_ENRICHMENT:
  await this.handleVacationHotelEnrichment(job as Job<VacationHotelEnrichmentJobData>)
  break
```

Implement `handleVacationHotelEnrichment`:
1. Call Google Places enricher with `hotelName + destination`
2. Call TripAdvisor enricher with `hotelName + destination`
3. Download top 5 photos from Google Places → upload to Cloudflare R2 via `StorageService`
4. Upsert single row in `vacationHotelEnrichment` table with all fields
5. Set `enrichedAt = now()`, `expiresAt = now() + 30 days`

- [ ] **Step 2: Add imports and DI in automation module**

Ensure `GooglePlacesEnricherService`, `TripadvisorEnricherService`, `SerpApiClientService` are provided or imported in the automation module.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/automation/ apps/api/src/vacation-enrichment/
git commit -m "feat(api): vacation hotel enrichment job handler in enrichment processor"
```

### Task 18: Vacation Enrichment Controller + Module

**Files:**
- Create: `apps/api/src/vacation-enrichment/vacation-enrichment.controller.ts`
- Create: `apps/api/src/vacation-enrichment/vacation-enrichment.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create controller**

Two endpoints, guarded by `InternalApiKeyGuard`:
- `POST /vacation-enrichment/enrich/:hotelId` — dispatches enrichment for a specific hotel
- `GET /vacation-enrichment/stats` — returns counts: total hotels, enriched, stale, unenriched

- [ ] **Step 2: Create module and register**

```typescript
@Module({
  imports: [ConfigModule, HttpModule.register({ timeout: 30000 }), BullModule.registerQueue({ name: QUEUES.ENRICHMENT })],
  controllers: [VacationEnrichmentController],
  providers: [EnrichmentDispatcherService, SerpApiClientService, GooglePlacesEnricherService, TripadvisorEnricherService],
  exports: [EnrichmentDispatcherService],
})
export class VacationEnrichmentModule {}
```

Add to `app.module.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/vacation-enrichment/ apps/api/src/app.module.ts
git commit -m "feat(api): vacation enrichment controller and module"
```

---

## Phase 6: Enrichment Trigger in Repository + Environment Variables

### Task 19: Wire Enrichment Dispatch into Hotel Detail Endpoint

**Files:**
- Modify: `apps/api/src/vacation-repository/vacation-repository.service.ts`
- Modify: `apps/api/src/vacation-repository/vacation-repository.module.ts`

- [ ] **Step 1: Inject enrichment dispatcher into repository service**

In `getHotelDetail(id)`, after checking enrichment status:
- If enrichment is missing: call `enrichmentDispatcher.dispatchEnrichment(hotel.id, hotel.name, destination.name)`
- If enrichment is stale (`expiresAt < now()`): call dispatcher for re-enrichment
- Always return available data immediately (enrichment is async)

- [ ] **Step 2: Update module imports**

Import `VacationEnrichmentModule` into `VacationRepositoryModule` to access the dispatcher.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/vacation-repository/
git commit -m "feat(api): trigger lazy enrichment on hotel detail view"
```

### Task 20: Environment Variables + Final Wiring

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add environment variables to .env.example**

```env
# Softvoyage VCO
SOFTVOYAGE_VCO_BASE_URL=https://vco.sax.softvoyage.com/cgi-bin
SOFTVOYAGE_VCO_CODE_AG=VCO
SOFTVOYAGE_VCO_ALIAS=YAQ

# Softvoyage VCM (fallback)
SOFTVOYAGE_VCM_BASE_URL=https://vcm.sax.softvoyage.com/cgi-bin
SOFTVOYAGE_VCM_CODE_AG=VCM
SOFTVOYAGE_VCM_ALIAS=DJW

# SerpAPI
SERPAPI_KEY=

# Vacation Package Features
ENABLE_VACATION_CATALOG_SYNC=true
ENABLE_VACATION_LIVE_PRICING=true
ENABLE_VACATION_ENRICHMENT=true
VACATION_CATALOG_SYNC_CRON=0 4 * * *
VACATION_PRICING_CACHE_TTL=900
VACATION_ENRICHMENT_EXPIRY_DAYS=30
VACATION_BROWSER_POOL_SIZE=2
```

- [ ] **Step 2: Verify full build**

```bash
cd tailfire && pnpm build
```

- [ ] **Step 3: Verify type check**

```bash
cd tailfire && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/.env.example
git commit -m "feat(api): add vacation package environment variables"
```

### Task 21: FDW Setup Script Update

**Files:**
- Modify: `scripts/prod-catalog-setup.sql` — add vacation tables to the FDW foreign table imports
- Modify: `scripts/setup-local-fdw.sh` — add vacation catalog tables

- [ ] **Step 1: Add vacation tables to FDW scripts**

Follow the existing pattern in `prod-catalog-setup.sql` for how cruise/tour catalog tables are imported as foreign tables. Add:
- `catalog.vacation_gateways`
- `catalog.vacation_destinations`
- `catalog.vacation_hotels`
- `catalog.vacation_gateway_destinations`
- `catalog.vacation_tour_operators`
- `catalog.vacation_sync_history`

- [ ] **Step 2: Commit**

```bash
git add scripts/
git commit -m "feat(scripts): add vacation catalog tables to FDW setup"
```

---

## Phase 7: Monitoring & Alerting

### Task 22: Add Softvoyage VCO Health Provider

Integrates VCO availability into the existing API health monitoring system so admins get notified if VCO goes down.

**Files:**
- Modify: `apps/api/src/api-health/api-health.types.ts` — add `softvoyage_vco` provider
- Modify: `apps/api/src/api-health/api-health.service.ts` — add health check implementation

- [ ] **Step 1: Add provider to HEALTH_PROVIDERS**

In `api-health.types.ts`, add to the `HEALTH_PROVIDERS` array in the Travel section:

```typescript
{ key: 'softvoyage_vco', name: 'Softvoyage VCO', category: 'travel' },
```

- [ ] **Step 2: Add env var mapping**

In `api-health.service.ts`, add to `PROVIDER_ENV_VARS`:

```typescript
softvoyage_vco: ['SOFTVOYAGE_VCO_BASE_URL'],
```

- [ ] **Step 3: Implement health check method**

Add `checkSoftvoyageVco()` method in `api-health.service.ts` following the pattern of other provider checks:
1. Fetch `${SOFTVOYAGE_VCO_BASE_URL}/ajax.cgi?action=getPackagesGateways&code_ag=${CODE_AG}&alias=${ALIAS}&language=en`
2. Verify response is JSON with a `gateways` array
3. Return `{ success: true, responseMs }` or `{ success: false, error }`

Add the case to the main `checkProvider()` switch statement.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/api-health/
git commit -m "feat(api): add Softvoyage VCO health provider to API health monitoring"
```

### Task 23: Add VACATION_SEARCH Queue Monitoring Endpoint

Exposes queue depth and job metrics so you can monitor queue health and get alerted before problems escalate.

**Files:**
- Create: `apps/api/src/softvoyage/softvoyage-health.service.ts`
- Modify: `apps/api/src/softvoyage/softvoyage.controller.ts`

- [ ] **Step 1: Create health service**

The service must:
- Inject `@InjectQueue(QUEUES.VACATION_SEARCH)` queue
- `getQueueHealth(): Promise<VacationSearchQueueHealth>`:
  1. Get waiting count: `queue.getWaitingCount()`
  2. Get active count: `queue.getActiveCount()`
  3. Get failed count: `queue.getFailedCount()`
  4. Get completed count: `queue.getCompletedCount()`
  5. Return all counts + status assessment:
     - `status: 'healthy'` if waiting < 10
     - `status: 'degraded'` if waiting 10-25
     - `status: 'critical'` if waiting > 25

```typescript
export interface VacationSearchQueueHealth {
  status: 'healthy' | 'degraded' | 'critical'
  waiting: number
  active: number
  failed: number
  completed: number
  browserPoolSize: number
}
```

- [ ] **Step 2: Add health endpoint to controller**

Add to `softvoyage.controller.ts`:
- `GET /softvoyage/health` — returns queue health (guarded by `InternalApiKeyGuard`)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/softvoyage/
git commit -m "feat(api): vacation search queue health monitoring endpoint"
```

### Task 24: Add Sentry Alerts for Critical Conditions

Log structured warnings/errors to Sentry when monitoring thresholds are crossed, so they appear in Sentry alerts.

**Files:**
- Modify: `apps/api/src/softvoyage/softvoyage-search.processor.ts`
- Modify: `apps/api/src/vacation-import/services/vacation-import-orchestrator.service.ts`

- [ ] **Step 1: Add queue depth warning in search processor**

In the search processor's `process()` method, after acquiring a browser:

```typescript
const waitingCount = await this.vacationSearchQueue.getWaitingCount()
if (waitingCount > 10) {
  this.logger.warn({
    message: 'VACATION_SEARCH queue backing up',
    waitingCount,
    activeCount: await this.vacationSearchQueue.getActiveCount(),
    threshold: 10,
  })
}
```

Sentry captures NestJS Logger warnings automatically via `SentryModule`.

- [ ] **Step 2: Add sync duration warning in import orchestrator**

At the end of `runSync()`, if duration exceeds 10 minutes:

```typescript
const durationMs = Date.now() - startTime
if (durationMs > 10 * 60 * 1000) {
  this.logger.warn({
    message: 'Vacation catalog sync took longer than expected',
    durationMs,
    durationMinutes: Math.round(durationMs / 60000),
    metrics,
  })
}
```

- [ ] **Step 3: Add VCO failure tracking in search processor**

In the `@OnWorkerEvent('failed')` handler:

```typescript
@OnWorkerEvent('failed')
onFailed(job: Job, error: Error): void {
  this.logger.error({
    message: 'Vacation search job failed',
    jobId: job.id,
    error: error.message,
    attemptsMade: job.attemptsMade,
    gateway: job.data.gatewayCode,
    destination: job.data.destDep,
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/softvoyage/ apps/api/src/vacation-import/
git commit -m "feat(api): add Sentry-captured monitoring alerts for vacation search and sync"
```

---

## Task Dependency Summary

```
Phase 1: Schema (Tasks 1-3) — no dependencies
    ↓
Phase 2: Catalog Import (Tasks 4-7) — depends on Phase 1
    ↓
Phase 3: Repository (Tasks 8-9) — depends on Phase 1
    ↓
Phase 4: Live Pricing (Tasks 10-14) — depends on Phase 1
    ↓
Phase 5: Enrichment (Tasks 15-18) — depends on Phase 1, 3
    ↓
Phase 6: Wiring (Tasks 19-21) — depends on Phases 3, 5
    ↓
Phase 7: Monitoring (Tasks 22-24) — depends on Phases 4, 6
```

Phases 2, 3, and 4 can be built in parallel after Phase 1 completes. Phase 5 depends on Phase 3 (repository) for the hotel detail trigger. Phase 6 ties everything together. Phase 7 adds monitoring and alerting last (but must ship before production deployment).
