-- Create OCR Supplier Runbooks table
-- Stores per-supplier, per-document-type extraction hints for the OCR system.
-- Global scope (no agency_id) since supplier invoice formats don't vary by agency.

CREATE TABLE IF NOT EXISTS ocr_supplier_runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  extraction_hints TEXT NOT NULL,
  example_fields JSONB,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_name, document_type)
);

-- Index for quick lookup during OCR extraction
CREATE INDEX IF NOT EXISTS idx_ocr_supplier_runbooks_lookup
  ON ocr_supplier_runbooks (supplier_name, document_type);

-- Note: runbook_id column on ocr_import_jobs is created in the prior migration (20260217180000).
-- FK constraint is omitted to avoid cross-migration dependency issues within a single transaction.
