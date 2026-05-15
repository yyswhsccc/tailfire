# TES → TF Cutover Backfill Plan

**Status:** Draft — Codex SMALL FIXES verdict (2026-05-15)
**Owner:** Al (aguertin@phoenixvoyages.ca)
**Scope:** Production cutover of Phoenix Voyages from TraveleSolutions (TES) to Tailfire (TF). Goal: imported data is indistinguishable from natively-created TF data. No "TES leftover" smell.

## Executive Summary

The 2026-03-23 TES import created functionally clean data (no broken FKs, every trip reachable, every contact named) but with several field-level completeness gaps and three semantic gaps that would surface as bugs post-cutover. The most consequential is **commission settlement absence** — without remediation, all historical TES paid commissions reappear on agent payout dashboards as still-owed at cutover.

This plan addresses six phases:

1. **API code support** (cancellation policy schema, package details Zod, settlement endpoint) — must deploy to prod API before importer can use new fields
2. **Importer patches** — wire new fields through `scripts/migration/import-to-tailfire.ts`
3. **Supplier dedup workflow** — tiered classifier with offline AI tiebreaker for ambiguous cases ("Air Canada" vs "Air Canada Vacations")
4. **End-to-end import on disposable prod-clone** — proves importer + new code work together (B14 acceptance)
5. **Post-import backfills** — for existing tf-demo data and as safety nets if prod cutover misses anything
6. **Post-cutover maintenance** — supplier name collapse, audit script hygiene

## Investigation Findings (read-only audit)

Source: `scripts/migration/shape-diff.sh` plus targeted DB queries against tf-demo on 2026-05-15.

| ID | Gap | tf-demo state | Load-bearing? |
|---|---|---|---|
| **G1** | `activity_pricing.cancellation_policy` NULL | 1582 of 1586 (97%) | **Yes** — finalize() gate |
| **G3** | `payment_transactions.contact_id` NULL | 1001 of 4875 (929 fixable, 72 stay NULL) | Fidelity cleanup |
| **G4** | `activity_pricing.total_price_cents` = 0 | 849 of 1586 — **NOT A GAP**: 615 package children (correct), 232 unbooked placeholders (correct), 2 booked $0 anomalies | No — close after manual review of 2 anomalies |
| **G5** | `itinerary_activities.trip_id` NULL | 1625 — **NOT A GAP**: schema reaches trip via itinerary_day chain | No |
| **G6** | `package_details` row missing on imported packages | 100% (201 of 201) | **Yes** — UI shows empty section |
| **W1** | `trips.owner_id` = admin fixture | 510 of 523 | **Yes** — agent "My Trips" filter |
| **S1** | TES supplier import creates duplicates against existing TF suppliers | 0/380 deduped against prod | **Yes** — receivables ledger integrity |
| **S3** | TES has near-duplicate supplier names ("AIR CANADA" / "Air Canada") | Unmeasured pre-extract | Post-cutover maintenance |
| **#33** | `commission_item_settlements` missing | 0 of 249 check_items have settlements; 0 paid checks exist on tf-demo | **CRITICAL — biggest item** |

### Resolved non-issues (DO NOT include in backfill)

- **G4 zero pricing**: package math verified — 200 of 201 packages have parent priced + all children $0. Native TF accounting. Only 2 of 1586 activities are real anomalies (booked + $0).
- **G5 trip_id NULL**: itinerary_activities reach trips via `itinerary_day_id → itineraries → trips`. All 1625 NULL rows are reachable.
- **`trips.primary_supplier_id`**: schema field exists but no service or UI reads/writes it. Vestigial. Suppliers attach at activity layer (`activity_suppliers` join).

## Supplier FK Surface

Suppliers are linked at multiple points; the importer populates some but not all:

| Table | Column | Importer populates? |
|---|---|---|
| `activity_suppliers` (join) | `supplier_id` | Step 10 ✅ |
| `commission_checks` | `sender_supplier_id` (received) | Step 11 ✅ |
| `commission_check_items` | indirect via `activity_pricing_id` | Step 11 ✅ |
| `package_details` | `supplier_id` | ❌ Row doesn't exist (G6) |
| `trip_groups` | `primary_supplier_id` | N/A — TES has no group concept |
| `trips` | `primary_supplier_id` | ⚠️ Vestigial — leave NULL |
| `payment_transactions` | (none) | Reached via chain |

