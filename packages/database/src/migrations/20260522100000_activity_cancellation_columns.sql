-- Add cancellation metadata to itinerary_activities for #452
-- "Remove Booking" had no audit trail / refund flow. Cancel needs to record:
--   * when, who, why, and what to do with payments.
-- Path B ("Mark Unbooked") only available when no payments AND no confirmation #;
-- Path A ("Cancel Booking") is the only valid action once $ has been moved.

ALTER TABLE itinerary_activities
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_refund_decision VARCHAR(40),
  ADD COLUMN IF NOT EXISTS cancellation_refund_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_notes TEXT;

-- Refund decision is a closed set; enforce at the DB layer so any direct
-- writers (importer, scripts) can't slip in a typo.
ALTER TABLE itinerary_activities
  DROP CONSTRAINT IF EXISTS chk_cancellation_refund_decision;

ALTER TABLE itinerary_activities
  ADD CONSTRAINT chk_cancellation_refund_decision
  CHECK (cancellation_refund_decision IS NULL OR cancellation_refund_decision IN (
    'full_refund_pending',
    'partial_refund_pending',
    'no_refund',
    'supplier_retains'
  ));

-- When booking_status = 'cancelled', cancellation_reason + cancelled_at MUST be set.
-- This prevents silent un-book-as-cancel (which is exactly what #452 surfaced).
ALTER TABLE itinerary_activities
  DROP CONSTRAINT IF EXISTS chk_cancellation_requires_metadata;

ALTER TABLE itinerary_activities
  ADD CONSTRAINT chk_cancellation_requires_metadata
  CHECK (
    booking_status <> 'cancelled' OR (
      cancelled_at IS NOT NULL AND
      cancellation_reason IS NOT NULL AND
      cancellation_refund_decision IS NOT NULL
    )
  ) NOT VALID;
-- NOT VALID so the constraint applies to new rows + transitions only; legacy rows
-- that may already be 'cancelled' without metadata aren't blocked. Existing
-- 'cancelled' rows can be VALIDATED in a follow-up sweep once backfilled.

CREATE INDEX IF NOT EXISTS idx_itinerary_activities_cancelled_at
  ON itinerary_activities (cancelled_at)
  WHERE cancelled_at IS NOT NULL;
