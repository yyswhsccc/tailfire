# Cruise System Architecture

This document describes the complete cruise booking architecture, covering both the FTP catalog sync system and the FusionAPI live booking integration.

## System Overview

The Tailfire platform uses two complementary Traveltek systems for cruise functionality:

| System | Purpose | Data Type | Update Frequency |
|--------|---------|-----------|------------------|
| **Cruise Catalog** (FTP) | Browse, search, display | Static | Daily (2 AM sync) |
| **FusionAPI** | Book, price, availability | Live/Real-time | On-demand |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CRUISE DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐                    ┌─────────────────┐            │
│   │  Traveltek FTP  │                    │  Traveltek      │            │
│   │  Server         │                    │  FusionAPI      │            │
│   │  (ftpeu1prod)   │                    │  (fusionapi)    │            │
│   └────────┬────────┘                    └────────┬────────┘            │
│            │                                      │                      │
│            │ Daily Sync                           │ Real-time            │
│            │ (2 AM EST)                           │ (On-demand)          │
│            ▼                                      ▼                      │
│   ┌─────────────────┐                    ┌─────────────────┐            │
│   │  Cruise Import  │                    │  Cruise Booking │            │
│   │  Module         │                    │  Module         │            │
│   │  (IMPLEMENTED)  │                    │  (IMPLEMENTED)  │            │
│   └────────┬────────┘                    └────────┬────────┘            │
│            │                                      │                      │
│            │ Stores                               │ Uses for             │
│            │ catalog data                         │ live queries         │
│            ▼                           ┌──────────┴──────────┐           │
│   ┌─────────────────────────────────────────────────────────┐           │
│   │                     DATABASE                   │         │           │
│   │                                                │         │           │
│   │  catalog.cruise_sailings.provider_identifier   │ Import  │           │
│   │                        ║                       │ Booking │           │
│   │                        ║ codetocruiseid        │ (creates│           │
│   │                        ║ (THE CRITICAL LINK)   │  trips) │           │
│   │                        ▼                       │         │           │
│   │              Links FTP data to FusionAPI       │         │           │
│   └─────────────────────────────────────────────────────────┘           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The Critical Link: `codetocruiseid`

The `codetocruiseid` is Traveltek's globally unique sailing identifier. It serves as the bridge between:
- **FTP Catalog**: Extracted from file path, stored in database
- **FusionAPI**: Passed as query parameter for live operations

### How `codetocruiseid` Flows Through the System

```
FTP FILE PATH                          DATABASE                         FUSIONAPI
─────────────────                      ────────                         ─────────
/2026/02/1/180/2089722.json   ──►   cruise_sailings             ──►   ?codetocruiseid=2089722
       │                              provider_identifier
       │                              = "2089722"
       └── filename = codetocruiseid
```

### FTP Path Structure
```
/year/month/lineid/shipid/codetocruiseid.json

Example: /2026/02/1/180/2089722.json
         │    │  │  │   └── codetocruiseid (sailing ID)
         │    │  │  └────── shipid (180 = specific ship)
         │    │  └───────── lineid (1 = cruise line)
         │    └──────────── month (February)
         └───────────────── year (2026)
```

### Database Storage
```sql
-- The codetocruiseid is stored as provider_identifier
SELECT id, provider, provider_identifier, ship_name, departure_date
FROM catalog.cruise_sailings
WHERE provider = 'traveltek'
  AND provider_identifier = '2089722';

-- Unique constraint ensures no duplicates
UNIQUE (provider, provider_identifier)
```

### FusionAPI Usage
```bash
# Use codetocruiseid to query live availability/pricing
GET /cruiseresults.pl?codetocruiseid=2089722&sid={SID}&requestid={TOKEN}
GET /cruisecabingrades.pl?codetocruiseid=2089722&resultno=1&sessionkey={UUID}
```

---

## System 1: Cruise Catalog (FTP Import) - IMPLEMENTED

### Overview

The Cruise Import module syncs static catalog data from Traveltek's FTP server.

| Property | Value |
|----------|-------|
| **Location** | `apps/api/src/cruise-import/` |
| **FTP Server** | `ftpeu1prod.traveltek.net` |
| **Schedule** | Daily at 2 AM Toronto time |
| **Retry Policy** | 3 attempts with exponential backoff (5min, 10min) |
| **Data Format** | JSON files |
| **Status** | Fully implemented |

### Database Schema (16 tables in `catalog.*`)

