-- PR-1 Commission Foundation: reversal pattern + computation breakdown
--
-- Audit-proof pillar: replace CASCADE DELETE on settlements with negative
-- reversal rows. Every settlement carries its full formula snapshot in
-- computation_breakdown JSONB so an auditor can answer "why was Sandra paid
-- exactly $171 for booking X?" deterministically forever.
--
-- The previous unique constraint (check_item_id, recipient_user_id) is
-- incompatible with reversal pairs (positive + negation share the same key),
-- so we drop it. The reconcile + reversal services enforce "only one active
-- settlement per (check_item, recipient)" at the application layer.

-- 1. Drop CASCADE FKs and recreate as RESTRICT so we cannot lose settlements
--    when a check_item or paid_check is deleted (deletes are now blocked,
--    forcing a reversal flow instead). Use DO block to drop by column instead
--    of name — Postgres truncates auto-named constraints at 63 chars and the
--    actual names are *_fkey (Postgres default) not *_fk (Drizzle convention).
DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'commission_item_settlements'::regclass
      AND c.contype = 'f'
      AND a.attname IN ('check_item_id', 'paid_check_id')
      AND c.confdeltype = 'c' -- only CASCADE FKs (skip if already RESTRICT)
  LOOP
    EXECUTE format('ALTER TABLE commission_item_settlements DROP CONSTRAINT %I', conname);
  END LOOP;
END$$;

ALTER TABLE commission_item_settlements
  ADD CONSTRAINT commission_item_settlements_check_item_id_restrict_fk
    FOREIGN KEY (check_item_id) REFERENCES commission_check_items(id) ON DELETE RESTRICT;
ALTER TABLE commission_item_settlements
  ADD CONSTRAINT commission_item_settlements_paid_check_id_restrict_fk
    FOREIGN KEY (paid_check_id) REFERENCES commission_checks(id) ON DELETE RESTRICT;

-- 2. Drop the unique constraint that prevents reversal pairs.
ALTER TABLE commission_item_settlements
  DROP CONSTRAINT IF EXISTS unique_check_item_recipient;

-- 3. Add reversal columns + computation snapshot.
ALTER TABLE commission_item_settlements
  ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverses_settlement_id uuid REFERENCES commission_item_settlements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_reason text,
  ADD COLUMN IF NOT EXISTS computation_breakdown jsonb;

-- 4. Index to make active-settlement lookups fast (replaces the dropped unique).
CREATE INDEX IF NOT EXISTS idx_commission_item_settlements_active
  ON commission_item_settlements (check_item_id, recipient_user_id)
  WHERE reverses_settlement_id IS NULL;

-- 5. Reversal row data integrity: reversal rows must reference an original.
ALTER TABLE commission_item_settlements
  ADD CONSTRAINT settlement_reversal_consistency
    CHECK (
      (is_reversal = false AND reverses_settlement_id IS NULL) OR
      (is_reversal = true  AND reverses_settlement_id IS NOT NULL)
    );

COMMENT ON COLUMN commission_item_settlements.is_reversal IS
  'true = negation row that offsets a prior settlement. Pair with reverses_settlement_id.';
COMMENT ON COLUMN commission_item_settlements.reverses_settlement_id IS
  'FK to the settlement this row reverses. NULL on positive (original) rows.';
COMMENT ON COLUMN commission_item_settlements.computation_breakdown IS
  'JSONB snapshot of formula inputs at computation time: { grossReceivedCents, embeddedTaxCents, baseCents, feeRatePercent, feeCents, distributableCents, splitPercent, agentPoolCents, collaboratorPercent, agentShareCents, agencyRetainsCents, overrides: { feeRateOverride, agentSplitOverride } }. Used for forever audit reproducibility.';
