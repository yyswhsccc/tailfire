-- Fix schema drift: add all missing user_profiles columns
-- Safe for fresh databases where table may not exist yet (prod_baseline creates it)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    RAISE NOTICE 'user_profiles does not exist yet, skipping (prod_baseline will create it)';
    RETURN;
  END IF;

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS public_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS office_address JSONB;

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS social_media_links JSONB DEFAULT '{}'::jsonb;

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50);

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS email_signature_config JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS platform_preferences JSONB DEFAULT '{}'::jsonb;

  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN NOT NULL DEFAULT false;
END $$;
