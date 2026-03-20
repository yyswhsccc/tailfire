-- Add structured location data and enhanced fields to transportation_details
-- Supports Google Places integration and Amadeus Transfer API

ALTER TABLE transportation_details
  ADD COLUMN IF NOT EXISTS pickup_name varchar(255),
  ADD COLUMN IF NOT EXISTS pickup_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS pickup_lng numeric(10, 6),
  ADD COLUMN IF NOT EXISTS pickup_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS dropoff_name varchar(255),
  ADD COLUMN IF NOT EXISTS dropoff_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS dropoff_lng numeric(10, 6),
  ADD COLUMN IF NOT EXISTS dropoff_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS rental_company varchar(255),
  ADD COLUMN IF NOT EXISTS rental_booking_ref varchar(100),
  ADD COLUMN IF NOT EXISTS rental_car_class varchar(50),
  ADD COLUMN IF NOT EXISTS rental_fuel_policy varchar(50),
  ADD COLUMN IF NOT EXISTS departure_station varchar(255),
  ADD COLUMN IF NOT EXISTS arrival_station varchar(255);
