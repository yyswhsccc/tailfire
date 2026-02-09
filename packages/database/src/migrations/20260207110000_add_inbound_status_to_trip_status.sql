-- ============================================================================
-- Migration: Add 'inbound' to trip_status enum
-- Description: This must be a separate migration because PostgreSQL requires
--              enum values to be committed before they can be referenced in
--              CHECK constraints or other DDL statements.
-- ============================================================================

-- Add 'inbound' to trip_status enum (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'inbound'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'trip_status')
  ) THEN
    ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'inbound';
  END IF;
END $$;
