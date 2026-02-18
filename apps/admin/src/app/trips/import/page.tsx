'use client'

import { useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { useTrip } from '@/hooks/use-trips'
import { ImportSourceForm, type ImportFormState } from './_components/import-source-form'
import { BookingPreview } from './_components/booking-preview'
import { OcrPreview } from '../ocr-import/_components/ocr-preview'
import { OcrProcessingStatus } from '../ocr-import/_components/ocr-processing-status'
import type { ImportPreviewResponse, ImportPreviewRequest } from '@/types/import-booking.types'
import type { OcrPreviewResponse, OcrJobStatusResponse } from '@tailfire/shared-types'

type Step = 'input' | 'preview' | 'ocr-preview' | 'ocr-processing'

function ImportBookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const existingTripId = searchParams.get('tripId') || undefined

  const [step, setStep] = useState<Step>('input')

  // Cruise API state
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [previewRequest, setPreviewRequest] = useState<ImportPreviewRequest | null>(null)

  // OCR state
  const [ocrPreviewData, setOcrPreviewData] = useState<OcrPreviewResponse | null>(null)
  const [ocrJobId, setOcrJobId] = useState<string | null>(null)

  // Hoisted form state so it persists across back navigation
  const [formState, setFormState] = useState<ImportFormState>({
    cruiseLineId: null,
    bookingRef: '',
    currency: 'CAD',
  })

  // Fetch existing trip name if adding to a trip
  const { data: existingTrip } = useTrip(existingTripId || null, {
    enabled: !!existingTripId,
  })

  const handlePreviewSuccess = (data: ImportPreviewResponse, request: ImportPreviewRequest) => {
    setPreviewData(data)
    setPreviewRequest(request)
    setStep('preview')
  }

  const handlePdfResult = useCallback((result: OcrPreviewResponse | OcrJobStatusResponse) => {
    if ('extraction' in result && result.status === 'preview_ready') {
      setOcrPreviewData(result as OcrPreviewResponse)
      setStep('ocr-preview')
    } else {
      setOcrJobId((result as OcrJobStatusResponse).jobId)
      setStep('ocr-processing')
    }
  }, [])

  const handleOcrProcessingComplete = useCallback((preview: OcrPreviewResponse) => {
    setOcrPreviewData(preview)
    setOcrJobId(null)
    setStep('ocr-preview')
  }, [])

  const handleBack = () => {
    setStep('input')
  }

  const handleConfirmSuccess = (tripId: string) => {
    router.push(`/trips/${tripId}?tab=itinerary`)
  }

  const handleOcrConfirmSuccess = useCallback((tripId: string | null, contactId: string | null) => {
    if (tripId) {
      router.push(`/trips/${tripId}?tab=itinerary`)
    } else if (contactId) {
      router.push(`/contacts/${contactId}`)
    } else {
      router.push('/trips')
    }
  }, [router])

  return (
    <DashboardLayout>
      <PageHeader
        title="Import Booking"
        description={
          existingTripId
            ? `Import a booking into ${existingTrip?.name || 'this trip'}`
            : 'Import a booking from a supplier API or PDF confirmation'
        }
      />

      <div className="mt-6">
        {step === 'input' && (
          <ImportSourceForm
            onPreviewSuccess={handlePreviewSuccess}
            onPdfResult={handlePdfResult}
            isLoading={false}
            formState={formState}
            onFormStateChange={setFormState}
            tripId={existingTripId}
          />
        )}

        {step === 'preview' && previewData && previewRequest && (
          <BookingPreview
            preview={previewData}
            request={previewRequest}
            existingTripId={existingTripId}
            existingTripName={existingTrip?.name}
            onBack={handleBack}
            onConfirmSuccess={handleConfirmSuccess}
          />
        )}

        {step === 'ocr-processing' && ocrJobId && (
          <OcrProcessingStatus
            jobId={ocrJobId}
            onComplete={handleOcrProcessingComplete}
            onBack={handleBack}
          />
        )}

        {step === 'ocr-preview' && ocrPreviewData && (
          <OcrPreview
            preview={ocrPreviewData}
            existingTripId={existingTripId}
            existingTripName={existingTrip?.name}
            onBack={handleBack}
            onConfirmSuccess={handleOcrConfirmSuccess}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default function ImportBookingPage() {
  return (
    <Suspense>
      <ImportBookingContent />
    </Suspense>
  )
}
