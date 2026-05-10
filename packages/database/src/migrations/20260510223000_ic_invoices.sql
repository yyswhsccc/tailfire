-- ============================================================================
-- IC Invoices + IC Invoice Lines
--
-- RCTI (Recipient Created Tax Invoice) tables for IC commission payout workflow.
-- Includes:
--   - ic_invoice_status enum
--   - ic_invoice_line_type enum
--   - ic_invoices table (one per payout event, snapshotted identity + tax calc)
--   - ic_invoice_lines table (line items, commission or adjustment, mutually exclusive)
--   - CHECK constraint enforcing line-type discipline
--   - Unique index for invoice number deduplication
--   - Covering indexes for common query patterns
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE ic_invoice_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ic_invoice_line_type AS ENUM ('commission', 'adjustment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ic_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),

  invoice_number varchar(40) NOT NULL,
  invoice_date date NOT NULL,
  currency varchar(3) NOT NULL,

  -- Snapshotted IC identity at invoice creation time
  ic_legal_name varchar(255) NOT NULL,
  ic_address jsonb NOT NULL,
  ic_domicile_province varchar(2) NOT NULL,
  ic_gst_hst_number varchar(40),
  ic_sin_or_bn_mask varchar(20),
  ic_tax_profile_id uuid NOT NULL REFERENCES ic_tax_profiles(id),
  rcti_authorization_id uuid NOT NULL REFERENCES ic_payout_authorizations(id),

  -- C1: separate base / tax / total (cents)
  reportable_base_cents bigint NOT NULL,
  tax_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL,

  -- C2: place-of-supply outcome stored for audit trail
  place_of_supply_jurisdiction varchar(2) NOT NULL,
  place_of_supply_rule varchar(40) NOT NULL,
  tax_type varchar(10) NOT NULL,
  tax_rate_bp integer NOT NULL DEFAULT 0,

  pdf_storage_path text,
  pdf_hash varchar(64),

  status ic_invoice_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_reason text,

  -- C3 reservation: links to internal commission_checks (type='paid') row written on submission.
  -- NULL until invoice transitions to 'submitted'.
  reservation_check_id uuid REFERENCES commission_checks(id),

  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate invoice numbers per IC within an agency
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ic_invoices_number
  ON ic_invoices (agency_id, user_id, invoice_number);

-- Fast lookup by IC + status (claim list view)
CREATE INDEX IF NOT EXISTS idx_ic_invoices_user_status
  ON ic_invoices (user_id, status);

-- Fast lookup by agency + status + date (admin review queue, ordered by date desc)
CREATE INDEX IF NOT EXISTS idx_ic_invoices_agency_status_date
  ON ic_invoices (agency_id, status, invoice_date DESC);

CREATE TABLE IF NOT EXISTS ic_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES ic_invoices(id) ON DELETE CASCADE,
  line_type ic_invoice_line_type NOT NULL,

  -- Mutual exclusivity enforced by CHECK constraint below:
  --   commission → check_item_id NOT NULL, adjustment_id IS NULL
  --   adjustment → adjustment_id NOT NULL, check_item_id IS NULL
  check_item_id uuid REFERENCES commission_check_items(id),
  adjustment_id uuid REFERENCES commission_adjustments(id),

  description varchar(500),
  trip_ref varchar(100),
  amount_cents bigint NOT NULL,
  currency varchar(3) NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ic_invoice_lines_type_check CHECK (
    (line_type = 'commission' AND check_item_id IS NOT NULL AND adjustment_id IS NULL)
    OR
    (line_type = 'adjustment' AND adjustment_id IS NOT NULL AND check_item_id IS NULL)
  )
);

-- Fast lookup of all lines for a given invoice
CREATE INDEX IF NOT EXISTS idx_ic_invoice_lines_invoice
  ON ic_invoice_lines (invoice_id);
