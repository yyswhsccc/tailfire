-- Drop duplicate NO ACTION foreign key constraints that block trip deletion.
-- Both tables already have CASCADE FK constraints on the same column:
--   activity_travelers_trip_id_trips_id_fk (CASCADE)
--   package_details_trip_id_trips_id_fk (CASCADE)
-- The duplicate _fkey constraints (NO ACTION) prevent DELETE FROM trips.

ALTER TABLE activity_travelers DROP CONSTRAINT IF EXISTS activity_travelers_trip_id_fkey;
ALTER TABLE package_details DROP CONSTRAINT IF EXISTS package_details_trip_id_fkey;
