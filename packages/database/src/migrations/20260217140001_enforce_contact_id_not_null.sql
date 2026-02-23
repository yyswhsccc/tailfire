-- Enforce contact_id NOT NULL on trip_travelers
-- Also adds UNIQUE(trip_id, contact_id) and changes ON DELETE to RESTRICT.
--
-- Prerequisites: All trip_travelers rows must have a contact_id.
-- If any orphaned rows exist (contact_id IS NULL), they are deleted first.
-- Idempotent: safe to re-run if already applied.

-- Step 1: Clean up any orphaned rows (contact_id IS NULL)
DELETE FROM trip_travelers WHERE contact_id IS NULL;

-- Step 2: Set contact_id as NOT NULL (idempotent via exception handler)
DO $$ BEGIN
  ALTER TABLE trip_travelers ALTER COLUMN contact_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 3: Add unique constraint (idempotent via exception handler)
DO $$ BEGIN
  ALTER TABLE trip_travelers
    ADD CONSTRAINT unique_trip_traveler_contact UNIQUE (trip_id, contact_id);
EXCEPTION WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 4: Change FK from ON DELETE SET NULL to ON DELETE RESTRICT
-- Must drop and recreate the constraint
ALTER TABLE trip_travelers
  DROP CONSTRAINT IF EXISTS trip_travelers_contact_id_contacts_id_fk;

ALTER TABLE trip_travelers
  DROP CONSTRAINT IF EXISTS trip_travelers_contact_id_fkey;

DO $$ BEGIN
  ALTER TABLE trip_travelers
    ADD CONSTRAINT trip_travelers_contact_id_contacts_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
