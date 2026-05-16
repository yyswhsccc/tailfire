# PR-4 TF-Demo Execution Runbook

**Goal:** prove the post-PR-1/2/3/4 commission stack works end-to-end against real-shape data on tf-demo (Preview Supabase + Railway api-dev), so we can flip `IC_PAYOUTS_V2_ENABLED=true` on stg with confidence.

**Status:** Pending. PR-4 (importer + verifier code) shipped to main on 2026-05-16 as PR #423. This runbook executes Phase B + C from the PR-4 plan.

**Owner:** Al (one-engineer execution).

**Estimated time:** 1-2 work sessions including agent provisioning + first import + verification + 1 claim lifecycle.

---

## Pre-flight (must be true before starting)

- [ ] PR #423 merged to main (commit `6c5a7aba`) — adds the importer reorder + Step 15b/15c + hardened verifier
- [ ] PR #422 merged to main — adds dev-drift commission_tracking *_cents reapply
- [ ] PR #421 merged to main — adds 3 missing-on-prod schema reapply migrations
- [ ] PR #420 merged to main — adds DROP+CREATE for v_commission_position view (PR-3 hotfix)
- [ ] Prod deploy of `6c5a7aba` complete and green
- [ ] All 3 Supabase DBs aligned at the schema level (per the drift audit earlier today)
- [ ] `IC_PAYOUTS_V2_ENABLED=false` in Doppler `dev` / `stg` / `prd` (confirmed earlier)

---

## Phase B1 — Provision Phoenix Voyages agent users on tf-demo

**Decision (per Codex round-1):** use the `/users/invite` endpoint, NOT raw Supabase SQL. It creates Supabase Auth + `user_profiles` atomically and sends the invite email.

### B1.1 — Get tf-demo admin JWT

```bash
# Use admin@phoenixvoyages.ca / Phoenix2026! (memory)
TAILFIRE_API="https://api-dev.tailfire.ca/api/v1"
TAILFIRE_TOKEN=$(curl -sX POST "$TAILFIRE_API/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@phoenixvoyages.ca","password":"Phoenix2026!"}' \
  | jq -r '.access_token')
echo "${#TAILFIRE_TOKEN} char token"
```

If sign-in fails: check whether tf-demo's admin user has been provisioned. If not, provision via Supabase MCP `secrets_get stg SUPABASE_SERVICE_ROLE_KEY` + direct auth.admin call. **Confirm with user before any direct DB writes.**

### B1.2 — List the 16 agent initials that need provisioning

Source: `scripts/migration/COMMISSION_MAPPING.md:18`
```
JL, SL, MG, AG, DB, DH, RS, AC, HB, PL, MP, CB, MF, HD, CF, AR
```

### B1.3 — Get the real agent identities

From Phoenix Voyages: full name + email per initial. Until that table exists, draft a synthetic mapping for tf-demo testing (use phoenixvoyages.ca email aliases). **Do NOT commit the real mapping JSON to git** — it contains PII.

Save the mapping outside the repo:
```
~/.local/share/tailfire/tf-demo-agent-mapping.json
```

### B1.4 — Invite each agent

```bash
for initials in JL SL MG AG DB DH RS AC HB PL MP CB MF HD CF AR; do
  email="$(jq -r ".\"$initials\".email" ~/.local/share/tailfire/tf-demo-agent-mapping.json)"
  fullname="$(jq -r ".\"$initials\".fullName" ~/.local/share/tailfire/tf-demo-agent-mapping.json)"
  curl -sX POST "$TAILFIRE_API/users/invite" \
    -H "Authorization: Bearer $TAILFIRE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"fullName\":\"$fullname\",\"role\":\"user\"}" \
    | jq -r '.id // .message'
done
```

### B1.5 — Capture the UUIDs