**Receivables integrity depends on supplier dedup being correct at cutover** — a "duplicate Air Canada" splits the A/R ledger across two supplier UUIDs.

## Phase 1 — API Code Support

Lands in `main`, deploys via normal flow before any cutover import runs.

### P1.A — Cancellation policy support in activity create + PATCH pricing

| File | Change |
|---|---|
| `packages/shared-types/src/schemas/activity.schema.ts:90` | Add `cancellationPolicy: z.string().optional()` to create schema (camelCase in API surface) |
| Same file | Add `cancellationPolicy: z.string().optional()` to PATCH pricing schema |
| `apps/api/src/trips/activities.service.ts:624` | When auto-creating `activity_pricing` row, persist `cancellation_policy` (snake_case DB column) from `dto.cancellationPolicy` |
| `apps/api/src/trips/activities.service.ts:851` | PATCH pricing path: persist `cancellation_policy` from `dto.cancellationPolicy` |
| Swagger | Auto-generated from Zod |

**Acceptance:** POST `/activities` with `cancellationPolicy` field persists the value; PATCH on activity pricing updates the value; field appears on activity detail responses.

### P1.B — packageDetails block in activity create (shared Zod)

| File | Change |
|---|---|
| `packages/shared-types/src/schemas/activity.schema.ts` | Add optional `packageDetails: { supplierId, supplierName, paymentStatus, cancellationPolicy, ... }` block to create schema |
| `apps/api/src/trips/activities.controller.ts:297` | Pass `packageDetails` through with `dto` and `tripId` (currently stripped) |
| `apps/api/src/trips/activities.service.ts` | When `activity_type='package'` and `packageDetails` provided, call `createPackageDetails(activityId, packageDetails)` |

**Acceptance:** POST `/activities` with `activityType:'package'` and a `packageDetails` block creates a `package_details` row alongside the activity.

### P1.C — Transactional settlement API for historical paid commissions (NEW)

**Codex's specific guidance:** do not rely on `/commission/checks/:id/items` (only inserts check_items, not settlements) or `acceptCheck()` (only flips status). The importer/backfill must insert `commission_item_settlements` directly OR call a new transactional endpoint.

| File | Change |
|---|---|
| `apps/api/src/financials/commission/commission.controller.ts` | New endpoint: `POST /commission/checks/historical-paid` — accepts `{ recipientUserId, checkNumber, checkDate, settledAmountCents, currency, settlements: [{ checkItemId, settledAmountCents }], source: 'travelesolutions', sourceRef }` |
| `apps/api/src/financials/commission/commission.service.ts` | New method `createHistoricalPaidCheck()`: inside a transaction, INSERT `commission_checks` (check_type='paid', status='accepted', source from payload), INSERT `commission_item_settlements` for each line (ON CONFLICT (check_item_id, recipient_user_id) DO NOTHING) |
| Same | Field `settled_amount_cents` = **preserve TES `Commission.Paid`** — do NOT re-derive with native formula (rewrites history) |

**Acceptance:**
- Endpoint creates one paid check + N settlements in one transaction
- `getCommissionDue()` returns 0 owed for any check_item that now has a matching settlement
- Re-running the endpoint is idempotent (ON CONFLICT prevents duplicates)
- Endpoint admin-only

### P1.D — TICO compliance review (external)

| Action | Owner |
|---|---|
| Legal review of per-type cancellation policy boilerplate | Phoenix Voyages legal counsel |

**Decision needed:** is "Per airline fare rules. See booking confirmation for details." sufficient under Reg 26/05 §38, or does §38 require literal per-booking contract text? If literal, strategy changes from boilerplate backfill to "fetch from booking confirmation PDF" (very different effort profile).

## Phase 2 — Importer Patches

Lands in `scripts/migration/import-to-tailfire.ts`. Cannot proceed until P1.A/B/C are deployed.

