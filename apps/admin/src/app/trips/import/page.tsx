'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { useTrip } from '@/hooks/use-trips'
import { ImportSourceForm, type ImportFormState } from './_components/import-source-form'
import { BookingPreview } from './_components/booking-preview'
import type { ImportPreviewResponse, ImportPreviewRequest } from '@/types/import-booking.types'

function ImportBookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const existingTripId = searchParams.get('tripId') || undefined

  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [previewRequest, setPreviewRequest] = useState<ImportPreviewRequest | null>(null)

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

  const handleBack = () => {
    setStep('input')
  }

  const handleConfirmSuccess = (tripId: string) => {
    router.push(`/trips/${tripId}?tab=itinerary`)
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Import Booking"
        description={
          existingTripId
            ? 'Import an existing booking into this trip'
            : 'Import an existing booking from a cruise line'
        }
      />

      <div className="mt-6">
        {step === 'input' && (
          <ImportSourceForm
            onPreviewSuccess={handlePreviewSuccess}
            isLoading={false}
            formState={formState}
            onFormStateChange={setFormState}
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
