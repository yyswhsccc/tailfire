-- Fix: Ensure trip status trigger allows INSERT (guard was lost on preview)
-- The previous migration used $$ delimiters which Drizzle's breakpoint splitting
-- may have corrupted, causing CREATE OR REPLACE FUNCTION to silently fail.

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
    ARRAY['inbound', 'draft'],
    ARRAY['inbound', 'quoted'],
    ARRAY['inbound', 'booked'],
    ARRAY['inbound', 'cancelled'],
    ARRAY['draft', 'quoted'],
    ARRAY['draft', 'booked'],
    ARRAY['draft', 'cancelled'],
    ARRAY['draft', 'inbound'],
    ARRAY['quoted', 'draft'],
    ARRAY['quoted', 'booked'],
    ARRAY['quoted', 'cancelled'],
    ARRAY['booked', 'in_progress'],
    ARRAY['booked', 'completed'],
    ARRAY['booked', 'cancelled'],
    ARRAY['in_progress', 'completed'],
    ARRAY['in_progress', 'cancelled']
  ];

  from_status := OLD.status::text;
  to_status := NEW.status::text;

  -- Check standard transitions
  FOR i IN 1..array_length(valid_transitions, 1) LOOP
    IF valid_transitions[i][1] = from_status AND valid_transitions[i][2] = to_status THEN
      is_valid := TRUE;
      EXIT;
    END IF;
  END LOOP;

  -- Allow cancelled -> previous status for admin un-cancel
  IF NOT is_valid AND from_status = 'cancelled' AND NEW.status_before_cancel IS NULL THEN
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
