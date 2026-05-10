CREATE TABLE IF NOT EXISTS agency_tax_filing_config (
  agency_id uuid PRIMARY KEY REFERENCES agencies(id),
  legal_name varchar(255) NOT NULL,
  payer_account_number varchar(20) NOT NULL,
  transmitter_number varchar(20),
  filing_address jsonb NOT NULL,
  filing_province varchar(2) NOT NULL,
  filing_contact_name varchar(255),
  filing_contact_email varchar(255),
  filing_contact_phone varchar(40),
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_tax_filing_config_effective
  ON agency_tax_filing_config (agency_id, effective_from);
