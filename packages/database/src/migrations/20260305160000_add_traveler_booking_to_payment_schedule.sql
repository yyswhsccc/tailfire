-- Add traveler_booking_id to payment_schedule_config
-- Enables per-traveler payment schedules for activities with multiple bookings
-- (e.g., two passengers on the same cruise with separate confirmation numbers)

-- 1. Add the column
ALTER TABLE payment_schedule_config
  ADD COLUMN IF NOT EXISTS traveler_booking_id UUID REFERENCES traveler_bookings(id) ON DELETE CASCADE;

-- 2. Drop existing unique constraint on component_pricing_id
-- (replaced by two partial unique indexes below)
ALTER TABLE payment_schedule_config
  DROP CONSTRAINT IF EXISTS payment_schedule_config_component_pricing_id_unique;

-- 3. Two partial unique indexes (cleaner than COALESCE sentinel):
-- One global schedule per activity pricing (when no traveler booking)
CREATE UNIQUE INDEX IF NOT EXISTS uq_psc_pricing_global
  ON payment_schedule_config (component_pricing_id)
  WHERE traveler_booking_id IS NULL;

-- One schedule per traveler booking per activity pricing
CREATE UNIQUE INDEX IF NOT EXISTS uq_psc_pricing_traveler
  ON payment_schedule_config (component_pricing_id, traveler_booking_id)
  WHERE traveler_booking_id IS NOT NULL;

-- 4. Index for traveler_booking_id lookups
CREATE INDEX IF NOT EXISTS idx_psc_traveler_booking
  ON payment_schedule_config(traveler_booking_id)
  WHERE traveler_booking_id IS NOT NULL;
