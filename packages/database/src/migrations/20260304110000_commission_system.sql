-- Migration: Commission System Tables + Enhanced Tracking
-- Creates check-based commission tables and enhances existing commission_tracking
-- Part of TraveleSolutions pre-migration work

-- ============================================================================
-- PART A: New enums and tables
-- ============================================================================

-- Enums
CREATE TYPE commission_check_type AS ENUM ('received', 'paid');
CREATE TYPE commission_check_status AS ENUM ('pending', 'submitted', 'accepted', 'cancelled');
CREATE TYPE commission_adjustment_type AS ENUM ('agent', 'company', 'backend');
CREATE TYPE commission_adjustment_status AS ENUM ('pending', 'reconciled');

-- Checks table (received from suppliers + paid to agents)
CREATE TABLE commission_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  check_number VARCHAR(255) NOT NULL,
  check_type commission_check_type NOT NULL,
  check_date DATE NOT NULL,
  check_amount_cents INTEGER NOT NULL CHECK (check_amount_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
  sender_name VARCHAR(255),
  sender_supplier_id UUID REFERENCES suppliers(id),
  recipient_name VARCHAR(255),
  recipient_user_id UUID REFERENCES user_profiles(id),
  status commission_check_status NOT NULL DEFAULT 'pending',
  group_check BOOLEAN NOT NULL DEFAULT false,
  parent_check_id UUID REFERENCES commission_checks(id),
  payroll_id VARCHAR(255),
  notes TEXT,
  source VARCHAR(100) DEFAULT 'manual',
  source_ref VARCHAR(255),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Semantic check constraints
  CONSTRAINT chk_received_sender CHECK (
    check_type != 'received' OR sender_name IS NOT NULL OR sender_supplier_id IS NOT NULL
  ),
  CONSTRAINT chk_paid_recipient CHECK (
    check_type != 'paid' OR recipient_name IS NOT NULL OR recipient_user_id IS NOT NULL
  )
);

-- Check items (bookings reconciled to a check)
CREATE TABLE commission_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES commission_checks(id) ON DELETE CASCADE,
  activity_pricing_id UUID NOT NULL REFERENCES activity_pricing(id),
  projected_cents INTEGER CHECK (projected_cents >= 0),
  received_parent_cents INTEGER DEFAULT 0 CHECK (received_parent_cents >= 0),
  received_cents INTEGER DEFAULT 0 CHECK (received_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(check_id, activity_pricing_id)
);

-- Adjustments (taxes, corrections)
CREATE TABLE commission_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES commission_checks(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  description VARCHAR(500) NOT NULL,
  amount_cents INTEGER NOT NULL,
  adjustment_type commission_adjustment_type NOT NULL,
  tax_type VARCHAR(50),
  tax_rate DECIMAL(5,2),
  agent_user_id UUID REFERENCES user_profiles(id),
  company_name VARCHAR(255),
  status commission_adjustment_status NOT NULL DEFAULT 'pending',
  source VARCHAR(100) DEFAULT 'manual',
  source_ref VARCHAR(255),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_commission_checks_agency ON commission_checks(agency_id);
CREATE INDEX idx_commission_checks_type ON commission_checks(check_type);
CREATE INDEX idx_commission_checks_status ON commission_checks(status);
CREATE INDEX idx_commission_checks_date ON commission_checks(check_date);
CREATE INDEX idx_commission_checks_supplier ON commission_checks(sender_supplier_id);
CREATE INDEX idx_commission_checks_recipient ON commission_checks(recipient_user_id);
CREATE INDEX idx_commission_check_items_check ON commission_check_items(check_id);
CREATE INDEX idx_commission_check_items_pricing ON commission_check_items(activity_pricing_id);
CREATE INDEX idx_commission_adjustments_check ON commission_adjustments(check_id);
CREATE INDEX idx_commission_adjustments_agency ON commission_adjustments(agency_id);

-- ============================================================================
-- PART B: Agency fee columns
-- ============================================================================

ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS commission_fee_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00;
ALTER TABLE agency_settings ADD CONSTRAINT chk_commission_fee_rate CHECK (commission_fee_rate >= 0 AND commission_fee_rate <= 100);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS commission_fee_rate_override DECIMAL(5,2);
ALTER TABLE trips ADD CONSTRAINT chk_commission_fee_rate_override CHECK (commission_fee_rate_override IS NULL OR (commission_fee_rate_override >= 0 AND commission_fee_rate_override <= 100));

-- ============================================================================
-- PART C: Enhanced commission_tracking columns
-- ============================================================================

ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS gross_commission_cents INTEGER CHECK (gross_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER DEFAULT 0 CHECK (tax_amount_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS tax_type VARCHAR(50);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS net_commission_cents INTEGER CHECK (net_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_cents INTEGER DEFAULT 0 CHECK (received_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS paid_cents INTEGER DEFAULT 0 CHECK (paid_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS adjustment_cents INTEGER DEFAULT 0;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_parent_cents INTEGER DEFAULT 0 CHECK (received_parent_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'manual';
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS source_booking_ref VARCHAR(255);
