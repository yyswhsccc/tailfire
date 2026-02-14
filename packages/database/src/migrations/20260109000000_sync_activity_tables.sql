-- Migration: Sync activity_* tables (drop obsolete component_*, create missing tables)
-- Safe for fresh databases where tables may not exist yet (prod_baseline creates them)

-- ============================================================================
-- PRE-CHECK: Skip if key dependency tables don't exist yet
-- (prod_baseline will create everything from scratch)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'itinerary_activities') THEN
    RAISE NOTICE 'itinerary_activities does not exist yet, skipping sync (prod_baseline will create all tables)';
    RETURN;
  END IF;

  -- Validate required enums exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'component_entity_type') THEN
    RAISE EXCEPTION 'Required enum component_entity_type does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
    RAISE EXCEPTION 'Required enum media_type does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_type') THEN
    RAISE EXCEPTION 'Required enum pricing_type does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type') THEN
    RAISE EXCEPTION 'Required enum invoice_type does not exist';
  END IF;
END $$;

-- Only run the rest if itinerary_activities exists (guard above returned early if not)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'itinerary_activities') THEN
    RETURN;
  END IF;

  -- Drop obsolete component_* tables
  DROP TABLE IF EXISTS component_documents CASCADE;
  DROP TABLE IF EXISTS component_media CASCADE;
  DROP TABLE IF EXISTS component_pricing CASCADE;
  DROP TABLE IF EXISTS component_suppliers CASCADE;
END $$;

