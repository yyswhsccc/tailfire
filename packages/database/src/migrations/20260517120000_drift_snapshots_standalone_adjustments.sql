-- PR-3 Commit 5 (Codex round-1 fix #2): standalone vs item-scoped adjustments
--
-- Original drift formula subtracted ALL reconciled adjustments which
-- false-alerted on standalone adjustment-only claims (IC v2 allows them).
-- Now only item-scoped adjustments (activity_pricing_id IS NOT NULL) close
-- the committed/settled gap for an already-counted item. Standalone
-- adjustments are independent payouts and don't shift the balance.

ALTER TABLE commission_drift_snapshots
  ADD COLUMN IF NOT EXISTS standalone_reconciled_adjustments_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN commission_drift_snapshots.standalone_reconciled_adjustments_cents IS
  'PR-3 Commit 5: visibility-only bucket for reconciled commission_adjustments with activity_pricing_id IS NULL. These are standalone payouts the IC claimed independently of any check item; they are paid via the same reservation flow but do NOT shift the drift balance because they were never in the committed_payable population to begin with. Excluded from true_drift_cents formula.';
