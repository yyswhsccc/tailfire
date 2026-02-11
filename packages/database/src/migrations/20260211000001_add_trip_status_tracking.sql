-- ============================================================================
-- Migration: Add Trip Status Tracking
-- Description: Adds cancellation tracking and auto-transition audit fields to trips
-- Dependencies: trips table must exist
-- ============================================================================

-- Cancellation tracking columns
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancelled_by UUID;

-- Auto-transition audit columns
ALTER TABLE trips ADD COLUMN IF NOT EXISTS status_auto_transitioned_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ;

-- Performance index for scheduler (finding trips that need status transitions)
CREATE INDEX IF NOT EXISTS idx_trips_status_dates
  ON trips (status, start_date, end_date)
  WHERE status IN ('booked', 'in_progress');

-- Index for cancelled trips queries
CREATE INDEX IF NOT EXISTS idx_trips_cancelled
  ON trips (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN trips.cancelled_at IS 'Timestamp when trip was cancelled';
COMMENT ON COLUMN trips.cancellation_reason IS 'User-provided reason for cancellation';
COMMENT ON COLUMN trips.cancelled_by IS 'User ID who cancelled the trip';
COMMENT ON COLUMN trips.status_auto_transitioned_at IS 'Timestamp of last automatic status transition by scheduler';
COMMENT ON COLUMN trips.last_status_change_at IS 'Timestamp of last status change (manual or automatic)';
