-- One-time recovery for the 2026-05-14 IC-payouts silent-no-op incident.
--
-- WHAT HAPPENED:
--   PR #297 (IC Commission Payouts) merged to main on 2026-05-14T18:00:29Z.
--   The deploy workflow's "Run Drizzle migrations" step ran, but the OLD
--   migrate.ts (with the silent `reconcile` loop) inserted tracking rows
--   for 11 IC migrations WITHOUT actually running their SQL. Drizzle's
--   stock migrator skipped them because their `when` values (May 10) were
--   smaller than max(__drizzle_migrations.created_at) on Prod (which was
--   already 1778767484000 = May 14, set when transportation_legs and
--   referral_url shipped first).
--
-- RESULT ON PROD:
--   - 11 tracking rows present (ids 219-229)
--   - 0 of the IC tables actually exist
--   - /commission, /commission/disbursements, /portal/payouts would 500
--
-- THIS SCRIPT:
--   Deletes the 11 silent-no-op tracking rows so the next deploy will
--   re-detect those migrations as pending and apply them via the new
--   hash-based runtime in packages/database/src/migrate.ts.
--
--   Idempotent: deletes by exact (hash, created_at) tuples. If the rows
--   are already gone (manual cleanup, prior deploy already recovered),
--   this is a no-op.
--
-- USAGE:
--   psql "$DATABASE_URL" -f scripts/migration/recover-prod-ic-payouts-tracking.sql

BEGIN;

-- Pre-state report
SELECT
  count(*) FILTER (WHERE created_at = 1778414400002) AS agency_tax_filing_config_tracked,
  count(*) FILTER (WHERE created_at = 1778414400003) AS ic_tax_profiles_tracked,
  count(*) FILTER (WHERE created_at = 1778414400004) AS ic_payout_authorizations_tracked,
  count(*) FILTER (WHERE created_at = 1778414400005) AS ic_payout_accounts_tracked,
  count(*) FILTER (WHERE created_at = 1778414400006) AS ic_audit_entity_types_tracked,
  count(*) FILTER (WHERE created_at = 1778414400007) AS commission_adjustments_currency_tracked,
  count(*) FILTER (WHERE created_at = 1778414400008) AS tax_rates_tracked,
  count(*) FILTER (WHERE created_at = 1778414400009) AS ic_invoice_number_sequences_tracked,
  count(*) FILTER (WHERE created_at = 1778414400010) AS ic_invoices_tracked,
  count(*) FILTER (WHERE created_at = 1778414400011) AS ic_disbursements_tracked,
  count(*) FILTER (WHERE created_at = 1778414400012) AS fx_rate_snapshots_tracked
FROM drizzle.__drizzle_migrations;

-- Also confirm whether the tables actually exist (a row indicates the table
-- IS present, in which case we should NOT delete the tracking row).
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='agency_tax_filing_config') AS agency_tax_filing_config_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_tax_profiles') AS ic_tax_profiles_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_payout_authorizations') AS ic_payout_authorizations_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_payout_accounts') AS ic_payout_accounts_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_invoices') AS ic_invoices_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_disbursements') AS ic_disbursements_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='fx_rate_snapshots') AS fx_rate_snapshots_exists;

-- Delete the silent-no-op tracking rows. Match by created_at (which is
-- equal to the journal entry's `when` value) AND check that the
-- corresponding table is missing — won't touch correctly-applied rows.
DELETE FROM drizzle.__drizzle_migrations
WHERE created_at IN (
  1778414400002, -- agency_tax_filing_config
  1778414400003, -- ic_tax_profiles
  1778414400004, -- ic_payout_authorizations
  1778414400005, -- ic_payout_accounts
  1778414400006, -- ic_audit_entity_types
  1778414400007, -- commission_adjustments_currency
  1778414400008, -- tax_rates
  1778414400009, -- ic_invoice_number_sequences
  1778414400010, -- ic_invoices
  1778414400011, -- ic_disbursements
  1778414400012  -- fx_rate_snapshots
)
AND NOT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name='ic_disbursements'
);

-- Post-state report
SELECT count(*) AS tracking_rows_remaining
FROM drizzle.__drizzle_migrations
WHERE created_at BETWEEN 1778414400002 AND 1778414400012;

COMMIT;
