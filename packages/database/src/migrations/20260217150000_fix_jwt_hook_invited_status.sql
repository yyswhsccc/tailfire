-- Fix JWT Hook Activation Deadlock
-- The original hook only issued claims for client_portal_users with status='active'.
-- This caused a deadlock: invited users couldn't get tokens → couldn't call activate → stayed invited forever.
-- Fix: Allow both 'invited' and 'active' statuses to receive client_portal claims.
-- Security is maintained because:
--   1. ClientPortalAuthGuard checks status='active' — invited users can't access protected endpoints
--   2. JwtAuthGuard rejects client_portal tokens — prevents client tokens from reaching staff endpoints
--   3. The activate endpoint uses @Public() + manual getUser() — works for any valid token

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
  user_contact_id uuid;
  user_status text;
BEGIN
  -- 1. Check user_profiles first (staff users)
  SELECT agency_id, role::text INTO user_agency_id, user_role
  FROM public.user_profiles
  WHERE id = (event->>'user_id')::uuid;

  IF user_agency_id IS NOT NULL AND user_role IS NOT NULL THEN
    -- Staff user found - set claims as before
    claims := event->'claims';
    claims := jsonb_set(claims, '{agency_id}', to_jsonb(user_agency_id));
    claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
    claims := jsonb_set(claims, '{user_id}', event->'user_id');

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
  END IF;

  -- 2. Check client_portal_users (client portal users)
  -- Allow both 'invited' and 'active' statuses so the activation flow works.
  SELECT agency_id, contact_id, status::text
  INTO user_agency_id, user_contact_id, user_status
  FROM public.client_portal_users
  WHERE supabase_user_id = (event->>'user_id')::uuid;

  IF user_agency_id IS NOT NULL AND user_status IN ('invited', 'active') THEN
    -- Client portal user found - set client claims
    claims := event->'claims';
    claims := jsonb_set(claims, '{agency_id}', to_jsonb(user_agency_id));
    claims := jsonb_set(claims, '{role}', '"client_portal"');
    claims := jsonb_set(claims, '{contact_id}', to_jsonb(user_contact_id));
    claims := jsonb_set(claims, '{user_id}', event->'user_id');

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
  END IF;

  -- 3. Neither table has a valid row - hard fail (maintain security posture)
  RAISE EXCEPTION 'No valid user profile found for user %. Neither user_profiles nor active client_portal_users row exists.', (event->>'user_id');
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
