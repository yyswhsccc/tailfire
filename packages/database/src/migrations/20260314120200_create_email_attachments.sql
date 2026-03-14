-- Email Attachments table
-- Attachment metadata for synced emails. Files fetched on-demand from IMAP.
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES synced_emails(id) ON DELETE CASCADE,

  -- Attachment info
  filename VARCHAR(500),
  content_type VARCHAR(255),
  size_bytes INTEGER,
  content_id VARCHAR(255),
  is_inline BOOLEAN NOT NULL DEFAULT false,

  -- IMAP part reference (for on-demand fetch)
  imap_part_id VARCHAR(100),

  -- Cached storage (populated on first access)
  storage_path TEXT,
  storage_url TEXT,
  is_cached BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_attachments_email_id ON email_attachments(email_id);

-- Dedupe attachment metadata on re-sync
CREATE UNIQUE INDEX idx_email_attachments_unique ON email_attachments(email_id, imap_part_id)
  WHERE imap_part_id IS NOT NULL;

-- RLS
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
