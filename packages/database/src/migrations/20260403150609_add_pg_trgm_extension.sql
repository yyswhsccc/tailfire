CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gist (
    (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) gist_trgm_ops
  );
