-- PR-1 Commit 11 (Codex round-3 BLOCK fix): correct the settlement unique +
-- non-negative CHECK so reversal rows can actually land.
--
-- Migration 20260516100400 attempted to DROP CONSTRAINT
-- `unique_check_item_recipient` — but Postgres had auto-named the original
-- constraint (from 20260304200000_add_settlement_table.sql line 14) as
-- `commission_item_settlements_check_item_id_recipient_user_id_key`. The
-- IF EXISTS clause silently no-op'd, so the unique is still in place and
-- the CHECK (settled_amount_cents >= 0) from line 11 of that same file is
-- also still in place.
--
-- Both must go for the reversal pattern to work:
--   - The unique prevents the paired negative row (same check_item +
--     recipient as the original positive row).
--   - The CHECK prevents the negative cents itself.
--
-- We also re-create the partial active-settlement index that 100400 added
-- under a different name, just in case 100400's CREATE INDEX IF NOT EXISTS
-- raced with this same fix-up: idempotent under either ordering.

-- 1. Drop ALL unique constraints/indexes on (check_item_id, recipient_user_id)
--    by inspecting pg_constraint + pg_index. Catches both the auto-named
--    `_key` constraint AND any manually-named one from an earlier attempt.
DO $$
DECLARE
  cons_name text;
  idx_name  text;
BEGIN
  -- Unique CONSTRAINTS (table-level)
  FOR cons_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'commission_item_settlements'::regclass
      AND c.contype  = 'u'
      AND c.conkey   @> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'commission_item_settlements'::regclass AND attname = 'check_item_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'commission_item_settlements'::regclass AND attname = 'recipient_user_id')
      ]
  LOOP
    EXECUTE format('ALTER TABLE commission_item_settlements DROP CONSTRAINT %I', cons_name);
  END LOOP;

  -- Unique INDEXES that weren't backed by a constraint (defensive)
  FOR idx_name IN
    SELECT i.relname
    FROM pg_class i
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    WHERE t.relname = 'commission_item_settlements'
      AND ix.indisunique = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid
      )
      -- Match the exact column set: check_item_id + recipient_user_id (no filter)
      AND ix.indpred IS NULL
      AND ix.indkey::int[] @> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'commission_item_settlements'::regclass AND attname = 'check_item_id')::int,
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'commission_item_settlements'::regclass AND attname = 'recipient_user_id')::int
      ]
  LOOP
    EXECUTE format('DROP INDEX %I', idx_name);
  END LOOP;
END$$;

-- 2. Drop the non-negative CHECK on settled_amount_cents (also by inspection
--    since the original migration did not name it). pg_constraint records
--    the column the check involves via conkey; we match on the single-column
--    CHECK that references settled_amount_cents.
DO $$
DECLARE
  cons_name text;
BEGIN
  FOR cons_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'commission_item_settlements'::regclass
      AND c.contype  = 'c'
      AND c.conkey   = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'commission_item_settlements'::regclass AND attname = 'settled_amount_cents')
      ]
      AND pg_get_constraintdef(c.oid) ILIKE '%>= 0%'
  LOOP
    EXECUTE format('ALTER TABLE commission_item_settlements DROP CONSTRAINT %I', cons_name);
  END LOOP;
END$$;

-- 3. Re-assert the partial unique index that protects active (non-reversal)
--    settlements. PR-1 migration 100400 created an index with the SAME
--    expression but only WHERE reverses_settlement_id IS NULL — and it was
--    a regular index, not unique. Make it unique now so two concurrent
--    submits cannot land both insert paths.
DROP INDEX IF EXISTS idx_commission_item_settlements_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_item_settlements_active_unique
  ON commission_item_settlements (check_item_id, recipient_user_id)
  WHERE reverses_settlement_id IS NULL;

COMMENT ON INDEX idx_commission_item_settlements_active_unique IS
  'PR-1 Commit 11: replaces the dropped full unique. Allows reversal rows (which carry reverses_settlement_id) to coexist with their original positive row, while still preventing two active claims for the same (check_item, recipient).';
