-- Migration: 20260327140000_planning_sessions
-- Creates planning_sessions, planning_session_messages, and planning_session_items
-- tables for the AI Concierge journey tracking feature.

-- ============================================================================
-- TABLE: planning_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agency scope (required)
  agency_id             UUID NOT NULL
                          REFERENCES agencies(id),

  -- Anonymous visitor identification (ota_vid cookie)
  visitor_token         TEXT,

  -- Linked after authentication
  contact_id            UUID
                          REFERENCES contacts(id),

  client_portal_user_id UUID
                          REFERENCES client_portal_users(id),

  -- Session lifecycle
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'claimed', 'converted', 'archived')),

  title                 TEXT,
  summary               TEXT,
  source_channel        TEXT DEFAULT 'ota',

  -- AI state
  preferences           JSONB NOT NULL DEFAULT '{}',
  session_context       JSONB NOT NULL DEFAULT '{}',
  ai_memory             JSONB NOT NULL DEFAULT '{}',

  -- Set when session converts to a booked trip
  converted_trip_id     UUID
                          REFERENCES trips(id),

  -- Timestamps
  last_activity_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX planning_sessions_agency_id_idx    ON planning_sessions (agency_id);
CREATE INDEX planning_sessions_contact_id_idx   ON planning_sessions (contact_id);
CREATE INDEX planning_sessions_visitor_token_idx ON planning_sessions (visitor_token);
CREATE INDEX planning_sessions_status_idx        ON planning_sessions (status);

-- updatedAt trigger (reuses existing function)
CREATE TRIGGER update_planning_sessions_updated_at
  BEFORE UPDATE ON planning_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

--> statement-breakpoint

-- ============================================================================
-- TABLE: planning_session_messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_session_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id   UUID NOT NULL
                 REFERENCES planning_sessions(id) ON DELETE CASCADE,

  -- Message role in the AI conversation
  role         TEXT NOT NULL
                 CHECK (role IN ('user', 'assistant', 'system', 'tool')),

  content      TEXT NOT NULL,

  -- Populated when role = 'tool'
  tool_name    TEXT,
  tool_args    JSONB,
  tool_result  JSONB,

  -- Token accounting
  token_count  INTEGER,
  model_id     TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for chronological retrieval per session
CREATE INDEX planning_session_messages_session_created_idx
  ON planning_session_messages (session_id, created_at);

--> statement-breakpoint

-- ============================================================================
-- TABLE: planning_session_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_session_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id     UUID NOT NULL
                   REFERENCES planning_sessions(id) ON DELETE CASCADE,

  -- Entity type discriminator
  entity_type    TEXT NOT NULL
                   CHECK (entity_type IN (
                     'sailing', 'tour', 'destination', 'hotel',
                     'flight', 'activity', 'cruise_line', 'ship'
                   )),

  -- The ID or slug of the referenced entity
  entity_id      TEXT NOT NULL,

  -- Denormalized display fields
  name           TEXT NOT NULL,
  thumbnail_url  TEXT,

  -- User interaction state
  hearted        BOOLEAN NOT NULL DEFAULT FALSE,
  notes          TEXT,

  -- Flexible metadata (prices, dates, cabin categories, etc.)
  metadata       JSONB NOT NULL DEFAULT '{}',

  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX planning_session_items_session_id_idx   ON planning_session_items (session_id);
CREATE INDEX planning_session_items_entity_type_idx  ON planning_session_items (entity_type);
