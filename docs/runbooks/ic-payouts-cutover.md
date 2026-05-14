# IC Payouts Cutover Runbook

**Status:** Draft (Phase 3 complete; awaiting first production execution)
**Owner:** Engineering + Finance
**Last updated:** 2026-05-11

This runbook describes the production cutover from the legacy `payAgents` / `claims/me` flow to the IC Commission Payouts (`/ic-payouts/*`) module. After cutover, IC agents submit their own commission claims (RCTI invoices), admins approve, and disbursement is tracked end-to-end with FX snapshots for year-end T4A reporting.

---

## 0. Pre-cutover checklist

Confirm each before scheduling the maintenance window. **Do not proceed if any item is unchecked.**

- [ ] Phase 1, 2, and 3 PRs merged to `main` and deployed to production. Tag `phase-3-ic-payouts-disbursement` exists on `main`.
- [ ] All Codex/spec review findings addressed (see `docs/superpowers/specs/_codex-reviews/`).
- [ ] At least one IC has completed onboarding on the preview environment (`tf-demo.phoenixvoyages.ca`) and successfully:
  1. Set up a tax profile (SIN/BN encrypted)
  2. Signed the RCTI authorization
  3. Added a default payout account for CAD (and USD if applicable)
- [ ] At least one full claim flow tested on preview: submit → admin approve → admin mark sent (with reference + proof file) → IC sees notification.
- [ ] At least one failure path tested on preview: claim submitted → admin mark failed → verify reservation reversed (settlements deleted, adjustments back to pending, invoice cancelled).
- [ ] FX snapshot table has at least 5 weekday snapshots (`SELECT count(*) FROM fx_rate_snapshots WHERE source = 'bank_of_canada' AND rate_date >= now() - interval '14 days';`).
- [ ] Tax counsel sign-off on the RCTI agreement text (`apps/api/src/ic-payouts/authorizations/rcti-template.ts`) — currently placeholder.
- [ ] Tax counsel sign-off on T4A Box 020 vs Box 048 classification.
- [ ] All admin users trained on the new flow (use `/commission/disbursements` → Disbursements tab).
- [ ] Doppler `prd` config has `IC_PAYOUTS_V2_ENABLED` either unset or set to `false`. **Do NOT preemptively set it to `true`.**

---

## 1. Flip the gate to `false` in `prd` (explicit)

```
mcp__doppler__secrets_update(
  project: "tailfire",
  config: "prd",
  secrets: { "IC_PAYOUTS_V2_ENABLED": "false" }
)
```

This is a no-op functionally (default behavior when unset is also `false`), but it makes the gate explicit and visible in the Doppler console.

Verify Railway env vars match — Doppler and Railway are NOT synced automatically (see `CLAUDE.md` > "Doppler and Railway Are NOT Automatically Synced"):

```bash
railway environment production && railway service api-prod
railway variables --kv | grep IC_PAYOUTS_V2_ENABLED
```

If Railway is missing the var, set it:
```bash
railway variables --set "IC_PAYOUTS_V2_ENABLED=false"
```

---

## 2. Run the drain script

Identifies in-flight legacy paid checks that need manual reconciliation before cutover.

```bash
# From a machine with prd DATABASE_URL access (typically a Railway shell)
pnpm --filter @tailfire/api exec tsx \
  apps/api/src/ic-payouts/cutover/drain-legacy-paid-checks.script.ts \
  > /tmp/legacy-paid-drain.csv

# Or against the compiled build:
node apps/api/dist/ic-payouts/cutover/drain-legacy-paid-checks.script.js \
  > /tmp/legacy-paid-drain.csv
```

The CSV will contain every `commission_checks` row where `check_type='paid' AND status IN ('pending','submitted')`.

**Interpret:**
- 0 rows → proceed to step 3.
- N>0 rows → each represents a legacy paid check that the agent hasn't yet acknowledged or that admin hasn't accepted. **Reconcile manually** via the existing `/commission` UI (admin can mark each accepted or cancelled). Re-run the drain until 0 rows.

The script is read-only — it never modifies data.

---

## 3. Schedule maintenance window

Choose a low-traffic time (typically a Sunday evening Eastern). The cutover itself is fast (one Doppler flip), but the maintenance window covers:
- 5 min: final drain confirmation
- 5 min: flip the gate
- 10 min: smoke test
- 30 min: monitoring buffer

Notify all IC users and admin users 24 hours in advance.

---

## 4. Flip the gate to `true`

During the maintenance window:

```
mcp__doppler__secrets_update(
  project: "tailfire",
  config: "prd",
  secrets: { "IC_PAYOUTS_V2_ENABLED": "true" }
)
```

Set the same in Railway:
```bash
railway environment production && railway service api-prod
railway variables --set "IC_PAYOUTS_V2_ENABLED=true"
```

**Railway will restart the api-prod service automatically.** Wait ~60 seconds for the new env var to take effect.

Verify the change is live:
```bash
curl -X POST https://api.tailfire.ca/api/v1/commission/claims/me \
  -H "Authorization: Bearer <test-agent-jwt>"
# Expected: HTTP 410 Gone with message redirecting to /ic-payouts/me/claims
```

---

## 5. Production smoke test

With a real IC account (NOT a test fixture):

1. Log into the admin panel as the IC user
2. Navigate to `/portal/payouts/onboarding` — confirm the wizard works
3. Complete onboarding if not done yet (tax profile + RCTI + first account)
4. Navigate to `/portal/commission` (or wherever the claim builder lives)
5. Submit a small test claim (e.g., $10 in commission)
6. Switch to an admin account, navigate to `/commission/disbursements` → Disbursements tab
7. Approve the invoice
8. Mark the disbursement sent with a real reference (or test reference if no real payout has actually been initiated)
9. Confirm the IC receives the email notification
10. Verify `SELECT status, completed_at, fx_rate_to_cad, cad_equivalent_total_cents FROM ic_disbursements WHERE id = '<test-disbursement-id>';` shows `status='sent'`, all FX fields populated.

