-- Fix P0: Make imap_uid nullable for outbound emails and convert unique index to partial
ALTER TABLE synced_emails ALTER COLUMN imap_uid DROP NOT NULL;

-- Drop the old full unique index and create partial index (only for IMAP-synced rows)
DROP INDEX IF EXISTS idx_synced_emails_unique_imap;
CREATE UNIQUE INDEX idx_synced_emails_unique_imap ON synced_emails(email_account_id, folder, imap_uid)
  WHERE imap_uid IS NOT NULL;

-- Fix P1: Add unique constraint for attachment dedupe on re-sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_attachments_unique ON email_attachments(email_id, imap_part_id)
  WHERE imap_part_id IS NOT NULL;
