-- 20260320120200_create_impersonation_sessions.sql
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_imp_admin_active ON impersonation_sessions(admin_user_id)
  WHERE ended_at IS NULL;
CREATE INDEX idx_imp_target ON impersonation_sessions(target_user_id);
CREATE INDEX idx_imp_agency ON impersonation_sessions(agency_id);
