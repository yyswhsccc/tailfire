-- Notification System Tables Migration
-- Creates notification_preferences and platform_notifications tables for multi-channel notification delivery

-- =============================================================================
-- Platform Notification Status Enum
-- =============================================================================

CREATE TYPE platform_notification_status AS ENUM ('unread', 'read', 'dismissed');

-- =============================================================================
-- Notification Preferences Table
-- =============================================================================

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Channel toggles
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  platform_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Category-specific preferences (which channels per category)
  category_preferences JSONB DEFAULT '{
    "payment_reminders": ["email", "platform"],
    "trip_updates": ["email", "push", "platform"],
    "client_care": ["email"],
    "booking_alerts": ["email", "push", "platform"],
    "system_alerts": ["platform"]
  }'::jsonb,

  -- Push notification tokens array
  push_tokens JSONB DEFAULT '[]'::jsonb,

  -- Quiet hours (optional)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'America/Toronto',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each user has exactly one preferences row
CREATE UNIQUE INDEX notification_preferences_user_id_unique ON notification_preferences(user_id);

-- Agency lookup for admin operations
CREATE INDEX notification_preferences_agency_idx ON notification_preferences(agency_id);

-- =============================================================================
-- Platform Notifications Table (In-App Notifications)
-- =============================================================================

CREATE TABLE platform_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Notification content
  category VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,

  -- Optional deep link for in-app navigation
  action_url VARCHAR(500),

  -- Additional metadata (entity IDs, etc.)
  metadata JSONB,

  -- Status tracking
  status platform_notification_status NOT NULL DEFAULT 'unread',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

-- Primary query: unread notifications for a user
CREATE INDEX platform_notifications_user_status_idx ON platform_notifications(user_id, status);

-- For cleanup: find old notifications by agency
CREATE INDEX platform_notifications_agency_created_idx ON platform_notifications(agency_id, created_at);

-- =============================================================================
-- Trigger: Auto-update updated_at on notification_preferences
-- =============================================================================

CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_preferences_updated_at_trigger
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();
