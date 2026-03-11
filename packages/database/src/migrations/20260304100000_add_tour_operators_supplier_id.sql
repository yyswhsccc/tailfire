-- Migration: Add supplier_id FK to tour_operators
-- Links tour operators to Tailfire suppliers (mirrors cruise_lines.supplierId pattern)
-- Required for TraveleSolutions migration to map imported tour operators to suppliers

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog'
      AND c.relname = 'tour_operators'
      AND c.relkind = 'r'
  ) THEN
    ALTER TABLE catalog.tour_operators ADD COLUMN IF NOT EXISTS supplier_id UUID;
  ELSE
    RAISE NOTICE 'Skipping catalog DDL — foreign tables detected (Dev/Preview)';
  END IF;
END $$;