### P2.A — Pass cancellationPolicy on Step 7 POST /activities

Source value lookup order:
1. `supplier.default_cancellation_policy` for the booking's TourOperator (4 of 380 suppliers have this populated)
2. Per-type boilerplate from a new constants table:

```ts
const CANCELLATION_BOILERPLATE: Record<ActivityType, string> = {
  flight:         "Per airline fare rules. See booking confirmation for details.",
  lodging:        "Per hotel cancellation policy in booking confirmation.",
  custom_cruise:  "Per cruise line standard cancellation schedule.",
  tour:           "Per tour operator terms. See booking confirmation.",
  transportation: "Non-refundable within 48 hours of service.",
  insurance:      "Per policy terms and conditions.",
  package:        "Per tour operator terms; subject to bundle restrictions.",
  options:        "See booking confirmation.",
}
```

3. Skip activities with no booking association (planning placeholders — cancellation policy not relevant)

### P2.B — Pass packageDetails block on Step 7 for activity_type='package'

```ts
packageDetails: {
  supplierId: tfSupplierUuid,
  supplierName: booking.TourOperator?.TourOperatorName,
  paymentStatus: 'unpaid',
  cancellationPolicy: <same source as P2.A>,
}
```

### P2.C — Replace Step 14b with new settlement endpoint

Current code at `import-to-tailfire.ts:2616` calls `/commission/checks` then `/accept`. Replace with single `POST /commission/checks/historical-paid` call that includes the settlement payload built from ledger lookup:

```ts
// For each booking with Commission.Paid > 0:
// 1. Find activity_ids for the booking via ledger
// 2. Find commission_check_items via activity_pricing_id IN (... pricing rows for those activities ...)
// 3. Build settlements: [{ checkItemId, settledAmountCents: proportional split of TES.Paid }]
// 4. POST /commission/checks/historical-paid with the full payload
```

**Allocation across multiple check_items per booking:** distribute `Commission.Paid` proportionally by `received_cents`. Sum of allocations equals exact TES amount (no rounding loss).

### P2.D — Step 1 reads signed alias map (depends on Phase 3 output)

```ts
// Before creating supplier via POST /suppliers, check signed map:
const map = loadJson<SupplierAliasMap>('supplier-aliases-signed.json')
const existing = map.tourOperatorIdToTfUuid[String(s.TourOperatorID)]
if (existing) {
  addMapping(ledger, { sourceType: 'supplier', sourceId: s.TourOperatorID, tailfireId: existing, status: 'reused' })
  continue
}
// else: create new
```

## Phase 3 — Pre-Cutover Supplier Dedup Workflow

Codex's specific note: AI tier runs OFFLINE/CACHED. No AI SDK runtime dependency in the importer. Signed alias map IS the runtime artifact.

### P3.A — Build classifier

Standalone Node script: `scripts/migration/supplier-dedup.ts`

**Tier logic** (in order; first match wins):

```
T0  Exact case-insensitive match (trimmed)        → auto-merge
T1  Curated alias whitelist                        → auto-merge
    Examples: CCL ↔ Carnival, NCL ↔ Norwegian Cruise Line,
              AC ↔ Air Canada (airline), WS ↔ WestJet
T2  Safe fuzzy:
      (Levenshtein ≤ 2 OR Jaro-Winkler ≥ 0.95)
      AND neither name contains any of:
        Vacations, Holidays, Tours, Airlines, Air, Airways, Cruises
      that the other doesn't                       → auto-merge
T3  Borderline (high similarity + business-class divergence):
      Call Claude Sonnet via offline CLI:
        Input: both names, BookingCount, supplier_categories,
               recent commission patterns if available
        Output: { decision, confidence, reasoning }
      Cache result in CSV/JSON.                    → human review
T4  No match                                       → create new
```

**Canonical Tier 3 examples that MUST stay separate:**
- Air Canada (airline) ≠ Air Canada Vacations (tour operator)
- WestJet ≠ WestJet Vacations
- Sunwing Airlines ≠ Sunwing Vacations
- Transat / Air Transat ≠ Transat Holidays