#### Core Entities
| Table | Description | Key Fields |
|-------|-------------|------------|
| `cruise_sailings` | Main sailing entity | `provider_identifier` (codetocruiseid) |
| `cruise_ships` | Ship details | `provider_ship_id`, `name`, `tonnage` |
| `cruise_lines` | Cruise line companies | `provider_line_id`, `name`, `logo_url` |
| `cruise_ports` | Port information | `port_code`, `name`, `country` |
| `cruise_regions` | Geographic regions | `name`, `description` |

#### Sailing Details
| Table | Description |
|-------|-------------|
| `cruise_sailing_stops` | Itinerary ports of call |
| `cruise_sailing_regions` | Regions visited by sailing |
| `cruise_sailing_cabin_prices` | Base pricing per cabin type |
| `cruise_alternate_sailings` | Related sailings |

#### Ship Details
| Table | Description |
|-------|-------------|
| `cruise_ship_cabin_types` | Cabin categories per ship |
| `cruise_ship_decks` | Deck layouts |
| `cruise_ship_images` | Ship photos |
| `cruise_cabin_images` | Cabin photos |

#### Sync Infrastructure
| Table | Description |
|-------|-------------|
| `cruise_ftp_file_sync` | Tracks synced files (delta sync) |
| `cruise_sync_raw` | Raw JSON storage |
| `cruise_sync_history` | Sync operation logs |

### Data Flow

```
1. FTP Connection
   └── Connect to ftpeu1prod.traveltek.net

2. File Discovery
   └── List directories: /year/month/lineid/shipid/
       └── Find JSON files (codetocruiseid.json)

3. Delta Sync
   └── Check cruise_ftp_file_sync for last modified
       └── Only download changed/new files

4. JSON Parsing
   └── Extract sailing data from JSON
       └── Map to database schema

5. Database Upsert
   └── Insert/update all related tables
       └── Maintain referential integrity

6. Sync History
   └── Record operation in cruise_sync_history
```

### Scheduled Sync Resilience

The daily 2 AM sync includes automatic retry with exponential backoff:

| Attempt | Delay | Cumulative Time |
|---------|-------|-----------------|
| 1 | - | 2:00 AM |
| 2 | 5 min | 2:05 AM |
| 3 | 10 min | 2:15 AM |

**Retryable errors**: Connection refused, timeout, network errors, FTP errors
**Non-retryable errors**: Auth failures, environment guard, data validation

If all retries fail, the sync will attempt again at the next scheduled time (2 AM tomorrow).

### API Endpoints

Protected by internal API key (`x-internal-api-key` header):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cruise-import/test-connection` | GET | Test FTP connectivity |
| `/cruise-import/sync` | POST | Trigger manual sync |
| `/cruise-import/sync/status` | GET | Get current sync status |
| `/cruise-import/sync/cancel` | POST | Cancel running sync |
| `/cruise-import/sync/history` | GET | View sync history |
| `/cruise-import/storage-stats` | GET | Database statistics |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TRAVELTEK_FTP_HOST` | FTP server hostname |
| `TRAVELTEK_FTP_USER` | FTP username |
| `TRAVELTEK_FTP_PASSWORD` | FTP password |
| `INTERNAL_API_KEY` | API key for sync endpoints |
| `ENABLE_SCHEDULED_CRUISE_SYNC` | Enable daily cron (`true`/`false`) |

---

## System 2: FusionAPI (Live Booking) - IMPLEMENTED

### Overview

The FusionAPI provides real-time cruise availability, pricing, and booking capabilities.

| Property | Value |
|----------|-------|
| **Location** | `apps/api/src/cruise-booking/` |
| **Base URL** | `https://fusionapi.traveltek.net/2.1/json/` |
| **Protocol** | HTTPS with OAuth 2.0 |
| **Status** | ✅ Fully implemented (January 2026) |

### Module Structure

```
cruise-booking/
├── cruise-booking.module.ts            # NestJS module with HttpModule
├── cruise-booking.controller.ts        # 10 endpoints with role-based guards
├── services/
│   ├── traveltek-auth.service.ts       # OAuth token caching
│   ├── fusion-api.service.ts           # Low-level HTTP client with retry
│   ├── booking-session.service.ts      # Session CRUD, handoff, idempotency
│   ├── booking.service.ts              # High-level orchestration
│   └── import-booking.service.ts       # Import existing bookings
├── dto/                                # 6 DTOs with class-validator
│   └── import-booking.dto.ts           # Import preview & confirm DTOs
└── types/
    └── fusion-api.types.ts             # FusionAPI type definitions
```

