-- Migration: create_portal_messages
-- Creates the portal_messages table for agent-client messaging in the client portal.

CREATE TABLE IF NOT EXISTS portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  trip_id UUID REFERENCES trips(id),
  sender_type TEXT NOT NULL,
  sender_id UUID,
  sender_name TEXT,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_contact ON portal_messages(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_messages_trip ON portal_messages(trip_id, created_at);
