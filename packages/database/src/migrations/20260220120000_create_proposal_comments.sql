-- Create proposal_comments table for per-activity commenting on shared proposals

CREATE TYPE proposal_comment_author_type AS ENUM ('client', 'agent');

CREATE TABLE proposal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES itinerary_activities(id) ON DELETE CASCADE,
  author_type proposal_comment_author_type NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  author_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Integrity: client must have contact_id only, agent must have user_id only
  CONSTRAINT chk_author_refs CHECK (
    (author_type = 'client' AND contact_id IS NOT NULL AND user_id IS NULL) OR
    (author_type = 'agent' AND user_id IS NOT NULL AND contact_id IS NULL)
  )
);

-- Indexes for efficient queries
CREATE INDEX idx_proposal_comments_trip_id ON proposal_comments(trip_id);
CREATE INDEX idx_proposal_comments_itinerary_id ON proposal_comments(itinerary_id);
CREATE INDEX idx_proposal_comments_activity_id ON proposal_comments(activity_id);

-- RLS policies
ALTER TABLE proposal_comments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_all" ON proposal_comments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read comments for trips they own
CREATE POLICY "authenticated_read" ON proposal_comments
  FOR SELECT
  TO authenticated
  USING (
    trip_id IN (
      SELECT id FROM trips WHERE owner_id = auth.uid()
    )
  );

-- Authenticated users can insert comments for trips they own (agent comments)
CREATE POLICY "authenticated_insert" ON proposal_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_type = 'agent' AND
    user_id = auth.uid() AND
    trip_id IN (
      SELECT id FROM trips WHERE owner_id = auth.uid()
    )
  );
