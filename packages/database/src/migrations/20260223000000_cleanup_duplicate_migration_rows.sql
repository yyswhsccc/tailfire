-- Cleanup duplicate rows in __drizzle_migrations tracking table
-- caused by journal timestamp reordering during branch merge.
--
-- The 5 client-portal migrations (originally from PR #15) were applied
-- twice: once with old timestamps and once with corrected timestamps.
-- Remove the old duplicate entries to keep the count consistent.
-- Idempotent: safe to re-run.

DELETE FROM drizzle.__drizzle_migrations
WHERE created_at IN (
  1771451400000,
  1771451401000,
  1771451402000,
  1771451403000,
  1771451404000
);
