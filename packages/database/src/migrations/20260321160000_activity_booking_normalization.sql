-- New enums for activity proposal and booking lifecycle
CREATE TYPE activity_proposal_status AS ENUM ('draft', 'proposing', 'approved', 'cancelled');
CREATE TYPE activity_booking_status AS ENUM ('unbooked', 'booked', 'cancelled');

-- Add new columns to itinerary_activities
ALTER TABLE itinerary_activities ADD COLUMN proposal_status activity_proposal_status NOT NULL DEFAULT 'draft';
ALTER TABLE itinerary_activities ADD COLUMN booking_status activity_booking_status NOT NULL DEFAULT 'unbooked';

-- Passport verification fields
ALTER TABLE itinerary_activities ADD COLUMN passport_verified boolean NOT NULL DEFAULT false;
ALTER TABLE itinerary_activities ADD COLUMN passport_verified_at timestamptz;
ALTER TABLE itinerary_activities ADD COLUMN passport_verified_by uuid;

-- Non-refundable amount on payment schedule config
ALTER TABLE payment_schedule_config ADD COLUMN non_refundable_amount_cents integer;

-- Migrate existing data (safety net — no live data)
UPDATE itinerary_activities SET proposal_status = 'draft' WHERE status = 'proposed';
UPDATE itinerary_activities SET proposal_status = 'approved' WHERE status = 'confirmed';
UPDATE itinerary_activities SET proposal_status = 'cancelled' WHERE status = 'cancelled';
UPDATE itinerary_activities SET proposal_status = 'draft' WHERE status = 'optional';
UPDATE itinerary_activities SET booking_status = 'booked' WHERE is_booked = true;

-- Drop old columns
ALTER TABLE itinerary_activities DROP COLUMN status;
ALTER TABLE itinerary_activities DROP COLUMN is_booked;

-- Drop old enum
DROP TYPE IF EXISTS activity_status;
