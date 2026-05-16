-- PR-1 Commit 12 (Codex round-4 BLOCK fix): correct the "active settlement"
-- predicate + add concurrent-reversal guard.
--
-- Bug found in commit 11: the partial unique idx
-- `idx_commission_item_settlements_active_unique` filtered on
-- `WHERE reverses_settlement_id IS NULL`. That predicate is true for every
-- ORIGINAL settlement row (only reversal rows carry the FK back to the
-- original), so reversed items remained "active" forever — and the
-- equivalent SQL filters in getEligibleForUser / fetchEligibleItemsByCurrency
-- meant reversed items could never be re-claimed.
--
-- Fix: an "active settlement" is now defined as:
--   is_reversal = false  AND  reversed_at IS NULL
-- The reverseSingle() service updates the ORIGINAL row's reversed_at/by/
-- reason in the same tx as it inserts the negation row, so a reversed
-- original immediately exits the active set.
--
-- Also: add a UNIQUE on `reverses_settlement_id WHERE is_reversal = true`
-- so two concurrent reversal calls cannot both insert negation rows
-- pointing at the same original settlement.

-- 1. Drop the broken predicate index from commit 11
DROP INDEX IF EXISTS idx_commission_item_settlements_active_unique;

-- 2. Create the correct active-settlement unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_item_settlements_active_unique
  ON commission_item_settlements (check_item_id, recipient_user_id)
  WHERE is_reversal = false AND reversed_at IS NULL;

COMMENT ON INDEX idx_commission_item_settlements_active_unique IS
  'PR-1 Commit 12: an active settlement is one that is not a reversal row AND has not yet been reversed. Prevents two active claims for the same (check_item, recipient).';

-- 3. Prevent concurrent double-reversal: only one negation row per original.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_item_settlements_reversal_unique
  ON commission_item_settlements (reverses_settlement_id)
  WHERE is_reversal = true;

COMMENT ON INDEX idx_commission_item_settlements_reversal_unique IS
  'PR-1 Commit 12: prevents two concurrent reverseSettlement() calls from both inserting a negation row against the same original.';
