-- Fix schema drift: add columns missing from trips and user_profiles
-- Safe for fresh databases where tables may not exist yet (prod_baseline creates them)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'itinerary_style') THEN
    CREATE TYPE itinerary_style AS ENUM ('side_by_side', 'stacked', 'compact');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trips') THEN
    ALTER TABLE public.trips
      ADD COLUMN IF NOT EXISTS allow_pdf_downloads BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS itinerary_style itinerary_style DEFAULT 'side_by_side';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;
  END IF;
END $$;
