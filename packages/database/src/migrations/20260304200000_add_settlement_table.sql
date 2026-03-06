-- Commission Item Settlements
-- Row-level settlement marker at (check_item, agent) granularity.
-- Prevents double-pay on concurrent payAgents() calls via
-- INSERT ... ON CONFLICT DO NOTHING RETURNING.

CREATE TABLE commission_item_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_item_id UUID NOT NULL REFERENCES commission_check_items(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES user_profiles(id),
  paid_check_id UUID NOT NULL REFERENCES commission_checks(id) ON DELETE CASCADE,
  settled_amount_cents INTEGER NOT NULL CHECK (settled_amount_cents >= 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(check_item_id, recipient_user_id)
);

CREATE INDEX idx_settlements_recipient ON commission_item_settlements(recipient_user_id);
CREATE INDEX idx_settlements_paid_check ON commission_item_settlements(paid_check_id);
