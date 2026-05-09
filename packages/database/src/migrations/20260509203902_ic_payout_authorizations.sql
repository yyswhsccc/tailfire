DO $$ BEGIN
  CREATE TYPE ic_payout_authorization_status AS ENUM ('active', 'superseded', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS ic_payout_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),

  agreement_version varchar(20) NOT NULL,
  agreement_text_hash varchar(64) NOT NULL,
  agreement_pdf_storage_path text NOT NULL,

  accepted_at timestamptz NOT NULL,
  accepted_ip inet,
  signature_png_storage_path text NOT NULL,

  payer_tax_registration_attested boolean NOT NULL DEFAULT false,
  recipient_tax_registration_attested boolean NOT NULL DEFAULT false,

  status ic_payout_authorization_status NOT NULL DEFAULT 'active',

  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_payout_authorizations_user_status
  ON ic_payout_authorizations (user_id, status);

-- Add the deferred FK from Task 4
ALTER TABLE ic_tax_profiles
  ADD CONSTRAINT fk_ic_tax_profiles_rcti_authorization
  FOREIGN KEY (rcti_authorization_id) REFERENCES ic_payout_authorizations(id);
