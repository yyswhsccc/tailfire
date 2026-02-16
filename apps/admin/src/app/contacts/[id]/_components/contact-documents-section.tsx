'use client'

import { DocumentUploader } from '@/components/document-uploader'

const CONTACT_DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'visa', label: 'Visa' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'travel_insurance', label: 'Travel Insurance' },
  { value: 'medical', label: 'Medical Info' },
  { value: 'contract', label: 'Contract' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'authorization', label: 'Authorization Form' },
  { value: 'other', label: 'Other' },
]

export function ContactDocumentsSection({ contactId }: { contactId: string }) {
  return (
    <DocumentUploader
      resourceId={contactId}
      endpointPath="/contacts/{id}/documents"
      queryKey={['contact-documents', contactId]}
      documentTypes={CONTACT_DOCUMENT_TYPES}
    />
  )
}