### API Endpoints

> **Authentication:** All cruise-booking endpoints require JWT authentication (Bearer token). Role-based guards control access:
> - `admin` role: Full access to all endpoints
> - `user` role: Access to own trips and handoff flows

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cruise-booking/search` | POST | Search cruises |
| `/cruise-booking/rates` | GET | Get agency-tailored rate codes |
| `/cruise-booking/cabin-grades` | GET | Get cabin categories with pricing |
| `/cruise-booking/cabins` | GET | Get specific cabins with deck plans |
| `/cruise-booking/basket` | POST | Add to basket (holds cabin) |
| `/cruise-booking/basket/:sessionId` | GET | Get basket contents |
| `/cruise-booking/basket/:sessionId/:itemkey` | DELETE | Remove from basket |
| `/cruise-booking/book` | POST | Complete booking with idempotency |
| `/cruise-booking/proposal/:activityId` | GET | Get proposal for client handoff |
| `/cruise-booking/session/:sessionId` | DELETE | Cancel session |
| `/cruise-booking/import/preview` | POST | Preview existing cruise booking for import |
| `/cruise-booking/import/confirm` | POST | Import existing cruise booking into Tailfire |

### Database Tables

| Table | Purpose |
|-------|---------|
| `cruise_booking_sessions` | Ephemeral FusionAPI session/hold state |
| `cruise_booking_idempotency` | Booking retry safety (24h TTL) |
| `custom_cruise_details.fusion_booking_*` | Durable booking confirmations |

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OAUTH AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Step 1: Get Access Token                                           │
│  ─────────────────────────                                          │
│                                                                      │
│  POST /token.pl                                                      │
│  Authorization: Basic {base64(username:password)}                   │
│  Content-Type: application/x-www-form-urlencoded                    │
│                                                                      │
│  Body: grant_type=client_credentials&scope=portal                   │
│                                                                      │
│  Response: { "access_token": "xxx", "expires_in": 3600 }            │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Step 2: Make API Requests                                          │
│  ─────────────────────────                                          │
│                                                                      │
│  GET requests:  Pass token as `requestid` query parameter           │
│  POST requests: Pass token as `requestid` header                    │
│                                                                      │
│  Required parameters:                                                │
│  • sid={TRAVELTEK_SID}      - Account identifier                    │
│  • requestid={access_token} - The OAuth token                       │
│  • sessionkey={UUID}        - Session state (stateful API)          │
│                                                                      │
│  Example:                                                            │
│  GET /cruiseresults.pl?sid=52426&requestid={token}&adults=2         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Booking Flow (9 Steps)

```
┌─────────────────┐
│  1. SEARCH      │  cruiseresults.pl
│                 │  • Input: dates, destinations, passengers
│                 │  • Output: codetocruiseid, resultno
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. RATE CODES  │  cruiseratecodes.pl
│                 │  • Input: codetocruiseid, resultno
│                 │  • Output: Available fare types
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. CABIN       │  cruisecabingrades.pl
│     GRADES      │  • Input: codetocruiseid, resultno
│                 │  • Output: gradeno, LIVE pricing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. PRICING     │  cruisecabingradebreakdown.pl
│     BREAKDOWN   │  • Input: codetocruiseid, gradeno
│                 │  • Output: Detailed fare breakdown
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. SPECIFIC    │  cruisecabins.pl (optional)
│     CABINS      │  • Input: codetocruiseid, gradeno
│                 │  • Output: Specific cabin numbers
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. PAX DATA    │  cruisegetpaxdata.pl (optional)
│                 │  • Input: cruiseline, pastpaxid
│                 │  • Output: Past passenger info
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  7. ADD TO      │  basketadd.pl
│     BASKET      │  • Input: codetocruiseid, gradeno, farecode
│                 │  • Output: itemkey, sessionkey
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  8. REVIEW      │  basket.pl
│     BASKET      │  • Input: sessionkey
│                 │  • Output: Basket contents, totals
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  9. CREATE      │  book.pl
│     BOOKING     │  • Input: sessionkey, passengers, payment
│                 │  • Output: Booking reference
└─────────────────┘
```

### Session Management

FusionAPI is **stateful**. The `sessionkey` (UUID) maintains context:

- Created on first search request
- Must be passed to all subsequent calls
- Links search results to basket operations
- Valid for 2+ hours of inactivity
- Lost sessions require starting over

### Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `TRAVELTEK_API_URL` | FusionAPI base URL | Doppler |
| `TRAVELTEK_USERNAME` | OAuth username | Doppler |
| `TRAVELTEK_PASSWORD` | OAuth password | Doppler |
| `TRAVELTEK_SID` | Site ID (account identifier) | Doppler |

---

## System 3: Booking Import (cruiseimportbooking.pl) - IMPLEMENTED

### Overview

The Booking Import feature allows agents to import existing cruise bookings from cruise line reservation systems into Tailfire. This uses Traveltek's `cruiseimportbooking.pl` endpoint to fetch booking data and creates a complete trip with all associated entities.

| Property | Value |
|----------|-------|
| **Location** | `apps/api/src/cruise-booking/services/import-booking.service.ts` |
| **FusionAPI Endpoint** | `cruiseimportbooking.pl` |
| **Purpose** | Import pre-existing bookings into Tailfire |
| **Status** | Implemented (February 2026) |

### Import Flow (2-Step Process)

**Step 1: Preview** - Fetches booking from Traveltek without creating anything in Tailfire. Returns passenger list, cruise details, pricing, itinerary ports.

**Step 2: Confirm** - Creates the full entity graph:
1. Match or create contacts for each passenger (by name + DOB)
2. Create or use existing trip
3. Create itinerary and itinerary day
4. Create custom cruise activity with enriched details
5. Create trip travelers for each passenger
6. Link travelers to cruise activity
7. Generate port schedule from cruise itinerary
8. Stamp Traveltek fields as idempotency marker

### Idempotency

Import is scoped by `agency_id + source + fusionBookingRef` to prevent duplicate imports. If the same booking reference has already been imported, the confirm endpoint returns the existing trip.

### Catalog Enrichment

The import service performs best-effort catalog lookups to enrich the imported data:
- Sail catalog lookup (by Traveltek codetocruiseid)
- Region lookup from catalog
- Ship details (image URL, ship class)
- Port timezone enrichment from cruise catalog
- Cabin category, deck, and location persistence

### Database Changes (Migration: `20260216120000`)

Added to `custom_cruise_details`:
- `cabin_location` (varchar) - Ship location (Mid-ship, Aft, Forward)
- `dining_preferences` (jsonb) - Seating, table size, smoking preferences
- `selected_extras` (jsonb) - Beverage packages, wifi, excursions
- `selected_promotions` (jsonb) - Applied promotion codes
- `traveltek_booking_id` (bigint) - For re-sync capability
- `traveltek_portfolio_id` (bigint) - For re-sync capability

### FusionAPI Types

New types in `fusion-api.types.ts`:
- `ImportBookingParams` - Request parameters (lineid, bookingreference, viewonly, currency)
- `ImportBookingResult` - Full booking response (cruise item, passengers, payment info)
- `ImportBookingCruiseItem` - Cruise details (ship, cabin, itinerary, pricing, dining)
- `ImportBookingPassenger` - Passenger details (name, DOB, nationality, gender)
- `ImportBookingItineraryPort` - Port call details with coordinates

---

## Data Classification: Static vs Live

| Data Type | Source | Frequency | Storage | Use Case |
|-----------|--------|-----------|---------|----------|
| Ship details | FTP | Weekly | `catalog.cruise_ships` | Display, filtering |
| Line info | FTP | Monthly | `catalog.cruise_lines` | Display, branding |
| Ports | FTP | Monthly | `catalog.cruise_ports` | Itinerary display |
| Itineraries | FTP | Daily | `catalog.cruise_sailing_stops` | Route preview |
| **Base prices** | FTP | Daily | `catalog.cruise_sailings.cheapest_*` | Search sorting |
| **LIVE availability** | FusionAPI | Real-time | Not stored | Booking flow |
| **LIVE pricing** | FusionAPI | Real-time | Not stored | Booking flow |
| **Cabin selection** | FusionAPI | Real-time | Not stored | Booking flow |
| **Booking status** | FusionAPI | Real-time | Confirmation only | Post-booking |

### Key Insight: Price Discrepancies

FTP prices are **estimated/cached**. FusionAPI prices are **live/authoritative**.

```
FTP Catalog: cheapest_inside = $499 (synced yesterday)
FusionAPI:   actualPrice = $549 (real-time)
```

**Strategy**: Display FTP prices with "from $X" disclaimer. Show live prices during booking flow.

---

## Booking Session Management

### Session Lifecycle

The cruise booking module maintains session state in the `cruise_booking_sessions` table:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SESSION LIFECYCLE                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CREATE: When agent/client adds to basket                                    │
│     └── status = 'active', flow_type = 'agent'|'client_handoff'|'ota'       │
│     └── session_key = UUID passed to FusionAPI                              │
│     └── session_expires_at = now + 2 hours                                  │
│                                                                              │
│  UPDATE: On every FusionAPI call                                             │
│     └── Extend session_expires_at = now + 2 hours                           │
│     └── Update hold_expires_at, basket_item_key if basket changes           │
│                                                                              │
│  HANDOFF: When client accesses agent's basket                                │
│     └── Verify trip_traveler linked to requesting user                      │
│     └── Update flow_type = 'client_handoff'                                 │
│                                                                              │
│  COMPLETE: After successful booking                                          │
│     └── status = 'completed'                                                │
│     └── Copy booking_ref to custom_cruise_details                           │
│                                                                              │
│  EXPIRE: TTL cleanup job                                                     │
│     └── UPDATE status = 'expired' WHERE session_expires_at < now            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Status Transitions:
  active → completed (successful booking)
  active → cancelled (user abandons)
  active → expired   (TTL cleanup)
```

