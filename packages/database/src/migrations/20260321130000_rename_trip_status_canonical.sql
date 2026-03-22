-- Migration: Rename trip_status enum to canonical vocabulary
-- planning replaces draft+quoted, active replaces booked,
-- travelling replaces in_progress, travelled replaces completed
--
-- PostgreSQL cannot ALTER TYPE ... DROP VALUE, so we:
--   1. Remove the column default
--   2. Update all rows to new values
--   3. Cast column to varchar
--   4. Drop the old type
--   5. Create new type with canonical values
--   6. Cast column back to the new type
--   7. Set new default

-- ─── Step 1: Drop the column default ────────────────────────────────────────
ALTER TABLE trips ALTER COLUMN status DROP DEFAULT;

-- ─── Step 2: Update existing rows (safety net — should be no live data) ─────
UPDATE trips SET status = 'planning'
  WHERE status::text IN ('draft', 'quoted');

UPDATE trips SET status = 'active'
  WHERE status::text = 'booked';

UPDATE trips SET status = 'travelling'
  WHERE status::text = 'in_progress';

UPDATE trips SET status = 'travelled'
  WHERE status::text = 'completed';

-- status_before_cancel is already varchar(20) — just update values
UPDATE trips SET status_before_cancel = 'planning'
  WHERE status_before_cancel IN ('draft', 'quoted');

UPDATE trips SET status_before_cancel = 'active'
  WHERE status_before_cancel = 'booked';

UPDATE trips SET status_before_cancel = 'travelling'
  WHERE status_before_cancel = 'in_progress';

UPDATE trips SET status_before_cancel = 'travelled'
  WHERE status_before_cancel = 'completed';

-- ─── Step 3: Cast column to varchar ─────────────────────────────────────────
ALTER TABLE trips ALTER COLUMN status TYPE varchar(20) USING status::text;

-- ─── Step 4: Drop the old enum type ─────────────────────────────────────────
DROP TYPE IF EXISTS trip_status;

-- ─── Step 5: Create the new canonical enum ───────────────────────────────────
CREATE TYPE trip_status AS ENUM (
  'inbound',
  'planning',
  'active',
  'travelling',
  'travelled',
  'cancelled'
);

-- ─── Step 6: Cast column back to the new enum ────────────────────────────────
ALTER TABLE trips ALTER COLUMN status TYPE trip_status USING status::trip_status;

-- ─── Step 7: Set new default ─────────────────────────────────────────────────
ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'planning';

-- ─── Replace the status transition validator ─────────────────────────────────
CREATE OR REPLACE FUNCTION validate_trip_status_transition()
RETURNS TRIGGER AS $fn$
DECLARE
  valid_transitions text[][];
  from_status text;
  to_status text;
  is_valid boolean := FALSE;
  i integer;
BEGIN
  -- Skip validation on INSERT (OLD is null)
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Skip validation if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  valid_transitions := ARRAY[
    -- inbound can go to planning or cancelled
    ARRAY['inbound',   'planning'],
    ARRAY['inbound',   'cancelled'],
    -- planning can go to inbound or cancelled
    ARRAY['planning',  'inbound'],
    ARRAY['planning',  'cancelled'],
    -- active can go to planning, travelling, or cancelled
    ARRAY['active',    'planning'],
    ARRAY['active',    'travelling'],
    ARRAY['active',    'cancelled'],
    -- travelling can go to travelled or cancelled
    ARRAY['travelling', 'travelled'],
    ARRAY['travelling', 'cancelled'],
    -- travelled is terminal (no outbound transitions listed)
    -- cancelled can go to planning (admin un-cancel)
    ARRAY['cancelled', 'planning']
  ];

  from_status := OLD.status::text;
  to_status   := NEW.status::text;

  -- Check standard transitions
  FOR i IN 1..array_length(valid_transitions, 1) LOOP
    IF valid_transitions[i][1] = from_status AND valid_transitions[i][2] = to_status THEN
      is_valid := TRUE;
      EXIT;
    END IF;
  END LOOP;

  -- Allow cancelled -> planning for admin un-cancel when status_before_cancel is set
  IF NOT is_valid AND from_status = 'cancelled' AND to_status = 'planning'
     AND NEW.status_before_cancel IS NOT NULL THEN
    is_valid := TRUE;
  END IF;

  IF NOT is_valid THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', from_status, to_status;
  END IF;

  -- Owner must be assigned when leaving inbound
  IF OLD.status::text = 'inbound' AND NEW.status::text != 'inbound' AND NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'An owner must be assigned when transitioning from inbound status';
  END IF;

  -- Owner can only be null for inbound trips
  IF NEW.owner_id IS NULL AND NEW.status::text != 'inbound' THEN
    RAISE EXCEPTION 'Owner can only be cleared for inbound trips';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;
