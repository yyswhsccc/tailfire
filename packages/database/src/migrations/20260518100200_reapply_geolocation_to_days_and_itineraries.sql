-- Re-apply: 20260202120000_add_geolocation_to_days_and_itineraries
--
-- Drift audit 2026-05-16: 8 itinerary_days location columns and 6
-- itineraries destination columns are missing on prod despite the
-- original migration being recorded as applied in
-- drizzle.__drizzle_migrations. Re-create idempotently.
--
-- ADD COLUMN ... NOT NULL DEFAULT FALSE is metadata-only on PG 11+
-- so no rewrite cost.

ALTER TABLE itinerary_days
  ADD COLUMN IF NOT EXISTS start_location_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_location_lat       NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS start_location_lng       NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS end_location_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS end_location_lat         NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS end_location_lng         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS start_location_override  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS end_location_override    BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS primary_destination_name    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS primary_destination_lat     NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS primary_destination_lng     NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS secondary_destination_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS secondary_destination_lat   NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS secondary_destination_lng   NUMERIC(10,6);