### Cabin Hold Timing

Two distinct expiry times are tracked:

| Expiry Type | Duration | Storage | Purpose |
|-------------|----------|---------|---------|
| **Session** | 2+ hours | `session_expires_at` | FusionAPI stateful context |
| **Cabin Hold** | 15-30 min | `hold_expires_at` | Inventory reservation |

The cabin hold is the critical deadline for checkout. UI displays countdown timer.

### Idempotency Pattern

Prevents double-bookings on retry:

```typescript
// 1. Check for existing booking with idempotency key
const existing = await findByIdempotencyKey(key)
if (existing.bookingRef) return cached result

// 2. Create pending idempotency record
await createIdempotencyRecord(key, activityId, userId)

// 3. Submit to FusionAPI
const result = await fusionApi.createBooking(...)

// 4. Update record with result
await updateIdempotencyRecord(key, result)
```

### Booking Flows

| Flow | Description | Session Owner |
|------|-------------|---------------|
| **Agent** | Agent searches → proposes → books | Agent throughout |
| **Client Handoff** | Agent proposes → Client books | Agent starts, Client continues |
| **OTA** | Client self-service booking | Client throughout |

### Error Handling

| Error Type | Handling | Retry |
|------------|----------|-------|
| TIMEOUT | Exponential backoff | Max 3, 1s→2s→4s |
| RATE_LIMIT | Backoff with jitter | Max 3, 5s + random |
| INVALID_SESSION | Non-retryable, force new session | No |
| CABIN_NOT_AVAILABLE | Return to selection, suggest alternatives | No |

