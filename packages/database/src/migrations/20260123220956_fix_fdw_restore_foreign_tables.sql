-- Fix FDW: Restore foreign tables in Preview/Dev
--
-- Background: Migrations fix_cruise_ports_to_base_table and fix_all_cruise_tables_to_base
-- converted foreign tables to local base tables, breaking the FDW architecture.
-- The FDW infrastructure (prod_catalog server + user mapping) still exists.
-- This migration restores the foreign tables.
--
-- IMPORTANT: This migration ONLY runs on Dev/Preview (skips if Production).

DO $$
DECLARE
  has_foreign_server boolean;
  is_production boolean;
BEGIN
  -- Check if prod_catalog foreign server exists (Dev/Preview only)
  SELECT EXISTS (
    SELECT 1 FROM pg_foreign_server WHERE srvname = 'prod_catalog'
  ) INTO has_foreign_server;

  -- Check if this is Production (has local tables that should NOT be dropped)
  -- Production has cruise_sync_history with actual sync records
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'catalog' AND tablename = 'cruise_sync_history') THEN
    SELECT EXISTS (
      SELECT 1 FROM catalog.cruise_sync_history
      WHERE status = 'completed'
      LIMIT 1
    ) INTO is_production;
  ELSE
    is_production := false;
  END IF;

  IF is_production THEN
    RAISE NOTICE 'Production environment detected (has sync history). Skipping FDW restore.';
    RETURN;
  END IF;

  IF NOT has_foreign_server THEN
    RAISE NOTICE 'No prod_catalog foreign server found. Skipping FDW restore.';
    RETURN;
  END IF;

  RAISE NOTICE 'Dev/Preview environment detected. Restoring foreign tables...';

  -- Drop all local tables in catalog schema (they contain stale/partial data)
  DROP TABLE IF EXISTS catalog.cruise_alternate_sailings CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_cabin_images CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ftp_file_sync CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_lines CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ports CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_regions CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sailing_cabin_prices CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sailing_regions CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sailing_stops CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sailings CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ship_cabin_types CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ship_decks CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ship_images CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_ships CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sync_history CASCADE;
  DROP TABLE IF EXISTS catalog.cruise_sync_raw CASCADE;

  -- Re-import as foreign tables from Production
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

  -- Grant permissions
  GRANT USAGE ON SCHEMA catalog TO service_role, authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO service_role, authenticated;

  RAISE NOTICE 'FDW foreign tables restored successfully.';
END $$;

-- ===========================================================================
-- VERIFICATION QUERIES (run after applying)
-- ===========================================================================
--
-- 1. Confirm all 16 tables are FOREIGN tables (relkind='f'):
--
--    SELECT c.relname, c.relkind,
--           CASE c.relkind WHEN 'f' THEN 'foreign' WHEN 'r' THEN 'LOCAL (BAD)' END as type
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'catalog' AND c.relkind IN ('r', 'f')
--    ORDER BY c.relname;
--
-- 2. Verify data comes from Production:
--
--    SELECT COUNT(*) FROM catalog.cruise_sailings;
--    -- Should match Production count (500+)
--
-- ===========================================================================