```bash
# Query Preview DB directly via Doppler-managed connection string
psql "$(mcp_secret stg DATABASE_URL)" -At -F'|' -c "
  SELECT email, id FROM user_profiles WHERE email IN (
    'jl@phoenixvoyages.ca', 'sl@...', ...
  )"
```

Use the output to populate the real `agent-initials-mapping.json` (still outside the repo).

---

## Phase B2 — Build the local config files

### B2.1 — agent-initials-mapping.json

```bash
cp scripts/migration/data/agent-initials-mapping.json.example \
   scripts/migration/data/agent-initials-mapping.json
# Edit and replace every 00000000-... with the real UUID
```

This file is **gitignored** by the existing `scripts/migration/data/.gitignore`. Verify before saving:
```bash
git check-ignore scripts/migration/data/agent-initials-mapping.json
# Expected: prints the path (means it's ignored)
```

### B2.2 — supplier-currency-overrides.json

```bash
cp scripts/migration/data/supplier-currency-overrides.json.example \
   scripts/migration/data/supplier-currency-overrides.json
```

The example file already covers common cruise lines (USD). Tweak if the TES export uses slightly different `TourOperatorName` strings — must match exactly (case-sensitive).

---

## Phase B3 — Extract fresh TES data

**Critical:** use `mguertin` credentials (per memory `feedback_tes_extraction_account`). `aguertin` returns NULL PII.

```bash
TES_USER=mguertin \
TES_PASS="<from password manager>" \
TES_COMPANY=PhoenixV \
  npx tsx scripts/migration/extract-travelesolutions.ts \
    --output scripts/migration/data/
```

Confirms: `scripts/migration/data/{bookings.json,commission-checks.json,payments.json,...}` populated.

---

## Phase B4 — Run the import against tf-demo

### B4.1 — Set required env vars

```bash
export TAILFIRE_API="https://api-dev.tailfire.ca/api/v1"
export TAILFIRE_TOKEN="$TAILFIRE_TOKEN"  # from B1.1
export ADMIN_FALLBACK_USER_ID="$(jq -r '.JL.userId' scripts/migration/data/agent-initials-mapping.json)"
# (or use the admin user UUID — the fallback should be a real, never-claiming user)
```

### B4.2 — Optional dry-run

```bash
DRY_RUN=true npx tsx scripts/migration/import-to-tailfire.ts 2>&1 | tee /tmp/tes-import-dry.log
```

Per Codex: "useful for config and parsing sanity, but do not trust it for commission readiness because later steps depend on DB state that dry-run cannot create."

### B4.3 — Real import

```bash
npx tsx scripts/migration/import-to-tailfire.ts 2>&1 | tee /tmp/tes-import.log
```

**Expected new step sequence (per PR-4):**
1. suppliers → contacts → trips → insurance → supplierLinks → commission
2. paymentSchedules → paymentTransactions
3. commissionChecks (creates, NEVER accepts)
4. commissionCheckItems (Step 15)
5. **reconcileImportedTracking** (NEW Step 15b — bulk-reconcile Accepted-only)
6. **acceptReceivedChecks** (NEW Step 15c — GET-first idempotent accept)
7. paidCommissionChecks (Step 14b)
8. commissionAdjustments (Step 14c)
9. draftFixup (lifecycle backfill)

If any step throws (gate-step contract from PR-4), fix the cause and resume:
```bash
RESUME=true npx tsx scripts/migration/import-to-tailfire.ts
# Or target a single step:
RESUME=true npx tsx scripts/migration/import-to-tailfire.ts --step reconcileImportedTracking
```

---

## Phase B5 — Verify

```bash
TEST_AGENT_INITIALS=JL \
ADMIN_FALLBACK_USER_ID="$ADMIN_FALLBACK_USER_ID" \
DATABASE_URL="$(mcp_secret stg DATABASE_URL)" \
  npx tsx scripts/migration/verify-commission-mapping.ts
```

**Pass criteria:** every REQUIRED check ✓. The verifier exits non-zero on any REQUIRED failure.

