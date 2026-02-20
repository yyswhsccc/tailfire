-- Phase 2: Client Feedback, Comments & Notifications
-- Creates client_activity_responses table, extends proposal_comments, adds 'declined' status

-- 1a. Create client_activity_response_type enum
DO $$ BEGIN
  CREATE TYPE client_activity_response_type AS ENUM ('confirmed', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1a. Create client_activity_responses table
CREATE TABLE IF NOT EXISTS client_activity_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL,  -- snapshot activity ID (no FK - may not exist in live tables)
  version_number INTEGER NOT NULL,
  response client_activity_response_type NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name VARCHAR(255) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(itinerary_id, activity_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_car_itinerary_version ON client_activity_responses(itinerary_id, version_number);
CREATE INDEX IF NOT EXISTS idx_car_trip ON client_activity_responses(trip_id);

ALTER TABLE client_activity_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON client_activity_responses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 1b. Drop FK on activity_id (snapshot activity IDs may not exist in live tables)
ALTER TABLE proposal_comments DROP CONSTRAINT IF EXISTS proposal_comments_activity_id_fkey;

-- 1b. Add version_number to scope comments to a published version
ALTER TABLE proposal_comments
  ADD COLUMN IF NOT EXISTS version_number INTEGER;

-- 1b. Add day_id (NO FK - may reference snapshot day IDs)
ALTER TABLE proposal_comments
  ADD COLUMN IF NOT EXISTS day_id UUID;

CREATE INDEX IF NOT EXISTS idx_proposal_comments_day_id ON proposal_comments(day_id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_version ON proposal_comments(itinerary_id, version_number);

-- 1c. Add 'declined' to itinerary_status enum
ALTER TYPE itinerary_status ADD VALUE IF NOT EXISTS 'declined';

-- 1d. Enable Realtime on proposal_comments
ALTER PUBLICATION supabase_realtime ADD TABLE proposal_comments;

-- 1d. Add agency-scoped read policy for collaborators
CREATE POLICY "agency_member_read" ON proposal_comments
  FOR SELECT
  TO authenticated
  USING (
    trip_id IN (
      SELECT t.id FROM trips t
      JOIN agencies a ON t.agency_id = a.id
      JOIN agency_members am ON am.agency_id = a.id
      WHERE am.user_id = auth.uid()
    )
  );
