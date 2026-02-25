-- Update JWT custom claims hook to support portal users
-- Portal users have app_metadata.portal_user = true and no user_profiles row.
-- Without this fix, the hook throws an exception for portal users.
-- Uses coalesce() around to_jsonb() to prevent SQL NULL from poisoning jsonb_set.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_agency_id uuid;
  user_role text;
  user_status text;
  is_portal_user boolean;
  portal_contact_id uuid;
  portal_agency_id uuid;
BEGIN
  -- Check if this is a portal user (from app_metadata set at user creation)
  is_portal_user := coalesce((event->'claims'->'app_metadata'->>'portal_user')::boolean, false);

  IF is_portal_user THEN
    -- Portal users: get contact_id and agency_id from app_metadata
    portal_contact_id := (event->'claims'->'app_metadata'->>'contact_id')::uuid;
    portal_agency_id := (event->'claims'->'app_metadata'->>'agency_id')::uuid;

    claims := event->'claims';
    claims := jsonb_set(claims, '{portal_user}', 'true'::jsonb);
    -- Use coalesce to avoid SQL NULL poisoning jsonb_set (to_jsonb(NULL) = SQL NULL, not JSON null)
    claims := jsonb_set(claims, '{contact_id}', coalesce(to_jsonb(portal_contact_id), 'null'::jsonb));
    claims := jsonb_set(claims, '{agency_id}', coalesce(to_jsonb(portal_agency_id), 'null'::jsonb));
    claims := jsonb_set(claims, '{user_id}', coalesce(event->'user_id', 'null'::jsonb));

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
  END IF;

  -- Admin users: existing logic (unchanged)
  SELECT agency_id, role::text, status::text
  INTO user_agency_id, user_role, user_status
  FROM public.user_profiles
  WHERE id = (event->>'user_id')::uuid;

  IF user_agency_id IS NULL OR user_role IS NULL THEN
    RAISE EXCEPTION 'User profile incomplete: missing agency_id or role for user %', (event->>'user_id');
  END IF;

  IF user_status = 'locked' THEN
    RAISE EXCEPTION 'User account is locked for user %', (event->>'user_id');
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{agency_id}', to_jsonb(user_agency_id));
  claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
  claims := jsonb_set(claims, '{user_id}', coalesce(event->'user_id', 'null'::jsonb));
  claims := jsonb_set(claims, '{user_status}', to_jsonb(user_status));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT USAGE ON TYPE public.user_status TO supabase_auth_admin;
