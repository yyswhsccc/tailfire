-- Unified Template System: add multi-channel + forking support

-- Agent-level forking
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS user_id uuid;

-- Channel type for tab filtering
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS channel varchar(20);

-- Form support (JSON schema for dynamic form fields)
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS form_json jsonb;

-- SMS support
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS sms_template text;

-- System lock flag
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_user_id ON document_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_channel ON document_templates(channel);

-- Backfill channel from existing category + output_types
UPDATE document_templates SET channel = 'pdf' WHERE output_types @> '{pdf}' AND channel IS NULL;
UPDATE document_templates SET channel = 'email' WHERE channel IS NULL;

-- Mark existing system templates (no agency, no user)
UPDATE document_templates SET is_system = true WHERE agency_id IS NULL AND user_id IS NULL;
