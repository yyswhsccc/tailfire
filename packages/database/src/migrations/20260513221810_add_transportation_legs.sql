-- #304 — multi-leg train/bus journeys with interchanges
--
-- Stores an ordered array of legs on transportation_details. Each leg is:
--   {
--     "trainNumber": "BRB 79023",
--     "operator": "Bayerische Regiobahn",
--     "departureStation": "München Hbf",
--     "arrivalStation": "Garmisch-Partenkirchen",
--     "departureDate": "2026-09-30",
--     "departureTime": "14:32",
--     "arrivalDate": "2026-09-30",
--     "arrivalTime": "15:48",
--     "interchangeMinutesAfter": 39
--   }
-- interchangeMinutesAfter is the minutes between the END of this leg and the
-- START of the next. Ignored for the last leg.
--
-- The existing flat columns (departure_station, arrival_station, pickup_time,
-- etc.) describe the WHOLE journey (or a single-leg journey when legs is null/
-- empty) for back-compat with existing rows.
ALTER TABLE transportation_details
  ADD COLUMN IF NOT EXISTS legs jsonb;

COMMENT ON COLUMN transportation_details.legs IS
  'Ordered list of journey legs for multi-segment train/bus trips with interchanges. NULL or empty array = single-leg.';
