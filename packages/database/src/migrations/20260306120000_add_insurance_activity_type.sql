-- Add 'insurance' to activity_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'activity_type'::regtype
    AND enumlabel = 'insurance'
  ) THEN
    ALTER TYPE activity_type ADD VALUE 'insurance';
  END IF;
END $$;

-- Add activity_id FK to trip_insurance_packages
ALTER TABLE trip_insurance_packages
  ADD COLUMN IF NOT EXISTS activity_id UUID
    REFERENCES itinerary_activities(id) ON DELETE SET NULL;

-- Unique partial index: one activity per insurance package
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_insurance_packages_activity_id
  ON trip_insurance_packages(activity_id)
  WHERE activity_id IS NOT NULL;
