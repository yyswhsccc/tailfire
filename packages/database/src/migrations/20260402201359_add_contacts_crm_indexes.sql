-- Indexes for Contacts CRM Portal computed fields
-- nextTrip batch query: trip_travelers.contact_id
CREATE INDEX IF NOT EXISTS idx_trip_travelers_contact_id
  ON trip_travelers(contact_id);

-- relationshipCount batch query: contact_relationships.contact_id1/contact_id2
CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id1
  ON contact_relationships(contact_id1);

CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id2
  ON contact_relationships(contact_id2);
