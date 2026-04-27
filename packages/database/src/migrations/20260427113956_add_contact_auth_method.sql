-- Add auth_method to contacts for tracking how the consumer authenticates
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'magic_link';
COMMENT ON COLUMN contacts.auth_method IS 'Authentication method: magic_link, password, google, apple';
