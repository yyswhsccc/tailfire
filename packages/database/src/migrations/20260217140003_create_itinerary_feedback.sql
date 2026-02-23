-- Create itinerary_feedback table
-- Tracks client approvals and change requests for itineraries.
-- Idempotent: safe to re-run if already applied.

-- Enum for feedback type
DO $$ BEGIN
  CREATE TYPE itinerary_feedback_type AS ENUM ('approval', 'change_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for feedback status (agent workflow)
DO $$ BEGIN
  CREATE TYPE itinerary_feedback_status AS ENUM ('pending', 'reviewed', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS itinerary_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  client_portal_user_id UUID NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,

  -- Agency scoping (for RLS)
  agency_id UUID NOT NULL,

  -- Feedback content
  feedback_type itinerary_feedback_type NOT NULL,
  message TEXT,  -- Free-text overall comment
  activity_notes JSONB,  -- [{ activityId, activityName, note }]

  -- Agent workflow
  status itinerary_feedback_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,  -- FK to user_profiles (the agent who reviewed)

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_itinerary_feedback_itinerary ON itinerary_feedback(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_feedback_client ON itinerary_feedback(client_portal_user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_feedback_agency ON itinerary_feedback(agency_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_feedback_status ON itinerary_feedback(status);
