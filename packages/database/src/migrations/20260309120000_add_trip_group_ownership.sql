-- Add owner_id to trip_groups and create trip_group_shares table for group access control

-- 1. Add owner_id to trip_groups
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Backfill: set owner_id = created_by for existing groups
UPDATE trip_groups SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;

-- Constraint: group_bookings must have an owner (folders can be ownerless)
-- NOT VALID so it doesn't block migration if orphaned group_bookings exist
ALTER TABLE trip_groups ADD CONSTRAINT chk_group_booking_has_owner
  CHECK (type = 'folder' OR owner_id IS NOT NULL) NOT VALID;

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_trip_groups_owner ON trip_groups(owner_id);

-- 2. Create trip_group_shares table (mirrors trip_shares)
CREATE TABLE IF NOT EXISTS trip_group_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  access_level VARCHAR(10) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write')),
  shared_by UUID NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto_trip_owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trip_group_share UNIQUE (trip_group_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_group_shares_group ON trip_group_shares(trip_group_id);
CREATE INDEX IF NOT EXISTS idx_trip_group_shares_shared_with ON trip_group_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_trip_group_shares_agency ON trip_group_shares(agency_id);

-- RLS
ALTER TABLE trip_group_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trip_group_shares' AND policyname = 'trip_group_shares_agency_isolation'
  ) THEN
    CREATE POLICY trip_group_shares_agency_isolation ON trip_group_shares
      FOR ALL
      TO authenticated
      USING (
        agency_id = (
          SELECT agency_id FROM user_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
