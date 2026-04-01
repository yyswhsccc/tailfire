-- Extend trip_shares and contact_shares with reason, scope, expiry columns
-- All columns nullable — backward compatible with existing shares

-- trip_shares extensions
ALTER TABLE "trip_shares" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE "trip_shares" ADD COLUMN IF NOT EXISTS "scoped_contact_id" uuid;
ALTER TABLE "trip_shares" ADD COLUMN IF NOT EXISTS "granted_by" uuid;
ALTER TABLE "trip_shares" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

-- contact_shares extensions
ALTER TABLE "contact_shares" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE "contact_shares" ADD COLUMN IF NOT EXISTS "granted_by" uuid;
ALTER TABLE "contact_shares" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
