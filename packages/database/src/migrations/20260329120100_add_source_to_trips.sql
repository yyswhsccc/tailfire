-- Add source column to trips table to distinguish admin-created vs OTA-originated trips
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'admin';
