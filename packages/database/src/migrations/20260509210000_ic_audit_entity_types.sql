-- IC Commission Payout: extend activity_entity_type enum (Task 12)
--
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction. The migration
-- runner (packages/database/src/migrate.ts) detects this pattern and applies
-- the migration outside the per-migration tx for that reason. Each ADD VALUE
-- is also guarded with IF NOT EXISTS for idempotency.

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
