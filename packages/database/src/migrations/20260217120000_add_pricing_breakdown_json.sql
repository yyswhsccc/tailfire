-- Add pricing_breakdown_json column to activity_pricing
-- Stores per-person or per-unit pricing breakdown as JSONB array
-- Structure: [{label, priceCents, travelerId?}]

ALTER TABLE activity_pricing
ADD COLUMN pricing_breakdown_json jsonb DEFAULT NULL;

COMMENT ON COLUMN activity_pricing.pricing_breakdown_json IS
  'Per-person or per-unit pricing breakdown. Array of {label, priceCents, travelerId?}';
