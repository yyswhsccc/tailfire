ALTER TABLE commission_adjustments ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'CAD';

-- Index for currency-aware eligibility queries (Phase 2 getCommissionDue refactor)
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_user_status_currency
  ON commission_adjustments (agent_user_id, status, currency);
