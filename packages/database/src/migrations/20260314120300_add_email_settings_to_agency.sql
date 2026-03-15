-- Add email integration settings to existing agency_settings table
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS email_allowed_domains JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS email_compliance_footer TEXT;
