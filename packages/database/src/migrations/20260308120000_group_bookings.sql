-- Group Bookings Enhancement
-- Adds type discriminator, booking-specific fields, group documents/media tables,
-- and tripGroupId support on notes.

-- 1. Enum types
DO $$ BEGIN
  CREATE TYPE trip_group_type AS ENUM ('folder', 'group_booking');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trip_group_status AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enhance trip_groups table
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS type trip_group_type NOT NULL DEFAULT 'folder';
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS group_number VARCHAR(100);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS primary_supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS destination VARCHAR(500);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS status trip_group_status;

-- 3. Index on trips.trip_group_id (was missing)
CREATE INDEX IF NOT EXISTS idx_trips_trip_group_id ON trips(trip_group_id) WHERE trip_group_id IS NOT NULL;

-- 4. Partial unique for group bookings: no duplicate group_number per agency
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_groups_agency_group_number
  ON trip_groups(agency_id, group_number)
  WHERE type = 'group_booking' AND group_number IS NOT NULL;

-- 5. Add tripGroupId to notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS trip_group_id UUID REFERENCES trip_groups(id) ON DELETE CASCADE;

-- Update check constraint: exactly one of tripId, contactId, tripGroupId
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_entity_check;
ALTER TABLE notes ADD CONSTRAINT notes_entity_check CHECK (
  (CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN trip_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

CREATE INDEX IF NOT EXISTS idx_notes_trip_group_pinned_created
  ON notes(trip_group_id, is_pinned, created_at)
  WHERE trip_group_id IS NOT NULL;

-- 6. trip_group_documents table
CREATE TABLE IF NOT EXISTS trip_group_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_trip_group_documents_group ON trip_group_documents(trip_group_id);

-- 7. trip_group_media table
CREATE TABLE IF NOT EXISTS trip_group_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  media_type VARCHAR(50) NOT NULL DEFAULT 'image',
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_trip_group_media_group ON trip_group_media(trip_group_id);
