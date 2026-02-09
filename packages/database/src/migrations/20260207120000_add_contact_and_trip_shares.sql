-- ============================================================================
-- Migration: Contact & Trip Ownership Management
-- Description: Adds nullable owner_id and sharing tables
-- NOTE: The 'inbound' enum value is added in 20260207110000_add_inbound_status_to_trip_status.sql
--       which MUST run first (PostgreSQL requires enum values to be committed before use)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Allow nullable owner_id for inbound trips
-- ----------------------------------------------------------------------------
-- First drop the NOT NULL constraint if it exists
ALTER TABLE trips ALTER COLUMN owner_id DROP NOT NULL;

-- Add constraint: owner_id required unless status = 'inbound'
-- NOTE: Using status::text to avoid PostgreSQL enum value transaction limitation
-- (new enum values can't be referenced in the same transaction they're added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_owner_required_unless_inbound'
  ) THEN
    ALTER TABLE trips ADD CONSTRAINT trips_owner_required_unless_inbound
      CHECK (owner_id IS NOT NULL OR status::text = 'inbound');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Create contact_shares table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  access_level VARCHAR(10) NOT NULL DEFAULT 'basic' CHECK (access_level IN ('basic', 'full')),
  shared_by UUID NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_contact_share UNIQUE (contact_id, shared_with_user_id)
);

-- Create indexes for contact_shares
CREATE INDEX IF NOT EXISTS idx_contact_shares_contact_id ON contact_shares(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_shares_shared_with ON contact_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_shares_agency ON contact_shares(agency_id);

-- Enable RLS for contact_shares
ALTER TABLE contact_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see shares in their agency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_shares' AND policyname = 'contact_shares_agency_isolation'
  ) THEN
    CREATE POLICY contact_shares_agency_isolation ON contact_shares
      FOR ALL
      TO authenticated
      USING (
        agency_id = (
          SELECT agency_id FROM user_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Create trip_shares table (separate from trip_collaborators)
-- NOTE: trip_collaborators is for commission splits, not access sharing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  access_level VARCHAR(10) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write')),
  shared_by UUID NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trip_share UNIQUE (trip_id, shared_with_user_id)
);

-- Create indexes for trip_shares
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_id ON trip_shares(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_shares_shared_with ON trip_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_trip_shares_agency ON trip_shares(agency_id);

-- Enable RLS for trip_shares
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see shares in their agency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trip_shares' AND policyname = 'trip_shares_agency_isolation'
  ) THEN
    CREATE POLICY trip_shares_agency_isolation ON trip_shares
      FOR ALL
      TO authenticated
      USING (
        agency_id = (
          SELECT agency_id FROM user_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Update trip status workflow validation trigger for inbound status
-- NOTE: Using status::text comparisons to avoid PostgreSQL enum value transaction limitation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_trip_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions TEXT[][];
  i INT;
  from_status TEXT;
  to_status TEXT;
  is_valid BOOLEAN := FALSE;
BEGIN
  -- Skip validation on INSERT
  IF TG_OP = 'INSERT' THEN
    -- For new trips, ensure inbound trips don't have an owner (optional)
    -- and non-inbound trips have an owner
    IF NEW.status::text = 'inbound' AND NEW.owner_id IS NOT NULL THEN
      -- Allow inbound trips to have an owner (optional)
      RETURN NEW;
    END IF;
    IF NEW.status::text != 'inbound' AND NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'Non-inbound trips must have an owner';
    END IF;
    RETURN NEW;
  END IF;

  -- Skip if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions (from, to)
  -- inbound can go to draft, quoted (when owner is assigned)
  -- draft can go to quoted, booked, cancelled
  -- quoted can go to draft, booked, cancelled
  -- booked can go to in_progress, completed, cancelled
  -- in_progress can go to completed, cancelled
  -- completed and cancelled are terminal
  valid_transitions := ARRAY[
    -- Inbound transitions
    ARRAY['inbound', 'draft'],
    ARRAY['inbound', 'quoted'],
    ARRAY['inbound', 'booked'],
    ARRAY['inbound', 'cancelled'],
    -- Draft transitions
    ARRAY['draft', 'quoted'],
    ARRAY['draft', 'booked'],
    ARRAY['draft', 'cancelled'],
    ARRAY['draft', 'inbound'],
    -- Quoted transitions
    ARRAY['quoted', 'draft'],
    ARRAY['quoted', 'booked'],
    ARRAY['quoted', 'cancelled'],
    -- Booked transitions
    ARRAY['booked', 'in_progress'],
    ARRAY['booked', 'completed'],
    ARRAY['booked', 'cancelled'],
    -- In Progress transitions
    ARRAY['in_progress', 'completed'],
    ARRAY['in_progress', 'cancelled']
    -- Completed and Cancelled have no outgoing transitions
  ];

  from_status := OLD.status::text;
  to_status := NEW.status::text;

  -- Check if transition is valid
  FOR i IN 1..array_length(valid_transitions, 1) LOOP
    IF valid_transitions[i][1] = from_status AND valid_transitions[i][2] = to_status THEN
      is_valid := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT is_valid THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', from_status, to_status;
  END IF;

  -- Validate owner_id when transitioning from inbound to non-inbound
  IF OLD.status::text = 'inbound' AND NEW.status::text != 'inbound' AND NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'An owner must be assigned when transitioning from inbound status';
  END IF;

  -- Validate that owner_id is cleared only when status is inbound
  IF NEW.owner_id IS NULL AND NEW.status::text != 'inbound' THEN
    RAISE EXCEPTION 'Owner can only be cleared for inbound trips';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the OLD trigger from migration 0009 to avoid duplicate checks
DROP TRIGGER IF EXISTS trip_status_transition_validation ON trips;

-- Recreate trigger with new logic (handles INSERT and inbound status)
DROP TRIGGER IF EXISTS validate_trip_status_transition_trigger ON trips;
CREATE TRIGGER validate_trip_status_transition_trigger
  BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW
  EXECUTE FUNCTION validate_trip_status_transition();
