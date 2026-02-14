-- Phase 11: RLS API-First Lockdown
-- Safe for fresh databases where tables may not exist yet (prod_baseline creates them)

DO $$
BEGIN
  -- Enable RLS on agencies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agencies') THEN
    ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.agencies FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS agencies_authenticated_select ON public.agencies;
    CREATE POLICY agencies_authenticated_select
      ON public.agencies FOR SELECT TO authenticated USING (true);
  END IF;

  -- Enable RLS on user_profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS user_profiles_self_select ON public.user_profiles;
    CREATE POLICY user_profiles_self_select
      ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());
  END IF;

  -- Enable RLS on contacts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contacts') THEN
    ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;
  END IF;

  -- Enable RLS on trips
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trips') THEN
    ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.trips FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
