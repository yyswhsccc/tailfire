-- Add trip_group_documents and trip_group_media tables
-- Plus tripGroupId support on notes for group-scoped notes

-- 1. trip_group_documents table
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

-- 2. trip_group_media table
CREATE TABLE IF NOT EXISTS trip_group_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  media_type media_type NOT NULL DEFAULT 'image',
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_trip_group_media_group ON trip_group_media(trip_group_id);

-- 3. Add trip_group_id to notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS trip_group_id UUID REFERENCES trip_groups(id) ON DELETE CASCADE;

-- Update CHECK constraint: exactly one entity FK must be set (now 3 options)
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_entity_check;
ALTER TABLE notes ADD CONSTRAINT notes_entity_check CHECK (
  num_nonnulls(trip_id, contact_id, trip_group_id) = 1
);

-- Index for group notes
CREATE INDEX IF NOT EXISTS idx_notes_trip_group_pinned_created
  ON notes(trip_group_id, is_pinned, created_at)
  WHERE trip_group_id IS NOT NULL;
