-- Add photo fields to contacts for portal avatar uploads
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_storage_path TEXT;
