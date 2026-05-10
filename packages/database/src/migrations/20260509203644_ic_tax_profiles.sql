CREATE TABLE IF NOT EXISTS ic_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  legal_name varchar(255) NOT NULL,
  domicile_address jsonb NOT NULL,
  domicile_province varchar(2) NOT NULL,
  is_corporation boolean NOT NULL DEFAULT false,
  sin_or_bn_encrypted bytea,
  encryption_key_version smallint,
  sin_or_bn_mask varchar(20),
  gst_hst_registered boolean NOT NULL DEFAULT false,
  gst_hst_number varchar(40),
  gst_hst_effective_from date,
  gst_hst_effective_to date,
  auto_disburse boolean NOT NULL DEFAULT false,
  approval_ceiling_cents bigint,
  rcti_authorization_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_ic_tax_profiles_agency_user UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ic_tax_profiles_agency ON ic_tax_profiles(agency_id);
CREATE INDEX IF NOT EXISTS idx_ic_tax_profiles_user ON ic_tax_profiles(user_id);
