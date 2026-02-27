-- Migrate itinerary_feedback FK from client_portal_users to contacts
-- The client_portal_users table is not populated; portal identity comes from contacts directly

-- Drop existing FK
ALTER TABLE itinerary_feedback
  DROP CONSTRAINT IF EXISTS itinerary_feedback_client_portal_user_id_client_portal_users_id_fk;

-- Rename column
ALTER TABLE itinerary_feedback
  RENAME COLUMN client_portal_user_id TO contact_id;

-- Add new FK to contacts
ALTER TABLE itinerary_feedback
  ADD CONSTRAINT itinerary_feedback_contact_id_contacts_id_fk
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- Update index
DROP INDEX IF EXISTS idx_itinerary_feedback_client;
CREATE INDEX IF NOT EXISTS idx_itinerary_feedback_contact ON itinerary_feedback(contact_id);
