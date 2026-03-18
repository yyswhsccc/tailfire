-- Booking Reference Consolidation
-- Single source of truth: itinerary_activities.confirmation_number

-- 1. Backfill: Copy activity_pricing.confirmation_number → itinerary_activities.confirmation_number
--    (only where ia.confirmation_number is NULL and ap has a value)
UPDATE itinerary_activities ia
SET confirmation_number = ap.confirmation_number
FROM activity_pricing ap
WHERE ap.activity_id = ia.id
  AND ia.confirmation_number IS NULL
  AND ap.confirmation_number IS NOT NULL;

-- 2. Backfill: Copy custom_cruise_details.booking_number → itinerary_activities.confirmation_number
--    (only where ia.confirmation_number is NULL and cruise has a booking_number)
UPDATE itinerary_activities ia
SET confirmation_number = ccd.booking_number
FROM custom_cruise_details ccd
WHERE ccd.activity_id = ia.id
  AND ia.confirmation_number IS NULL
  AND ccd.booking_number IS NOT NULL;

-- 3. Drop the redundant column from activity_pricing
ALTER TABLE activity_pricing DROP COLUMN IF EXISTS confirmation_number;

-- 4. Document the canonical field
COMMENT ON COLUMN itinerary_activities.confirmation_number IS
  'Supplier booking reference (PNR, reservation #, booking #, confirmation #). Single source of truth.';
