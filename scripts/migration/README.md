# TES Migration Scripts

This directory holds the TraveleSolutions (TES) → Tailfire migration scripts.

**Status:** Brought into git on 2026-05-15 as part of B14
([docs/PRODUCTION_LAUNCH_PUNCHLIST.md](../../docs/PRODUCTION_LAUNCH_PUNCHLIST.md)).
Previously these lived outside the repo at
`/Users/alguertin/Development/tailfire-project/scripts/migration/` with no
audit trail and no PR review path.

> **Source of truth is now this directory.** Do not edit the out-of-tree
> copy. Edits there will not be reviewed or shipped.

---

## Files

| File | Purpose |
|---|---|
| `extract-travelesolutions.ts` | Pull raw data from TES API (uses TES_TOKEN or username/password). Outputs JSON to `data/` for the importer to consume. Use the **mguertin** account — `aguertin` returns NULL PII. |
| `import-to-tailfire.ts` | Main importer (3000+ lines). Steps 1-9 entities, 11-14 financials. Idempotent via `data/migration/id-mapping.json` ledger. Resumable with `--resume`. |
| `import-group-bookings.ts` | Group booking import (separate flow). |
| `validate-import.ts` | Post-import counts validator. Compares Tailfire row counts against expected from extract step. |
| `verify-commission-mapping.ts` | Confirms agent→commission mapping resolved correctly post-import. |
| `tes-import-runner.sh` | End-to-end orchestrator. Logs in to Tailfire (Supabase auth), then runs the importer with the right env. |
| `backfill-trip-collaborators.sql` | Backfill `trip_collaborators` from imported trips so agents see their own work. |
| `data/*.example` | Template config files. Copy to non-`.example` and fill in real values per environment (do NOT commit the concrete files — see `data/.gitignore`). |

---

## Per-environment config (do NOT commit)

`data/agent-initials-mapping.json` maps TES agent initials (e.g. `SL` from a
trip name like "Smith Family Mexico 2026 (SL)") to a Tailfire user UUID. Each
environment (Dev / Preview / Prod) needs its own concrete file because the
user UUIDs differ.

`data/supplier-currency-overrides.json` overrides currency per supplier when
TES doesn't carry it. Same per-env requirement.

The `data/.gitignore` allows only `*.example` and `.gitignore` itself — real
mapping files stay local-only.

---

## Running an import

See `docs/TES_MIGRATION_RUNBOOK.md` for the full procedure. Outline:

1. Generate per-env config from `*.example`.
2. `pnpm tsx scripts/migration/extract-travelesolutions.ts` — pulls raw TES data.
3. `bash scripts/migration/tes-import-runner.sh` — auths and imports.
4. `pnpm tsx scripts/migration/validate-import.ts` — count check.
5. `POST /trips/backfill-lifecycle` (admin) — recompute trip statuses.
6. `POST /contacts/backfill-lifecycle` (admin) — recompute contact statuses.

---

## Re-validation work owed (B14 acceptance)

The script was last validated against TF on **2026-04-02**. Six weeks of
codebase changes have happened since — see `docs/PRODUCTION_LAUNCH_PUNCHLIST.md`
B14 for the specific risks (`PaymentScheduleLockPolicy` throws on locked
trips, `ActivityTravelerAssignmentPolicy` race, IC payouts schema, W1-W5
agent mapping). Plan: dry-run on tf-demo against current `main`, patch every
failure, then re-run before prod cutover (Phase 4).

---

## Authentication notes (per project memory)

- TES API: user `mguertin`, password / token via env. The `aguertin`
  account returns NULL PII for some records — use `mguertin`.
- Tailfire: `admin@phoenixvoyages.ca` / Supabase auth. Token script lives at
  `/tmp/get_token.py` for interactive use; the runner shell script handles
  this via Supabase auth API.
