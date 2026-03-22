-- Migration: Rename trip_status enum to canonical vocabulary
-- planning replaces draft+quoted, active replaces booked,
-- travelling replaces in_progress, travelled replaces completed
--
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction.
-- Since Drizzle runs migrations in a transaction, we assume the new
-- values were already added via a pre-migration step or manually.
-- This migration handles: data update, enum swap, trigger recreation.

-- ─── Step 1: Drop dependent triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS validate_trip_status_transition_trigger ON trips;
DROP TRIGGER IF EXISTS set_trip_reference_update ON trips;

-- ─── Step 2: Update existing rows ─────────────────────────────────────────
UPDATE trips SET status = 'planning' WHERE status::text IN ('draft', 'quoted');
UPDATE trips SET status = 'active' WHERE status::text = 'booked';
UPDATE trips SET status = 'travelling' WHERE status::text = 'in_progress';
UPDATE trips SET status = 'travelled' WHERE status::text = 'completed';

UPDATE trips SET status_before_cancel = 'planning' WHERE status_before_cancel IN ('draft', 'quoted');
UPDATE trips SET status_before_cancel = 'active' WHERE status_before_cancel = 'booked';
UPDATE trips SET status_before_cancel = 'travelling' WHERE status_before_cancel = 'in_progress';
UPDATE trips SET status_before_cancel = 'travelled' WHERE status_before_cancel = 'completed';

-- ─── Step 3: Swap enum type ───────────────────────────────────────────────
ALTER TABLE trips ALTER COLUMN status DROP DEFAULT;
ALTER TABLE trips ALTER COLUMN status TYPE varchar(20) USING status::text;
DROP TYPE trip_status;
CREATE TYPE trip_status AS ENUM ('inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled');
ALTER TABLE trips ALTER COLUMN status TYPE trip_status USING status::trip_status;
ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'planning';

-- ─── Step 4: Recreate triggers with new values ────────────────────────────
CREATE TRIGGER set_trip_reference_update
  BEFORE UPDATE ON trips FOR EACH ROW
  WHEN (NEW.status = 'planning' AND OLD.trip_type IS DISTINCT FROM NEW.trip_type)
  EXECUTE FUNCTION generate_trip_reference();

CREATE OR REPLACE FUNCTION validate_trip_status_transition()
RETURNS TRIGGER AS $fn$
DECLARE
  valid_transitions text[][];
  from_status text;
  to_status text;
  is_valid boolean := FALSE;
  i integer;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  valid_transitions := ARRAY[
    ARRAY['inbound',   'planning'],
    ARRAY['inbound',   'cancelled'],
    ARRAY['planning',  'inbound'],
    ARRAY['planning',  'cancelled'],
    ARRAY['active',    'planning'],
    ARRAY['active',    'travelling'],
    ARRAY['active',    'cancelled'],
    ARRAY['travelling', 'travelled'],
    ARRAY['travelling', 'cancelled'],
    ARRAY['cancelled', 'planning']
  ];

  from_status := OLD.status::text;
  to_status   := NEW.status::text;

  FOR i IN 1..array_length(valid_transitions, 1) LOOP
    IF valid_transitions[i][1] = from_status AND valid_transitions[i][2] = to_status THEN
      is_valid := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT is_valid AND from_status = 'cancelled' AND to_status = 'planning'
     AND NEW.status_before_cancel IS NOT NULL THEN
    is_valid := TRUE;
  END IF;

  IF NOT is_valid THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', from_status, to_status;
  END IF;

  IF OLD.status::text = 'inbound' AND NEW.status::text != 'inbound' AND NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'An owner must be assigned when transitioning from inbound status';
  END IF;

  IF NEW.owner_id IS NULL AND NEW.status::text != 'inbound' THEN
    RAISE EXCEPTION 'Owner can only be cleared for inbound trips';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER validate_trip_status_transition_trigger
  BEFORE UPDATE ON trips FOR EACH ROW
  EXECUTE FUNCTION validate_trip_status_transition();
