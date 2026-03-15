-- Email Accounts table
-- Stores IMAP/SMTP connection details for agent personal email accounts.
-- Part of EmailAccountsModule (separate from EmailModule transactional emails).
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  imap_host VARCHAR(255) NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_tls BOOLEAN NOT NULL DEFAULT true,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_tls BOOLEAN NOT NULL DEFAULT true,
  credentials JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  sync_state JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_agency_id ON email_accounts(agency_id);
CREATE UNIQUE INDEX idx_email_accounts_user_email ON email_accounts(user_id, email_address);

-- RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own email accounts"
  ON email_accounts FOR ALL
  USING (user_id = auth.uid());
