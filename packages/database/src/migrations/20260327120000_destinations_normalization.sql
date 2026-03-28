-- Destinations Normalization
-- Unifies cruise ports, tour cities, and enrichment data into a single
-- addressable entity with aliases, port mappings, and region mappings.

-- ============================================================================
-- TABLE: destinations
-- ============================================================================

CREATE TABLE IF NOT EXISTS "destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "destination_type" text NOT NULL CHECK (
    "destination_type" IN ('city','port_city','island','region','country','resort_area')
  ),
  "country_code" varchar(2),
  "admin_area" text,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "parent_destination_id" uuid REFERENCES "destinations"("id"),
  "source_status" text NOT NULL DEFAULT 'seeded' CHECK (
    "source_status" IN ('seeded','matched','reviewed','hidden')
  ),
  "content_status" text NOT NULL DEFAULT 'seeded' CHECK (
    "content_status" IN ('seeded','enriched','reviewed','published')
  ),
  "summary" text,
  "hero_image_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "destinations_normalized_name_idx" ON "destinations"("normalized_name", "country_code");
CREATE INDEX IF NOT EXISTS "destinations_type_idx" ON "destinations"("destination_type");
CREATE INDEX IF NOT EXISTS "destinations_slug_idx" ON "destinations"("slug");

-- ============================================================================
-- TABLE: destination_aliases
-- ============================================================================

CREATE TABLE IF NOT EXISTS "destination_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "destination_id" uuid NOT NULL REFERENCES "destinations"("id") ON DELETE CASCADE,
  "alias" text NOT NULL,
  "normalized_alias" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'en',
  "source" text NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "destination_aliases_destination_idx" ON "destination_aliases"("destination_id");
CREATE INDEX IF NOT EXISTS "destination_aliases_normalized_idx" ON "destination_aliases"("normalized_alias");

-- ============================================================================
-- TABLE: destination_ports
-- ============================================================================

CREATE TABLE IF NOT EXISTS "destination_ports" (
  "destination_id" uuid NOT NULL REFERENCES "destinations"("id") ON DELETE CASCADE,
  "port_id" uuid NOT NULL,
  "match_method" text NOT NULL CHECK (
    "match_method" IN ('seed','exact','geo','manual')
  ),
  "confidence" numeric(5,4) NOT NULL DEFAULT 1.0,
  "is_primary" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("destination_id", "port_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "destination_ports_port_unique" ON "destination_ports"("port_id");

-- ============================================================================
-- TABLE: destination_regions
-- ============================================================================

CREATE TABLE IF NOT EXISTS "destination_regions" (
  "destination_id" uuid NOT NULL REFERENCES "destinations"("id") ON DELETE CASCADE,
  "cruise_region_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("destination_id", "cruise_region_id")
);
