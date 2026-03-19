-- Commission Receive: audit trail + accounting integration fields

-- 1. Add audit fields to commission_checks (per-deposit)
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS reconciliation_date TIMESTAMPTZ;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS reconciled_by UUID;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS accounting_transaction_id VARCHAR(255);
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE commission_checks ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- 2. Add audit fields to commission_tracking (per-item)
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS reconciliation_date TIMESTAMPTZ;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS reconciled_by UUID;

-- 3. Index for pending receivables query
CREATE INDEX IF NOT EXISTS idx_commission_tracking_status
  ON commission_tracking(commission_status)
  WHERE commission_status = 'pending';

-- 4. Make activity_pricing_id nullable for unreconciled deposit items
ALTER TABLE commission_check_items ALTER COLUMN activity_pricing_id DROP NOT NULL;

-- 5. Add description field for unreconciled items
ALTER TABLE commission_check_items ADD COLUMN IF NOT EXISTS description VARCHAR(500);
