-- PR-1 Commission Foundation: tax-on-commission fields on check items
--
-- Adds embedded GST/HST tracking per check item. Example: Air Canada Vacations
-- pays $105 = $100 commissionable_base + $5 GST. The fee/split formula runs
-- against base, not gross, so we must persist the breakdown at deposit time.
--
-- Backfill: existing 249 tf-demo rows default to (0, NULL, NULL) — i.e. treat
-- historical TES deposits as tax-exclusive until admin reconciles.

ALTER TABLE commission_check_items
  ADD COLUMN IF NOT EXISTS embedded_tax_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedded_tax_type varchar(50),
  ADD COLUMN IF NOT EXISTS embedded_tax_rate_percent numeric(5,2);

COMMENT ON COLUMN commission_check_items.embedded_tax_cents IS
  'GST/HST embedded in received_cents. commissionable_base = received_cents - embedded_tax_cents.';
COMMENT ON COLUMN commission_check_items.embedded_tax_type IS
  'Tax label: GST | HST | QST | PST | NONE. NULL = no tax detected.';
COMMENT ON COLUMN commission_check_items.embedded_tax_rate_percent IS
  'Effective rate as % (e.g. 5.00 for GST, 13.00 for ON HST). NULL = not applicable.';
