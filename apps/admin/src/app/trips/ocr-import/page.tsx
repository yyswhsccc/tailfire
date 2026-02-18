'use client'

import { useState, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { useTrip } from '@/hooks/use-trips'
import { OcrUploadForm } from './_components/ocr-upload-form'
import { OcrPreview } from './_components/ocr-preview'
import { OcrProcessingStatus } from './_components/ocr-processing-status'
import type { OcrPreviewResponse, OcrJobStatusResponse } from '@tailfire/shared-types'

type Step = 'upload' | 'processing' | 'preview'

function OcrImportContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const existingTripId = searchParams.get('tripId') || undefined
  const existingContactId = searchParams.get('contactId') || undefined

  const [step, setStep] = useState<Step>('upload')
  const [previewData, setPreviewData] = useState<OcrPreviewResponse | null>(null)
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)

  const { data: existingTrip } = useTrip(existingTripId || null, {
    enabled: !!existingTripId,
  })

  const handleUploadResult = useCallback((result: OcrPreviewResponse | OcrJobStatusResponse) => {
    if ('extraction' in result && result.status === 'preview_ready') {
      setPreviewData(result as OcrPreviewResponse)
      setStep('preview')
    } else {
      setProcessingJobId((result as OcrJobStatusResponse).jobId)
      setStep('processing')
    }
  }, [])

  const handleProcessingComplete = useCallback((preview: OcrPreviewResponse) => {
    setPreviewData(preview)
    setProcessingJobId(null)
    setStep('preview')
  }, [])

  const handleBack = useCallback(() => {
    setStep('upload')
    setPreviewData(null)
    setProcessingJobId(null)
  }, [])

  const handleConfirmSuccess = useCallback((tripId: string | null, contactId: string | null) => {
    if (tripId) {
      router.push(`/trips/${tripId}?tab=itinerary`)
    } else if (contactId) {
      router.push(`/contacts/${contactId}`)
    } else {
      router.push('/trips')
    }
  }, [router])

  const isPassportContext = !!existingContactId
  const description = isPassportContext
    ? 'Scan a passport or travel document for this contact'
    : existingTripId
      ? `Import a document into ${existingTrip?.name || 'this trip'}`
      : 'Upload a PDF booking confirmation or travel document to extract and import data'

  return (
    <DashboardLayout>
      <PageHeader
        title="Import Document"
        description={description}
      />

      <div className="mt-6">
        {step === 'upload' && (
          <OcrUploadForm
            tripId={existingTripId}
            contactId={existingContactId}
            onResult={handleUploadResult}
          />
        )}

        {step === 'processing' && processingJobId && (
          <OcrProcessingStatus
            jobId={processingJobId}
            onComplete={handleProcessingComplete}
            onBack={handleBack}
          />
        )}

        {step === 'preview' && previewData && (
          <OcrPreview
            preview={previewData}
            existingTripId={existingTripId}
            existingTripName={existingTrip?.name}
            existingContactId={existingContactId}
            onBack={handleBack}
            onConfirmSuccess={handleConfirmSuccess}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default function OcrImportPage() {
  return (
    <Suspense>
      <OcrImportContent />
    </Suspense>
  )
}
