-- ==============================================================================
-- Migration: Sync All Environments
-- ==============================================================================
-- This idempotent migration brings Dev, Preview, and Prod into alignment.
-- Creates missing tables: email_logs, email_templates, api_provider_configs, trip_orders
-- All statements use IF NOT EXISTS/ON CONFLICT to be safely re-runnable.
-- ==============================================================================

-- ============================================================================
-- PART 1: ENUM TYPES
-- ============================================================================

-- email_status enum
DO $$ BEGIN
  CREATE TYPE "public"."email_status" AS ENUM (
    'pending',
    'sent',
    'failed',
    'filtered'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- email_category enum
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

-- trip_order_status enum
DO $$ BEGIN
  CREATE TYPE "public"."trip_order_status" AS ENUM (
    'draft',
    'finalized',
    'sent'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PART 2: EMAIL_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "email_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "to_email" text[] NOT NULL,
  "cc_email" text[],
  "bcc_email" text[],
  "from_email" varchar(255) NOT NULL,
  "reply_to" varchar(255),
  "subject" text NOT NULL,
  "body_html" text,
  "body_text" text,
  "template_slug" varchar(100),
  "variables" jsonb,
  "status" "email_status" DEFAULT 'pending' NOT NULL,
  "provider" varchar(50) DEFAULT 'resend',
  "provider_message_id" varchar(255),
  "error_message" text,
  "trip_id" uuid,
  "contact_id" uuid,
  "activity_id" uuid,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

-- email_logs foreign keys
DO $$ BEGIN
  ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_trip_id_trips_id_fk"
    FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_contact_id_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_activity_id_activities_id_fk"
    FOREIGN KEY ("activity_id") REFERENCES "public"."itinerary_activities"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- email_logs indexes
CREATE INDEX IF NOT EXISTS "idx_email_logs_agency_id" ON "email_logs" USING btree ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_email_logs_trip_id" ON "email_logs" USING btree ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_email_logs_contact_id" ON "email_logs" USING btree ("contact_id");
CREATE INDEX IF NOT EXISTS "idx_email_logs_status" ON "email_logs" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_email_logs_created_at" ON "email_logs" USING btree ("created_at");

-- email_logs RLS
ALTER TABLE "email_logs" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "email_logs" TO service_role;

-- ============================================================================
-- PART 3: EMAIL_TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid,
  "slug" varchar(100) NOT NULL,
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

-- email_templates unique constraint (use duplicate_table for constraint/index errors)
DO $$ BEGIN
  ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_slug_key" UNIQUE ("slug");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;

-- email_templates indexes
CREATE INDEX IF NOT EXISTS "idx_email_templates_slug" ON "email_templates" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "idx_email_templates_category" ON "email_templates" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_email_templates_agency_id" ON "email_templates" USING btree ("agency_id");

-- email_templates RLS
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "email_templates" TO service_role;

-- ============================================================================
-- PART 4: API_PROVIDER_CONFIGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "api_provider_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_name" text NOT NULL,
  "booking_type" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "encrypted_credentials" jsonb,
  "is_active" boolean DEFAULT true,
  "is_global" boolean DEFAULT false,
  "priority" integer DEFAULT 10,
  "rapidapi_host" text,
  "rapidapi_key" text,
  "user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- api_provider_configs foreign key
DO $$ BEGIN
  ALTER TABLE "api_provider_configs" ADD CONSTRAINT "api_provider_configs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- api_provider_configs indexes
CREATE INDEX IF NOT EXISTS "idx_api_provider_configs_provider" ON "api_provider_configs" USING btree ("provider_name");
CREATE INDEX IF NOT EXISTS "idx_api_provider_configs_booking_type" ON "api_provider_configs" USING btree ("booking_type");
CREATE INDEX IF NOT EXISTS "idx_api_provider_configs_active" ON "api_provider_configs" USING btree ("is_active") WHERE (is_active = true);

-- api_provider_configs unique constraint
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_provider_configs_unique"
    ON "api_provider_configs" USING btree ("provider_name", COALESCE("booking_type", ''::text));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- api_provider_configs RLS
ALTER TABLE "api_provider_configs" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "api_provider_configs" TO service_role;

-- ============================================================================
-- PART 5: TRIP_ORDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "trip_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL,
  "agency_id" uuid NOT NULL,
  "version_number" integer NOT NULL DEFAULT 1,
  "order_data" jsonb NOT NULL,
  "payment_summary" jsonb,
  "booking_details" jsonb,
  "business_config" jsonb,
  "status" "trip_order_status" NOT NULL DEFAULT 'draft',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finalized_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_by" uuid,
  "finalized_by" uuid,
  "sent_by" uuid,
  "email_log_id" uuid
);

-- trip_orders unique constraint (use duplicate_table for constraint/index errors)
DO $$ BEGIN
  ALTER TABLE "trip_orders" ADD CONSTRAINT "unique_trip_version" UNIQUE ("trip_id", "version_number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;

-- trip_orders foreign keys
DO $$ BEGIN
  ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_trip_id_trips_id_fk"
    FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_email_log_id_email_logs_id_fk"
    FOREIGN KEY ("email_log_id") REFERENCES "public"."email_logs"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- trip_orders indexes
CREATE INDEX IF NOT EXISTS "idx_trip_orders_trip_id" ON "trip_orders" USING btree ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_trip_orders_agency_id" ON "trip_orders" USING btree ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_trip_orders_status" ON "trip_orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_trip_orders_created_at" ON "trip_orders" USING btree ("created_at");

-- trip_orders RLS
ALTER TABLE "trip_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_orders" FORCE ROW LEVEL SECURITY;
GRANT ALL ON "trip_orders" TO service_role;

-- trip_orders permissive policy (API handles authorization)
DO $$ BEGIN
  CREATE POLICY "trip_orders_all" ON "trip_orders"
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PART 6: SYSTEM_DEPLOYMENTS TABLE (if missing on Dev)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "system_deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "environment" varchar(50) NOT NULL,
  "deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "commit_sha" varchar(40),
  "branch" varchar(100),
  "deployed_by" varchar(255),
  "notes" text
);

-- system_deployments RLS
ALTER TABLE "system_deployments" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "system_deployments" TO service_role;

-- ============================================================================
-- PART 7: SEED EMAIL TEMPLATES
-- ============================================================================

-- Trip Order PDF Template (used by Generate Invoice feature)
INSERT INTO "email_templates" (
  "slug", "name", "description", "subject", "body_html", "body_text", "variables", "category", "is_system", "is_active"
) VALUES (
  'trip-order-pdf',
  'Trip Order PDF',
  'Sent when a trip order/invoice PDF is generated and sent to client',
  'Your Trip Order - {{trip.name}} (Ref: {{trip.reference}})',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Trip Order</h1>
  </div>
  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>
    <p>Please find attached your trip order for <strong>{{trip.name}}</strong>.</p>
    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <p><strong>Reference:</strong> {{trip.reference}}</p>
      <p><strong>Dates:</strong> {{trip.start_date}} - {{trip.end_date}}</p>
      <p><strong>Total:</strong> {{trip.total}}</p>
    </div>
    <p>If you have any questions, please don''t hesitate to contact us.</p>
    <p>Best regards,<br>{{business.name::Phoenix Voyages}}</p>
  </div>
  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>{{business.name}} | {{business.phone}} | {{business.email}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Please find attached your trip order for {{trip.name}}.

Reference: {{trip.reference}}
Dates: {{trip.start_date}} - {{trip.end_date}}
Total: {{trip.total}}

If you have any questions, please don''t hesitate to contact us.

Best regards,
{{business.name::Phoenix Voyages}}

---
{{business.name}} | {{business.phone}} | {{business.email}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name/title"},
    {"key": "trip.reference", "description": "Trip reference number"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "trip.total", "description": "Trip total cost"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"},
    {"key": "business.phone", "description": "Agency phone"},
    {"key": "business.email", "description": "Agency email"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;

-- Trip Confirmation Template
INSERT INTO "email_templates" (
  "slug", "name", "description", "subject", "body_html", "body_text", "variables", "category", "is_system", "is_active"
) VALUES (
  'trip-confirmation',
  'Trip Confirmation',
  'Sent when a trip is booked/confirmed',
  'Your Trip Confirmation - {{trip.name}}',
  '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1a365d; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">Trip Confirmed!</h1>
  </div>
  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{contact.first_name::Valued Customer}},</p>
    <p>Your trip has been confirmed!</p>
    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #1a365d; margin-top: 0;">{{trip.name}}</h2>
      <p><strong>Reference:</strong> {{trip.reference}}</p>
      <p><strong>Dates:</strong> {{trip.start_date}} - {{trip.end_date}}</p>
    </div>
    <p>Best regards,<br>{{business.name::Phoenix Voyages}}</p>
  </div>
</body>
</html>',
  'Dear {{contact.first_name::Valued Customer}},

Your trip has been confirmed!

Trip: {{trip.name}}
Reference: {{trip.reference}}
Dates: {{trip.start_date}} - {{trip.end_date}}

Best regards,
{{business.name::Phoenix Voyages}}',
  '[
    {"key": "contact.first_name", "description": "Contact first name", "defaultValue": "Valued Customer"},
    {"key": "trip.name", "description": "Trip name/title"},
    {"key": "trip.reference", "description": "Trip reference number"},
    {"key": "trip.start_date", "description": "Trip start date"},
    {"key": "trip.end_date", "description": "Trip end date"},
    {"key": "business.name", "description": "Agency name", "defaultValue": "Phoenix Voyages"}
  ]'::jsonb,
  'trip_order',
  true,
  true
) ON CONFLICT (slug) DO NOTHING;