---

## Security Considerations

### Token Handling
- OAuth tokens passed as `requestid` query parameter appear in logs
- Consider using POST methods where possible (token in header)
- Never log full tokens; truncate for debugging

### Credential Storage
- All credentials in Doppler (never in code/docs)
- Separate credentials per environment (dev/stg/prd)
- Rotate credentials if exposed

### Session Security
- Sessions are stateful server-side
- Don't expose raw `sessionkey` to frontend
- Consider mapping internal session IDs to FusionAPI sessionkeys

---

## FDW Architecture (Cross-Environment)

For catalog data sharing across environments:

| Environment | Cruise Data Source |
|-------------|-------------------|
| Production | Local `catalog` schema (source of truth) |
| Preview | FDW → Production's `catalog` schema |
| Local Dev | FDW → Production's `catalog` schema |

> **Note:** Local Dev uses FDW (foreign tables pointing to Production), not a local copy.
> If catalog queries fail on local dev, restore FDW with `./scripts/setup-local-fdw.sh`.

See `CLAUDE.md` for FDW details and sync commands.

---

## Related Documentation

- [Cruise Import README](../apps/api/src/cruise-import/README.md) - FTP sync details
- [Cruise Booking README](../apps/api/src/cruise-booking/README.md) - FusionAPI documentation
- [Deployment Guide](./DEPLOYMENT_API.md) - Environment configuration
- [Traveltek FusionAPI Docs](https://docs.traveltek.com/FKpitwn16WopwZdCaW17) - Official API reference
