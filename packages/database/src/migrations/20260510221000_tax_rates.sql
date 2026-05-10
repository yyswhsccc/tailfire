CREATE TABLE IF NOT EXISTS tax_rates (
  jurisdiction varchar(2) NOT NULL,
  tax_type varchar(10) NOT NULL,
  rate_bp integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  source text NOT NULL,
  PRIMARY KEY (jurisdiction, tax_type, effective_from)
);

-- Seed CRA federal rates effective 2024-current. Provincial PST/QST layers are
-- intentionally omitted from v1 — see spec section 10 risk #2 (tax counsel review).
-- For provinces with combined federal+provincial sales tax (BC, MB, SK, QC),
-- only the federal GST portion is recorded here. Their full combined rate is a
-- TODO for tax counsel.
INSERT INTO tax_rates (jurisdiction, tax_type, rate_bp, effective_from, source) VALUES
  ('AB', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),
  ('BC', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),       -- BC also has PST 7%, not modelled
  ('MB', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),       -- MB also has RST 7%, not modelled
  ('NB', 'HST', 1500, '2016-07-01', 'CRA-2024-rates'),
  ('NL', 'HST', 1500, '2016-07-01', 'CRA-2024-rates'),
  ('NS', 'HST', 1500, '2010-07-01', 'CRA-2024-rates'),
  ('NT', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),
  ('NU', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),
  ('ON', 'HST', 1300, '2010-07-01', 'CRA-2024-rates'),
  ('PE', 'HST', 1500, '2016-10-01', 'CRA-2024-rates'),
  ('QC', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),       -- QC also has QST 9.975%, not modelled
  ('SK', 'GST', 500, '2008-01-01', 'CRA-2024-rates'),       -- SK also has PST 6%, not modelled
  ('YT', 'GST', 500, '2008-01-01', 'CRA-2024-rates')
ON CONFLICT (jurisdiction, tax_type, effective_from) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tax_rates_jurisdiction_effective
  ON tax_rates (jurisdiction, effective_from DESC);
