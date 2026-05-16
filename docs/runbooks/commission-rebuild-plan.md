# Commission System Rebuild — Plan

**Status:** Draft — awaiting Codex validation (2026-05-15)
**Owner:** Al (aguertin@phoenixvoyages.ca)
**Scope:** Full commission flow rebuild — single source of truth, audit-proof, IC Payouts V2 wired with correct math, tax-on-commission modeling, per-trip overrides, reconciliation gate.

---

## Executive Summary

The current commission implementation has 4 structural problems that block production cutover:

1. **Math duplicated in 4 places** — IC Payouts V2 passes through raw `received_cents` (no fee/split applied); legacy SQL in `getCommissionDue` + `payAgents` + `upsertActivityCommission` have copy-pasted formulas. If we flip `IC_PAYOUTS_V2_ENABLED=true` today, agents see invoices for the GROSS supplier amount — typically 175% of what they should actually be paid.
2. **Rollup drift surface** — `commission_tracking` has 7 rollup columns (`received_cents`, `paid_cents`, `adjustment_cents`, etc.) that duplicate source data and are updated piecemeal via DTO writes. They can silently drift from truth.
3. **Not audit-proof** — `commission_item_settlements` records only the final amount (no breakdown snapshot); cancellation uses `CASCADE DELETE` (destroys history); no per-entity change history; accepted checks can be edited via generic PATCH.
4. **Missing domain concepts** — no `is_reconciled` per-activity gate (your step 4); no tax-on-commission modeling (Air Canada Vacations $105 = $100 + $5 GST scenario); no per-trip agent split override ("Joel earns 100% on his own travel").

Rebuild scope: ~16-18 days of focused engineering across 6 PRs.

---

## Locked Decisions (no relitigation)

### Flow (per Phoenix Voyages owner)

1. Agent sells activity → expects commission
2. Supplier sends ONE check covering many activities/trips/agents
3. Admin records **DEPOSIT** (`commission_checks` check_type='received'), links activities via `commission_check_items`, accepts it
4. Activity becomes **PAYABLE** when: trip departed AND activity `is_reconciled = true`
5. Agent claims via IC Payouts V2 → `ic_invoice` + payment request
6. Admin processes payment → `ic_disbursement` + `commission_item_settlements`

### Math (the ONE formula)

```
gross_received       (supplier paid, e.g. $105)
embedded_tax         (GST/HST embedded, e.g. $5)
commissionable_base  = gross_received - embedded_tax    ($100)
platform_fee         = base × fee_rate% (5% default)    ($5)
distributable        = base - platform_fee              ($95)
agent_pool           = distributable × split% (60%)     ($57)
agent_share          = agent_pool × collaborator%       ($57 solo)
agency_retains       = commissionable_base - agent_share + tax
```

### Audit-proof pillars

1. **Immutable source after `accepted`** — locked fields cannot change without explicit recall (DB trigger guard)
2. **Per-entity change history** — `commission_check_history`, `commission_check_item_history`, `commission_item_settlement_history`, `commission_adjustment_history`, etc.
3. **Reversal-row pattern** — replace `CASCADE DELETE` with offsetting negative settlement rows
4. **Computation breakdown JSONB** — every settlement records the full formula inputs at the moment of computation
5. **Signed transitions** — reason required for: check recall, paid-check cancel, activity unreconcile, fee/split override changes
6. **Drift check** — nightly view + alert on any non-zero unexplained drift
7. **changed_by + user_agent** (NOT IP) captured per change
8. **Forever retention** — no TTL on history tables

### Tax model

- Per-`commission_check_items`: `embedded_tax_cents`, `embedded_tax_type` (varchar), `embedded_tax_rate_percent` (decimal)
- Per-`suppliers`: defaults (`default_commission_tax_type`, `default_commission_tax_rate_percent`, `commission_includes_tax`)
- Tax is a deposit-time concept; activity expected commission stays PRE-TAX

### Schema posture

- Drop `commission_tracking` rollup columns (`received_cents`, `paid_cents`, `adjustment_cents`, `platform_fee_cents`, `tax_amount_cents`, `gross_commission_cents`, `net_commission_cents`)
- Keep only: `is_reconciled`, `reconciled_at`, `reconciled_by`, `commission_status`, `notes`, `source`, `source_booking_ref`, audit fields
- Compute rollups from source on demand
- View `v_commission_position` for drift checks

### Trip overrides

