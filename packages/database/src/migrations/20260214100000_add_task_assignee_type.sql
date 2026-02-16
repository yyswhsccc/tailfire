-- Add task_assignee_type enum and column to tasks table
-- Supports: 'user' (team member), 'contact' (client/passenger), 'admin_pool' (any admin)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_assignee_type') THEN
    CREATE TYPE "task_assignee_type" AS ENUM ('user', 'contact', 'admin_pool');
  END IF;
END $$;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_type" "task_assignee_type" NOT NULL DEFAULT 'user';

-- Backfill existing contact assignments
UPDATE "tasks" SET "assignee_type" = 'contact' WHERE "assignee_contact_id" IS NOT NULL;

-- Index for filtering by assignee type
CREATE INDEX IF NOT EXISTS "idx_tasks_assignee_type" ON "tasks" ("assignee_type") WHERE "is_deleted" = false;
