-- Partial index for efficient unread message counting (Issue 5)
-- Covers getUnreadCount() queries: contact_id WHERE sender_type = 'agent' AND read_at IS NULL
CREATE INDEX IF NOT EXISTS idx_portal_messages_unread
  ON portal_messages(contact_id)
  WHERE sender_type = 'agent' AND read_at IS NULL;
