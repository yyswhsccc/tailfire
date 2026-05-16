-- PR-1 Commission Foundation: per-activity reconciliation gate
--
-- is_reconciled is admin-asserted JUDGMENT (not auto-derived). It gates
-- IC Payouts V2 eligibility: an activity becomes PAYABLE only when
--   trip departed AND commission_tracking.is_reconciled = true.
--
-- Existing reconciliation_date + reconciled_by columns are repurposed as the
-- "when/who" of the reconciliation decision (previously they were unused).
--
-- Backfill: existing tf-demo rows are TES-imported historical data we treat
-- as already reconciled. Reset to FALSE during cutover if needed.

ALTER TABLE commission_tracking
  ADD COLUMN IF NOT EXISTS is_reconciled boolean NOT NULL DEFAULT false;

-- Backfill: TES-imported rows are treated as reconciled (closed historicals).
UPDATE commission_tracking
SET is_reconciled = true
WHERE source = 'tes_import'
  AND is_reconciled = false;

COMMENT ON COLUMN commission_tracking.is_reconciled IS
  'Admin-asserted: this activity''s commission matches the supplier deposit. Gates IC v2 eligibility together with trip departure. Toggled via /commission/tracking/:id/reconcile.';
COMMENT ON COLUMN commission_tracking.reconciliation_date IS
  'Timestamp the reconcile flag was last set to true. Reset to NULL on unreconcile.';
COMMENT ON COLUMN commission_tracking.reconciled_by IS
  'User who last set is_reconciled = true. Reset to NULL on unreconcile.';
