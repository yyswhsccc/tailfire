-- Add itinerary versioning columns and table
-- Enables publish-gated itinerary content for shared proposal pages

-- 1a. Add version columns to itineraries
ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_version INTEGER,
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN NOT NULL DEFAULT FALSE;

-- 1b. Create itinerary_versions table
CREATE TABLE IF NOT EXISTS itinerary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  published_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(itinerary_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_versions_itinerary ON itinerary_versions(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_versions_latest ON itinerary_versions(itinerary_id, version_number DESC);

-- 1c. RLS policies
ALTER TABLE itinerary_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON itinerary_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON itinerary_versions
  FOR SELECT TO authenticated
  USING (agency_id = (auth.jwt() ->> 'agency_id')::uuid);

CREATE POLICY "authenticated_insert" ON itinerary_versions
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = (auth.jwt() ->> 'agency_id')::uuid);

GRANT SELECT, INSERT ON itinerary_versions TO authenticated;
