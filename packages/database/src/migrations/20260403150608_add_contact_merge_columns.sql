ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS merged_into_contact_id UUID REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by UUID;

CREATE INDEX IF NOT EXISTS idx_contacts_merged_into ON contacts(merged_into_contact_id)
  WHERE merged_into_contact_id IS NOT NULL;
