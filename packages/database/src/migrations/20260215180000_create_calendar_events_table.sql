-- ============================================================================
-- Migration: Create Calendar Events Table
-- Description: Standalone calendar events (meetings, calls, follow-ups)
--              linked to contacts and/or trips
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
-- TABLE: calendar_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Timing
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,

  -- Sub-type (meeting, call, follow_up, appointment, other)
  event_type VARCHAR(50) NOT NULL DEFAULT 'meeting',

  -- Entity references (both optional, both can be set)
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Range queries by agency
CREATE INDEX IF NOT EXISTS idx_calendar_events_agency_start
  ON calendar_events (agency_id, start_at);

-- Contact events
CREATE INDEX IF NOT EXISTS idx_calendar_events_contact_start
  ON calendar_events (contact_id, start_at)
  WHERE contact_id IS NOT NULL;

-- Trip events
CREATE INDEX IF NOT EXISTS idx_calendar_events_trip_start
  ON calendar_events (trip_id, start_at)
  WHERE trip_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Calendar events: Agency isolation policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calendar_events' AND policyname = 'calendar_events_agency_isolation'
  ) THEN
    CREATE POLICY calendar_events_agency_isolation ON calendar_events
      FOR ALL
      TO authenticated
      USING (
        agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
      );
  END IF;
END $$;
