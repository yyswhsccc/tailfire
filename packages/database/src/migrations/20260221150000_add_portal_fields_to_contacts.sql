-- Add portal authentication fields to contacts
-- Allows contacts to be linked to Supabase auth users for client portal access

ALTER TABLE contacts
  ADD COLUMN portal_user_id UUID,
  ADD COLUMN portal_invited_at TIMESTAMPTZ,
  ADD COLUMN portal_invited_by UUID,
  ADD COLUMN portal_activated_at TIMESTAMPTZ;

-- Unique partial index: only one contact per portal user
CREATE UNIQUE INDEX idx_contacts_portal_user_id
  ON contacts(portal_user_id) WHERE portal_user_id IS NOT NULL;
