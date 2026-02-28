-- Create document_templates table
CREATE TABLE IF NOT EXISTS document_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               UUID REFERENCES agencies(id),
  parent_id               UUID REFERENCES document_templates(id),
  parent_version          INTEGER,

  slug                    VARCHAR(100) NOT NULL,
  name                    VARCHAR(255) NOT NULL,
  description             TEXT,
  category                VARCHAR(50) NOT NULL,

  blocks_json             JSONB NOT NULL DEFAULT '{"blocks":[]}',

  email_html              TEXT,
  email_css               TEXT,
  pdf_html                TEXT,
  pdf_css                 TEXT,
  subject_template        TEXT,
  text_template           TEXT,

  variables               JSONB,
  output_types            TEXT[] NOT NULL DEFAULT '{email}',

  status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at            TIMESTAMPTZ,
  version                 INTEGER NOT NULL DEFAULT 1,
  is_active               BOOLEAN NOT NULL DEFAULT true,

  created_by              UUID,
  updated_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System templates: slug must be unique (one system template per slug)
CREATE UNIQUE INDEX idx_document_templates_system_slug
  ON document_templates (slug)
  WHERE agency_id IS NULL;

-- Agency templates: slug unique per agency
CREATE UNIQUE INDEX idx_document_templates_agency_slug
  ON document_templates (agency_id, slug)
  WHERE agency_id IS NOT NULL;

-- General indexes
CREATE INDEX idx_document_templates_agency_id ON document_templates (agency_id);
CREATE INDEX idx_document_templates_category ON document_templates (category);
CREATE INDEX idx_document_templates_status ON document_templates (status);
CREATE INDEX idx_document_templates_parent_id ON document_templates (parent_id);

-- Enable RLS
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
