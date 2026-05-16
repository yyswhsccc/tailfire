-- PR-3 Drift + reports: commission_drift_snapshots
--
-- Append-only point-in-time row per (agency, currency, recipient) capturing
-- the bucketed reconciliation state of the IC v2 commission pipeline.
--
-- All bucket values are in AGENT-SHARE CENTS (post-formula) — computed by
-- CommissionDriftService via commission-formula's computeAgentShare. The
-- view v_commission_position (added in a later migration) is a thin
-- aggregate over this table at (agency, currency) grain.
--
-- Drift invariant (per row, locked by Codex round-2 plan validation):
--   committed_payable_cents
--   - in_flight_reconciled_unsettled_cents
--   - adjustments_reconciled_cents
--   - settled_active_cents
--   = 0
-- Any non-zero result is `true_drift_cents` and pages via Sentry.
--
-- `reversal_pair_imbalance` is a SEPARATE integrity alarm — original +
-- reversal rows should always net to zero; non-zero = orphan reversal or
-- mismatched negation. Page with its own fingerprint.

CREATE TABLE IF NOT EXISTS commission_drift_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  currency varchar(3) NOT NULL,
  recipient_user_id uuid NOT NULL,

  snapshot_at timestamp with time zone NOT NULL DEFAULT now(),

  -- Alert-formula buckets (all agent-share cents)
  committed_payable_cents integer NOT NULL DEFAULT 0,
  in_flight_reconciled_unsettled_cents integer NOT NULL DEFAULT 0,
  settled_active_cents integer NOT NULL DEFAULT 0,
  adjustments_reconciled_cents integer NOT NULL DEFAULT 0,
  true_drift_cents integer NOT NULL DEFAULT 0,

  -- Integrity bucket (separate alarm)
  settled_reversed_pair_net_cents integer NOT NULL DEFAULT 0,
  reversal_pair_imbalance integer NOT NULL DEFAULT 0,

  -- Visibility-only buckets (never enter the alert formula)
  unreconciled_committed_cents integer NOT NULL DEFAULT 0,
  pending_adjustments_cents integer NOT NULL DEFAULT 0,
  supplier_short_cents integer NOT NULL DEFAULT 0,

  -- Sentry coordination
  sentry_alert_fired boolean NOT NULL DEFAULT false,
  sentry_event_id text
);

-- Latest-snapshot lookups: pulled per (agency, currency) ORDER BY snapshot_at DESC LIMIT 1.
CREATE INDEX IF NOT EXISTS idx_commission_drift_snapshots_latest
  ON commission_drift_snapshots (agency_id, currency, snapshot_at DESC);

-- Per-recipient drilldown
CREATE INDEX IF NOT EXISTS idx_commission_drift_snapshots_recipient
  ON commission_drift_snapshots (agency_id, recipient_user_id, snapshot_at DESC);

-- Only-non-zero-drift listing
CREATE INDEX IF NOT EXISTS idx_commission_drift_snapshots_nonzero
  ON commission_drift_snapshots (agency_id, snapshot_at DESC)
  WHERE true_drift_cents != 0 OR reversal_pair_imbalance != 0;

COMMENT ON TABLE commission_drift_snapshots IS
  'PR-3: per-(agency, currency, recipient) snapshot of the commission reconciliation state. Append-only, forever retention. Written by CommissionDriftService on a 6h cadence (setInterval, not BullMQ — Upstash limitation). The v_commission_position view aggregates over this table.';

COMMENT ON COLUMN commission_drift_snapshots.true_drift_cents IS
  'Locked formula (Codex round-2 plan validation): committed_payable - in_flight - adjustments_reconciled - settled_active. Any non-zero = real bug, pages via Sentry with fingerprint commission_drift_${agency_id}_${currency}.';

COMMENT ON COLUMN commission_drift_snapshots.reversal_pair_imbalance IS
  'Separate integrity alarm. Original + reversal rows should always net to zero; non-zero = orphan or mismatched negation. Sentry fingerprint commission_reversal_imbalance_${agency_id}_${currency}.';
