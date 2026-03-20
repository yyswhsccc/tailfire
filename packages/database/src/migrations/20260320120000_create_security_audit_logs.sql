CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(100) NOT NULL,
  user_id UUID,
  actor_id UUID,
  agency_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_audit_logs_event ON security_audit_logs(event);
CREATE INDEX idx_security_audit_logs_agency ON security_audit_logs(agency_id);
CREATE INDEX idx_security_audit_logs_created ON security_audit_logs(created_at DESC);
CREATE INDEX idx_security_audit_logs_user ON security_audit_logs(user_id);
