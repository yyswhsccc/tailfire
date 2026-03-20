CREATE TABLE IF NOT EXISTS contact_share_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csr_contact ON contact_share_requests(contact_id);
CREATE INDEX idx_csr_owner_status ON contact_share_requests(owner_id, status);
CREATE INDEX idx_csr_requester ON contact_share_requests(requester_id);
CREATE INDEX idx_csr_agency ON contact_share_requests(agency_id);

-- Prevent duplicate pending requests for the same contact + requester pair
CREATE UNIQUE INDEX idx_csr_unique_pending
  ON contact_share_requests(contact_id, requester_id)
  WHERE status = 'pending';
