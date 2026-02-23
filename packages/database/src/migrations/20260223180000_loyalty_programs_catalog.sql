-- Loyalty Programs Catalog + Per-Passenger Booking Integration
--
-- 1. Agency-level loyalty programs catalog (Library)
-- 2. Link contact memberships to catalog (optional FK)
-- 3. Per-passenger loyalty on bookings (activity_travelers)

-- ============================================================================
-- 1. Agency-level loyalty programs catalog
-- ============================================================================

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider_name VARCHAR(255) NOT NULL,
  program_name VARCHAR(255) NOT NULL,
  program_type VARCHAR(50) NOT NULL DEFAULT 'cruise',
  logo_url TEXT,
  website_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_agency_provider_program
  ON loyalty_programs(agency_id, provider_name, program_name);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_agency ON loyalty_programs(agency_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_type ON loyalty_programs(program_type);

-- RLS
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_programs_agency_policy ON loyalty_programs
  USING (agency_id = current_setting('app.agency_id', true)::uuid);

-- ============================================================================
-- 2. Link contact memberships to catalog (optional FK)
-- ============================================================================

ALTER TABLE contact_loyalty_programs
  ADD COLUMN IF NOT EXISTS loyalty_program_id UUID REFERENCES loyalty_programs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clp_loyalty_program ON contact_loyalty_programs(loyalty_program_id);

-- ============================================================================
-- 3. Per-passenger loyalty on bookings
-- ============================================================================

ALTER TABLE activity_travelers
  ADD COLUMN IF NOT EXISTS contact_loyalty_program_id UUID
    REFERENCES contact_loyalty_programs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_at_loyalty ON activity_travelers(contact_loyalty_program_id);

-- ============================================================================
-- 4. Extend audit entity type enum
-- ============================================================================

ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'loyalty_program';

-- ============================================================================
-- 5. Seed common providers for the default agency
-- ============================================================================

INSERT INTO loyalty_programs (agency_id, provider_name, program_name, program_type)
SELECT '00000000-0000-0000-0000-000000000001', provider_name, program_name, program_type
FROM (VALUES
  ('Royal Caribbean', 'Crown & Anchor Society', 'cruise'),
  ('Celebrity Cruises', 'Captain''s Club', 'cruise'),
  ('Norwegian Cruise Line', 'Latitudes Rewards', 'cruise'),
  ('Carnival Cruise Line', 'VIFP Club', 'cruise'),
  ('Princess Cruises', 'Captain''s Circle', 'cruise'),
  ('Holland America Line', 'Mariner Society', 'cruise'),
  ('MSC Cruises', 'Voyagers Club', 'cruise'),
  ('Disney Cruise Line', 'Castaway Club', 'cruise'),
  ('Viking', 'Viking Explorer Society', 'cruise'),
  ('Cunard', 'Cunard World Club', 'cruise'),
  ('Air Canada', 'Aeroplan', 'airline'),
  ('WestJet', 'WestJet Rewards', 'airline'),
  ('United Airlines', 'MileagePlus', 'airline'),
  ('Delta Air Lines', 'SkyMiles', 'airline'),
  ('American Airlines', 'AAdvantage', 'airline'),
  ('Marriott Bonvoy', 'Marriott Bonvoy', 'hotel'),
  ('Hilton Honors', 'Hilton Honors', 'hotel'),
  ('IHG One Rewards', 'IHG One Rewards', 'hotel'),
  ('World of Hyatt', 'World of Hyatt', 'hotel')
) AS seed(provider_name, program_name, program_type)
WHERE EXISTS (SELECT 1 FROM agencies WHERE id = '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
