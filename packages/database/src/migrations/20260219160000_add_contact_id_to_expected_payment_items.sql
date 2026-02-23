-- Add contact_id to expected_payment_items
-- Links an expected payment item to a specific contact/passenger (payer)
-- Nullable: not all payments need to be assigned to a specific contact

ALTER TABLE expected_payment_items
  ADD COLUMN contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Index for contact payment history lookup
CREATE INDEX idx_expected_payment_items_contact_id
  ON expected_payment_items(contact_id)
  WHERE contact_id IS NOT NULL;

-- RLS: The existing RLS policies on expected_payment_items use agency_id,
-- so no new policies are needed. The contact_id is just an optional FK.