If failures:
- `Agent mapping file present and populated` → rerun B2.1
- `trip_collaborators distributed across multiple agents` → import didn't run Step 3a successfully (check warnings.json, re-run with `--step trips --resume`)
- `Admin fallback owns < 50% of leads` → too many trips fell back to admin (unparseable initials); add the missing initials to mapping then re-run trips step
- `All accepted-received check items have reconciled commission_tracking` → Step 15b errored or was skipped; re-run with `--step reconcileImportedTracking --resume`
- `Historical paid commission_checks present` → Step 14b errored or bookings.json had no Commission.Paid > 0 (informational only — manual confirm OK)
- `IC eligibility > 0 for test agent` → likely cascade from the above. Verify with manual SQL:
  ```sql
  SELECT COUNT(*) FROM commission_check_items cci
    JOIN commission_checks cc ON cc.id = cci.check_id
    JOIN trip_collaborators tc ON tc.user_id = '<JL uuid>' AND tc.is_active
    ...
  ```

---

## Phase B6 — Smoke-test IC eligibility endpoint

### B6.1 — Get a test agent JWT

```bash
# JL completes onboarding via the invite email, sets a password
# Then sign in:
AGENT_TOKEN=$(curl -sX POST "$TAILFIRE_API/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(jq -r '.JL.email' ~/.local/share/tailfire/tf-demo-agent-mapping.json)\",\"password\":\"<password JL set>\"}" \
  | jq -r '.access_token')
```

### B6.2 — Hit /ic-payouts/me/eligible

```bash
curl -s "$TAILFIRE_API/ic-payouts/me/eligible" \
  -H "Authorization: Bearer $AGENT_TOKEN" | jq '. | length'
```

**Expected:** non-zero count, matching the verifier's eligibility check.

If 0 returned even though verifier said >0: re-check Doppler — `IC_PAYOUTS_V2_ENABLED=true` must be set on `stg` for the V2 endpoint. **This is the actual flag flip — see Phase D.**

Actually wait: V2 endpoints are GATED, so they 410 Gone when flag is false. If you want to validate eligibility BEFORE flipping the flag, you need to use the legacy endpoint or query the DB directly via the same predicate.

### B6.3 — Complete IC onboarding for JL

Before claim submission, JL must have:
- Password set
- Tax profile filled in
- RCTI authorization signed
- Payout account configured

All accessible from the `/portal/payouts/onboarding` route on tf-demo.

### B6.4 — Submit a test claim

```bash
# Pick 1 eligible item (from B6.2 output)
ITEM_ID="<id from the eligible list>"
curl -sX POST "$TAILFIRE_API/ic-payouts/claims" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[\"$ITEM_ID\"]}" | jq '.id'
```

### B6.5 — Admin approves + marks sent

Via admin UI on tf-demo.phoenixvoyages.ca:
- /commission/claims → click pending claim → approve
- /commission/invoices → mark sent

### B6.6 — Verify drift snapshot is clean

```bash
# Trigger manual drift check
curl -sX POST "$TAILFIRE_API/commission/admin/drift-check/run" \
  -H "Authorization: Bearer $TAILFIRE_TOKEN" | jq '.'

# Inspect latest snapshot per agency
psql "$(mcp_secret stg DATABASE_URL)" -At -c "
  SELECT DISTINCT ON (agency_id, currency)
    agency_id, currency,
    true_drift_cents, reversal_pair_imbalance,
    pending_adjustments_cents, supplier_short_cents
  FROM commission_drift_snapshots
  ORDER BY agency_id, currency, snapshot_at DESC
"
```

**Pass criteria (per Codex):** `true_drift_cents = 0` AND `reversal_pair_imbalance = 0` for every populated agency/currency. Visibility buckets can be non-zero but must be intentional.

If non-zero alarm bucket: diagnose before flag flip. Check Sentry for the per-currency fingerprint.

---

