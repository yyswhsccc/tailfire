-- Enable RLS and Realtime for Notification System
-- This migration enables Row Level Security and Supabase Realtime on notification tables

-- =============================================================================
-- Enable RLS on platform_notifications
-- =============================================================================

ALTER TABLE platform_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON platform_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark read/dismissed)
CREATE POLICY "Users can update own notifications"
  ON platform_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can do everything (for API operations)
CREATE POLICY "Service role has full access to notifications"
  ON platform_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Enable RLS on notification_preferences
-- =============================================================================

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences"
  ON notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can do everything (for API operations)
CREATE POLICY "Service role has full access to preferences"
  ON notification_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Add platform_notifications to Supabase Realtime publication
-- =============================================================================

-- Check if publication exists and add tables
DO $$
BEGIN
  -- Add platform_notifications to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'platform_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE platform_notifications;
  END IF;
END $$;

-- Ensure full row data on updates for Realtime
ALTER TABLE platform_notifications REPLICA IDENTITY FULL;

-- =============================================================================
-- Add optional columns to platform_notifications for better filtering
-- =============================================================================

-- notification_type: specific type like 'trip.booked', 'payment.received'
ALTER TABLE platform_notifications
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(100);

-- entity_type: type of related entity (trip, payment, contact, etc.)
ALTER TABLE platform_notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);

-- entity_id: ID of the related entity for deep linking
ALTER TABLE platform_notifications
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- dedupe_key: for preventing duplicate notifications
ALTER TABLE platform_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

-- =============================================================================
-- Add indexes for new columns
-- =============================================================================

-- Index for efficient querying by user, status, and creation date
CREATE INDEX IF NOT EXISTS idx_platform_notifications_user_unread
  ON platform_notifications(user_id, created_at DESC)
  WHERE status = 'unread';

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_platform_notifications_entity
  ON platform_notifications(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Index for deduplication checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_notifications_dedupe
  ON platform_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON COLUMN platform_notifications.notification_type IS 'Specific notification type (e.g., trip.booked, payment.received)';
COMMENT ON COLUMN platform_notifications.entity_type IS 'Type of related entity (trip, payment, contact, activity)';
COMMENT ON COLUMN platform_notifications.entity_id IS 'UUID of the related entity for navigation';
COMMENT ON COLUMN platform_notifications.dedupe_key IS 'Unique key to prevent duplicate notifications';
