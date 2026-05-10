CREATE TABLE IF NOT EXISTS ic_invoice_number_sequences (
  agency_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tax_year smallint NOT NULL,
  next_seq integer NOT NULL DEFAULT 1,
  PRIMARY KEY (agency_id, user_id, tax_year)
);
