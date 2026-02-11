-- Add unique constraint on (queue_name, job_id) to prevent cross-queue collisions
-- and ensure job history rows are uniquely identifiable

-- Add unique constraint (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automation_job_history_queue_job_unique'
  ) THEN
    ALTER TABLE automation_job_history
    ADD CONSTRAINT automation_job_history_queue_job_unique
    UNIQUE (queue_name, job_id);
  END IF;
END $$;

-- Add composite index for efficient lookups by queue and status
CREATE INDEX IF NOT EXISTS idx_automation_job_history_queue_status
ON automation_job_history(queue_name, status, created_at DESC);
