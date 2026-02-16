-- Add 'contact_document' to activity_entity_type enum for audit logging
ALTER TYPE activity_entity_type ADD VALUE IF NOT EXISTS 'contact_document';

-- Create contact_documents table
CREATE TABLE IF NOT EXISTS contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID,

  CONSTRAINT contact_documents_type_check CHECK (
    document_type IS NULL OR document_type IN (
      'passport', 'visa', 'id_document', 'travel_insurance',
      'medical', 'contract', 'invoice', 'receipt', 'authorization', 'other'
    )
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_documents_contact_id ON contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_documents_document_type ON contact_documents(document_type);

-- RLS policy: agency isolation through contacts table
ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_documents_agency_isolation ON contact_documents
  USING (EXISTS (
    SELECT 1 FROM contacts
    WHERE contacts.id = contact_documents.contact_id
    AND contacts.agency_id = current_setting('app.agency_id')::uuid
  ));
