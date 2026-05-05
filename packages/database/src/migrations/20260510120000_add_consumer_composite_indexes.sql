-- Add composite indexes on consumer_activity and consumer_insights
-- Replaces single-column contact index with contact+created_at composite for common query patterns

CREATE INDEX IF NOT EXISTS idx_consumer_activity_contact_created ON consumer_activity(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumer_insights_contact_created ON consumer_insights(contact_id, created_at DESC);

DROP INDEX IF EXISTS idx_consumer_activity_contact;
DROP INDEX IF EXISTS idx_consumer_insights_contact;
