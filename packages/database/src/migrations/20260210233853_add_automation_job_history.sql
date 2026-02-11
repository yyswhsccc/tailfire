-- Add automation job history table for audit trail
-- Redis has TTL on jobs, this provides permanent history

-- Create enum for job status
DO $$ BEGIN
  CREATE TYPE automation_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS automation_job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(50) NOT NULL,
  job_id VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  job_data JSONB NOT NULL DEFAULT '{}',
  status automation_job_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_automation_job_history_queue ON automation_job_history(queue_name);
CREATE INDEX IF NOT EXISTS idx_automation_job_history_status ON automation_job_history(status);
CREATE INDEX IF NOT EXISTS idx_automation_job_history_job_id ON automation_job_history(job_id);
CREATE INDEX IF NOT EXISTS idx_automation_job_history_created ON automation_job_history(created_at DESC);

COMMENT ON TABLE automation_job_history IS 'Permanent audit trail for automation jobs (Redis jobs have TTL)';
