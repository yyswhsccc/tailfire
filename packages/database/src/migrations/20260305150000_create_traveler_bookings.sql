-- Per-traveler bookings table
-- Stores individual booking records per traveler per activity
-- (e.g., two passengers on same cruise with separate confirmation numbers)

CREATE TABLE IF NOT EXISTS traveler_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
  trip_traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL,

  -- Booking identity
  confirmation_number VARCHAR(255),
  booking_reference VARCHAR(255),
  booking_status VARCHAR(100) DEFAULT 'confirmed',
  supplier VARCHAR(255),

  -- Pricing (this traveler's portion)
  price_cents INTEGER,
  net_price_cents INTEGER,
  taxes_and_fees_cents INTEGER DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'CAD',

  -- Commission (this traveler's portion)
  commission_cents INTEGER,

  -- Type-specific details (cabin/seat/room as JSON)
  booking_details_json JSONB DEFAULT '{}',

  -- External system tracking (for imports)
  external_booking_id VARCHAR(255),
  external_system VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(activity_id, trip_traveler_id)
);

CREATE INDEX IF NOT EXISTS idx_tb_activity ON traveler_bookings(activity_id);
CREATE INDEX IF NOT EXISTS idx_tb_traveler ON traveler_bookings(trip_traveler_id);
CREATE INDEX IF NOT EXISTS idx_tb_agency ON traveler_bookings(agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_external
  ON traveler_bookings(agency_id, external_system, external_booking_id)
  WHERE external_booking_id IS NOT NULL;

-- RLS
ALTER TABLE traveler_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY traveler_bookings_agency_isolation ON traveler_bookings
  USING (agency_id = current_setting('app.agency_id', true)::uuid);

-- Auto-link trigger: inserting a traveler_booking auto-creates activity_travelers row
CREATE OR REPLACE FUNCTION auto_link_activity_traveler_from_booking()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
  SELECT NEW.activity_id, NEW.trip_traveler_id, tt.trip_id
  FROM trip_travelers tt WHERE tt.id = NEW.trip_traveler_id
  ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_traveler_bookings_auto_link
  AFTER INSERT ON traveler_bookings
  FOR EACH ROW EXECUTE FUNCTION auto_link_activity_traveler_from_booking();
