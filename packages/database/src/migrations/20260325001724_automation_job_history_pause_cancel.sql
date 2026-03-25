-- Add pause/cancel support + trip association to automation_job_history

-- Enum additions (ALTER TYPE ADD VALUE cannot run in transactions)
ALTER TYPE automation_job_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE automation_job_status ADD VALUE IF NOT EXISTS 'cancelled';

-- New columns
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- Index for trip-scoped queries
CREATE INDEX IF NOT EXISTS idx_automation_job_history_trip ON automation_job_history(trip_id);