### P3.B — Dry-run pre-pass output

`scripts/migration/output/supplier-merge-decisions.csv` with columns:
- `tes_tour_operator_id`, `tes_name`, `tes_booking_count`
- `candidate_tf_name`, `candidate_tf_uuid`
- `tier` (T0–T4)
- `classifier_score` (Levenshtein / JW)
- `ai_decision`, `ai_confidence`, `ai_reasoning` (T3 only)
- `suggested_action` (merge / create_new / human_review)
- `final_decision` (filled in by human)
- `approver` (filled in by human)

### P3.C — Human review

Approver fills `final_decision` and `approver` columns for all T3 rows + spot-checks T2. Spreadsheet committed back. Build step converts to `supplier-aliases-signed.json` (committed to repo, read by importer in P2.D).

### P3.D — Immutable audit artifact

`scripts/migration/audit-logs/supplier-merge-audit-{timestamp}.jsonl` — append-only log, one JSON object per decision:

```json
{
  "timestamp": "2026-XX-XXTXX:XX:XXZ",
  "tier": "T3",
  "tes_name": "Air Canada Vacations",
  "tes_tour_operator_id": 123,
  "candidate_tf_name": "Air Canada",
  "candidate_tf_uuid": "uuid-...",
  "classifier_score": 0.93,
  "ai_decision": "create_new",
  "ai_confidence": 0.95,
  "ai_reasoning": "Different IATA codes (AC vs ACV)...",
  "final_decision": "create_new",
  "approver": "aguertin@phoenixvoyages.ca"
}
```

Committed to git as the immutable record of every cutover supplier decision.

## Phase 4 — Disposable Prod-Clone End-to-End Run

Codex's prior B14 acceptance: a real write-import on a disposable environment, not `--dry-run`.

| Step | Action |
|---|---|
| P4.A | Stand up disposable Supabase project (NOT tf-demo — UAT continuity matters). Recommend `tf-import-clone-2026XXXX` |
| P4.B | Re-extract from TES via `scripts/migration/extract-travelesolutions.ts` using `mguertin` account (NOT aguertin — PII returns NULL) |
| P4.C | Run full write-import with all P1-P3 code in place. NOT `--dry-run` |
| P4.D | Run `POST /trips/backfill-lifecycle` + `POST /contacts/backfill-lifecycle` |
| P4.E | Run `validate-import.ts` — counts match expected, no drift |
| P4.F | Specifically verify post-import:<br/>• 0 NULL `contact_id` on real payment txns (allow NULL on `notes LIKE 'TES import fallback%'`)<br/>• 0 NULL `cancellation_policy`<br/>• All packages have `package_details` rows<br/>• `getCommissionDue()` returns 0 for any TES agent with all-historical work<br/>• `owner_id` distribution shows real agents (not admin fixture)<br/>• `commission_checks` has paid checks with matching settlements |

If P4.F passes, the importer is cutover-ready. If not, iterate Phase 1/2 until it does.

## Phase 5 — Post-Import Backfills

For existing tf-demo data already imported pre-fix, AND as safety nets for prod if anything slips through.

**Order matters:** tf-demo #33 cleanup must complete BEFORE agent finance UAT (Codex specific instruction).

### P5.A — Migrations (against tf-demo first)

| Order | Item | Migration |
|---|---|---|
| 1 | **#33 commission settlements** | Walk ledger.json → resolve TES BookingID → activity_ids → check_items → INSERT paid check + settlements via `POST /commission/checks/historical-paid` (or direct SQL fallback if API not yet deployed). Settlement amounts preserve TES `Commission.Paid` proportionally. |
| 2 | **#25 cancellation_policy** | `UPDATE activity_pricing SET cancellation_policy = CASE WHEN <supplier default exists> THEN <supplier default> ELSE <per-type boilerplate> END WHERE cancellation_policy IS NULL` |
| 3 | **#31 package_details** | `INSERT INTO package_details (activity_id, supplier_id, supplier_name, payment_status, cancellation_policy) SELECT ia.id, asup.supplier_id, s.name, 'unpaid', '<boilerplate>' FROM itinerary_activities ia JOIN activity_suppliers asup ON ... WHERE ia.activity_type='package' AND NOT EXISTS (SELECT 1 FROM package_details WHERE activity_id=ia.id)` |
| 4 | **#30 owner_id remap** | Call `reassignTripOwner` service (or mirror its 3-step transaction in SQL) for each of 510 trips owned by admin-fixture. Sets `trips.owner_id` + lead `trip_collaborators` flag + `contacts.assigned_to` atomically per trip. |
| 5 | **#26 contact_id** (fidelity only) | Re-extract `payments.json` from TES, build PaymentID → contact_id map via `payment.Client.ClientID`, UPDATE 929 fixable rows. Leave 55 fallback rows + 17 other as NULL. |

