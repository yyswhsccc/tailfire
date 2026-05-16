-- #430 backfill: fan trip travelers onto every activity that has none.
--
-- Before this migration, activities created via ComponentOrchestrationService
-- (flight, lodging, transportation, dining, port_info, options, custom_cruise,
-- custom_tour, tour_day) bypassed ActivityTravelerAssignmentPolicy and left
-- activity_travelers empty. The flight form on the admin shows "Travelers
-- (X of Y)" sourced from trip travelers, masking the missing assignments —
-- but downstream code (per-passenger pricing, manifest exports, T4A reports
-- via traveler_bookings) sees the gap.
--
-- This INSERT touches only activities with zero existing assignments. Run
-- once at deploy. Safe to re-run (ON CONFLICT DO NOTHING).
INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
SELECT ia.id, tt.id, tt.trip_id
FROM itinerary_activities ia
LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
LEFT JOIN itineraries it ON it.id = id_day.itinerary_id
JOIN trip_travelers tt
  ON tt.trip_id = COALESCE(it.trip_id, ia.trip_id)
WHERE NOT EXISTS (
  SELECT 1 FROM activity_travelers at WHERE at.activity_id = ia.id
)
ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING;
