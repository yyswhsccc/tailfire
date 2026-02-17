-- Add import-related fields to custom_cruise_details
-- Supports Traveltek booking import: cabin location, dining, extras, promotions, and Traveltek IDs

-- Cabin location (e.g., "Mid-ship", "Aft", "Forward")
ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS cabin_location VARCHAR(100);

-- Dining preferences from cruise line booking (seating, table size, smoking)
ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS dining_preferences JSONB DEFAULT '{}';

-- Selected extras (beverage packages, wifi, excursions with pricing)
ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS selected_extras JSONB DEFAULT '[]';

-- Applied promotions/discount codes
ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS selected_promotions JSONB DEFAULT '{}';

-- Traveltek internal IDs for future re-sync/refresh
ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS traveltek_booking_id BIGINT;

ALTER TABLE custom_cruise_details
ADD COLUMN IF NOT EXISTS traveltek_portfolio_id BIGINT;

-- Comments
COMMENT ON COLUMN custom_cruise_details.cabin_location IS 'Cabin location on ship (e.g., Mid-ship, Aft, Forward)';
COMMENT ON COLUMN custom_cruise_details.dining_preferences IS 'Dining preferences: seating type, table size, smoking preference';
COMMENT ON COLUMN custom_cruise_details.selected_extras IS 'Selected extras: beverage packages, wifi, excursions with pricing';
COMMENT ON COLUMN custom_cruise_details.selected_promotions IS 'Applied promotion codes and discounts';
COMMENT ON COLUMN custom_cruise_details.traveltek_booking_id IS 'Traveltek internal booking ID for re-sync';
COMMENT ON COLUMN custom_cruise_details.traveltek_portfolio_id IS 'Traveltek portfolio ID for re-sync';
