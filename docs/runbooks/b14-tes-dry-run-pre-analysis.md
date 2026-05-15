# B14 — TES Import Dry-Run Pre-Analysis

Code-grounded analysis of `scripts/migration/import-to-tailfire.ts` against current `main` (post-B1/B2/B4/B9/B10/B12 merges, 2026-05-15). Identifies likely failure modes for the tf-demo dry-run BEFORE running it, so the operator (Claude + Al paired) knows what to expect.

This is read-only static analysis. The actual dry-run still has to happen against tf-demo.

---

## Authentication context

The importer authenticates as **admin@phoenixvoyages.ca** (Supabase auth → `TAILFIRE_TOKEN` → Bearer header). Per `tes-import-runner.sh:108-122`. **Admin role bypasses** several launch-window policies:

- `PaymentScheduleLockPolicy` (PR #372) — admin can edit payment schedules on travelled/cancelled trips
- `RolesGuard` admin checks elsewhere

This significantly de-risks the dry-run. Most launch-window policy additions are agent-restrictive, not admin-restrictive.

---

## Risk-by-risk analysis (against punchlist B14 risk table)

### 🔴 HIGH risk → Likely OK with admin token

#### `PaymentScheduleLockPolicy` (PR #372) on travelled trips
**Importer touchpoints:**
- `import-to-tailfire.ts:2142` — `POST /payment-schedules/<configId>/expected-payment-items` (creates a payment item)
- `import-to-tailfire.ts:2210` — `POST /payment-schedules` (creates the schedule)
- `import-to-tailfire.ts:2222` — `GET /payment-schedules/activity-pricing/<id>` (read; safe)
- `import-to-tailfire.ts:2228` — `POST /payment-schedules/<configId>/expected-payment-items` (loop)
- `import-to-tailfire.ts:2384` — `POST /payment-schedules/transactions` (records a payment)
- `import-to-tailfire.ts:2445` — `POST /payment-schedules/transactions` (records a payment)

**Why it's likely OK:** The lock policy throws `BadRequestException` only when the actor's role is non-admin AND the trip status is `travelling`/`travelled`/`cancelled`. The importer is admin, so the policy bypasses. **Verify:** confirm the lock policy actually checks `auth.role === 'admin'` and not just user identity.

**Action item before dry-run:** grep `apps/api/src/trips/payment-schedule-lock-policy.ts` for the admin bypass condition; document the exact check.

#### `ActivityTravelerAssignmentPolicy.tryAssignAllTripTravelersToActivity` (PRs #354/#359/#366)
**Importer touchpoints:**
- `import-to-tailfire.ts:811` — `POST /trips/${tfTripId}/travelers` (creates trip travelers)
- `import-to-tailfire.ts:908,938,957,976` — `POST /activities/<type>` (creates activities)
- `import-to-tailfire.ts:1287` — `POST /activities/<id>/traveler-bookings` (assigns travelers manually)

**Why it's likely OK:** The new policy method has a `try*` prefix per CLAUDE.md §8 — failures are best-effort. The DB layer uses `ON CONFLICT DO NOTHING` so duplicate-assignment from both the policy AND the importer's manual `/traveler-bookings` POST is idempotent. The importer's flow is: create travelers → create activities → manually assign via traveler-bookings. The new policy fires once activity is created, but the manual step then runs and converges on the same state.

**Action item:** during dry-run, check `activity_traveler` rows for any cases where the policy assigned a traveler the importer didn't intend to assign (e.g. activity-level traveler subset). If found, either (a) disable the policy via env-flag for the import duration, or (b) accept that all trip travelers get assigned to all activities.

#### IC payouts schema (post-April 2 module on `main`)
**Importer touchpoints:** None. The importer does NOT POST to `/ic-invoices`, `/ic-disbursements`, or `/commission-adjustments` endpoints. Confirmed via grep.

**Treatment decision** (per B14 acceptance, must be made before dry-run):
- **Option A — Legacy commission only:** keep `IC_PAYOUTS_V2_ENABLED=false` (B8). Imported commission data lives in legacy tables. New IC schema stays empty. Future commission runs use IC v2 once the flag flips.
- **Option B — Backfill IC schema:** extend the importer to populate `ic_invoices` from imported `commission` rows. ~1 day of importer work.

**Recommendation:** Option A for launch. IC schema can backfill from legacy commission rows post-launch via a separate migration — zero data loss, clean cutover.

#### W1-W5 fixes (per `project_tes_commission_mapping.md`)
Per memory and the punchlist, the dev import used `admin-fixture` for all 426 trips. For prod cutover, real agent UUIDs are required.

**Status before dry-run:** unknown. Codex consult needed. Per the agent-mapping JSON we copied in B14 step-1 (`scripts/migration/data/agent-initials-mapping.json.example`), the script expects per-env user UUIDs.

**Action items before dry-run:**
- W1: Verify each agent in TES has a corresponding `user_profiles` row in tf-demo. Generate `data/agent-initials-mapping.json` for tf-demo (PII, NOT committed).
- W2: `trip_collaborators` backfill against real agents (script: `scripts/migration/backfill-trip-collaborators.sql`).
- W3: `commission_adjustments` decision — carry-over balances? Default: NO (start fresh).
- W4: Paid-checks decision — import historical or skip? Default: skip (financials reconciled post-launch separately).
- W5: Whatever else the project_tes_commission_mapping memory captures.

---

### 🟡 MEDIUM risk → Doesn't block import

#### TICO §38 expansion (B4, just merged)
The new validator only fires on `TripOrderService.finalizeTripOrder()`. The importer creates trips and activities but does NOT call finalize. **Imported trips will be importable but not finalizable** until each one has the new disclosure fields populated in the agency's `business_settings`. This is the expected post-import state.

**Action:** confirm `business_settings.document_passport_requirements`, `_visa_requirements`, `_insurance_requirements` are populated for Phoenix Voyages in tf-demo BEFORE attempting any post-import finalize.

---

### 🟢 LOW risk → Confirmed safe

- Activity `referralUrl` field (migration `20260514020444`) — importer doesn't send; field stays `null`. Safe.
- Booking-detail hydration fix (#355) — importer only writes; doesn't read. Safe.
- B1 consumer-activity scoping — importer doesn't touch `/consumer-activity/*` endpoints. Safe.
- B2 throttling on `/consumer-auth/register` — importer doesn't register consumers. Safe.

---

## What this analysis CAN'T tell you

The above is static. The actual dry-run will surface:
- Drift in DB schema between expected (per `_journal.json`) and actual (run `bash scripts/migration-drift-check.sh` from B9 first).
- Idempotency edge cases when re-running the importer with `--resume`.
- Per-trip data quirks (TES has many edge cases around group bookings, commission splits, etc.) — only the actual run finds these.

---

## Recommended dry-run flow

1. **Pre-flight (drift check):**
   ```bash
   DATABASE_URL=$(mcp_doppler_get tailfire stg DATABASE_URL) \
     bash scripts/migration-drift-check.sh
   ```
   Resolve any drift before proceeding.

2. **W1-W5 prep:**
   - Create `scripts/migration/data/agent-initials-mapping.json` for tf-demo.
   - Decide IC payouts treatment (recommend Option A above).
   - Decide commission_adjustments + paid-checks treatment.

3. **Set env vars:**
   - `TAILFIRE_TOKEN` from admin Supabase login (per `tes-import-runner.sh`).
   - `TAILFIRE_API=https://api-dev.tailfire.ca/api/v1` (tf-demo).
   - `IC_PAYOUTS_V2_ENABLED=false` confirmed in stg Doppler.

4. **Dry-run:**
   ```bash
   bash scripts/migration/tes-import-runner.sh --dry-run
   ```

5. **Capture every failure** — patch the script (in-tree now) — re-run.

6. **Validate counts:**
   ```bash
   pnpm tsx scripts/migration/validate-import.ts
   ```

7. **Codex gate (mandatory per goal):** "After B14 dry-run completes on tf-demo: review report — failures, count deviations, W1-W5 status, IC payouts treatment decision."

8. Only after Codex APPROVE → proceed to Phase 4 prod import.

---

## Pre-analysis verdict

The HIGH-risk items in the punchlist look likely-OK because the importer runs as admin (bypassing PaymentScheduleLockPolicy) and the traveler-assignment race is convergent (DB ON CONFLICT DO NOTHING + manual step in importer overrides).

The actual blockers for the dry-run are W1-W5 (agent mapping prep) + the IC payouts treatment decision. Both are operational decisions, not code blockers.

**Estimated dry-run wall time:** 30-60 minutes for the actual run, plus 1-2 hours for W1-W5 prep beforehand. The "2-3 days" estimate in the punchlist accounts for iteration on script patches if the dry-run finds issues — that's the realistic worst case.
