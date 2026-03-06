# TraveleSolutions Data Migration Design

**Date:** 2026-03-04
**Status:** Phase 1 Complete — Shortfall Analysis Done — Codex Validated

## Goal

Migrate all live contacts, trips, itineraries, and financial data from TraveleSolutions (https://travelesolutions.com) into Tailfire. Enrich cruise trips with catalog data. Improve commission tracking beyond TraveleSolutions' capabilities.

## Actual Volumes (Discovered)

| Entity | Count |
|--------|-------|
| Contacts | 800 |
| Trips | 409 |
| Bookings | 581 (across all trips) |
| Bookings with commission | ~19 (from sample) |
| Unique suppliers (TourOperators) | ~20-30 estimated |

## Key Decisions

### 1. Trip Types → `leisure` + Tags
All imported trips set to `tripType: 'leisure'`. The TraveleSolutions trip type (Vacation, Anniversary, Wedding, etc.) stored as a **tag** on the trip via `POST /trips/:id/tags`.

No enum migration needed. Store original source type in `trip.customFields.sourceTripType` for queryability even if tags change.

### 2. Supplier Linkage → Catalog Integration
TraveleSolutions `TourOperator` must link to Tailfire catalog entities:
- **Cruise suppliers** (Norwegian, Royal Caribbean, etc.) → match to `catalog.cruise_lines` by name, then link `cruise_lines.supplierId` to created `suppliers` record
- **Tour operators** (AmaWaterways, Club Med, etc.) → match to `catalog.tour_operators`. **Gap:** `tour_operators` has no `supplierId` FK — need migration to add it (mirror `cruise_lines` pattern)
- **Other suppliers** (Intair, Air Canada Vacations, Sunwing, TravelBrand, etc.) → create as `suppliers` records, store name in `activity_pricing.supplier`

### 3. Commission System → Enhance Beyond TraveleSolutions

**TraveleSolutions commission model** (per-booking):
```
Earned, Received, ReceivedParent, TotalReceived, Paid, Due, TotalDue, Rate, Adjustment, AdjustmentCount
```

**TraveleSolutions shortfall:** No tax tracking on commissions. When commission arrives with taxes already deducted (e.g., $150 earned but $130 received because $20 GST/HST withheld), there's no way to make that apparent.

**Tailfire enhancement:** Add tax-aware commission tracking that shows:
- Gross commission earned
- Tax amount (GST/HST/other)
- Net commission after tax
- What was actually received vs what's still due
- Parent agency share

---

## Phase 1 Discovery Results

### REST API Discovered

TraveleSolutions exposes a full REST API at `https://travelesolutions.com/api/api/`. Authentication is JWT Bearer token stored in `localStorage` under `ls.authenticationData`.

**Authentication:**
```
POST /api/token
Body: grant_type=password&username=...&password=...&companyshortname=...
Returns: { access_token, token_type, expires_in }
```

### API Endpoints

| Endpoint | Method | Description | Pagination |
|----------|--------|-------------|------------|
| `/api/api/Client?pageNumber=X&pageSize=Y` | GET | Paginated client list | Yes, pageSize=100 works |
| `/api/api/Client?clientID=X` | GET | Single client detail | No |
| `/api/api/Trip?pageNumber=X&pageSize=Y` | GET | Paginated trip list (light) | Yes, pageSize=100 works |
| `/api/api/Trip?tripID=X` | GET | Single trip detail (full) | No |
| `/api/api/Booking?pageNumber=1&pageSize=Y` | GET | Paginated booking list with commission | Yes |
| `/api/api/Booking/GetBookingPaymentsByTripID?tripID=X` | GET | Booking payments for a trip | No |
| `/api/api/TourOperator?pageNumber=X&pageSize=Y` | GET | Tour operators (suppliers) | Yes, 375 total |
| `/api/api/Property?pageNumber=X&pageSize=Y` | GET | Hotels/resorts (global catalog) | Yes, 643K total |
| `/api/api/Airline?pageNumber=X&pageSize=Y` | GET | Airlines | Yes, 1204 total |
| `/api/token` | POST | JWT authentication | No |

**Note:** Trip list returns `TravelingPackagesLight` (no carrier detail, no travelers). Full detail requires per-trip API call.

**Pagination format:**
```json
{ "Items": [...], "CountFiltered": N, "CountUnfiltered": N, "CountCurrent": N, "PageNumber": N, "PageSize": N }
```

### Key JSON Shapes

(See previous version of this doc for full Client, Trip, and Booking JSON shapes)

### Enums Discovered

**Trip Statuses:** Active(1), Booked(2), Cancelled(3), Paid(4), Ready To Travel(5), Traveled(6)
**Trip Types:** Vacation, Anniversary, Business Trip, Honeymoon, Other, Wedding
**Trip Main Types:** Regular Trip, Group/Contract, Group/No Contract, Fast Track, Reservation, Proposal
**Carrier Types:** Resort/Hotel(2), Flight(3), Cruise(5), Activity(8), (Tour, Train, Car Rental TBD)
**Traveler Types:** Primary(1), Secondary(2)

---

## Tailfire Shortfall Analysis

### Confirmed Working (No Changes Needed)
- Suppliers CRUD (`POST/GET/PATCH/DELETE /suppliers`)
- All typed activity endpoints (flight, lodging, custom_cruise, transportation, etc.)
- Itinerary + day creation (batch day creation supported)
- Activity pricing + payment schedules + expected items + transactions
- External references (`trips.externalReference` + `activities.confirmationNumber`)
- Trip status transitions (draft → booked → completed)
- Tags create-and-assign API (`POST /contacts/:id/tags`, `POST /trips/:id/tags`)

### Shortfalls Requiring Changes

#### A. Commission Tracking Enhancement (FEATURE)

**Current state:** `commission_tracking` table exists but is a stub — never written to by any API. Only read by financial dashboards. `activity_pricing` has `commissionTotalCents`, `commissionSplitPercentage`, `commissionExpectedDate`. Table is linked to `activity_pricing` via `component_pricing_id` and supports 1:N records per pricing row.

**Required changes:**

1. **Schema migration** — Enhance `commission_tracking` table:
   ```
   ADD: gross_commission_cents    INTEGER CHECK (>= 0) -- Full commission before tax
   ADD: tax_amount_cents          INTEGER DEFAULT 0 CHECK (>= 0) -- Tax withheld (GST/HST/etc.)
   ADD: tax_type                  VARCHAR(50) -- 'GST', 'HST', 'VAT', etc.
   ADD: net_commission_cents      INTEGER CHECK (>= 0) -- Gross minus tax (deterministic: gross - tax)
   ADD: received_cents            INTEGER DEFAULT 0 CHECK (>= 0) -- Amount actually received
   ADD: paid_cents                INTEGER DEFAULT 0 CHECK (>= 0) -- Amount paid out to agent
   ADD: adjustment_cents          INTEGER DEFAULT 0 -- Corrections/write-offs (can be negative)
   ADD: received_parent_cents     INTEGER DEFAULT 0 CHECK (>= 0) -- Parent agency share
   ADD: source                    VARCHAR(100) DEFAULT 'manual' -- 'travelesolutions', 'traveltek', 'manual'
   ADD: source_booking_ref        VARCHAR(255) -- External booking reference
   ```

   **Codex-validated constraints:**
   - Preserve existing legacy fields (`commission_amount`, `commission_rate`, `commission_status`) for backward compatibility with `financial-summary.service.ts`
   - Enforce 1:1 cardinality per activity pricing for new API (add unique constraint on `component_pricing_id` for new records, or handle via API upsert logic)
   - Check constraints on cents fields to prevent invalid negatives
   - Deterministic rule: `net_commission_cents = gross_commission_cents - tax_amount_cents + adjustment_cents`

2. **API endpoints** — New commission management:
   - `POST /activities/:id/commission` — Create/upsert commission record (enforce one per activity pricing)
   - `GET /activities/:id/commission` — Get commission with tax breakdown
   - `PATCH /activities/:id/commission` — Update received/paid/adjustment

3. **Financial dashboard** — Show tax-aware commission:
   - Gross Earned vs Net (after tax) vs Received vs Paid vs Due
   - Tax amount clearly visible
   - Must remain compatible with existing `financial-summary.service.ts` readers

#### B. Tour Operator → Supplier FK (MIGRATION)

**Current state:** `catalog.tour_operators` has no `supplierId` FK. `catalog.cruise_lines` already has one.

**Required:** Add `supplier_id UUID REFERENCES suppliers(id)` to `catalog.tour_operators` (mirrors `cruise_lines` pattern).

**Codex-validated risk:** `catalog` schema is FDW-protected. Unguarded `ALTER TABLE catalog.*` is unsafe on Dev/Preview environments. Must use the catalog guard pattern from `MIGRATIONS.md` (wrap in `pg_class.relkind = 'r'` guard so it only runs on Production where tables are local).

#### C. Multi-value Contact Fields (WORKAROUND)

Single `email`/`phone` fields. Use first Default as primary. Store additional in notes.

#### D. Passport Issued City (WORKAROUND)

Store in `travelPreferences` JSONB.

---

## Extraction Approach

### API Call Plan

| Step | Calls | Data |
|------|-------|------|
| Client list (pageSize=100) | 8 | All 800 contacts |
| Trip list for IDs (pageSize=100) | 5 | 409 trip IDs + light data |
| Trip detail (per trip) | 409 | Full carriers, travelers, itinerary |
| Booking payments (per trip) | 409 | Payments + commission per booking |
| **Total** | **~831** | |

### Script: `scripts/migration/extract-travelesolutions.ts`

Node.js/TypeScript — direct HTTP API calls (no Playwright needed).

1. Authenticate via `POST /api/token`
2. Paginate all contacts → `data/migration/contacts.json`
3. Paginate trip list for IDs
4. Fetch each trip detail individually
5. Fetch booking payments per trip (includes commission)
6. Deduplicate and collect unique TourOperators → `data/migration/suppliers.json`
7. Output trips with embedded bookings → `data/migration/trips.json`
8. Output financial summary → `data/migration/bookings.json`
9. Assign stable source IDs: `ClientID.ID` for contacts, `TripID` for trips, `BookingID` for bookings

---

## Import Approach

### Script: `scripts/migration/import-to-tailfire.ts`

**Strict 13-step dependency order:**

1. **Suppliers** — Create via `POST /suppliers`, match to catalog cruise_lines/tour_operators where possible
2. **Contacts** — `POST /contacts`, build persistent `sourceId → tailfireId` ledger
3. **Contact tags** — `POST /contacts/:id/tags` (create-and-assign)
4. **Trips** — `POST /trips` as `draft` with `tripType: 'leisure'`, `externalReference: TripID`
5. **Trip tags** — `POST /trips/:id/tags` with TraveleSolutions trip type name (Vacation, Anniversary, etc.)
6. **Trip travelers** — `POST /trips/:id/travelers`, link via contact ID mapping
7. **Itineraries** — `POST /trips/:id/itineraries`
8. **Itinerary days** — Batch create or individual, using trip date range
9. **Typed activities** — `POST /activities/{type}` (flight, lodging, custom_cruise, etc.)
   - Set `confirmationNumber` = booking number
   - Set `activity_pricing.supplier` = TourOperator name
10. **Activity pricing** — Set `totalPriceCents`, `commissionTotalCents`, payment schedules, expected items
11. **Payment transactions** — Record payments against expected items
12. **Commission records** — Create `commission_tracking` records with tax breakdown (new API)
13. **Final status transitions** — `draft → booked` (requires travelers), then `booked → completed` if Traveled

**Critical constraints from Codex validation:**
- `draft → booked` requires at least one traveler linked first
- `completed` cannot be set directly from `draft` — must go through `booked`
- Payment schedule item sums must equal activity total
- Transaction currency must match parent pricing currency
- Tag `POST` endpoints are create-and-assign (not idempotent) — deduplicate tag names before import to avoid conflicts on repeated names
- `POST /suppliers` is role-guarded — import script must use admin auth
- Typed activity creation requires `itineraryDayId` — ensure days exist before activities
- Payment schedule creation can conflict if config already exists — add find-or-update logic

**Safeguards:**
- **Idempotency ledger**: `data/migration/id-mapping.json` — `{sourceId, entityType, tailfireId, status}`
- **Dry-run mode**: Validate without writing
- **Resume-from-failure**: Skip already-imported entities
- **Side-effect mitigation**: All trips created as `draft` first
- **Tag deduplication**: Collect unique tag names first, create once, then assign by ID to avoid duplicates

---

## Status Mapping

| TraveleSolutions | Tailfire Initial | Tailfire Final |
|-----------------|-----------------|----------------|
| Active | draft | booked |
| Booked | draft | booked |
| Paid | draft | booked |
| Ready To Travel | draft | booked |
| Traveled | draft | completed (via booked) |
| Cancelled | draft | cancelled |

---

## Supplier Matching Strategy

### Matching Controls (Codex-validated)
Name-only matching is too weak. Use tiered matching:
1. **Normalized exact match** — lowercase, trim, remove punctuation (e.g., "Norwegian Cruise Line" → "norwegian cruise line")
2. **Alias dictionary** — known aliases (e.g., "NCL" → "Norwegian Cruise Line", "RCCL" → "Royal Caribbean")
3. **Fuzzy threshold** — Levenshtein or similar, threshold > 0.85 confidence
4. **Manual review queue** — unmatched suppliers logged for human review

### Cruise Suppliers
1. Extract TourOperator name from booking (e.g., "Norwegian Cruise Line")
2. Create `suppliers` record
3. Match to `catalog.cruise_lines` using tiered matching above
4. Set `cruise_lines.supplierId` = created supplier ID
5. When creating `custom_cruise` activity, link via `custom_cruise_details.cruiseLineId`

### Tour Operators
1. Extract TourOperator name from booking
2. Create `suppliers` record
3. Match to `catalog.tour_operators` using tiered matching above
4. Set `tour_operators.supplierId` = created supplier ID (new FK)

### Other Suppliers (airlines, hotels, consolidators)
1. Create `suppliers` record
2. Store name in `activity_pricing.supplier` field

---

## Commission Enhancement Design

### TraveleSolutions Model (what we're importing)
Per booking: `{ Earned, Received, ReceivedParent, TotalReceived, Paid, Due, TotalDue, Rate, Adjustment }`

### Tailfire Enhanced Model (what we're building)
Per activity pricing, with tax awareness:

```
commission_tracking record:
├── gross_commission_cents     = Earned × 100
├── tax_amount_cents           = Tax portion (NEW - not in TraveleSolutions)
├── tax_type                   = 'HST', 'GST', etc. (NEW)
├── net_commission_cents       = Gross - Tax (NEW)
├── commission_rate            = Rate percentage
├── received_cents             = TotalReceived × 100
├── paid_cents                 = Paid × 100
├── adjustment_cents           = Adjustment × 100
├── received_parent_cents      = ReceivedParent × 100
├── commission_status          = pending | received | cancelled
├── source                     = 'travelesolutions' | 'traveltek' | 'manual'
└── source_booking_ref         = BookingNumber
```

**Tax example:** $500 commission earned, HST 13% applies
- `gross_commission_cents`: 50000
- `tax_amount_cents`: 6500
- `tax_type`: 'HST'
- `net_commission_cents`: 43500 (what you actually keep)
- `received_cents`: 43500 (what supplier paid you, tax already withheld)

---

## Reconciliation Checklist

After import, verify:

- [ ] Source contact count (800) = target contact count
- [ ] Source trip count (409) = target trip count
- [ ] Source traveler associations = target traveler associations
- [ ] Financial totals match (sum of booking PackagePrice = sum of activity totalPriceCents)
- [ ] Payment transaction totals match
- [ ] Commission totals match (sum of Earned = sum of gross_commission_cents)
- [ ] All trips tagged with correct trip type
- [ ] All trips in correct final status
- [ ] Suppliers created and linked to catalog where applicable
- [ ] 10 random contacts spot-checked
- [ ] 10 random trips spot-checked for itinerary completeness
- [ ] No orphaned travelers

---

## Pre-Migration Tailfire Changes Required

### Migration 1: Tour Operator Supplier FK
**Must use catalog guard pattern** (FDW-protected schema):
```sql
-- Only runs on Production where catalog tables are local (relkind = 'r')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'catalog' AND c.relname = 'tour_operators' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE catalog.tour_operators ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
  END IF;
END $$;
```

### Migration 2: Commission Tracking Enhancement
```sql
-- Add new tax-aware commission fields (preserves existing legacy columns)
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS gross_commission_cents INTEGER CHECK (gross_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER DEFAULT 0 CHECK (tax_amount_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS tax_type VARCHAR(50);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS net_commission_cents INTEGER CHECK (net_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_cents INTEGER DEFAULT 0 CHECK (received_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS paid_cents INTEGER DEFAULT 0 CHECK (paid_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS adjustment_cents INTEGER DEFAULT 0;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_parent_cents INTEGER DEFAULT 0 CHECK (received_parent_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'manual';
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS source_booking_ref VARCHAR(255);

-- Note: Existing legacy fields (commission_amount, commission_rate, commission_status)
-- are preserved for backward compatibility with financial-summary.service.ts
```

### API: Commission Endpoints
- `POST /activities/:id/commission` — Create commission record
- `GET /activities/:id/commission` — Get with tax breakdown
- `PATCH /activities/:id/commission` — Update received/paid/adjustment

---

## Risks

- JWT token expiry during long extraction runs — need token refresh
- Rate limiting on TraveleSolutions API — add configurable delays
- Trip creation triggers BullMQ automations — mitigated by draft-first approach
- Payment schedule sum validation — transform must ensure item sums = activity totals
- Supplier name matching to catalog may not be exact — need fuzzy matching + manual review queue
- Commission data is sparse (only ~19 of 581 bookings have commission) — import what exists

---

## Codex Validation Log

### Round 1 (earlier session)
- Identified tags as create-and-assign endpoints, not bulk assign
- Flagged trip status transition constraints (draft → booked needs travelers)
- Financial migration needed explicit activity pricing + payment schedule + transaction handling
- Country fields must be 3-char ISO codes

### Round 2 (earlier session)
- Trip type enum extension is broader than just SQL — requires DTO + shared-types + UI
- User decided: use `leisure` + tags instead (no enum change)
- Supplier linking: activity_pricing.supplier is partial, structured linkage preferred
- Commission tracking: skip is a reporting gap, prefer full import

### Round 3 (2026-03-04)
Validated updated design doc with all decisions incorporated. Findings:
1. **Commission enhancement**: Feasible but enforce 1:1 cardinality, preserve legacy fields, add check constraints, maintain `financial-summary.service.ts` compatibility
2. **Tour operator FK**: Concept right but must use catalog guard pattern (FDW-protected)
3. **13-step import order**: Mostly correct — add tag deduplication, admin auth for suppliers, ensure itinerary days before activities, find-or-update for payment schedules
4. **Supplier matching**: Needs normalized exact + alias dictionary + fuzzy threshold + manual review queue
5. **Trip type as leisure + tags**: Confirmed safe, also store original in `customFields.sourceTripType`

**Status: Plan approved with above refinements incorporated.**
