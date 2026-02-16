-- Pending task assignment notifications for hourly contact digest emails
-- Rows are consumed (deleted) after the digest email is sent

CREATE TABLE IF NOT EXISTS "task_notification_pending" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "event_type" varchar(50) NOT NULL, -- 'assigned' | 'removed'
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Index for the digest query: group by contact
CREATE INDEX IF NOT EXISTS "idx_task_notification_pending_contact"
  ON "task_notification_pending" ("contact_id");

-- Prevent duplicate notifications for same task+contact+event
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_notification_pending_unique"
  ON "task_notification_pending" ("task_id", "contact_id", "event_type");
