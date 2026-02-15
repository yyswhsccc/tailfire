-- ============================================================================
-- Migration: Create Notes Table
-- Description: Central notes system for internal agent notes on contacts and trips
-- ============================================================================

-- Reuse the update_updated_at_column function (created by tasks migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: notes
-- ============================================================================

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  content TEXT NOT NULL,

  -- Entity references (exactly one must be set)
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,

  is_pinned BOOLEAN NOT NULL DEFAULT false,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CHECK: exactly one entity FK must be set
  CONSTRAINT notes_entity_check CHECK (
    (trip_id IS NOT NULL AND contact_id IS NULL) OR
    (trip_id IS NULL AND contact_id IS NOT NULL)
  )
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Composite indexes for sorted queries (pinned first, then newest)
CREATE INDEX IF NOT EXISTS idx_notes_contact_pinned_created
  ON notes (contact_id, is_pinned, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_trip_pinned_created
  ON notes (trip_id, is_pinned, created_at DESC)
  WHERE trip_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Notes: Agency isolation policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notes' AND policyname = 'notes_agency_isolation'
  ) THEN
    CREATE POLICY notes_agency_isolation ON notes
      FOR ALL
      TO authenticated
      USING (
        agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
      );
  END IF;
END $$;
