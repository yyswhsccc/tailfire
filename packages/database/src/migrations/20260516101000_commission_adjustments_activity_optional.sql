-- PR-1 Commission Foundation: adjustments scoping + opt-in flag
--
-- activity_pricing_id: optional FK to scope an adjustment to a specific
-- booking (vs trip-level or agent-level). NULL preserves existing behavior.
--
-- is_optional: explicit IC opt-in flag. Today IC v2 infers opt-in from
-- amount sign (positive = opt-in, negative = auto-include). This column
-- lets admins flag NEGATIVE adjustments as optional too, for the rare
-- "agent disputed it, holding pending" case.

ALTER TABLE commission_adjustments
  ADD COLUMN IF NOT EXISTS activity_pricing_id uuid
    REFERENCES activity_pricing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_activity_pricing
  ON commission_adjustments (activity_pricing_id)
  WHERE activity_pricing_id IS NOT NULL;

COMMENT ON COLUMN commission_adjustments.activity_pricing_id IS
  'Optional scope: which activity_pricing row this adjustment relates to. NULL = trip/agent-level adjustment.';
COMMENT ON COLUMN commission_adjustments.is_optional IS
  'When true, the IC must opt in to this adjustment at claim time. Default false: amount > 0 still infers opt-in via IC v2 logic, but is_optional overrides for ambiguous cases.';
