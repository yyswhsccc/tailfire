-- Re-apply: 20260304110000_commission_system (the ALTER TABLE
-- commission_tracking block that adds 8 *_cents columns)
--
-- Drift audit 2026-05-16: dev's commission_tracking is missing 8
-- columns originally added by 20260304110000_commission_system in its
-- "extend commission_tracking with denormalized money buckets" section.
-- The original migration is recorded as applied in dev's
-- drizzle.__drizzle_migrations, but the ADD COLUMN block clearly did
-- not take effect (same failure shape as the prod drift fixed by the
-- 20260518100000-200 series).
--
-- This migration is idempotent: ADD COLUMN IF NOT EXISTS makes it a
-- safe no-op on prod and preview, where the columns already exist
-- with identical definitions.
--
-- Definitions are copy-pasted from the original migration to ensure
-- type / default / CHECK constraint parity.

ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS gross_commission_cents INTEGER CHECK (gross_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS tax_amount_cents       INTEGER DEFAULT 0 CHECK (tax_amount_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS net_commission_cents   INTEGER CHECK (net_commission_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_cents         INTEGER DEFAULT 0 CHECK (received_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS paid_cents             INTEGER DEFAULT 0 CHECK (paid_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS adjustment_cents       INTEGER DEFAULT 0;
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS received_parent_cents  INTEGER DEFAULT 0 CHECK (received_parent_cents >= 0);
ALTER TABLE commission_tracking ADD COLUMN IF NOT EXISTS platform_fee_cents     INTEGER DEFAULT 0;
