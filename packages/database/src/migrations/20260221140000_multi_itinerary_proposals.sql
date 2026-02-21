-- Multi-Itinerary Proposals: Add client_selected_itinerary_id to trips
-- Allows clients to select their preferred itinerary from multiple proposing options.

-- Client's preferred itinerary selection (reversible until agent confirms)
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS client_selected_itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trips_client_selected ON trips(client_selected_itinerary_id)
  WHERE client_selected_itinerary_id IS NOT NULL;

-- Ensure client_selected_itinerary_id belongs to the same trip (defense-in-depth)
CREATE OR REPLACE FUNCTION check_client_selected_itinerary_trip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_selected_itinerary_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM itineraries WHERE id = NEW.client_selected_itinerary_id AND trip_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'client_selected_itinerary_id must belong to the same trip';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_client_selected_itinerary
  BEFORE INSERT OR UPDATE OF client_selected_itinerary_id ON trips
  FOR EACH ROW EXECUTE FUNCTION check_client_selected_itinerary_trip();
