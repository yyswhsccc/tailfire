-- Add 'open_ai' to api_provider enum
ALTER TYPE api_provider ADD VALUE IF NOT EXISTS 'open_ai';

-- Create ocr_import_jobs table for preview persistence and async job tracking
CREATE TABLE IF NOT EXISTS ocr_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  user_id uuid NOT NULL,

  -- Job status
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'preview_ready', 'confirmed', 'failed')),

  -- File info
  file_storage_path text,
  file_name varchar(255),
  file_mime_type varchar(100),

  -- Document type
  detected_document_type varchar(50),
  confirmed_document_type varchar(50),

  -- Result references (populated on confirm)
  trip_id uuid,
  contact_id uuid,
  activity_id uuid,

  -- Extraction data (JSONB)
  extraction_result jsonb,
  enriched_result jsonb,

  -- Error tracking
  error_message text,

  -- Token usage and model info
  tokens_prompt integer,
  tokens_completion integer,
  model varchar(50),
  prompt_version varchar(20) DEFAULT '1.0',

  -- Runbook traceability (FK added after ocr_supplier_runbooks is created)
  runbook_id uuid,

  -- Performance tracking
  processing_time_ms integer,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ocr_import_jobs_agency_id ON ocr_import_jobs(agency_id);
CREATE INDEX IF NOT EXISTS idx_ocr_import_jobs_status ON ocr_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ocr_import_jobs_user_created ON ocr_import_jobs(user_id, created_at DESC);

-- Comments
COMMENT ON TABLE ocr_import_jobs IS 'OCR document import jobs — stores preview data, extraction results, and async job state';
COMMENT ON COLUMN ocr_import_jobs.extraction_result IS 'Raw GPT-4o extraction result (JSONB) for debugging and replay';
COMMENT ON COLUMN ocr_import_jobs.enriched_result IS 'Post-enrichment result (after AeroDataBox/Google Places augmentation)';
COMMENT ON COLUMN ocr_import_jobs.prompt_version IS 'Version of the extraction prompt used — for reproducibility';
