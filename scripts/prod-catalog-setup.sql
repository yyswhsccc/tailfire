-- ===========================================================================
-- PROD CATALOG SETUP
-- Run this SQL in Prod Supabase (cmktvanwglszgadjrorm) SQL Editor
-- ===========================================================================

-- Step 1: Create catalog schema
CREATE SCHEMA IF NOT EXISTS catalog;

-- Step 2: Grant permissions
GRANT USAGE ON SCHEMA catalog TO service_role, authenticated, anon;
GRANT ALL ON SCHEMA catalog TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT ALL ON TABLES TO service_role;

-- Step 3: Create FDW user
-- SECURITY: Retrieve password from Doppler before running:
--   doppler secrets get FDW_CATALOG_PASSWORD -p tailfire -c dev --plain
-- NOTE: The previously committed password has been rotated.
CREATE USER fdw_catalog_ro WITH PASSWORD '<RETRIEVE_FROM_DOPPLER: FDW_CATALOG_PASSWORD>';
GRANT USAGE ON SCHEMA catalog TO fdw_catalog_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT SELECT ON TABLES TO fdw_catalog_ro;

-- ===========================================================================
-- CRUISE TABLES
-- ===========================================================================

-- Cruise Lines
CREATE TABLE catalog.cruise_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  provider_identifier VARCHAR(100) NOT NULL,
  supplier_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_lines_provider_identifier_unique UNIQUE (provider, provider_identifier),
  CONSTRAINT cruise_lines_slug_unique UNIQUE (slug)
);

-- Cruise Ports
CREATE TABLE catalog.cruise_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  provider_identifier VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_ports_provider_identifier_unique UNIQUE (provider, provider_identifier),
  CONSTRAINT cruise_ports_slug_unique UNIQUE (slug)
);

-- Cruise Regions
CREATE TABLE catalog.cruise_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  provider_identifier VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_regions_provider_identifier_unique UNIQUE (provider, provider_identifier),
  CONSTRAINT cruise_regions_slug_unique UNIQUE (slug)
);

-- Cruise Ships
CREATE TABLE catalog.cruise_ships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  provider_identifier VARCHAR(100) NOT NULL,
  cruise_line_id UUID REFERENCES catalog.cruise_lines(id) ON DELETE SET NULL,
  ship_class VARCHAR(100),
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_ships_provider_identifier_unique UNIQUE (provider, provider_identifier),
  CONSTRAINT cruise_ships_slug_unique UNIQUE (slug)
);

-- Ship Cabin Types
CREATE TABLE catalog.cruise_ship_cabin_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id UUID NOT NULL REFERENCES catalog.cruise_ships(id) ON DELETE CASCADE,
  cabin_code VARCHAR(20) NOT NULL,
  cabin_category VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  deck_locations VARCHAR(255),
  default_occupancy INTEGER NOT NULL DEFAULT 2,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_ship_cabin_types_code_unique UNIQUE (ship_id, cabin_code)
);

-- Ship Decks
CREATE TABLE catalog.cruise_ship_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id UUID NOT NULL REFERENCES catalog.cruise_ships(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  deck_number INTEGER,
  deck_plan_url TEXT,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ship Images
CREATE TABLE catalog.cruise_ship_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_id UUID NOT NULL REFERENCES catalog.cruise_ships(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text VARCHAR(500),
  image_type VARCHAR(50) NOT NULL DEFAULT 'gallery',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_hero BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cabin Images
CREATE TABLE catalog.cruise_cabin_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabin_type_id UUID NOT NULL REFERENCES catalog.cruise_ship_cabin_types(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_url_hd TEXT,
  image_url_2k TEXT,
  caption VARCHAR(500),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT idx_cabin_images_unique UNIQUE (cabin_type_id, image_url)
);

-- Cruise Sailings
CREATE TABLE catalog.cruise_sailings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  provider_identifier VARCHAR(100) NOT NULL,
  ship_id UUID NOT NULL REFERENCES catalog.cruise_ships(id) ON DELETE RESTRICT,
  cruise_line_id UUID NOT NULL REFERENCES catalog.cruise_lines(id) ON DELETE RESTRICT,
  embark_port_id UUID REFERENCES catalog.cruise_ports(id) ON DELETE SET NULL,
  disembark_port_id UUID REFERENCES catalog.cruise_ports(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  sail_date DATE NOT NULL,
  end_date DATE NOT NULL,
  nights INTEGER NOT NULL,
  sea_days INTEGER,
  voyage_code VARCHAR(50),
  market_id INTEGER,
  no_fly BOOLEAN,
  depart_uk BOOLEAN,
  embark_port_name VARCHAR(255),
  disembark_port_name VARCHAR(255),
  cheapest_inside_cents INTEGER,
  cheapest_oceanview_cents INTEGER,
  cheapest_balcony_cents INTEGER,
  cheapest_suite_cents INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_sailings_provider_identifier_unique UNIQUE (provider, provider_identifier)
);

-- Sailing Cabin Prices
CREATE TABLE catalog.cruise_sailing_cabin_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sailing_id UUID NOT NULL REFERENCES catalog.cruise_sailings(id) ON DELETE CASCADE,
  cabin_code VARCHAR(20) NOT NULL,
  cabin_category VARCHAR(50) NOT NULL,
  occupancy INTEGER NOT NULL DEFAULT 2,
  base_price_cents INTEGER NOT NULL,
  taxes_cents INTEGER NOT NULL DEFAULT 0,
  original_currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
  original_amount_cents INTEGER NOT NULL,
  is_per_person INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_sailing_cabin_prices_unique UNIQUE (sailing_id, cabin_code, occupancy)
);

-- Sailing Stops
CREATE TABLE catalog.cruise_sailing_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sailing_id UUID NOT NULL REFERENCES catalog.cruise_sailings(id) ON DELETE CASCADE,
  port_id UUID REFERENCES catalog.cruise_ports(id) ON DELETE SET NULL,
  port_name VARCHAR(255) NOT NULL,
  is_sea_day BOOLEAN NOT NULL DEFAULT FALSE,
  day_number INTEGER NOT NULL,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  arrival_time TIME,
  departure_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_sailing_stops_unique UNIQUE (sailing_id, day_number, sequence_order)
);

