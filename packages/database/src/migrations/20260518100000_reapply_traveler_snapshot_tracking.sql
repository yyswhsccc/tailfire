-- Re-apply: 20260131032251_add_traveler_snapshot_tracking
--
-- Prod ↔ preview DB drift audit (2026-05-16) discovered that
-- trip_travelers.snapshot_updated_at and .contact_deleted_at do NOT
-- exist on prod, even though the original migration is recorded as
-- applied in drizzle.__drizzle_migrations on both DBs with identical
-- content hashes. Most likely cause: manual schema action on prod
-- outside the migration system at some point.
--
-- Per Codex review: re-apply via additive, idempotent migration. The
-- ADD/UPDATE/ALTER order matters — adding the column with DEFAULT NOW()
-- populates existing rows immediately, which would make the backfill
-- a no-op (WHERE snapshot_updated_at IS NULL would match zero rows).
-- Fix: add the column with NO default first, run the backfill, then
-- attach the default for future inserts.

ALTER TABLE trip_travelers
  ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_deleted_at TIMESTAMPTZ;

UPDATE trip_travelers
SET snapshot_updated_at = updated_at
WHERE snapshot_updated_at IS NULL;

ALTER TABLE trip_travelers
  ALTER COLUMN snapshot_updated_at SET DEFAULT NOW();
