-- ============================================================================
-- Migration: Add loyalty programs table + cruise booking schema enhancements
-- Phase A: Schema + import wiring only. UI (Phase B) and PDF OCR (Phase C) follow.
-- ============================================================================

-- 1. Create contact_loyalty_programs table
CREATE TABLE IF NOT EXISTS contact_loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  program_name VARCHAR(255) NOT NULL,
  provider_name VARCHAR(255) NOT NULL,
  membership_number VARCHAR(100) NOT NULL,
  tier_level VARCHAR(100),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, provider_name, membership_number)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_contact ON contact_loyalty_programs(contact_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_provider ON contact_loyalty_programs(provider_name);

-- RLS: agency isolation through contacts table (follows contact_documents pattern)
ALTER TABLE contact_loyalty_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_loyalty_programs_agency_isolation ON contact_loyalty_programs
  USING (EXISTS (
    SELECT 1 FROM contacts
    WHERE contacts.id = contact_loyalty_programs.contact_id
    AND contacts.agency_id = current_setting('app.agency_id')::uuid
  ));

-- 2. Add universal booking columns to activity_pricing
ALTER TABLE activity_pricing
  ADD COLUMN IF NOT EXISTS net_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS non_refundable_deposit BOOLEAN,
  ADD COLUMN IF NOT EXISTS cancellation_schedule_json JSONB;

COMMENT ON COLUMN activity_pricing.net_price_cents IS 'Agency net price in cents (total minus commission). Applies to all activity types.';
COMMENT ON COLUMN activity_pricing.non_refundable_deposit IS 'Whether deposit is non-refundable. Null = unknown.';
COMMENT ON COLUMN activity_pricing.cancellation_schedule_json IS 'Structured cancellation schedule: [{daysRange, penaltyPercent, effectiveDate, description}]';

-- 3. Add cruise-specific columns to custom_cruise_details
ALTER TABLE custom_cruise_details
  ADD COLUMN IF NOT EXISTS reservation_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS stateroom_category_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS onboard_credit_cents INTEGER,
  ADD COLUMN IF NOT EXISTS onboard_credit_currency VARCHAR(3);

COMMENT ON COLUMN custom_cruise_details.reservation_number IS 'Cruise line own confirmation/reservation number';
COMMENT ON COLUMN custom_cruise_details.stateroom_category_code IS 'Berthed stateroom category code (e.g., XB, D5)';
COMMENT ON COLUMN custom_cruise_details.onboard_credit_cents IS 'Onboard credit amount in cents';
COMMENT ON COLUMN custom_cruise_details.onboard_credit_currency IS 'Onboard credit currency (e.g., CAD, USD)';