### P5.B — Re-run shape-diff with refined segmentation

Confirm 0 real gaps. The 232 unbooked-placeholder $0 rows remain (legitimate). The 2 booked-$0 anomalies handled by P5.C.

### P5.C — Manual classification of 2 booked $0 flight anomalies

Look up the 2 rows, ask Phoenix Voyages whether they should have a price (agent comp / data entry error / real $0), and either set a price or mark exempt.

## Phase 6 — Post-Cutover (deferred)

| Item | Description |
|---|---|
| #29 within-TES supplier name collapse | Maintenance pass to merge near-duplicate names within freshly imported TF supplier set ("AIR CANADA" vs "Air Canada"). Re-point `activity_suppliers.supplier_id` and `commission_checks.sender_supplier_id` to survivor, delete loser. |
| #32 shape-diff segmentation refinement | Update audit script §4.4 to segment by `parent_activity_id IS NULL AND booking_status='booked'` so re-audits don't false-positive on package-child $0 rows. |

## Acceptance Criteria for Prod Cutover

All of:

- [ ] Phase 1 code deployed to prod API (`api.tailfire.ca`)
- [ ] Phase 2 importer patches committed in `scripts/migration/import-to-tailfire.ts`
- [ ] Phase 3 signed alias map produced + committed
- [ ] Phase 4 dry-run import on disposable env passes P4.F verification
- [ ] Phase 5 P5.A migrations dry-run on tf-demo, re-audit shows 0 real gaps
- [ ] TICO P1.D legal sign-off received
- [ ] Codex final review (re-validate) shows no blocking issues

## Open Decisions

| # | Decision | Status |
|---|---|---|
| 1 | TICO §38 granularity — boilerplate sufficient or literal per-booking? | **Awaiting legal review** |
| 2 | Settlement amount allocation when one paid check spans multiple check_items — proportional by `received_cents` (recommended) or equal split? | Recommended proportional, awaiting Codex sanity check on actual data |
| 3 | Disposable prod-clone env name + Supabase region — match prod (`ca-central-1`)? | Yes, ca-central-1 |
| 4 | Who approves Tier 3 supplier dedup decisions? | Al + Phoenix Voyages ops lead |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 schema changes break existing admin/OTA forms | Add fields as optional in Zod; existing callers continue without change |
| `POST /commission/checks/historical-paid` is destructive if called twice on same booking | ON CONFLICT (check_item_id, recipient_user_id) DO NOTHING idempotency |
| Supplier dedup AI returns inconsistent results across re-runs | Cache LLM output in signed map; reruns read cache instead of re-asking |
| TES re-extract returns different data than 2026-03-23 baseline | Validate row counts against baseline; flag deltas for review |
| Prod cutover hits a gap not caught in Phase 4 | Phase 5 migrations are safety net; can run post-cutover |

## References

- Codex review thread (2026-05-15): two-round REWORK → SMALL FIXES
- Investigation queries: `/tmp/shape-diff-report.md`
- Shape-diff source: `scripts/migration/shape-diff.sh`
- Existing TES runbook: `docs/TES_MIGRATION_RUNBOOK.md`
- B14 dry-run pre-analysis: `docs/runbooks/b14-tes-dry-run-pre-analysis.md`
- TICO compliance doc: `docs/COMPLIANCE_TICO.md`
