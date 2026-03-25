-- Add signature + submission data columns for audit trail
ALTER TABLE form_tokens ADD COLUMN IF NOT EXISTS signature_data jsonb;
ALTER TABLE form_tokens ADD COLUMN IF NOT EXISTS submission_data jsonb;
