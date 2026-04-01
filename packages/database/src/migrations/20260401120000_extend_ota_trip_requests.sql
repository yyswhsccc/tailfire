-- Make email nullable for anonymous drafts
ALTER TABLE ota_trip_requests ALTER COLUMN contact_email DROP NOT NULL;

-- New columns for Phase 2 (Consumer Trip Builder)
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS share_token varchar(64);
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS date_flexibility boolean DEFAULT false;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS travel_style varchar(20);
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS inspiration jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS board_order jsonb DEFAULT '[]'::jsonb;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_trip_requests_share_token
  ON ota_trip_requests (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_session
  ON ota_trip_requests (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_contact
  ON ota_trip_requests (contact_id) WHERE contact_id IS NOT NULL;
