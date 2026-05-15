#!/usr/bin/env bash
# B9: Migration drift detector.
#
# Diffs three sources of truth for Drizzle migrations:
#   1. SQL files on disk         — packages/database/src/migrations/*.sql
#   2. Journal manifest          — packages/database/src/migrations/meta/_journal.json
#   3. Applied migrations in DB  — drizzle.__drizzle_migrations table
#
# Reports orphans in every direction so you can see drift before it bites:
#   - Files on disk NOT in the journal           → idle / stale SQL
#   - Journal entries NOT on disk                → broken manifest
#   - DB applied NOT in journal                  → DB has migrations that vanished from the codebase
#   - Journal entries NOT applied in DB          → pending migrations (normal pre-deploy)
#
# Usage:
#   DATABASE_URL=postgres://... scripts/migration-drift-check.sh
#   scripts/migration-drift-check.sh --skip-db   # skip the DB query (file/journal only)
#
# Exit codes:
#   0 — no drift (or only "pending" which is informational)
#   1 — orphans detected in either direction (action required)
#   2 — bad usage / missing dependency

set -euo pipefail

SKIP_DB=0
if [[ "${1:-}" == "--skip-db" ]]; then
  SKIP_DB=1
fi

if [[ ! -d "packages/database/src/migrations" ]]; then
  echo "ERROR: must run from repo root" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 2
fi

JOURNAL_FILE="packages/database/src/migrations/meta/_journal.json"
if [[ ! -f "$JOURNAL_FILE" ]]; then
  echo "ERROR: journal not found at $JOURNAL_FILE" >&2
  exit 2
fi

# 1. SQL files on disk — strip directory + .sql extension.
DISK_TAGS="$(
  find packages/database/src/migrations -maxdepth 1 -name "*.sql" \
    -exec basename {} .sql \; \
    | sort -u
)"

# 2. Journal entries — strip the timestamp prefix Drizzle uses internally
# (`when`) but the `tag` field already matches the .sql basename.
JOURNAL_TAGS="$(
  jq -r '.entries[].tag' "$JOURNAL_FILE" | sort -u
)"

# Files NOT in journal → orphan SQL (idle, will not run on deploy).
DISK_NOT_IN_JOURNAL="$(comm -23 <(echo "$DISK_TAGS") <(echo "$JOURNAL_TAGS"))"

# Journal NOT on disk → broken journal (deploy will fail).
JOURNAL_NOT_ON_DISK="$(comm -13 <(echo "$DISK_TAGS") <(echo "$JOURNAL_TAGS"))"

EXIT_CODE=0
echo "=== Migration drift check ==="
echo "  SQL files on disk : $(echo "$DISK_TAGS" | grep -c .)"
echo "  Journal entries   : $(echo "$JOURNAL_TAGS" | grep -c .)"

if [[ -n "$DISK_NOT_IN_JOURNAL" ]]; then
  echo ""
  echo "❌ ORPHAN SQL FILES (on disk but NOT in _journal.json):"
  echo "------------------------------------------------------------"
  echo "$DISK_NOT_IN_JOURNAL"
  echo "------------------------------------------------------------"
  echo "These files will NOT run on deploy. Either delete them or add"
  echo "a journal entry."
  EXIT_CODE=1
fi

if [[ -n "$JOURNAL_NOT_ON_DISK" ]]; then
  echo ""
  echo "❌ BROKEN JOURNAL ENTRIES (referenced but no .sql file):"
  echo "------------------------------------------------------------"
  echo "$JOURNAL_NOT_ON_DISK"
  echo "------------------------------------------------------------"
  echo "Deploy will fail when Drizzle tries to read these. Either"
  echo "remove the journal entry or add the missing .sql file."
  EXIT_CODE=1
fi

# 3. Applied migrations in the database (only if --skip-db not given).
if [[ "$SKIP_DB" == "0" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo ""
    echo "ℹ️  DATABASE_URL not set — skipping DB-side check."
    echo "    Set DATABASE_URL or pass --skip-db to silence this."
  elif ! command -v psql >/dev/null 2>&1; then
    echo ""
    echo "ℹ️  psql not on PATH — skipping DB-side check."
  else
    # Drizzle stores migrations as 'hash' in drizzle.__drizzle_migrations.
    # The 'hash' is the .sql filename basename (the same as journal tag).
    DB_TAGS="$(
      psql "$DATABASE_URL" -t -A -c \
        "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id" 2>/dev/null \
        | grep -v '^$' \
        | sort -u
    )" || {
      echo ""
      echo "❌ Could not read drizzle.__drizzle_migrations from DB."
      echo "    Possible causes: bad DATABASE_URL, table missing (no migration"
      echo "    has run yet), or transaction-pooler connection (use session"
      echo "    pooler or direct connection per CLAUDE.md)."
      exit 1
    }

    echo "  DB applied        : $(echo "$DB_TAGS" | grep -c .)"

    # DB applied NOT in journal → DB has migrations that vanished from the
    # codebase. This is bad — usually means a branch was deployed that has
    # since been reverted, leaving DB schema ahead of the code.
    DB_NOT_IN_JOURNAL="$(comm -23 <(echo "$DB_TAGS") <(echo "$JOURNAL_TAGS"))"

    # Journal NOT in DB → pending migrations, normal pre-deploy state.
    JOURNAL_NOT_IN_DB="$(comm -13 <(echo "$DB_TAGS") <(echo "$JOURNAL_TAGS"))"

    if [[ -n "$DB_NOT_IN_JOURNAL" ]]; then
      echo ""
      echo "❌ DB ORPHANS (applied in DB but NOT in journal):"
      echo "------------------------------------------------------------"
      echo "$DB_NOT_IN_JOURNAL"
      echo "------------------------------------------------------------"
      echo "DB has migrations the codebase no longer knows about. Likely"
      echo "a reverted branch or a manual psql apply. Investigate before"
      echo "next deploy — see docs/runbooks/migration-recovery.md."
      EXIT_CODE=1
    fi

    if [[ -n "$JOURNAL_NOT_IN_DB" ]]; then
      echo ""
      echo "ℹ️  PENDING MIGRATIONS ($(echo "$JOURNAL_NOT_IN_DB" | grep -c .) — informational, normal before a deploy):"
      echo "------------------------------------------------------------"
      echo "$JOURNAL_NOT_IN_DB" | head -20
      [[ "$(echo "$JOURNAL_NOT_IN_DB" | grep -c .)" -gt 20 ]] && echo "... (truncated)"
      echo "------------------------------------------------------------"
    fi
  fi
fi

if [[ "$EXIT_CODE" == "0" ]]; then
  echo ""
  echo "✅ No drift."
fi

exit "$EXIT_CODE"
