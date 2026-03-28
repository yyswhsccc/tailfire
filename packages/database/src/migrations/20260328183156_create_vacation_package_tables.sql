-- Create vacation package catalog tables (catalog schema) and enrichment/bridging tables (public schema)
-- Catalog DDL is guarded to only run on Production where catalog tables are local (not FDW)

-- ============================================================================
-- CATALOG SCHEMA TABLES (guarded for FDW safety)
-- ============================================================================

DO $$
BEGIN
  -- Only run on environments where catalog tables are LOCAL (Production)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_lines'
      AND c.relkind = 'r'  -- 'r' = ordinary table, 'f' = foreign table
  ) THEN

    -- vacation_gateways: departure airports
    CREATE TABLE IF NOT EXISTS catalog.vacation_gateways (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(100) NOT NULL DEFAULT 'softvoyage',
      provider_identifier VARCHAR(10) NOT NULL,
      name VARCHAR(255) NOT NULL,
      airport_code VARCHAR(4) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      content_hash VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT vacation_gateways_provider_unique UNIQUE (provider, provider_identifier)
    );

    -- vacation_destinations: package destinations
    CREATE TABLE IF NOT EXISTS catalog.vacation_destinations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(100) NOT NULL DEFAULT 'softvoyage',
      provider_identifier VARCHAR(50) NOT NULL,
      name VARCHAR(500) NOT NULL,
      country_code VARCHAR(2),
      country_name VARCHAR(255),
      region_group VARCHAR(100),
      available_durations INTEGER[],
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      content_hash VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT vacation_destinations_provider_unique UNIQUE (provider, provider_identifier)
    );

    -- vacation_hotels: resort/hotel catalog
    CREATE TABLE IF NOT EXISTS catalog.vacation_hotels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(100) NOT NULL DEFAULT 'softvoyage',
      provider_identifier VARCHAR(50) NOT NULL,
      destination_id UUID REFERENCES catalog.vacation_destinations(id),
      name VARCHAR(500) NOT NULL,
      star_rating INTEGER,
      hotel_chain VARCHAR(255),
      image_url VARCHAR(1000),
      amenities JSONB,
      monarc_rating NUMERIC(3,2),
      monarc_review_count INTEGER,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      content_hash VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT vacation_hotels_provider_unique UNIQUE (provider, provider_identifier)
    );

    -- vacation_gateway_destinations: junction table
    CREATE TABLE IF NOT EXISTS catalog.vacation_gateway_destinations (
      gateway_id UUID NOT NULL REFERENCES catalog.vacation_gateways(id),
      destination_id UUID NOT NULL REFERENCES catalog.vacation_destinations(id),
      last_synced_at TIMESTAMPTZ,
      PRIMARY KEY (gateway_id, destination_id)
    );

    -- vacation_tour_operators: package tour operators (Sunwing, Air Transat, etc.)
    CREATE TABLE IF NOT EXISTS catalog.vacation_tour_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(100) NOT NULL DEFAULT 'softvoyage',
      provider_identifier VARCHAR(50) NOT NULL,
      code VARCHAR(10) NOT NULL,
      name VARCHAR(255),
      supplier_id UUID,
      is_active BOOLEAN DEFAULT true,
      CONSTRAINT vacation_tour_operators_provider_unique UNIQUE (provider, provider_identifier)
    );

    -- vacation_sync_history: sync audit trail
    CREATE TABLE IF NOT EXISTS catalog.vacation_sync_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(100) DEFAULT 'softvoyage',
      status VARCHAR(50) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      metrics JSONB,
      errors JSONB
    );

    RAISE NOTICE 'Created vacation catalog tables in catalog schema';
  ELSE
    RAISE NOTICE 'Skipping catalog DDL — foreign tables detected (Dev/Preview)';
  END IF;
END $$;

-- ============================================================================
-- PUBLIC SCHEMA TABLES (no guard needed — writable in all environments)
-- ============================================================================

-- vacation_hotel_enrichment: Google Places + TripAdvisor enrichment cache
CREATE TABLE IF NOT EXISTS vacation_hotel_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  google_place_id VARCHAR(255),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  formatted_address VARCHAR(1000),
  google_rating NUMERIC(2,1),
  google_review_count INTEGER,
  tripadvisor_rating NUMERIC(2,1),
  tripadvisor_review_count INTEGER,
  tripadvisor_link VARCHAR(1000),
  website VARCHAR(1000),
  phone VARCHAR(100),
  photos JSONB,
  raw_data JSONB,
  enriched_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vacation_hotel_enrichment_hotel_unique UNIQUE (hotel_id)
);

-- destination_vacation_destinations: bridges Tailfire destinations to Softvoyage vacation destinations
CREATE TABLE IF NOT EXISTS destination_vacation_destinations (
  destination_id UUID NOT NULL REFERENCES destinations(id),
  vacation_destination_id UUID NOT NULL,
  match_method VARCHAR(50) NOT NULL,
  confidence NUMERIC(5,4) DEFAULT 1.0,
  is_primary BOOLEAN DEFAULT true,
  PRIMARY KEY (destination_id, vacation_destination_id)
);
