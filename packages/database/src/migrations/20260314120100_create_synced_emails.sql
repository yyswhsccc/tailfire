-- Synced Emails table
-- Stores email messages synced from agent IMAP accounts.
-- Body lazily loaded on-demand. IMAP idempotency via unique index.
CREATE TABLE IF NOT EXISTS synced_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL,

  -- IMAP identifiers
  message_id VARCHAR(512),
  imap_uid INTEGER NOT NULL,
  folder VARCHAR(255) NOT NULL DEFAULT 'INBOX',

  -- Threading
  in_reply_to VARCHAR(512),
  references_header TEXT,
  thread_id UUID,

  -- Headers
  from_address VARCHAR(255),
  from_name VARCHAR(255),
  to_addresses JSONB DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  bcc_addresses JSONB DEFAULT '[]',
  subject VARCHAR(1000),
  date TIMESTAMPTZ,

  -- Body (lazily loaded)
  body_html TEXT,
  body_text TEXT,
  snippet VARCHAR(500),

  -- Flags
  is_seen BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  is_draft BOOLEAN NOT NULL DEFAULT false,

  -- Direction
  is_outbound BOOLEAN NOT NULL DEFAULT false,

  -- Contact matching
  matched_contact_ids JSONB DEFAULT '[]',

  -- Size
  size_bytes INTEGER,
  has_attachments BOOLEAN NOT NULL DEFAULT false,

  -- Raw storage
  raw_storage_path TEXT,

  -- Audit
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE constraint for IMAP sync idempotency (upsert on re-sync)
CREATE UNIQUE INDEX idx_synced_emails_unique_imap ON synced_emails(email_account_id, folder, imap_uid);

-- Query indexes
CREATE INDEX idx_synced_emails_account_folder ON synced_emails(email_account_id, folder);
CREATE INDEX idx_synced_emails_message_id ON synced_emails(message_id);
CREATE INDEX idx_synced_emails_date ON synced_emails(date);
CREATE INDEX idx_synced_emails_agency_id ON synced_emails(agency_id);
CREATE INDEX idx_synced_emails_thread_id ON synced_emails(thread_id);
CREATE INDEX idx_synced_emails_matched_contacts ON synced_emails USING gin(matched_contact_ids);

-- RLS
ALTER TABLE synced_emails ENABLE ROW LEVEL SECURITY;
