-- Index for fast email-to-contact matching (used during IMAP sync)
-- Normalized to lowercase for case-insensitive matching
CREATE INDEX IF NOT EXISTS idx_contacts_agency_email
  ON contacts(agency_id, lower(email))
  WHERE email IS NOT NULL;
