-- Add group trip billing columns
-- activity_pricing.billed_to_trip_id: when set, this activity's cost rolls up to another trip
-- trip_groups.master_trip_id: designates the billing master trip in a group

-- 1. Add billed_to_trip_id to activity_pricing
ALTER TABLE activity_pricing
  ADD COLUMN billed_to_trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;

CREATE INDEX idx_activity_pricing_billed_to_trip
  ON activity_pricing(billed_to_trip_id)
  WHERE billed_to_trip_id IS NOT NULL;

-- 2. Add master_trip_id to trip_groups
ALTER TABLE trip_groups
  ADD COLUMN master_trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;