-- Create missing enums (with guards)
DO $$ BEGIN
  CREATE TYPE payment_transaction_type AS ENUM ('payment', 'refund', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'check', 'credit_card', 'bank_transfer', 'stripe', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE insurance_policy_type AS ENUM ('trip_cancellation', 'medical', 'comprehensive', 'evacuation', 'baggage', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE traveler_insurance_status AS ENUM ('pending', 'has_own_insurance', 'declined', 'selected_package');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_payment_status AS ENUM ('unpaid', 'deposit_paid', 'paid', 'refunded', 'partially_refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_pricing_type AS ENUM ('flat_rate', 'per_person');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Create tables (only if dependency tables exist)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'itinerary_activities') THEN
    RETURN;
  END IF;

  -- 1. activity_amenities
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amenities') THEN
    CREATE TABLE IF NOT EXISTS activity_amenities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
      amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT activity_amenities_unique UNIQUE (activity_id, amenity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_amenities_activity ON activity_amenities(activity_id);
    ALTER TABLE activity_amenities ENABLE ROW LEVEL SECURITY;
    ALTER TABLE activity_amenities FORCE ROW LEVEL SECURITY;
  END IF;

  -- 2. activity_documents
  CREATE TABLE IF NOT EXISTS activity_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
    document_type VARCHAR(100),
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by UUID,
    CONSTRAINT activity_documents_type_check CHECK (
      document_type IS NULL OR document_type IN (
        'confirmation', 'voucher', 'invoice', 'itinerary', 'receipt',
        'contract', 'ticket', 'passport', 'visa', 'cabin_image', 'media_image', 'other'
      )
    )
  );
  CREATE INDEX IF NOT EXISTS idx_activity_documents_activity_id ON activity_documents(activity_id);
  CREATE INDEX IF NOT EXISTS idx_activity_documents_document_type ON activity_documents(document_type);
  ALTER TABLE activity_documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE activity_documents FORCE ROW LEVEL SECURITY;

  -- 3. activity_media
  CREATE TABLE IF NOT EXISTS activity_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    entity_type component_entity_type NOT NULL DEFAULT 'activity',
    media_type media_type NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    caption TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    attribution JSONB,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by UUID
  );
  CREATE INDEX IF NOT EXISTS idx_activity_media_activity ON activity_media(activity_id);
  ALTER TABLE activity_media ENABLE ROW LEVEL SECURITY;
  ALTER TABLE activity_media FORCE ROW LEVEL SECURITY;

  -- 4. activity_pricing
  CREATE TABLE IF NOT EXISTS activity_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL UNIQUE REFERENCES itinerary_activities(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL,
    pricing_type pricing_type NOT NULL,
    base_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
    invoice_type invoice_type NOT NULL DEFAULT 'individual_item',
    total_price_cents INTEGER,
    taxes_and_fees_cents INTEGER DEFAULT 0,
    commission_total_cents INTEGER,
    commission_split_percentage DECIMAL(5,2),
    commission_expected_date DATE,
    confirmation_number VARCHAR(255),
    booking_reference VARCHAR(255),
    booking_status VARCHAR(100),
    terms_and_conditions TEXT,
    cancellation_policy TEXT,
    supplier VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_activity_pricing_activity ON activity_pricing(activity_id);
  ALTER TABLE activity_pricing ENABLE ROW LEVEL SECURITY;
  ALTER TABLE activity_pricing FORCE ROW LEVEL SECURITY;

  -- 5. activity_suppliers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
    CREATE TABLE IF NOT EXISTS activity_suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      primary_supplier BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_activity_suppliers_activity ON activity_suppliers(activity_id);
    ALTER TABLE activity_suppliers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE activity_suppliers FORCE ROW LEVEL SECURITY;
  END IF;

  -- 6. activity_travelers
  CREATE TABLE IF NOT EXISTS activity_travelers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
    trip_traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT activity_travelers_unique UNIQUE (activity_id, trip_traveler_id)
  );
  CREATE INDEX IF NOT EXISTS idx_activity_travelers_activity ON activity_travelers(activity_id);
  ALTER TABLE activity_travelers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE activity_travelers FORCE ROW LEVEL SECURITY;

  -- 7. flight_segments
  CREATE TABLE IF NOT EXISTS flight_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES itinerary_activities(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL DEFAULT 0,
    airline VARCHAR(255),
    flight_number VARCHAR(100),
    departure_airport_code VARCHAR(10),
    departure_airport_name VARCHAR(255),
    departure_airport_city VARCHAR(100),
    departure_airport_lat DOUBLE PRECISION,
    departure_airport_lon DOUBLE PRECISION,
    departure_date DATE,
    departure_time TIME,
    departure_timezone VARCHAR(64),
    departure_terminal VARCHAR(50),
    departure_gate VARCHAR(50),
    arrival_airport_code VARCHAR(10),
    arrival_airport_name VARCHAR(255),
    arrival_airport_city VARCHAR(100),
    arrival_airport_lat DOUBLE PRECISION,
    arrival_airport_lon DOUBLE PRECISION,
    arrival_date DATE,
    arrival_time TIME,
    arrival_timezone VARCHAR(64),
    arrival_terminal VARCHAR(50),
    arrival_gate VARCHAR(50),
    aircraft_model VARCHAR(255),
    aircraft_registration VARCHAR(50),
    aircraft_mode_s VARCHAR(10),
    aircraft_image_url TEXT,
    aircraft_image_author VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT flight_segments_activity_order_unique UNIQUE (activity_id, segment_order)
  );
  ALTER TABLE flight_segments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE flight_segments FORCE ROW LEVEL SECURITY;

  -- 8. itinerary_templates
  CREATE TABLE IF NOT EXISTS itinerary_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    payload JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_itinerary_templates_agency ON itinerary_templates(agency_id);
  CREATE INDEX IF NOT EXISTS idx_itinerary_templates_agency_active ON itinerary_templates(agency_id, is_active);
  ALTER TABLE itinerary_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE itinerary_templates FORCE ROW LEVEL SECURITY;

  -- 9. package_templates
  CREATE TABLE IF NOT EXISTS package_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    payload JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_package_templates_agency ON package_templates(agency_id);
  CREATE INDEX IF NOT EXISTS idx_package_templates_agency_active ON package_templates(agency_id, is_active);
  ALTER TABLE package_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE package_templates FORCE ROW LEVEL SECURITY;

  -- 10. package_details
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
    CREATE TABLE IF NOT EXISTS package_details (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      activity_id UUID NOT NULL UNIQUE REFERENCES itinerary_activities(id) ON DELETE CASCADE,
      trip_id UUID NOT NULL REFERENCES trips(id),
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name VARCHAR(255),
      payment_status booking_payment_status DEFAULT 'unpaid',
      pricing_type booking_pricing_type DEFAULT 'flat_rate',
      cancellation_policy TEXT,
      cancellation_deadline DATE,
      terms_and_conditions TEXT,
      group_booking_number VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE package_details ENABLE ROW LEVEL SECURITY;
    ALTER TABLE package_details FORCE ROW LEVEL SECURITY;
  END IF;

  -- 11. payment_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expected_payment_items') THEN
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expected_payment_item_id UUID NOT NULL REFERENCES expected_payment_items(id) ON DELETE CASCADE,
      agency_id UUID NOT NULL,
      transaction_type payment_transaction_type NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency VARCHAR(3) NOT NULL,
      payment_method payment_method,
      reference_number VARCHAR(100),
      transaction_date TIMESTAMPTZ NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID
    );
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_item ON payment_transactions(expected_payment_item_id);
    ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;
  END IF;

  -- 12. trip_insurance_packages
  CREATE TABLE IF NOT EXISTS trip_insurance_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    provider_name VARCHAR(255) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    policy_type insurance_policy_type NOT NULL,
    coverage_amount_cents INTEGER,
    premium_cents INTEGER NOT NULL,
    deductible_cents INTEGER,
    currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
    coverage_start_date DATE,
    coverage_end_date DATE,
    coverage_details JSONB,
    terms_url TEXT,
    is_from_catalog BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_trip_insurance_packages_trip ON trip_insurance_packages(trip_id);
  ALTER TABLE trip_insurance_packages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE trip_insurance_packages FORCE ROW LEVEL SECURITY;

  -- 13. trip_traveler_insurance
  CREATE TABLE IF NOT EXISTS trip_traveler_insurance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
    status traveler_insurance_status NOT NULL DEFAULT 'pending',
    selected_package_id UUID REFERENCES trip_insurance_packages(id) ON DELETE SET NULL,
    external_policy_number VARCHAR(100),
    external_provider_name VARCHAR(255),
    external_coverage_details TEXT,
    declined_reason TEXT,
    declined_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    premium_paid_cents INTEGER,
    policy_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trip_traveler_insurance_unique_traveler UNIQUE (trip_id, trip_traveler_id)
  );
  CREATE INDEX IF NOT EXISTS idx_trip_traveler_insurance_trip ON trip_traveler_insurance(trip_id);
  ALTER TABLE trip_traveler_insurance ENABLE ROW LEVEL SECURITY;
  ALTER TABLE trip_traveler_insurance FORCE ROW LEVEL SECURITY;

END $$;
