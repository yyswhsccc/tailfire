# FDW Setup (Catalog Access)

This document describes how to configure Dev and Preview Supabase projects to
read catalog data from the Prod Supabase project using Postgres FDW (Foreign
Data Wrapper).

## Quick Start (Local Dev)

```bash
./scripts/setup-local-fdw.sh
```

This is the **only supported method** for setting up or restoring FDW on local dev.
The script is idempotent and safe to run multiple times.

### Prerequisites

- **Doppler CLI** authenticated: `doppler login`
- **psql** available on PATH
- Access to Doppler project `tailfire`, config `dev`
- The `FDW_CATALOG_PASSWORD` secret must be set in Doppler (`tailfire/dev`)

## How It Works

The setup script:
1. Reads `DATABASE_URL` and `FDW_CATALOG_PASSWORD` from Doppler
2. Verifies the target is the Dev database (refuses to run against Prod/Preview)
3. Drops and recreates the `prod_catalog` foreign server
4. Imports **all** tables from Production's `catalog` schema as foreign tables
5. Grants `SELECT` to `service_role` and `authenticated`
6. Verifies the import succeeded

## Important: The FDW Migration Is Dead Code

The Drizzle migration `20260104205000_setup_catalog_fdw.sql` has an unconditional
`RETURN` at line 23 that exits before any FDW logic runs. This was intentional —
the `__FDW_PASSWORD__` placeholder cannot be substituted by Drizzle's migrator.

**FDW was always set up manually**, not via migrations. Use `setup-local-fdw.sh`.

## Production Setup (Read-Only User)

The `fdw_catalog_ro` user must exist on Production. If it needs to be recreated:

Run in the **Prod** SQL Editor (password from Doppler `FDW_CATALOG_PASSWORD`):

```sql
CREATE USER fdw_catalog_ro WITH PASSWORD '<RETRIEVE_FROM_DOPPLER: FDW_CATALOG_PASSWORD>';

GRANT USAGE ON SCHEMA catalog TO fdw_catalog_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO fdw_catalog_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT ON TABLES TO fdw_catalog_ro;
```

See also: `scripts/prod-catalog-setup.sql` (full Production schema setup).

## When FDW Breaks

Symptoms:
- `catalog.cruise_lines` returns 0 rows or "relation does not exist"
- `SELECT relkind FROM pg_class ... WHERE relname = 'cruise_lines'` returns `r` instead of `f`
- Cruise search / catalog matching fails on local dev

Common causes:
- A migration ran `CREATE TABLE catalog.*` without an environment guard
- Someone ran `pnpm db:migrate` and a migration created local tables over the foreign ones
- The FDW password was rotated on Prod but not updated in Doppler

Fix:
```bash
./scripts/setup-local-fdw.sh
```

## Preventing Future Breakage

See `packages/database/MIGRATIONS.md` > "Catalog Schema (FDW-Protected)" for:
- The environment guard template for catalog DDL
- The companion migration pattern for new catalog tables
- CI validation that catches unguarded catalog DDL

## Notes

- If catalog queries are slow in Dev, consider adding materialized views in
  the Dev project for hot tables.
- Preview environment FDW must be set up manually (the CI step in
  `deploy-preview.yml` injects a placeholder into the dead-code migration
  and has no effect). A similar manual bootstrap is needed for Preview.
