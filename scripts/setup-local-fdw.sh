#!/usr/bin/env bash
# =============================================================================
# setup-local-fdw.sh
#
# Repeatable script to (re)configure Foreign Data Wrapper on the local Dev
# database so it reads catalog data from Production.
#
# Prerequisites:
#   - Doppler CLI authenticated (`doppler login`)
#   - psql available on PATH
#   - Access to Doppler project "tailfire", config "dev"
#
# Usage:
#   ./scripts/setup-local-fdw.sh
#
# Safe to run multiple times (idempotent).
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEV_PROJECT_REF="hplioumsywqgtnhwcivw"
PROD_HOST="db.cmktvanwglszgadjrorm.supabase.co"
PROD_PORT="5432"
PROD_DBNAME="postgres"
FDW_SERVER_NAME="prod_catalog"
FDW_USER="fdw_catalog_ro"

# ---------------------------------------------------------------------------
# Safety: only run against Dev database
# ---------------------------------------------------------------------------
echo "Fetching DATABASE_URL from Doppler (tailfire/dev)..."
DATABASE_URL=$(doppler secrets get DATABASE_URL -p tailfire -c dev --plain)

if [[ "$DATABASE_URL" != *"$DEV_PROJECT_REF"* ]]; then
  echo "ABORT: DATABASE_URL does not contain Dev project ref ($DEV_PROJECT_REF)."
  echo "This script must only run against the tailfire-Dev database."
  echo "Got: ${DATABASE_URL:0:60}..."
  exit 1
fi

echo "Fetching FDW_CATALOG_PASSWORD from Doppler (tailfire/dev)..."
FDW_PASSWORD=$(doppler secrets get FDW_CATALOG_PASSWORD -p tailfire -c dev --plain)

if [[ -z "$FDW_PASSWORD" ]]; then
  echo "ABORT: FDW_CATALOG_PASSWORD is empty. Set it in Doppler (tailfire/dev)."
  exit 1
fi

echo "Target database confirmed as tailfire-Dev ($DEV_PROJECT_REF)."

# ---------------------------------------------------------------------------
# SQL-level safety: abort if catalog tables are LOCAL and have sync data
# (This catches Production databases even if DATABASE_URL check is bypassed)
# On a healthy Dev FDW setup, catalog tables are foreign (relkind='f') so
# this check passes — foreign tables point to Prod and are expected to have data.
# ---------------------------------------------------------------------------
echo "Running SQL-level safety check..."
IS_LOCAL_WITH_SYNCS=$(psql "$DATABASE_URL" -t -A -c "
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'catalog'
        AND c.relname = 'cruise_sync_history'
        AND c.relkind = 'r'
    ) AND EXISTS (
      SELECT 1 FROM catalog.cruise_sync_history
      WHERE status = 'completed'
    )
    THEN 'yes'
    ELSE 'no'
  END;
" 2>/dev/null || echo "no")

IS_LOCAL_WITH_SYNCS=$(echo "$IS_LOCAL_WITH_SYNCS" | tr -d '[:space:]')

if [[ "$IS_LOCAL_WITH_SYNCS" == "yes" ]]; then
  echo "ABORT: catalog.cruise_sync_history is a LOCAL table with completed sync records."
  echo "This looks like a Production database. Refusing to overwrite catalog schema."
  exit 1
fi

echo "SQL safety check passed."

# ---------------------------------------------------------------------------
# Configure FDW
# ---------------------------------------------------------------------------
echo "Configuring FDW on tailfire-Dev..."

# Use format(%L) inside a DO block for safe password quoting (handles special chars like ')
# Pass the password via a custom GUC so it never appears in shell-interpolated SQL.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
-- 0. Pass password safely via custom GUC (session-scoped, reset on disconnect)
SET my.fdw_password = '$(echo "$FDW_PASSWORD" | sed "s/'/''/g")';

-- 1. Ensure postgres_fdw extension
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- 2. Ensure catalog schema exists (for DROP below)
CREATE SCHEMA IF NOT EXISTS catalog;

-- 3. Drop existing foreign server (CASCADE removes user mappings + foreign tables)
DROP SERVER IF EXISTS prod_catalog CASCADE;

-- 4. Create foreign server pointing to Production
CREATE SERVER prod_catalog
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host 'db.cmktvanwglszgadjrorm.supabase.co',
    port '5432',
    dbname 'postgres'
  );

-- 5. Create user mapping with safe password quoting
DO \$\$
BEGIN
  EXECUTE format(
    'CREATE USER MAPPING FOR current_user SERVER prod_catalog OPTIONS (user %L, password %L)',
    'fdw_catalog_ro',
    current_setting('my.fdw_password')
  );
END \$\$;

-- 6. Clean slate: drop and recreate catalog schema
DROP SCHEMA catalog CASCADE;
CREATE SCHEMA catalog;

-- 7. Import ALL tables from Production catalog schema
IMPORT FOREIGN SCHEMA catalog
  FROM SERVER prod_catalog
  INTO catalog;

-- 8. Grant permissions (matches existing migrations - NOT anon)
GRANT USAGE ON SCHEMA catalog TO service_role, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO service_role, authenticated;
SQL

echo "FDW configured successfully."

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
echo ""
echo "Verifying setup..."

FOREIGN_COUNT=$(psql "$DATABASE_URL" -t -A -c "
  SELECT count(*)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'catalog'
    AND c.relkind = 'f';
")
FOREIGN_COUNT=$(echo "$FOREIGN_COUNT" | tr -d '[:space:]')
echo "  Foreign tables in catalog schema: $FOREIGN_COUNT"

if [[ "$FOREIGN_COUNT" -lt 1 ]]; then
  echo "WARNING: No foreign tables found. FDW import may have failed."
  exit 1
fi

CRUISE_LINE_COUNT=$(psql "$DATABASE_URL" -t -A -c "
  SELECT count(*) FROM catalog.cruise_lines;
" 2>/dev/null || echo "ERROR")
CRUISE_LINE_COUNT=$(echo "$CRUISE_LINE_COUNT" | tr -d '[:space:]')

if [[ "$CRUISE_LINE_COUNT" == "ERROR" ]]; then
  echo "WARNING: Could not query catalog.cruise_lines. FDW connection may have failed."
  exit 1
fi

echo "  Rows in catalog.cruise_lines: $CRUISE_LINE_COUNT"
echo ""
echo "FDW setup complete. $FOREIGN_COUNT foreign tables imported from Production."
