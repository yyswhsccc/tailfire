DO $$ BEGIN
  CREATE TYPE ic_payout_account_rail AS ENUM ('interac_etransfer', 'eft', 'wise', 'wire', 'visa_direct');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ic_payout_account_status AS ENUM ('active', 'archived', 'unverified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ic_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),

  label varchar(80) NOT NULL,
  currency varchar(3) NOT NULL,
  rail ic_payout_account_rail NOT NULL,
  is_default_for_currency boolean NOT NULL DEFAULT false,
  status ic_payout_account_status NOT NULL DEFAULT 'unverified',

  details_encrypted bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  details_mask varchar(80) NOT NULL,

  provider_name varchar(40),
  provider_token varchar(255),

  pad_agreement_version varchar(20),
  pad_accepted_at timestamptz,
  pad_accepted_ip inet,

  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_payout_accounts_user
  ON ic_payout_accounts (user_id);

-- Partial unique index: exactly one active default account per (user, currency)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_per_currency
  ON ic_payout_accounts (user_id, currency)
  WHERE is_default_for_currency = true AND status = 'active';
