-- Fix P0: Make imap_uid nullable for outbound emails
ALTER TABLE synced_emails ALTER COLUMN imap_uid DROP NOT NULL;

-- Recreate as regular unique index (not partial).
-- PostgreSQL treats NULL as distinct in unique indexes, so multiple outbound
-- emails with imap_uid=NULL won't conflict, while IMAP-synced rows (non-null
-- imap_uid) remain deduplicated. This also allows Drizzle's onConflictDoUpdate
-- to match the index target correctly.
DROP INDEX IF EXISTS idx_synced_emails_unique_imap;
CREATE UNIQUE INDEX idx_synced_emails_unique_imap ON synced_emails(email_account_id, folder, imap_uid);

-- Fix P1: Add unique constraint for attachment dedupe on re-sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_attachments_unique ON email_attachments(email_id, imap_part_id)
  WHERE imap_part_id IS NOT NULL;
