-- OTA Tables Fixes
-- Issue 4: Add advisor_profile_id FK to ota_referrals + session_id index
-- Issue 5: Add unique constraint on advisor_profiles.user_id

-- ============================================================================
-- Issue 4a: Add advisor_profile_id column to ota_referrals
-- ============================================================================

ALTER TABLE "ota_referrals"
  ADD COLUMN IF NOT EXISTS "advisor_profile_id" uuid
    REFERENCES "advisor_profiles"("id") ON DELETE SET NULL;

-- ============================================================================
-- Issue 4b: Index on session_id for lookup performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS "ota_referrals_session_id_idx"
  ON "ota_referrals" ("session_id");

-- ============================================================================
-- Issue 5: Unique constraint on advisor_profiles.user_id (one profile per user)
-- ============================================================================

ALTER TABLE "advisor_profiles"
  ADD CONSTRAINT "advisor_profiles_user_id_unique" UNIQUE ("user_id");