## Phase C — Pre-flag-flip gate

- [ ] Verifier exits 0 with all REQUIRED ✓ on tf-demo
- [ ] At least 1 IC claim lifecycle (submit → approve → mark sent) completed end-to-end against tf-demo without errors
- [ ] Drift snapshot clean (true_drift_cents = 0, reversal_pair_imbalance = 0)
- [ ] Sentry has no commission_drift_* events in the last 24h
- [ ] Memory updated: `project_tes_commission_mapping.md` → "executed on tf-demo YYYY-MM-DD" with key numbers
- [ ] Memory updated: `project_commission_rebuild_complete.md` → add tf-demo execution timestamp

If any item above is unchecked: do NOT proceed to Phase D.

---

## Phase D — Flag flip on stg/preview (the actual gate)

**Per CLAUDE.md:** Doppler writes to `prd` (and arguably `stg`) require user confirmation.

### D.1 — Confirm with user

> "Ready to flip `IC_PAYOUTS_V2_ENABLED=true` on Doppler `stg` config? This activates the IC v2 money path on Railway preview / tf-demo API."

### D.2 — Flip in Doppler

```
mcp__doppler__secrets_update(
  project="tailfire", config="stg",
  secrets={"IC_PAYOUTS_V2_ENABLED": "true"}
)
```

### D.3 — Sync to Railway

Per CLAUDE.md: Doppler ↔ Railway is NOT auto-synced.

```bash
railway environment preview && railway service api-dev
railway variables --set "IC_PAYOUTS_V2_ENABLED=true"
# Railway will redeploy automatically
```

### D.4 — Re-smoke the IC v2 path

```bash
# Eligible endpoint should now work
curl "$TAILFIRE_API/ic-payouts/me/eligible" -H "Authorization: Bearer $AGENT_TOKEN" | jq

# Legacy /ic-payouts/me/claims should 410 Gone (per cutover runbook)
curl -I "$TAILFIRE_API/ic-payouts/me/claims" -H "Authorization: Bearer $AGENT_TOKEN"
```

### D.5 — Monitor for 48-72h

- Sentry: filter `tailfire-api` project for `commission_drift_*` and `IC_PAYOUTS_V2_*` events
- DB: drift snapshot job runs every 6h via setInterval (PR-3); confirm new rows appear
- Admin UI: `/commission/reports/discrepancy` should show 0 unexplained variances

### D.6 — Decision gate

- All clean → schedule production cutover per `docs/runbooks/ic-payouts-cutover.md`
- Any non-trivial issue → diagnose, fix, re-test, then re-evaluate

---

## Rollback playbook (if Phase D goes sideways)

```
mcp__doppler__secrets_update(
  project="tailfire", config="stg",
  secrets={"IC_PAYOUTS_V2_ENABLED": "false"}
)
# Then sync to Railway as in D.3
```

V1 path resumes immediately. Any IC v2 in-flight claims should be drained per Section 2 of `ic-payouts-cutover.md`.

---

## Out of scope for this runbook

- PR-J (audit trail UI dashboards + 3 more report endpoints) — optional pre-cutover, deferred per Codex
- PR-K (drop commission_tracking rollup columns) — NOT safe before flag flip, deferred to post-cutover
- Production cutover — separate runbook at `docs/runbooks/ic-payouts-cutover.md`

---

## References

- `docs/runbooks/commission-rebuild-plan.md` — the 6-PR sequence (collapsed into 0/1/2/3/4)
- `docs/runbooks/ic-payouts-cutover.md` — production cutover (after this runbook passes)
- `scripts/migration/COMMISSION_MAPPING.md` — TES → TF field-level mapping spec
- Memory `project_tes_commission_mapping.md` — investigation findings
- Memory `project_commission_rebuild_complete.md` — PR-0 through PR-3 completion log
- Memory `feedback_tes_extraction_account.md` — mguertin not aguertin for extraction
