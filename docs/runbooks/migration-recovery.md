# Migration Recovery Runbook

What to do when Drizzle migrations get out of sync with the database (B9).

The older "silent reconcile" behavior was removed in PR #335. There is no
automated recovery — drift requires manual investigation. This runbook
covers the common drift scenarios and how to fix each.

**Drift detector:** `scripts/migration-drift-check.sh` (B9, this PR). Run it
any time you suspect drift, OR before any production migration deploy.

---

## Sources of truth

| # | Source | Purpose |
|---|---|---|
| 1 | `packages/database/src/migrations/*.sql` | The actual migration SQL files |
| 2 | `packages/database/src/migrations/meta/_journal.json` | Drizzle's manifest — declares which .sql files are migrations + their order |
| 3 | `drizzle.__drizzle_migrations` (DB table) | Per-environment record of which migrations have been applied |

For a healthy migration state, all three must agree.

---

## How to detect drift

```bash
# File ↔ journal only (no DB needed)
bash scripts/migration-drift-check.sh --skip-db

# Full check including DB
DATABASE_URL=$(mcp_doppler_get tailfire prd DATABASE_URL) \
  bash scripts/migration-drift-check.sh
```

The script reports four categories of drift, each with its own fix.

---

## Scenario 1 — Disk has orphan SQL files (file NOT in journal)

**Symptom:**
```
❌ ORPHAN SQL FILES (on disk but NOT in _journal.json):
20251201000000_add_cruise_sync_history
...
```

**Why it matters:** These files will NOT run on deploy. If you wrote one
recently expecting it to apply, it won't.

**Fix:**
- If the file IS supposed to run: re-add it to `_journal.json` with the
  correct `idx` + `when` timestamp (use `pnpm --filter @tailfire/database
  db:generate` to regenerate via Drizzle).
- If the file is stale / superseded: move it to
  `packages/database/src/migrations/_archive/` (the directory is gitignored
  from CI checks) OR delete it.

The 27 pre-existing orphans found 2026-05-15 are documented as deferred
cleanup in `docs/KNOWN_ISSUES.md` — they're stale migrations from earlier
in the project's history.

---

## Scenario 2 — Journal references a missing file (broken manifest)

**Symptom:**
```
❌ BROKEN JOURNAL ENTRIES (referenced but no .sql file):
20260101000000_oh_no_we_deleted_this
```

**Why it matters:** Deploy will fail when Drizzle tries to read the SQL.

**Fix:**
- Recover the SQL file from git history: `git log --all --diff-filter=D
  --summary -- packages/database/src/migrations/<tag>.sql`
- Then `git checkout <commit>^ -- packages/database/src/migrations/<tag>.sql`
- If the migration was never supposed to land, remove the entry from
  `_journal.json` AND verify no environment has applied it (`SELECT *
  FROM drizzle.__drizzle_migrations WHERE hash = '<tag>'`).

---

## Scenario 3 — DB has applied migrations that vanished from the codebase

**Symptom:**
```
❌ DB ORPHANS (applied in DB but NOT in journal):
20260101000000_short_lived_branch_migration
```

**Why it matters:** A branch deployed to that env, then got reverted. The DB
schema is now ahead of the codebase. The next deploy might:
- Try to re-run a migration that already happened (idempotent SQL handles
  this fine; non-idempotent SQL crashes).
- Fail to roll back the orphan changes (Drizzle is forward-only).

**Fix path A — keep the orphan (DB stays ahead):**
1. Recover the .sql file from git history.
2. Add a journal entry that brings the codebase back in sync.

**Fix path B — un-apply the orphan (DB should match codebase):**
1. Write a NEW reverse migration that undoes the schema changes.
2. Apply it via the normal deploy flow.
3. Delete the orphan row from `drizzle.__drizzle_migrations` only if
   you're certain the DB reflects the absence of the change. Otherwise
   leave the row — it'll just say "we've applied something that doesn't
   exist in code" and the next deploy will not try to re-run it.

**NEVER** silently drop the orphan row in production. Investigate first.

---

## Scenario 4 — Pending migrations (journal NOT in DB)

**Symptom:**
```
ℹ️  PENDING MIGRATIONS (3 — informational, normal before a deploy):
20260514020444_add_referral_url_to_activities
...
```

**Why it matters:** Nothing — this is the normal state right before a
deploy. The next `pnpm db:migrate` will apply them.

**Fix:** Run the migration pipeline (`pnpm --filter @tailfire/api db:migrate`
locally; CI handles dev/preview/prod automatically).

---

## Cutover-safety checklist (run before Phase 4 prod TES import)

1. `bash scripts/migration-drift-check.sh --skip-db` — file ↔ journal sane?
2. `DATABASE_URL=<preview>... bash scripts/migration-drift-check.sh` — Preview is the reference state.
3. Take a prod backup: Supabase Dashboard → Project → Database → Backups.
4. Clone prod DB to a staging Supabase project.
5. `DATABASE_URL=<clone>... bash scripts/migration-drift-check.sh` — what does prod look like vs Preview?
6. If results differ: investigate before proceeding (ask Codex, then Al).
7. Run the actual prod migration via `deploy-prod.yml`.
8. Re-run the drift check post-migration to confirm clean state.

---

## Why we don't auto-recover

The historical "silent reconcile" path (PR #335 reverted) tried to be
helpful by patching things up automatically. In practice it masked real
problems and led to "everything looks fine but the schema isn't what you
think it is" incidents. The strict default — fail loudly, report drift,
let a human decide — surfaces issues at the time they happen instead of
weeks later when something else mysteriously breaks.
