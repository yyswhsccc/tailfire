-- ==============================================================================
-- Migration: Add template pinning columns to trip_orders
-- ==============================================================================
-- Adds template_id and template_version to trip_orders so each order can
-- snapshot which document template (and version) was used to generate it.
-- ==============================================================================

ALTER TABLE trip_orders
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES document_templates(id),
  ADD COLUMN IF NOT EXISTS template_version INTEGER;