-- Sailing Regions
CREATE TABLE catalog.cruise_sailing_regions (
  sailing_id UUID NOT NULL REFERENCES catalog.cruise_sailings(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES catalog.cruise_regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sailing_id, region_id)
);

-- Alternate Sailings
CREATE TABLE catalog.cruise_alternate_sailings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sailing_id UUID NOT NULL REFERENCES catalog.cruise_sailings(id) ON DELETE CASCADE,
  alternate_sailing_id UUID REFERENCES catalog.cruise_sailings(id) ON DELETE SET NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'traveltek',
  alternate_provider_identifier VARCHAR(100) NOT NULL,
  alternate_sail_date DATE,
  alternate_nights INTEGER,
  alternate_lead_price_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cruise_alternate_sailings_unique UNIQUE (sailing_id, alternate_provider_identifier)
);

-- Sync Raw
CREATE TABLE catalog.cruise_sync_raw (
  provider_sailing_id VARCHAR(100) PRIMARY KEY,
  raw_data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

-- Sync History
CREATE TABLE catalog.cruise_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  options JSONB,
  metrics JSONB,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FTP File Sync
CREATE TABLE catalog.cruise_ftp_file_sync (
  file_path VARCHAR(500) PRIMARY KEY,
  file_size INTEGER NOT NULL,
  ftp_modified_at TIMESTAMPTZ,
  content_hash VARCHAR(32),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'success',
  last_error TEXT
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================
CREATE INDEX idx_cruise_lines_name ON catalog.cruise_lines(name);
CREATE INDEX idx_cruise_lines_slug ON catalog.cruise_lines(slug);
CREATE INDEX idx_cruise_ships_name ON catalog.cruise_ships(name);
CREATE INDEX idx_cruise_ships_cruise_line_id ON catalog.cruise_ships(cruise_line_id);
CREATE INDEX idx_cruise_regions_slug ON catalog.cruise_regions(slug);
CREATE INDEX idx_cruise_ports_slug ON catalog.cruise_ports(slug);
CREATE INDEX idx_cabin_types_ship_id ON catalog.cruise_ship_cabin_types(ship_id);
CREATE INDEX idx_ship_decks_ship_id ON catalog.cruise_ship_decks(ship_id);
CREATE INDEX idx_ship_images_ship_id ON catalog.cruise_ship_images(ship_id);
CREATE INDEX idx_cabin_images_cabin_type ON catalog.cruise_cabin_images(cabin_type_id);
CREATE INDEX idx_sailings_sail_date ON catalog.cruise_sailings(sail_date) WHERE is_active = TRUE;
CREATE INDEX idx_sailings_ship_id ON catalog.cruise_sailings(ship_id);
CREATE INDEX idx_sailings_cruise_line_id ON catalog.cruise_sailings(cruise_line_id);
CREATE INDEX idx_sailing_prices_sailing ON catalog.cruise_sailing_cabin_prices(sailing_id);
CREATE INDEX idx_sailing_stops_sailing ON catalog.cruise_sailing_stops(sailing_id);
CREATE INDEX idx_sailing_regions_sailing ON catalog.cruise_sailing_regions(sailing_id);
CREATE INDEX idx_alternate_sailings_sailing ON catalog.cruise_alternate_sailings(sailing_id);
CREATE INDEX idx_sync_history_started ON catalog.cruise_sync_history(started_at DESC);
CREATE INDEX idx_ftp_file_sync_modified ON catalog.cruise_ftp_file_sync(ftp_modified_at);

-- Grant SELECT to FDW user on all tables
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO fdw_catalog_ro;
