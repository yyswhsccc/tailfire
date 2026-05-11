-- ============================================================================
-- IC Disbursements + IC Disbursement Attempts
--
-- Provider-agnostic payout disbursement system for IC commission payouts.
-- Includes:
--   - ic_disbursement_status enum (new)
--   - ic_disbursement_attempt_outcome enum (new)
--   - ic_disbursements table (1:1 with ic_invoices, FX snapshot for T4A Box 020)
--   - ic_disbursement_attempts table (append-only attempt log, ON DELETE CASCADE)
--   - UNIQUE constraints: invoice_id, idempotency_key, (disbursement_id, attempt_number)
--   - Indexes for reconcile cron sweep and IC disbursement history view
--
-- NOTE: ic_payout_account_rail enum is NOT created here — it already exists
-- from migration 20260509204100_ic_payout_accounts. Referenced directly by name.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE ic_disbursement_status AS ENUM ('queued', 'sending', 'sent', 'failed', 'returned', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ic_disbursement_attempt_outcome AS ENUM ('sent', 'failed', 'returned', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ic_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1:1 with invoice (UNIQUE enforces this)
  invoice_id uuid NOT NULL UNIQUE REFERENCES ic_invoices(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),

  -- Snapshot reference to payout account used (denormalized for audit trail)
  payout_account_id uuid NOT NULL REFERENCES ic_payout_accounts(id),

  amount_cents bigint NOT NULL,
  currency varchar(3) NOT NULL,

  -- Provider identifier: 'manual' | 'vopay' | 'dreampay'
  provider varchar(40) NOT NULL,
  rail ic_payout_account_rail NOT NULL,

  idempotency_key uuid NOT NULL UNIQUE,

  status ic_disbursement_status NOT NULL DEFAULT 'queued',

  -- FX snapshot for T4A Box 020 reporting.
  -- All nullable on insert (status='queued'); populated by DisbursementService.markSent (Task 37).
  -- For CAD disbursements: fx_rate_to_cad = 1.0, cad_equivalent_* = amount_cents.
  fx_rate_to_cad numeric(18, 8),
  cad_equivalent_base_cents bigint,    -- invoice.reportable_base_cents × fx_rate_to_cad → T4A Box 020
  cad_equivalent_tax_cents bigint,     -- invoice.tax_cents × fx_rate_to_cad (informational)
  cad_equivalent_total_cents bigint,
  fx_rate_source varchar(40),          -- 'bank_of_canada' | 'manual'
  fx_rate_date date,

  completed_at timestamptz,            -- when status flipped to 'sent'

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reconcile cron sweep (Task 38): WHERE status='sending' AND updated_at < now() - 48h
CREATE INDEX IF NOT EXISTS idx_ic_disbursements_status_updated
  ON ic_disbursements (status, updated_at);

-- IC disbursement history view: filter by user + status, ordered by completed_at DESC
CREATE INDEX IF NOT EXISTS idx_ic_disbursements_user_status_completed
  ON ic_disbursements (user_id, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS ic_disbursement_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  disbursement_id uuid NOT NULL REFERENCES ic_disbursements(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,

  provider varchar(40) NOT NULL,
  rail ic_payout_account_rail NOT NULL,

  -- Nullable while attempt is in-progress; set on completion
  outcome ic_disbursement_attempt_outcome,
  reason text,

  -- v1: manual payout fields (e-Transfer, Wise, wire)
  manual_reference varchar(255),         -- e-Transfer #, Wise tx id, wire ref
  manual_proof_storage_path text,
  manual_sent_by uuid,

  -- v2: provider integration fields
  provider_txn_id varchar(255),
  provider_webhook_payload jsonb,
  provider_fee_cents bigint,

  started_at timestamptz,
  completed_at timestamptz,

  -- Enforce sequential attempt numbering per disbursement
  CONSTRAINT uq_disbursement_attempt_number UNIQUE (disbursement_id, attempt_number)
);

-- Attempt history ordered by most recent (disbursement_id is leading for FK joins)
CREATE INDEX IF NOT EXISTS idx_ic_disbursement_attempts_disbursement_started
  ON ic_disbursement_attempts (disbursement_id, started_at DESC);
