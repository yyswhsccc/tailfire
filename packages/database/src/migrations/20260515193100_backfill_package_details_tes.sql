-- ============================================================================
-- Backfill package_details for 2026-03-23 TES import
-- ============================================================================
--
-- The 2026-03-23 TES import created 202 packages with stub package_details
-- rows (likely from a default trigger on activity_type='package' insert) but
-- left supplier_id, supplier_name, and cancellation_policy NULL. The original
-- importer did not pass a packageDetails block at create time.
--
-- P1.B + P2.B (PRs #407 + #409) fix this for future imports. This migration
-- backfills the existing data on tf-demo and is a safety net for any prod
-- rows that slip through at cutover.
--
-- Supplier resolution is via the package activity NAME, which the importer
-- creates as "${TourOperatorName} Package" (see import-to-tailfire.ts:1091).
-- Stripping the " Package" suffix and matching against suppliers.name covers
-- 199 of 200 packages on tf-demo. The 1 unmatched row keeps NULL supplier_id
-- but still gets a populated cancellation_policy.
--
-- Note: activity_suppliers is empty on tf-demo (Step 10 of importer did not
-- run successfully during the 2026-03-23 import — tracked separately, not
-- addressed here). That's why we resolve via name lookup rather than the
-- activity_suppliers join.
--
-- See docs/runbooks/tes-cutover-backfill-plan.md (P5.A item 3 / #31)
--
-- Idempotent: only touches rows where the target field is NULL/empty.
-- ============================================================================

UPDATE package_details pd
SET
  supplier_id = COALESCE(
    pd.supplier_id,
    (
      SELECT s.id
      FROM itinerary_activities ia
      JOIN suppliers s ON s.name = regexp_replace(ia.name, ' Package$', '')
      WHERE ia.id = pd.activity_id
        AND ia.activity_type = 'package'
        AND ia.name LIKE '% Package'
      LIMIT 1
    )
  ),
  supplier_name = COALESCE(
    NULLIF(pd.supplier_name, ''),
    (
      SELECT regexp_replace(ia.name, ' Package$', '')
      FROM itinerary_activities ia
      WHERE ia.id = pd.activity_id
        AND ia.activity_type = 'package'
        AND ia.name LIKE '% Package'
    )
  ),
  cancellation_policy = COALESCE(
    pd.cancellation_policy,
    'Per tour operator terms; subject to bundle restrictions.'
  ),
  updated_at = NOW()
WHERE pd.supplier_id IS NULL
   OR pd.supplier_name IS NULL
   OR pd.supplier_name = ''
   OR pd.cancellation_policy IS NULL;
