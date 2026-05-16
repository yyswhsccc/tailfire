-- PR-3 Commit 5 (Codex round-1 fix #5): the v_commission_position view's
-- gross_received CTE included ALL accepted received checks, then subtracted
-- only committed_payable_cents (which is restricted to departed +
-- reconciled). Result: agency_retains_cents was overstated by the gross
-- of every planning/active/inbound trip that hasn't earned anyone anything
-- yet.
--
-- Fix: filter gross_received to the same departed + reconciled population
-- that committed_payable_cents was computed against, so the subtraction
-- works on apples-to-apples buckets.
--
-- Hotfix 2026-05-16: use DROP + CREATE instead of CREATE OR REPLACE. The
-- previous definition created by migration 20260517110000 had column order
-- ending in (agency_retains_cents, total_gross_received_cents). This new
-- definition inserts standalone_reconciled_adjustments_cents BEFORE those
-- two — and Postgres rejects CREATE OR REPLACE VIEW when column position
-- changes (error 42P16: cannot change name of view column). DROP IF EXISTS
-- + CREATE sidesteps that constraint. Nothing else depends on the view yet.

DROP VIEW IF EXISTS v_commission_position;

CREATE VIEW v_commission_position AS
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
    supplier_short_cents,
    standalone_reconciled_adjustments_cents
  FROM commission_drift_snapshots
  ORDER BY agency_id, currency, recipient_user_id, snapshot_at DESC
),
gross_received AS (
  -- PR-3 Commit 5 fix: restrict to the SAME population that contributes
  -- to committed_payable_cents — departed trips with reconciled tracking.
  -- Without this filter, agency_retains_cents counted gross from
  -- planning/inbound trips that aren't payable yet.
  SELECT
    cc.agency_id,
    cc.currency,
    SUM(GREATEST(COALESCE(cci.received_cents, 0), 0))::int AS gross_received_cents
  FROM commission_check_items cci
  JOIN commission_checks cc      ON cc.id = cci.check_id
  JOIN activity_pricing ap       ON ap.id = cci.activity_pricing_id
  JOIN commission_tracking ct    ON ct.component_pricing_id = ap.id
  JOIN itinerary_activities ia   ON ia.id = ap.activity_id
  JOIN itinerary_days id_day     ON id_day.id = ia.itinerary_day_id
  JOIN itineraries i             ON i.id = id_day.itinerary_id
  JOIN trips t                   ON t.id = i.trip_id
  WHERE cc.check_type = 'received'
    AND cc.status = 'accepted'
    AND t.status IN ('travelling', 'travelled')
    AND ct.is_reconciled = true
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
  SUM(l.standalone_reconciled_adjustments_cents)::int AS standalone_reconciled_adjustments_cents,
  COALESCE(g.gross_received_cents, 0)
    - SUM(l.committed_payable_cents)::int           AS agency_retains_cents,
  COALESCE(g.gross_received_cents, 0)               AS total_gross_received_cents
FROM latest_per_recipient l
LEFT JOIN gross_received g
  ON g.agency_id = l.agency_id AND g.currency = l.currency
GROUP BY l.agency_id, l.currency, g.gross_received_cents;
