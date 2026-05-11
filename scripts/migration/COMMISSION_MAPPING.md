# TES → Tailfire Commission Mapping

Reference runbook for the IC Payouts production cutover import.
Script location: `../../../scripts/migration/import-to-tailfire.ts` (sibling directory, not in this repo).

## Background

TraveleSolutions (TES) has only 2-3 user accounts. One user creates all trips on
behalf of every agent. The real agent is identified by uppercase initials in
parentheses at the end of the trip name:

```
"Smith Family Mexico 2026 (SL)" → agent = SL (Sebastian Larente)
"Jones Caribbean Cruise (MG)"  → agent = MG
```

16 unique initials found across 429 trips in the Dev import:
`JL, SL, MG, AG, DB, DH, RS, AC, HB, PL, MP, CB, MF, HD, CF, AR`

109 trips had no parseable initials in the Dev dataset; these fall back to the
admin user and are written to `warnings.json` for manual review.

## Pre-Import Setup

### 1. Provision TF Users

All agent accounts must be created manually in the target TF environment
(TF-Demo or Production) **before** running the import. The import script only
assigns ownership by UUID — it does not create users.

### 2. Build the Agent Mapping Config

```bash
cp scripts/migration/data/agent-initials-mapping.json.example \
   scripts/migration/data/agent-initials-mapping.json
```

Edit `agent-initials-mapping.json` and replace every `00000000-...` placeholder
with the real `user_profiles.id` UUID from that environment:

```sql
SELECT id, email FROM user_profiles WHERE agency_id = '<your-agency-id>';
```

### 3. Build the Supplier Currency Config (optional)

```bash
cp scripts/migration/data/supplier-currency-overrides.json.example \
   scripts/migration/data/supplier-currency-overrides.json
```

The default file covers common cruise lines (USD). Add or remove entries to
match the actual TES tour operator names in your dataset. Operator names must
match exactly (case-sensitive) what TES exports as `TourOperatorName`.

### 4. Set Required Environment Variables

| Variable | Description |
|---|---|
| `TAILFIRE_TOKEN` | Admin JWT from target TF environment |
| `TAILFIRE_API` | API base URL (default: `http://localhost:3101/api/v1`) |
| `ADMIN_FALLBACK_USER_ID` | UUID of the admin user for unmapped trips |
| `AGENT_MAPPING_PATH` | Optional override path to mapping JSON |
| `SUPPLIER_CURRENCY_PATH` | Optional override path to currency JSON |

## What the Import Script Does (Commission-Relevant Steps)

### Step 3a — Assign trip owner from initials (NEW)

After creating each trip, the script calls `PATCH /trips/:id/owner` to re-assign
ownership to the resolved agent. This endpoint atomically updates:
- `trips.owner_id`
- `trip_collaborators` (deactivates old lead, upserts new lead at 100%)

Trips with no parseable or unmapped initials are assigned to `ADMIN_FALLBACK_USER_ID`
and logged to `warnings.json`.

### Step 14 — Received commission checks

Imports `commission-checks.json` (supplier→agency checks). Currency is now
detected per supplier via `supplier-currency-overrides.json` (was hardcoded CAD).

### Step 14b — Paid commission checks (NEW)

Imports `booking.Commission.Paid` as discrete check rows for each booking with
a positive paid amount:
- `checkType = 'paid'`
- `status = 'accepted'` (transitioned via pending→submitted→accepted)
- Idempotent: keyed by `TES-PAID-{bookingId}`
- These are pre-cutover historical settlements; TES is source of truth.

### Step 14c — Commission adjustments (NEW)

Imports `booking.Commission.Adjustment` as `commission_adjustments` rows:
- `adjustmentType = 'agent'`
- `status = 'pending'` (finance team reviews and applies post-import)
- Endpoint: `POST /commission/adjustments`
- Graceful 404 degradation: if endpoint missing, logs and reports — does not crash.

### Step 15 — Commission check items

Unchanged. Links received checks to activity_pricing rows.

## Decisions Made

| Decision | Rationale |
|---|---|
| Paid checks as `status='accepted'` | Pre-cutover settlements are facts; no review needed |
| Adjustments as `status='pending'` | Finance team validates each adjustment post-import |
| Currency via override map | Most CA suppliers = CAD; cruise lines typically settle USD |
| Unparseable trip names → admin fallback | 109/429 trips have no initials; import must not block |
| `PATCH /trips/:id/owner` (not direct INSERT) | Atomically syncs trip_collaborators; avoids partial state |

## Post-Import Verification

### Check trip_collaborators coverage

```sql
-- What fraction of trips have a non-admin collaborator?
SELECT
  COUNT(*) FILTER (WHERE tc.user_id != '<admin-uuid>') AS agent_assigned,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE tc.user_id != '<admin-uuid>') / COUNT(*), 1) AS pct
FROM trips t
LEFT JOIN trip_collaborators tc ON tc.trip_id = t.id AND tc.is_active = true AND tc.role = 'lead';
```

### Check paid commission checks

```sql
SELECT status, COUNT(*), SUM(check_amount_cents)/100.0 AS total_amount
FROM commission_checks
WHERE check_type = 'paid' AND source = 'travelesolutions'
GROUP BY status;
```

### Check commission adjustments

```sql
SELECT status, adjustment_type, COUNT(*), SUM(amount_cents)/100.0 AS total
FROM commission_adjustments
WHERE source = 'travelesolutions'
GROUP BY status, adjustment_type;
```

### Check unmapped trips (admin fallback)

After import, review `data/migration/warnings.json`. Trips in that list need
manual owner assignment in the TF admin UI, or re-run the `trips` step after
adding the missing initials to `agent-initials-mapping.json`.

## Re-Running Individual Steps

```bash
# Re-run only the owner assignment (after adding new initials to mapping):
TAILFIRE_TOKEN="..." ADMIN_FALLBACK_USER_ID="..." \
  npx tsx scripts/migration/import-to-tailfire.ts --step trips --resume

# Re-run only paid checks:
TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts --step paidCommissionChecks --resume

# Re-run only adjustments:
TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts --step commissionAdjustments --resume
```
