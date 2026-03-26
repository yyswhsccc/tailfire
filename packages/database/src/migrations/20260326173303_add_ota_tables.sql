-- OTA Consumer Portal Tables
-- advisor_profiles, deals, advisor_featured_deals, ota_referrals, ota_published_trips

-- ============================================================================
-- TABLE: advisor_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS "advisor_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user_profiles"("id") ON DELETE RESTRICT,
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id") ON DELETE RESTRICT,
  "slug" text UNIQUE NOT NULL,
  "tln_profile_url" text,
  "tln_agent_id" text,
  "tln_last_synced_at" timestamp with time zone,
  "display_name" text,
  "title" text,
  "bio" text,
  "photo_url" text,
  "specialties" text[],
  "certifications" text[],
  "languages" text[],
  "destinations" text[],
  "reviews" jsonb DEFAULT '[]'::jsonb,
  "bio_supplement" text,
  "social_links" jsonb DEFAULT '{}'::jsonb,
  "is_published" boolean DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================================
-- TABLE: deals
-- ============================================================================

CREATE TABLE IF NOT EXISTS "deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id") ON DELETE RESTRICT,
  "slug" text UNIQUE NOT NULL,
  "external_source" text,
  "external_id" text,
  "title" text NOT NULL,
  "description" text,
  "hero_image_url" text,
  "product_type" text NOT NULL,
  "pricing" jsonb DEFAULT '{}'::jsonb,
  "valid_from" date,
  "valid_until" date,
  "destinations" text[],
  "supplier_name" text,
  "is_published" boolean DEFAULT false,
  "seo_meta" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Partial unique index for external deal dedup (only when both are NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_external_deal"
  ON "deals" ("external_source", "external_id")
  WHERE "external_source" IS NOT NULL AND "external_id" IS NOT NULL;

-- ============================================================================
-- TABLE: advisor_featured_deals (join table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "advisor_featured_deals" (
  "advisor_profile_id" uuid NOT NULL REFERENCES "advisor_profiles"("id") ON DELETE CASCADE,
  "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("advisor_profile_id", "deal_id")
);

-- ============================================================================
-- TABLE: ota_referrals
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ota_referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" text NOT NULL,
  "advisor_slug" text NOT NULL,
  "landing_url" text,
  "referral_source" text,
  "cookie_expiry" timestamp with time zone,
  "converted_to_contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "agency_id" uuid REFERENCES "agencies"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================================
-- TABLE: ota_published_trips
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ota_published_trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id") ON DELETE RESTRICT,
  "template_id" uuid NOT NULL REFERENCES "itinerary_templates"("id") ON DELETE RESTRICT,
  "advisor_profile_id" uuid NOT NULL REFERENCES "advisor_profiles"("id") ON DELETE RESTRICT,
  "slug" text UNIQUE NOT NULL,
  "publish_type" text NOT NULL,
  "headline" text,
  "call_to_action" text DEFAULT 'Inquire About This Trip',
  "rendered_snapshot" jsonb NOT NULL,
  "hero_image_url" text,
  "is_published" boolean DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
