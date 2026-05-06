-- Create consumer_activity table for OTA browsing signal tracking
CREATE TABLE IF NOT EXISTS consumer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  event TEXT NOT NULL,
  entity_type TEXT,
  entity_slug TEXT,
  entity_name TEXT,
  search_query JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_activity_session ON consumer_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_consumer_activity_contact ON consumer_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_consumer_activity_created ON consumer_activity(created_at);

-- Create consumer_insights table for AI summaries + purchase signals
CREATE TABLE IF NOT EXISTS consumer_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  type TEXT NOT NULL,
  summary TEXT,
  facts JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_insights_contact ON consumer_insights(contact_id);