- Existing: `trips.commission_fee_rate_override` (tech fee %)
- Existing: `trip_collaborators.commission_percentage` (share between collaborators)
- NEW: `trip_collaborators.agent_split_override` (replaces agent profile splitValue when set)
- All admin-only, all in a new "Trip Settings" tab (currently buried in Overview)

### Reconciliation rules

- `is_reconciled` is admin-asserted JUDGMENT, not auto-computed
- Discrepancy investigation: trip-side bug (fix + reconcile) vs supplier short (chase + don't reconcile)
- Reconcile toggle visible to admin in 3 places: Activity Booking & Payment tab + Trip Bookings tab (checkmark column + bulk action) + Deposit tool (per-line during create/edit)
- Trip-level "Reconcile All Selected" via multi-select on Trip Bookings page (NOT in trip header)
- Adjustments: positive = opt-in by agent at claim time; negative = always auto-included; recalls modeled as negative adjustments (no net-negative claims)

### IC Payouts V2

- `IC_PAYOUTS_V2_ENABLED` flip is the LAST step, after all other changes
- Auto-disbursement (fintech API integration) is a separate future track — for now the manual provider stays

---

## The 6-PR Deployment Sequence

Sequence designed to ship incrementally, allow rollback per PR, and isolate risk.

**Shipping status (2026-05-16):** the 11 original PRs collapsed during execution into PR-0 → PR-4 + PR-J squash-merges to main, all live on production. Original A-K nodes mapped to actual shipped PRs in the rightmost column.

| PR | Branch | Size | Risk | Depends | What it ships | Shipped as |
|---|---|---|---|---|---|---|
| **PR-A** | `feature/commission-cci-tax-cols` | S | Low | — | `commission_check_items.embedded_tax_*` + supplier defaults schema; backfills to zero/none | ✅ PR-1 #417 |
| **PR-B** | `feature/commission-tracking-reconciled` | S | Low | — | `commission_tracking.is_reconciled` + audit columns; backfills existing rows to `true` | ✅ PR-1 #417 |
| **PR-C** | `feature/commission-audit-history-tables` | M | Low | — | History tables for checks, items, settlements, adjustments, tracking, activity_pricing, trip_collaborators | ✅ PR-1 #417 |
| **PR-D** | `feature/commission-settlements-reversal` | M | High | PR-A | Reversal-row schema + `computation_breakdown` JSONB + drop CASCADE FKs + immutability trigger | ✅ PR-1 #417 |
| **PR-E** | `feature/commission-formula-and-services` | L | Medium | PR-A,B,C,D | `computeAgentShare` formula module + audit interceptor + reconcile service + IC v2 math wiring + legacy hardening + adjustments fixes | ✅ PR-1 #417 |
| **PR-F** | `feature/trip-settings-tab` | L | Low | PR-B,C,E | Trip Settings tab (Admin Settings card) + collaborator UI + per-collaborator `agent_split_override` schema + reconcile surfaces (3) | ✅ PR-2 #418 |
| **PR-G** | `feature/deposit-full-crud` | L | Medium | PR-A,E | Full CRUD for deposit/receive tool via shared workbench + tax fields per line + URL filter persistence | ✅ PR-2 #418 |
| **PR-H** | `feature/ic-v2-transparency-ui` | M | Low | PR-E | ClaimBuilder breakdown view + positive adjustment opt-in + agent portal inline claim page | ✅ PR-2 #418 |
| **PR-I** | `feature/commission-drift-check` | M | Low | PR-A,B,D | `v_commission_position` view + drift snapshot table + nightly job + admin trigger endpoint | ✅ PR-3 #419 (+ #420 hotfix) |
| **PR-J** | `feature/commission-reports-and-audit-trail` | L | Low | PR-C,I | 10 audit-report endpoints (R1-R10): GST/HST, T4A, A/R aging, agent payments, supplier received, discrepancy, audit trail, reversals, overrides, drift snapshot | ✅ R1/R3/R6 via PR-3 #419; R2/R4/R5/R7/R8/R9 via **PR-J #427 (2e459720)**; R10 implicit in drift scheduler. Codex round-2 APPROVE. UI dashboards deferred. |
| **PR-K** | `feature/drop-commission-tracking-rollups` | M | Medium | PR-E | Final cleanup — drops the rollup columns after all readers migrated | ⏸ DEFERRED per Codex until prod runs stable under V2 and remaining readers (`financial.queries.ts:108`, `commission.service.ts:884`, importer DTOs) are migrated off rollups. |
| **Event** | Flag flip `IC_PAYOUTS_V2_ENABLED=true` on tf-demo | — | Medium | All above | Coordinated event | ✅ 2026-05-16 17:21Z |
| **Event** | Phase 4 disposable prod-clone end-to-end run | — | High | All above | B14 acceptance gate | ✅ Equivalent: tf-demo end-to-end claim lifecycle (slarente → $332.99 invoice approved → drift clean) |
| **Event** | Production cutover | — | High | Phase 4 clean | The big day | ✅ 2026-05-16 17:45Z: Doppler prd flags flipped, Railway api-prod + Vercel admin redeployed. Prod DB still empty (pre-launch); real TES import is a separate workstream when Phoenix Voyages is ready. |

**Extras shipped during execution (not in original plan):**
- **PR-0 (#416)** — IC v2 money-path gate (`IC_PAYOUTS_V2_ENABLED`); the missing flag wrapper that decouples merge-to-main from production cutover. Wraps every new endpoint with 410 Gone when disabled.
- **PR-4 (#423)** — TES importer fixes: step reorder so received checks aren't accepted before items added (PR-1 immutability trigger), new Step 15b (bulk-reconcile imported tracking — closes the `source='travelesolutions'` reconciliation gap), new Step 15c (deferred check acceptance), hardened verifier.
- **#420** — PR-3 view hotfix (DROP+CREATE instead of CREATE OR REPLACE — PG rejects column reorder).
- **#421/#422** — Schema drift recovery (3 prod migrations + 1 dev migration; tables had columns missing post-manual-DB-edit).
- **#424** — tf-demo execution runbook (`docs/runbooks/pr4-tf-demo-execution.md`).
- **#426** — Notification email link fix (ADMIN_URL absolute prefix; Gmail was rendering `/commission/...` as `http://commission/...`).
- **#427** — PR-J 6 remaining report endpoints (R2/R4/R5/R7/R8/R9).

**Actual calendar**: 1 work session (2026-05-16) to fully ship code + flag flip; full session spanned ~7h including all Codex validation rounds. Lots of work was already on `main` from prior weeks.

---

## Per-Area Detail (pointers to subagent specs)

### Schema (PRs A, B, C, D, I, K)

**Detailed spec:** schema-agent output captured in this session — 11 migration files with full DDL, dependency DAG, risk assessment, idempotency guards.

Key migrations:

| Migration | What |
|---|---|
| `20260516100000_commission_check_items_tax_fields.sql` | Add embedded_tax_* + backfill |
| `20260516100100_suppliers_commission_tax_defaults.sql` | Supplier-level tax defaults |
| `20260516100200_commission_tracking_add_reconciliation.sql` | is_reconciled + backfill existing TES data to true |
| `20260516100300_trip_collaborators_agent_split_override.sql` | NEW per-trip override field |
| `20260516100400_commission_item_settlements_reversal.sql` | Reversal columns + drop CASCADE + computation_breakdown JSONB |
| `20260516100500_commission_check_history.sql` | History pattern table (reference) |
| `20260516100600_commission_entity_history_tables.sql` | Replicate pattern for items/settlements/adjustments |
| `20260516100700_drop_commission_tracking_rollup_columns.sql` | Final cleanup (after readers migrated) |
| `20260516100800_commission_checks_immutability_trigger.sql` | DB-level immutability for accepted checks |
| `20260516100900_v_commission_position.sql` | Drift-check view |
| `20260516101000_commission_check_status_reason_required.sql` | Optional cancellation reason trigger |

### Backend Services (PRs E, I)

**Detailed spec:** backend-agent output — 8 phases with file paths, function signatures, transaction boundaries, test cases.

Key new files:

```
apps/api/src/financials/commission/
  commission-formula.ts                     ← THE math (computeAgentShare + resolveCommissionInputs)
  commission-formula.spec.ts
  commission-utils.ts                       ← diffKeys helper
  commission-audit.service.ts               ← writeHistory in transaction
  commission-audit.service.spec.ts
  commission-reconcile.service.ts           ← reconcile/unreconcile/bulk
  commission-reconcile.service.spec.ts
  commission-settlement-reversal.service.ts ← writeSettlementReversal helper
  commission-settlement-reversal.service.spec.ts
  commission-drift-check.service.ts         ← setInterval-based (not BullMQ — Upstash limitation)
  commission-drift-check.service.spec.ts
```

Surgical edits:
- `ic-invoice.service.ts` — wire formula into `getEligibleForUser` + `submitCurrencyInvoice` + add `is_reconciled` gate + adjustment opt-in + net-negative guard + computation_breakdown snapshot
- `commission.service.ts` — add `is_reconciled` gate, refactor `payAgents` to call formula, add immutability guard on `updateCheck`, reason-required `recallCheck`, replace DELETE with reversal rows
- `commission-adjustments.controller.ts` — add @AdminOnly, fix @GetAuthContext consistency
- `commission-adjustments.service.ts` — fix `agentUserId` filter, add explicit reconcile endpoints
- `trips.service.ts` — add `updateCommissionOverrides` method (cite TRIPS_SERVICE_SURFACE.md per CLAUDE.md §9)

### Admin + Agent UI (PRs F, G, H, J)

**Detailed spec:** ui-agent output — 13 sections covering Trip Settings tab + Reconcile surfaces + Deposit CRUD + Supplier tax defaults + ClaimBuilder transparency + Agent portal + Audit trail + Position dashboard + Reports.

Key new components (24 new files):

```
apps/admin/src/app/trips/[id]/_components/
  trip-settings-tab.tsx
  trip-general-settings.tsx     (extracted from trip-overview.tsx)
  trip-admin-settings.tsx
  trip-collaborator-list.tsx
  collaborator-split-confirm-dialog.tsx

apps/admin/src/app/commission/_components/
  audit-trail-tab.tsx
  audit-event-timeline.tsx
  commission-position-tab.tsx
  claim-line-breakdown.tsx

apps/admin/src/app/commission/reports/
  page.tsx + 6 report pages + report-shell.tsx

apps/admin/src/app/commission/receive/
  [depositId]/page.tsx
  _components/deposit-workbench.tsx

apps/admin/src/components/commission/
  reconcile-reason-dialog.tsx

apps/admin/src/hooks/
  use-reconcile.ts
  use-commission-audit.ts
  use-commission-reports.ts
  use-trip-collaborators.ts
```

### Reports + Backfills + Drift Check (PRs I, J + scripts)

**Detailed spec:** reports-agent output — 10 audit report SQL queries, 7 backfill scripts, drift-check implementation, test data fixtures, Phase 4 integration sequencing, cutover checklist, monitoring/alerting setup, risk register.

Reports:
- R1: GST/HST Collected per period
- R2: T4A Slip Data per IC per tax year
- R3: Commission A/R Aging
- R4: Per-agent Payment History
- R5: Per-supplier Received History
- R6: Reconciliation Discrepancy Report
- R7: Audit Trail for single record
- R8: Reversal/Clawback Report
- R9: Override Usage Report
- R10: Daily Drift Snapshot

Backfills:
- **A** — `commission_tracking.is_reconciled = true` for existing 2859 rows (migration-embedded)
- **B** — `commission_check_items.embedded_tax_*` defaults on existing 249 rows (migration-embedded)
- **C** — Phoenix payroll spreadsheet ingestion via `scripts/migration/ingest-payroll-csv.ts` (tf-demo only, operator-run)
- **D** — `trips.commission_fee_rate_override = 0` for trips covered by historical payroll (tf-demo only, operator SQL)
- **E** — `computation_breakdown` for any existing IC invoice lines (migration-embedded, no-op at first deploy)
- **F** — Supplier tax defaults: no action (admin configures per-supplier)
- **G** — Agent split override: no action (NULL = derive from profile)

---

## Audit-Proof Reports

Once shipped, an auditor can ask any of these and get a deterministic answer:

| Question | Source |
|---|---|
| "Show me every $ Sandra received in 2026" | R4 → `commission_item_settlements` joined to invoices/disbursements |
| "Why was Sandra paid exactly $171 for booking X?" | `commission_item_settlements.computation_breakdown` JSONB snapshot |
| "When did the fee rate change on trip Y?" | `commission_check_history` / `activity_pricing_history` |
| "Who marked activity Z as reconciled?" | `commission_tracking.reconciled_by` + history |
| "Did this paid check get reversed? Why?" | Reversal rows + reason field |
| "Show me all GST collected in Q1 2026" | R1 query |
| "Total commission paid to Joel for T4A purposes (2025)" | R2 query |
| "What's our A/R aging?" | R3 query |
| "Daily drift" | `commission_drift_snapshots` table |

---

## Production Cutover Checklist (T-48h)

- [ ] All 11 PRs merged to main + deployed to production
- [ ] Migration `meta/_journal.json` current; CI green
- [ ] Drift baseline captured: `SELECT * FROM commission_drift_snapshots ORDER BY snapshot_at DESC LIMIT 1`
- [ ] Backfill A verified: `SELECT COUNT(*) FROM commission_tracking WHERE is_reconciled = false` → 0
- [ ] Backfill B verified: `SELECT COUNT(*) FROM commission_check_items WHERE embedded_tax_type IS NULL` → 0
- [ ] `IC_PAYOUTS_V2_ENABLED = false` confirmed in prod Doppler + Railway
- [ ] All ICs (Joel, Sandra, + others) onboarded: tax profile + RCTI + payout account
- [ ] Tax counsel sign-off on RCTI template
- [ ] Backup Supabase prod DB

### During cutover

- [ ] Freeze TES writes
- [ ] Run B14 TES full import via mguertin account
- [ ] Run `POST /trips/backfill-lifecycle` + `POST /contacts/backfill-lifecycle`
- [ ] Trigger manual drift check `POST /commission/admin/drift-check/run` — verify zero
- [ ] Validate counts match Phase 4 clone

### Post-cutover

- [ ] Agent finance UAT: Sandra + Joel log in, verify commission DUE shows real numbers
- [ ] P1.D legal review status confirmed
- [ ] Flip `IC_PAYOUTS_V2_ENABLED=true` (separate maintenance window, ≥ T+72h after stable)

---

## Risks (Top 10)

| Risk | Mitigation |
|---|---|
| `v_commission_position` view double-counts items with multiple settlements | Verify against manual calcs on 5 known tf-demo activities before PR-I merge |
| Phase 4 prod-clone runs on old schema | Gate Phase 4 on explicit confirmation PR-A/B/C/D in prod |
| Payroll ingestion resolves <57 rows | DRY_RUN first; log SKIP reasons; manual trace fallback |
| Drift alert fires day 1 (unreconciled imported checks) | Expected for first 30 days; mute via Sentry fingerprint until UAT complete |
| IC_PAYOUTS_V2_ENABLED flip breaks legacy UI consumers | Flip only after UI verified pointing at /ic-payouts/* routes |
| `setInterval` drifts over time | Acceptable; add Sentry cron monitor with 2-hour window |
| Tax counsel declines RCTI template | Legacy commission flow continues; no user-facing degradation |
| Rollup column drop breaks `financial-summary.service.ts` raw SQL | Pre-deploy grep; backup `commission_tracking` table before applying |
| Reversal pattern introduces double-counting if old delete code persists | Code-review fence: PR-D blocks merge until commission.service.ts:263 DELETE is removed |
| Concurrent migration + service deploys race | Apply PRs in declared order; preview to main with deploy validation |

---

## Open Items Before Building

These should be answered before PR-A is opened:

1. **Q-Confirm-1:** Confirm the 6-PR slicing above. Any to combine or split?
2. **Q-Confirm-2:** Calendar — start when? (Some of this work needs to land before Phoenix's planned cutover date)
3. **Q-Confirm-3:** Should `IC_PAYOUTS_V2_ENABLED` get flipped on tf-demo IMMEDIATELY after PR-E (so we can do UAT on the new flow during PR-F/G/H/I/J), or wait until everything is in?
4. **Q-Confirm-4:** Per-agent `splitValue` is currently a JSONB field in `user_profiles.commission_settings`. Should we promote it to a proper column for stronger typing + indexing? (Out of immediate scope but flag for future.)
5. **Q-Confirm-5:** Audit reports — should they be SQL views or service-layer queries? Views are simpler but harder to test; service-layer is more flexible but more code.

---

## References

- Schema migration spec (subagent output, this session)
- Backend services spec (subagent output, this session)
- UI architecture spec (subagent output, this session)
- Reports + backfill + deployment spec (subagent output, this session)
- TES cutover plan: `docs/runbooks/tes-cutover-backfill-plan.md`
- IC payouts cutover: `docs/runbooks/ic-payouts-cutover.md`
- Production launch punchlist: `docs/PRODUCTION_LAUNCH_PUNCHLIST.md`
- TripsService surface inventory: `apps/api/src/trips/TRIPS_SERVICE_SURFACE.md`
- Codex review thread: pending validation of this plan