---

## 6. Post-cutover monitoring (48h)

Watch Sentry: https://systemsaholic.sentry.io

Specific signals to monitor:
- HTTP 410 responses on `/commission/due/pay` or `/commission/claims/me` — these are the gate firing correctly. **Expected** for legacy clients; if volume is high, may indicate a client that needs to be updated.
- HTTP 5xx on `/ic-payouts/*` — investigate immediately.
- BullMQ `ic-payout-disburse` queue depth — should hover near 0.
- BullMQ `ic-payout-reconcile` daily run — should auto-fail at most 0 stuck disbursements in a healthy week.
- Doppler `IC_PAYOUTS_V2_ENABLED` value — confirm it's still `true` (no accidental rollback).

Daily check for 48h:
```sql
-- New IC invoices in last 24h
SELECT count(*), status FROM ic_invoices WHERE created_at >= now() - interval '24 hours' GROUP BY status;

-- Disbursements awaiting manual send
SELECT count(*) FROM ic_disbursements WHERE status = 'sending';

-- Failed disbursements
SELECT count(*), date_trunc('day', updated_at) FROM ic_disbursements WHERE status = 'failed' AND updated_at >= now() - interval '48 hours' GROUP BY date_trunc('day', updated_at);
```

---

## 7. Rollback procedure (if needed)

If smoke test fails or Sentry shows critical errors, **flip the gate back to `false` in both Doppler and Railway**:

```
mcp__doppler__secrets_update(
  project: "tailfire", config: "prd",
  secrets: { "IC_PAYOUTS_V2_ENABLED": "false" }
)
```
```bash
railway variables --set "IC_PAYOUTS_V2_ENABLED=false"
```

Legacy endpoints resume working immediately after Railway restarts (~60s).

**Caveat:** IC invoices already submitted under V2 do NOT migrate back to V1. They will remain in `ic_invoices` table. The admin can reject them with reason "Cutover rolled back; please resubmit via legacy claims" so the reservation is reversed and the IC's eligible items return to pending.

---

## 8. Deprecate legacy code (post-60-day clean operation)

After 60 days of clean V2 operation with no rollback events:

- Remove the gated `payAgents` and `claimMyCommission` endpoints from `apps/api/src/financials/commission/commission.controller.ts`.
- Remove the legacy "Pay Agents" admin UI button from `/commission/page.tsx`.
- Remove `IC_PAYOUTS_V2_ENABLED` env var from Doppler all configs (no longer needed).
- Keep `CommissionService.payAgents()` method available for now — admin may still need it for one-off corrections. Mark with a `@deprecated` JSDoc.

This deprecation goes in a separate PR titled "chore: remove legacy commission payout endpoints" with a 1-week PR window for review.

---

## Appendix A: Common cutover issues

| Symptom | Likely cause | Fix |
|---|---|---|
| IC sees "Active RCTI authorization required" when submitting claim | IC hasn't completed onboarding Step 2 | Direct them to `/portal/payouts/onboarding` |
| Admin's Mark Sent fails with "Disbursement not found" | Disbursement was already finalized by another admin | Refresh the queue; race-condition is handled by atomic state guard (Task 34) |
| Disbursement stuck in `sending` for >48h | Admin forgot to mark sent OR provider returned `awaiting_manual` indefinitely | `ic-payout-reconcile` cron auto-fails after 48h; alternatively admin can mark-failed manually |
| FX rate fetch fails on weekend markSent | BoC doesn't publish weekends | `FxRateService.getRateOnDate` walks back up to 5 days; should succeed on Saturday/Sunday using Friday's rate |
| Multiple invoices for same IC same day | Different currencies; correct by design — one invoice per currency | No action |

## Appendix B: Useful queries during cutover

```sql
-- IC onboarding completion rate
SELECT
  count(*) FILTER (WHERE rcti_authorization_id IS NOT NULL) AS authorized_ics,
  count(*) FILTER (WHERE rcti_authorization_id IS NULL) AS pending_ics
FROM ic_tax_profiles;

-- Default payout account coverage
SELECT
  utp.id AS user_id,
  utp.first_name || ' ' || utp.last_name AS name,
  count(ipa.id) FILTER (WHERE ipa.status = 'active' AND ipa.is_default_for_currency = true) AS active_default_accounts
FROM user_profiles utp
LEFT JOIN ic_payout_accounts ipa ON ipa.user_id = utp.id
WHERE utp.role = 'agent'
GROUP BY utp.id, utp.first_name, utp.last_name
ORDER BY active_default_accounts ASC;

-- All disbursements awaiting manual send, oldest first
SELECT
  id, invoice_id, amount_cents, currency, rail, updated_at,
  now() - updated_at AS age
FROM ic_disbursements
WHERE status = 'sending'
ORDER BY updated_at ASC;
```

## Appendix C: Related references

- Plan: `docs/superpowers/plans/2026-05-09-ic-commission-payouts.md`
- Spec: `docs/superpowers/specs/2026-05-09-ic-commission-payouts-design.md`
- Codex review: `docs/superpowers/specs/_codex-reviews/2026-05-09-vopay-ic-payouts-codex-review.txt`
- Cutover feature flag implementation: `apps/api/src/financials/commission/commission.controller.ts` (Task 41)
- Drain script: `apps/api/src/ic-payouts/cutover/drain-legacy-paid-checks.script.ts` (Task 42)
