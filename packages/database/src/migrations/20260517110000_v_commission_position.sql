-- PR-3 Drift + reports: v_commission_position view
--
-- Thin aggregate over commission_drift_snapshots at (agency_id, currency)
-- grain. Returns the LATEST snapshot per (agency, currency, recipient)
-- and SUMs them up across recipients to get the agency-wide bucket totals.
--
-- agency_retains_cents is the only field that is NOT directly summed from
-- snapshot rows: it's derived per Codex round-2 plan validation as
--   SUM(gross_received_cents per check_item)
--   - SUM(committed_payable_cents across all recipients)
-- The gross_received aggregate is a simple SUM against source tables —
-- NOT a formula re-implementation (the agent-share computation stays
-- exclusively in commission-formula.ts per CLAUDE.md / Codex doctrine).
--
-- Drift invariant exposed on the view: true_drift_cents = 0 means clean.
-- Reversal pair imbalance exposed separately.

CREATE OR REPLACE VIEW v_commission_position AS
WITH latest_per_recipient AS (
  SELECT DISTINCT ON (agency_id, currency, recipient_user_id)
    agency_id,
    currency,
    recipient_user_id,
    snapshot_at,
    committed_payable_cents,
    in_flight_reconciled_unsettled_cents,
    settled_active_cents,
    adjustments_reconciled_cents,
    true_drift_cents,
    settled_reversed_pair_net_cents,
    reversal_pair_imbalance,
    unreconciled_committed_cents,
    pending_adjustments_cents,
    supplier_short_cents
  FROM commission_drift_snapshots
  ORDER BY agency_id, currency, recipient_user_id, snapshot_at DESC
),
gross_received AS (
  SELECT
    cc.agency_id,
    cc.currency,
    SUM(GREATEST(COALESCE(cci.received_cents, 0), 0))::int AS gross_received_cents
  FROM commission_check_items cci
  JOIN commission_checks cc ON cc.id = cci.check_id
  WHERE cc.check_type = 'received'
    AND cc.status = 'accepted'
  GROUP BY cc.agency_id, cc.currency
)
SELECT
  l.agency_id,
  l.currency,
  MAX(l.snapshot_at)                                AS latest_snapshot_at,
  COUNT(DISTINCT l.recipient_user_id)               AS recipient_count,
  SUM(l.committed_payable_cents)::int               AS committed_payable_cents,
  SUM(l.in_flight_reconciled_unsettled_cents)::int  AS in_flight_reconciled_unsettled_cents,
  SUM(l.settled_active_cents)::int                  AS settled_active_cents,
  SUM(l.adjustments_reconciled_cents)::int          AS adjustments_reconciled_cents,
  SUM(l.true_drift_cents)::int                      AS true_drift_cents,
  SUM(l.settled_reversed_pair_net_cents)::int       AS settled_reversed_pair_net_cents,
  SUM(l.reversal_pair_imbalance)::int               AS reversal_pair_imbalance,
  SUM(l.unreconciled_committed_cents)::int          AS unreconciled_committed_cents,
  SUM(l.pending_adjustments_cents)::int             AS pending_adjustments_cents,
  SUM(l.supplier_short_cents)::int                  AS supplier_short_cents,
  -- agency_retains_cents per Codex round-2: gross supplier $ minus
  -- what's payable to all collaborators. Stays in agent-share cents
  -- math; the formula itself isn't re-implemented in SQL.
  COALESCE(g.gross_received_cents, 0)
    - SUM(l.committed_payable_cents)::int           AS agency_retains_cents,
  COALESCE(g.gross_received_cents, 0)               AS total_gross_received_cents
FROM latest_per_recipient l
LEFT JOIN gross_received g
  ON g.agency_id = l.agency_id AND g.currency = l.currency
GROUP BY l.agency_id, l.currency, g.gross_received_cents;

COMMENT ON VIEW v_commission_position IS
  'PR-3: per-(agency, currency) reconciliation position from the latest commission_drift_snapshots row per recipient. true_drift_cents != 0 = real bug; reversal_pair_imbalance != 0 = orphan reversal. Both alerts already fired by CommissionDriftService at snapshot time — the view is for ad-hoc admin queries + the operator-facing /commission/reports endpoints.';
