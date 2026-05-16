-- PR-1 Commission Foundation: per-entity history tables (forever retention)
--
-- App-only audit: commission services explicitly call
-- CommissionAuditService.writeHistory(...) on every mutation. NO Postgres
-- triggers (Codex round-2 concession — Phoenix threat model defends against
-- regulators / disputes, not malicious devs with psql access).
--
-- All FKs use ON DELETE NO ACTION + NULLability to preserve history even
-- if the parent entity were hard-deleted (which our code now forbids via
-- reversal pattern + immutability trigger).

-- Helper macro thoughts: each table follows the same shape. Inlined for clarity.

CREATE TABLE IF NOT EXISTS commission_check_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_check_history_entity ON commission_check_history (entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_check_history_agency ON commission_check_history (agency_id, changed_at DESC);
COMMENT ON TABLE commission_check_history IS 'Forever-retention change log for commission_checks. Written via app-only CommissionAuditService.writeHistory.';

CREATE TABLE IF NOT EXISTS commission_check_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  parent_check_id uuid,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_check_item_history_entity ON commission_check_item_history (entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_check_item_history_check ON commission_check_item_history (parent_check_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS commission_item_settlement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  check_item_id uuid,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_item_settlement_history_entity ON commission_item_settlement_history (entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_item_settlement_history_item ON commission_item_settlement_history (check_item_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS commission_adjustment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_adjustment_history_entity ON commission_adjustment_history (entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_adjustment_history_agency ON commission_adjustment_history (agency_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS commission_tracking_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  activity_pricing_id uuid,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_tracking_history_entity ON commission_tracking_history (entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_tracking_history_activity ON commission_tracking_history (activity_pricing_id, changed_at DESC);

-- Scoped to commission-affecting fields on activity_pricing
-- (priceCents, costCents, taxRate, taxType, commissionRate, etc.) only.
CREATE TABLE IF NOT EXISTS activity_pricing_commission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_pricing_commission_history_entity ON activity_pricing_commission_history (entity_id, changed_at DESC);

-- trip_settings_history covers both:
--   scope = 'trip'         → trips.commission_fee_rate_override
--   scope = 'collaborator' → trip_collaborators.{commission_percentage, agent_split_override, role, is_active}
-- scope_id holds the trip_id or trip_collaborator.id respectively.
CREATE TABLE IF NOT EXISTS trip_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  scope varchar(20) NOT NULL,
  scope_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  user_agent text,
  reason text,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trip_settings_history_scope_chk CHECK (scope IN ('trip', 'collaborator'))
);
CREATE INDEX IF NOT EXISTS idx_trip_settings_history_trip ON trip_settings_history (trip_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_settings_history_scope ON trip_settings_history (scope, scope_id, changed_at DESC);
COMMENT ON TABLE trip_settings_history IS 'Audit trail for commission-affecting trip settings: fee rate override + collaborator splits/overrides.';
