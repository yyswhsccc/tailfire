-- PR-1 Commission Foundation: supplier-level commission tax defaults
--
-- Lets admins set per-supplier tax defaults so the deposit tool can pre-fill
-- embedded_tax_* on commission_check_items at import / deposit-creation time.
-- Default of FALSE for commission_includes_tax preserves current
-- "tax-exclusive" assumption for unconfigured suppliers.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS default_commission_tax_type varchar(50),
  ADD COLUMN IF NOT EXISTS default_commission_tax_rate_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS commission_includes_tax boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN suppliers.default_commission_tax_type IS
  'Default tax label applied to commissions from this supplier (GST | HST | QST | PST | NONE).';
COMMENT ON COLUMN suppliers.default_commission_tax_rate_percent IS
  'Default tax rate (%) used to compute embedded_tax_cents when commission_includes_tax = true.';
COMMENT ON COLUMN suppliers.commission_includes_tax IS
  'When true, commission_check_items.received_cents is assumed to include tax; embedded_tax is computed via gross * rate / (100 + rate). When false, received_cents is treated as tax-exclusive.';
