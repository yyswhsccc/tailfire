-- Create ota_trip_requests table for OTA consumer portal trip pipeline
CREATE TABLE IF NOT EXISTS "ota_trip_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Consumer identity
  "contact_email" text NOT NULL,
  "contact_name" text,
  "contact_phone" text,

  -- Attribution
  "advisor_slug" text,
  "referral_session_id" text,
  "source" text DEFAULT 'ota',
  "trip_group_id" uuid,

  -- Trip overview
  "title" text,
  "start_date" date,
  "end_date" date,
  "travelers" integer DEFAULT 1,
  "special_requests" text,

  -- Components JSONB
  "components" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "schema_version" integer NOT NULL DEFAULT 1,

  -- Status: draft | submitted | promoted | failed | expired
  "status" text NOT NULL DEFAULT 'draft',

  -- Resolution (populated on submit)
  "resolved_owner_id" uuid,
  "resolved_agency_id" uuid,
  "attribution" text,

  -- Promotion tracking
  "promoted_trip_id" uuid,
  "promoted_at" timestamptz,
  "promoted_by" text,
  "promotion_error" text,
  "promotion_attempts" integer DEFAULT 0,
  "last_promotion_at" timestamptz,

  -- Timestamps
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz,
  "expires_at" timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_ota_trip_requests_email" ON "ota_trip_requests" ("contact_email");
CREATE INDEX IF NOT EXISTS "idx_ota_trip_requests_status" ON "ota_trip_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_ota_trip_requests_advisor" ON "ota_trip_requests" ("advisor_slug");
