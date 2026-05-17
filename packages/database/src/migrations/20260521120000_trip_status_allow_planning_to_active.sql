-- #441 follow-up: the validate_trip_status_transition trigger rejected
-- `planning -> active`, which is the canonical promotion TripLifecycleService
-- runs every time the first activity on a planning trip is marked as
-- booked. Symptom: 500 with "Invalid status transition from planning to
-- active" returned from POST /bookings/activities/:id/mark even though
-- the activity was already booked, leaving trip status stuck in planning.
--
-- This adds the missing rule alongside the existing transitions. All other
-- behaviour (owner constraint on inbound exit, status_before_cancel
-- handling, etc.) is preserved verbatim.

CREATE OR REPLACE FUNCTION public.validate_trip_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  valid_transitions text[][];
  from_status text;
  to_status text;
  is_valid boolean := FALSE;
  i integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL AND NEW.status::text != 'inbound' THEN
      RAISE EXCEPTION 'Owner can only be cleared for inbound trips';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  valid_transitions := ARRAY[
    ARRAY['inbound','planning'], ARRAY['inbound','cancelled'],
    ARRAY['planning','inbound'], ARRAY['planning','cancelled'],
    ARRAY['planning','active'],        -- #441: first booking promotes to active
    ARRAY['active','planning'], ARRAY['active','travelling'], ARRAY['active','cancelled'],
    ARRAY['travelling','travelled'], ARRAY['travelling','cancelled'],
    ARRAY['cancelled','planning']
  ];
  from_status := OLD.status::text;
  to_status := NEW.status::text;
  FOR i IN 1..array_length(valid_transitions, 1) LOOP
    IF valid_transitions[i][1] = from_status AND valid_transitions[i][2] = to_status THEN
      is_valid := TRUE; EXIT;
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
$function$;
