-- Backfill commission_checks.sender_supplier_id from sender_name (#297 follow-up)
--
-- TES-imported received-type checks have free-text sender_name but no FK to
-- suppliers.id. This backfill uses pg_trgm similarity to link rows where the
-- sender_name exactly (or near-exactly) matches a supplier name.
--
-- Threshold: similarity >= 0.8 (validated empirically on Preview — every
-- match at this threshold was a true match, no false positives). Rows whose
-- best match falls below 0.8 are left unlinked for manual review.
--
-- Verified on Tailfire-Preview (2026-05-14):
--   - 140 unlinked received_checks across 33 distinct sender_names
--   - 137 linked at threshold 0.8 (all similarity 1.0 — exact matches)
--   - 3 left unlinked ("764274 Ontario Inc" — Ontario corp number, no obvious supplier)
--
-- Run on Prod AFTER the TES cutover (W1-W5 in project_tes_commission_mapping.md).
-- Idempotent: only touches rows where sender_supplier_id IS NULL.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/migration/backfill-sender-supplier-id.sql

BEGIN;

-- Confirm pg_trgm is installed (it should be — extension migration is older).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pre-state report
SELECT
  count(*) AS total_received,
  count(*) FILTER (WHERE sender_supplier_id IS NOT NULL) AS already_linked,
  count(*) FILTER (WHERE sender_supplier_id IS NULL AND sender_name IS NOT NULL AND sender_name <> '') AS unlinked_with_name,
  count(*) FILTER (WHERE sender_supplier_id IS NULL AND (sender_name IS NULL OR sender_name = '')) AS no_data
FROM commission_checks
WHERE check_type = 'received';

-- Apply
WITH matches AS (
  SELECT
    c.id AS check_id,
    s.id AS supplier_id,
    s.name AS supplier_name,
    similarity(s.name, c.sender_name) AS sim,
    row_number() OVER (PARTITION BY c.id ORDER BY similarity(s.name, c.sender_name) DESC) AS rn
  FROM commission_checks c
  CROSS JOIN suppliers s
  WHERE c.check_type = 'received'
    AND c.sender_supplier_id IS NULL
    AND c.sender_name IS NOT NULL AND c.sender_name <> ''
    AND similarity(s.name, c.sender_name) >= 0.8
)
UPDATE commission_checks c
SET sender_supplier_id = m.supplier_id
FROM matches m
WHERE c.id = m.check_id AND m.rn = 1 AND m.sim >= 0.8;

-- Post-state report
SELECT
  count(*) AS total_received,
  count(*) FILTER (WHERE sender_supplier_id IS NOT NULL) AS linked,
  count(*) FILTER (WHERE sender_supplier_id IS NULL AND sender_name IS NOT NULL AND sender_name <> '') AS still_unlinked
FROM commission_checks
WHERE check_type = 'received';

-- Show whatever's still unlinked so a human can decide whether to create new
-- supplier rows or leave them as text.
SELECT sender_name, count(*) AS occurrences
FROM commission_checks
WHERE check_type = 'received'
  AND sender_supplier_id IS NULL
  AND sender_name IS NOT NULL AND sender_name <> ''
GROUP BY sender_name
ORDER BY occurrences DESC, sender_name;

COMMIT;
