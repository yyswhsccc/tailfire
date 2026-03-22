-- Remove 'declined' from itinerary_status enum
-- Any declined itineraries become archived
UPDATE itineraries SET status = 'archived' WHERE status = 'declined';

-- Recreate enum without declined
ALTER TABLE itineraries ALTER COLUMN status DROP DEFAULT;
ALTER TABLE itineraries ALTER COLUMN status TYPE varchar(20) USING status::text;
DROP TYPE IF EXISTS itinerary_status;
CREATE TYPE itinerary_status AS ENUM ('draft', 'proposing', 'approved', 'archived');
ALTER TABLE itineraries ALTER COLUMN status TYPE itinerary_status USING status::itinerary_status;
ALTER TABLE itineraries ALTER COLUMN status SET DEFAULT 'draft';
