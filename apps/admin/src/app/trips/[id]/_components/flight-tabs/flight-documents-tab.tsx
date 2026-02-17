'use client'

import { DocumentUploader } from '@/components/document-uploader'

interface FlightDocumentsTabProps {
  componentId?: string
}

export function FlightDocumentsTab({ componentId }: FlightDocumentsTabProps) {
  // Show message if creating a new flight (no componentId yet)
  if (!componentId) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ash-900">Documents & Files</h3>
          <div className="rounded-lg border-2 border-dashed border-ash-300 p-8 text-center">
            <p className="text-sm text-ash-600">
              Save this flight first to upload documents.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ash-900">Documents & Files</h3>
        <DocumentUploader
          componentId={componentId}
          componentType="flight"
          excludeTypes={['cabin_image', 'media_image']}
        />
      </div>

      <div className="rounded-lg bg-ash-50 p-4">
        <p className="text-sm text-ash-600">
          <strong>Supported Documents:</strong>
        </p>
        <ul className="list-disc list-inside text-sm text-ash-600 mt-2 space-y-1">
          <li>E-tickets and boarding passes (PDF)</li>
          <li>Flight confirmation emails</li>
          <li>Travel insurance documents</li>
          <li>Baggage receipts</li>
        </ul>
      </div>
    </div>
  )
}
