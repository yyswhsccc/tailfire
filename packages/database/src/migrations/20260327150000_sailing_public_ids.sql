-- Add public_id and slug_base to cruise_sailings for stable OTA URLs
-- Guarded: only runs on Production where catalog tables are real (not FDW foreign tables)

DO $$
BEGIN
  -- Only execute on production where cruise_sailings is a real table (relkind = 'r')
  -- On Dev/Preview, this table is a foreign table (relkind = 'f') via FDW
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_sailings'
      AND c.relkind = 'r'
  ) THEN
    -- Add columns
    ALTER TABLE catalog.cruise_sailings ADD COLUMN IF NOT EXISTS public_id VARCHAR(20);
    ALTER TABLE catalog.cruise_sailings ADD COLUMN IF NOT EXISTS slug_base VARCHAR(255);

    -- Unique index on public_id (for URL lookups)
    CREATE UNIQUE INDEX IF NOT EXISTS cruise_sailings_public_id_idx
      ON catalog.cruise_sailings(public_id)
      WHERE public_id IS NOT NULL;

    -- Index on slug_base for search
    CREATE INDEX IF NOT EXISTS cruise_sailings_slug_base_idx
      ON catalog.cruise_sailings(slug_base)
      WHERE slug_base IS NOT NULL;

    RAISE NOTICE 'Added public_id and slug_base to catalog.cruise_sailings';
  ELSE
    RAISE NOTICE 'Skipping: catalog.cruise_sailings is not a local table (FDW environment)';
  END IF;
END $$;
