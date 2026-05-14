-- IC Commission Payout: extend activity_entity_type enum (Task 12)
--
-- NOTE: ALTER TYPE ADD VALUE is allowed inside a transaction in PostgreSQL 12+
-- as long as the new value is not used in the same transaction. This migration
-- only adds values (no usage), so Drizzle's stock per-run transaction is safe.
-- Each ADD VALUE is also guarded with IF NOT EXISTS for idempotency.

ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'agency_tax_filing_config';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_tax_profile';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_payout_authorization';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_payout_account';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_invoice';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_invoice_line';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_disbursement';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_disbursement_attempt';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_t4a_slip';
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'ic_t4a_filing';
