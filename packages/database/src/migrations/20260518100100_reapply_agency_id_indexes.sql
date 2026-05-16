-- Re-apply: 20260201220249_add_agency_id_indexes
--
-- Drift audit 2026-05-16: idx_contacts_agency_id,
-- idx_contact_groups_agency_id, idx_contact_relationships_agency_id
-- are missing on prod despite the original migration being recorded as
-- applied in drizzle.__drizzle_migrations. Re-create idempotently.

CREATE INDEX IF NOT EXISTS idx_contacts_agency_id              ON contacts (agency_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_agency_id        ON contact_groups (agency_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_agency_id ON contact_relationships (agency_id);
