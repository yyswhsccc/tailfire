-- Fix schema drift: add licensing_info and commission_settings to user_profiles
-- Safe for fresh databases where table may not exist yet (prod_baseline creates it)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    RAISE NOTICE 'user_profiles does not exist yet, skipping (prod_baseline will create it)';
    RETURN;
  END IF;

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS licensing_info JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS commission_settings JSONB DEFAULT '{}';
END $$;
