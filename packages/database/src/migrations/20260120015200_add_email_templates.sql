-- ==============================================================================
-- Migration: Add Email Templates Table
-- ==============================================================================
-- Creates the email_templates table for reusable email content.
-- RLS enabled but NO policies (API-only access via service_role).
-- ==============================================================================

-- Create email_category enum
DO $$ BEGIN
  CREATE TYPE "public"."email_category" AS ENUM (
    'trip_order',
    'notification',
    'marketing',
    'system',
    'payment',
    'client_care'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create email_templates table
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid,
  "slug" varchar(100) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text,
  "variables" jsonb,
  "category" "email_category" DEFAULT 'notification',
  "is_system" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_email_templates_slug" ON "email_templates" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "idx_email_templates_category" ON "email_templates" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_email_templates_agency_id" ON "email_templates" USING btree ("agency_id");

-- Enable RLS but no policies (API-only access via service_role)
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;

-- Grant permissions to service_role (API access)
GRANT ALL ON "email_templates" TO service_role;
