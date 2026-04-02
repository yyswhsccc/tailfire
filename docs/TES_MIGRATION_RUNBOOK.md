# TraveleSolutions (TES) → Tailfire Migration Runbook

**Last Validated:** 2026-04-02
**Status:** Ready for cutover — all code changes validated compatible

## Scripts Location

```
/Users/alguertin/Development/tailfire-project/scripts/migration/
├── extract-travelesolutions.ts   (16KB — extracts from TES API)
├── import-to-tailfire.ts         (117KB — imports into Tailfire API)
├── tes-import-runner.sh          (12KB — shell runner with cleanup + auth)
├── validate-import.ts            (15KB — post-import validation)
```

**IMPORTANT:** These scripts live in the parent `tailfire-project/scripts/` directory, NOT inside the `tailfire/` git repo.

Python extraction tools: `/Users/alguertin/Development/TESS/`

## TES API Credentials

| Field | Value |
|-------|-------|
| User | aguertin |
| Password | 123Hammond! |
| Company | PhoenixV |
| Token URL | `https://travelesolutions.com/api/token` |
| API Base | `https://travelesolutions.com/api/api` |

## Tailfire Auth (for import)

| Field | Value |
|-------|-------|
| Email | admin@phoenixvoyages.ca |
| Password | Phoenix2026! |

## Previous Import Stats (2026-03-23)

| Entity | Count |
|--------|-------|
| Trips | 426 |
| Contacts | 840 |
| Activities | 1,209 |
| Commissions | 536 |
| Commission Checks | 124 |
| Payment Transactions | 937 |

## Environment Configuration

### Preview (tf-demo)

```bash
export TAILFIRE_API=https://api-dev.tailfire.ca/api/v1
export SUPABASE_URL=https://gaqacfstpnmwphekjzae.supabase.co
# Get remaining secrets from Doppler stg config
```

### Production (live)

```bash
export TAILFIRE_API=https://api.tailfire.ca/api/v1
export SUPABASE_URL=https://cmktvanwglszgadjrorm.supabase.co
# Get remaining secrets from Doppler prd config
```

### Local Development

```bash
export TAILFIRE_API=http://localhost:3101/api/v1
# Reads SUPABASE_URL, DATABASE_URL from apps/api/.env automatically
```

## Runner Commands

```bash
# Full import (all trips) — runs cleanup first
./scripts/migration/tes-import-runner.sh

# Import first N trips (for testing)
./scripts/migration/tes-import-runner.sh --limit 50

# Dry run (no writes)
./scripts/migration/tes-import-runner.sh --dry-run

# Skip cleanup, just import (resume after partial run)
./scripts/migration/tes-import-runner.sh --skip-cleanup

# Only clean up, don't import
./scripts/migration/tes-import-runner.sh --cleanup-only

# Full reset (clear ALL mappings + ledger)
./scripts/migration/tes-import-runner.sh --full-reset
```

## Cutover Procedure

### Step 1: Preview Refresh (pre-cutover validation)

1. Point runner at Preview environment
2. Run `--full-reset` to wipe old TES data + ledger
3. Run full import
4. Run `validate-import.ts` to verify
5. Spot-check trips on tf-demo.phoenixvoyages.ca
6. Verify no regressions from recent code changes

### Step 2: Production Cutover

1. Schedule maintenance window
2. Point runner at Production environment
3. Run `--full-reset` for clean import
4. Run full import
5. Run `validate-import.ts`
6. Run lifecycle backfill: `POST /trips/backfill-lifecycle`
7. Verify on tailfire.phoenixvoyages.ca
8. Decommission TES access

## Compatibility with Recent Code Changes (2026-03-31 — 2026-04-02)

All changes validated compatible on 2026-04-02:

| Change | Impact on Import | Reason |
|--------|-----------------|--------|
| Empty string → null for dates (#119, #132) | **None** | Import sends valid dates or undefined, never `""` |
| Supplier validation COALESCE (#116) | **None** | Import always provides supplier from TES |
| BOOKING_DATE_MISSING removal (#145) | **None** | Import uses generic PATCH which already had bookingDate |
| proposalStatus/bookingStatus in Zod (#145) | **None** | Import sends these via generic route (already supported) |
| bookingDate in typed schemas (#145) | **None** | Import doesn't send bookingDate on CREATE (only on PATCH) |
| Itinerary day guard MAX=120 (#114) | **None** | Import creates ≤30 days per trip |
| Flight synthesize from startDatetime (#128) | **None** | Import creates cruises, not flights with empty details |
| Booking date persistence (#141-143) | **None** | Import uses generic PATCH route |

### Import API Call Pattern

- **CREATE** activities via typed routes (`/activities/flights`, `/activities/lodging`, `/activities/custom-cruise`, `/activities/transportation`) — basic fields only, no booking fields
- **PATCH** pricing + booking fields via generic route (`/activities/:id`) — sends bookingDate, proposalStatus, bookingStatus, totalPriceCents, commissionTotalCents
- Generic route schema (`activity.schema.ts`) already had all these fields before our changes
- Typed route schemas got additions (non-breaking — import doesn't send those fields on CREATE)

## Data Flow

```
TES API (travelesolutions.com)
  │
  ▼ extract-travelesolutions.ts
  │
  data/migration/*.json (local files)
  │
  ▼ import-to-tailfire.ts (via REST API)
  │
  Tailfire API → Database
  │
  ▼ validate-import.ts (verification)
  │
  ▼ POST /trips/backfill-lifecycle (lifecycle evaluation)
```

## Ledger

The import maintains an ID mapping ledger at:
```
data/migration/id-mapping.json
```

This tracks `TES ID → Tailfire ID` for all entities. Supports `--resume` for partial re-runs. Use `--full-reset` to clear the ledger for a clean re-import.
