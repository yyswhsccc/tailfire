-- Add avatar_url and pricing_visibility columns
-- Safe for fresh databases where tables may not exist yet (prod_baseline creates them)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'pricing_visibility'
  ) THEN
    CREATE TYPE pricing_visibility AS ENUM ('show_all', 'hide_all', 'travelers_only');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trips') THEN
    ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pricing_visibility pricing_visibility DEFAULT 'show_all';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
  END IF;
END $$;
