-- FDW setup for dev environments.
-- Connects Dev to Prod's catalog schema via Foreign Data Wrapper.
--
-- Prod project ref: cmktvanwglszgadjrorm
-- Dev project ref:  gaqacfstpnmwphekjzae
--
-- IMPORTANT: Run prod-catalog-setup.sql on Prod BEFORE applying this migration.
--
-- SECURITY: This file contains a placeholder __FDW_PASSWORD__ that MUST be replaced
-- with the actual password before applying. Do this via:
--   - CI pipeline: inject from secrets manager at deploy time
--   - Manual: retrieve from Vault, substitute, apply, then discard the modified file
-- NEVER commit this file with the real password.

DO $$
DECLARE
  is_local_catalog boolean;
BEGIN
  -- Guard: This migration uses __FDW_PASSWORD__ placeholder that must be replaced at deploy time.
  -- When running via Drizzle migrator (local dev or CI), the placeholder is NOT substituted,
  -- so we skip FDW setup. FDW is configured manually or via deploy scripts.
  RAISE NOTICE 'FDW setup skipped by Drizzle migrator (requires manual password injection)';
  RETURN;

  -- Guard: Skip FDW setup if catalog.cruise_lines is a LOCAL table (= Prod)
  -- 'r' = ordinary table (not foreign table 'f')
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_lines'
      AND c.relkind = 'r'
  ) INTO is_local_catalog;

  IF is_local_catalog THEN
    RAISE NOTICE 'Local catalog.cruise_lines detected (Prod). Skipping FDW setup.';
    RETURN;
  END IF;

  -- Skip if Dev already has foreign tables
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_lines'
      AND c.relkind = 'f'
  ) THEN
    RAISE NOTICE 'Foreign catalog detected (Dev already configured). Skipping FDW setup.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS postgres_fdw;

  DROP SCHEMA IF EXISTS catalog CASCADE;
  CREATE SCHEMA catalog;

  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'prod_catalog') THEN
    CREATE SERVER prod_catalog
      FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (host 'db.cmktvanwglszgadjrorm.supabase.co', port '5432', dbname 'postgres');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_user_mappings
    WHERE srvname = 'prod_catalog'
      AND usename = current_user
  ) THEN
    -- IMPORTANT: Replace __FDW_PASSWORD__ with actual password before applying.
    -- Store password in environment or secrets manager, not in version control.
    EXECUTE format(
      'CREATE USER MAPPING FOR %I SERVER prod_catalog OPTIONS (user %L, password %L)',
      current_user,
      'fdw_catalog_ro',
      '__FDW_PASSWORD__'
    );
  END IF;

  IMPORT FOREIGN SCHEMA catalog
    LIMIT TO (
      cruise_alternate_sailings,
      cruise_cabin_images,
      cruise_ftp_file_sync,
      cruise_lines,
      cruise_ports,
      cruise_regions,
      cruise_sailing_cabin_prices,
      cruise_sailing_regions,
      cruise_sailing_stops,
      cruise_sailings,
      cruise_ship_cabin_types,
      cruise_ship_decks,
      cruise_ship_images,
      cruise_ships,
      cruise_sync_history,
      cruise_sync_raw
    )
    FROM SERVER prod_catalog
    INTO catalog;

  GRANT USAGE ON SCHEMA catalog TO service_role, authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO service_role, authenticated;
END $$;

-- ===========================================================================
-- VERIFICATION QUERIES (run after applying to confirm FDW setup)
-- ===========================================================================
--
-- 1. Confirm all 16 tables are FOREIGN tables (relkind='f'):
--
--    SELECT c.relname, c.relkind
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'catalog'
--      AND c.relname LIKE 'cruise_%'
--    ORDER BY c.relname;
--
--    Expected: 16 rows, all with relkind='f'
--
-- 2. Verify FDW connection works (query Prod through foreign table):
--
--    SELECT COUNT(*) FROM catalog.cruise_lines;
--
--    Expected: Returns count (0 if Prod not yet seeded, >0 after seeding)
--
-- 3. Confirm grants are in place:
--
--    SELECT grantee, privilege_type
--    FROM information_schema.table_privileges
--    WHERE table_schema = 'catalog'
--      AND table_name = 'cruise_lines';
--
--    Expected: service_role and authenticated have SELECT
-- ===========================================================================
