CREATE TABLE IF NOT EXISTS contact_duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  contact_id1 UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_id2 UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  match_type VARCHAR(50) NOT NULL,
  dismissed_by UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id1, contact_id2, match_type)
);
