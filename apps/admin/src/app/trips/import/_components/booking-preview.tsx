'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { Loader2, Ship, MapPin, CalendarDays, DollarSign } from 'lucide-react'
import { TernCard, TernCardContent, TernCardHeader, TernCardTitle } from '@/components/tern/core/tern-card'
import { TernButton } from '@/components/tern/core/tern-button'
import { TernBadge } from '@/components/tern/core/tern-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useImportConfirm } from '@/hooks/use-import-booking'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import { parseISODate } from '@/lib/date-utils'
import { PassengerList } from './passenger-list'
import type { ImportPreviewResponse, ImportPreviewRequest } from '@/types/import-booking.types'

interface BookingPreviewProps {
  preview: ImportPreviewResponse
  request: ImportPreviewRequest
  existingTripId?: string
  existingTripName?: string
  onBack: () => void
  onConfirmSuccess: (tripId: string) => void
}

function formatCurrency(value: string | number, currency: string) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num)
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return ''
  const parsed = parseISODate(dateStr)
  return parsed ? format(parsed, 'PP') : dateStr
}

export function BookingPreview({
  preview,
  request,
  existingTripId,
  existingTripName,
  onBack,
  onConfirmSuccess,
}: BookingPreviewProps) {
  const [tripName, setTripName] = useState(preview.cruise.name || '')
  const confirmMutation = useImportConfirm()
  const { toast } = useToast()

  const { cruise, passengers, catalog } = preview
  const currency = cruise.pricing?.currency || request.currency || 'CAD'
  const shipName = cruise.ship?.name ?? 'Unknown ship'
  const shipImage = cruise.ship?.imageurl || catalog.shipImageUrl
  const itinerary = Array.isArray(cruise.itinerary) ? cruise.itinerary : []

  async function handleConfirm() {
    try {
      const result = await confirmMutation.mutateAsync({
        ...request,
        tripName: existingTripId ? undefined : tripName.trim() || undefined,
        existingTripId,
      })

      if (result.alreadyImported) {
        toast({
          title: 'Already imported',
          description: 'This booking was already imported.',
        })
      } else {
        toast({
          title: 'Import successful',
          description: 'The booking has been imported.',
        })
      }

      onConfirmSuccess(result.tripId)
    } catch (err) {
      if (err instanceof ApiError) {
        toast({
          title: 'Import failed',
          description: err.message || 'Failed to import booking.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Import failed',
          description: 'An unexpected error occurred.',
          variant: 'destructive',
        })
      }
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Cruise Details */}
      <TernCard>
        <TernCardHeader>
          <TernCardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Cruise Details
          </TernCardTitle>
        </TernCardHeader>
        <TernCardContent>
          <div className="flex gap-6">
            <div className="flex-1 space-y-3">
              <h3 className="text-lg font-semibold text-tern-gray-900">
                {shipName} &mdash; {cruise.name}
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tern-gray-600">
                {cruise.voyageCode && <span>Voyage: {cruise.voyageCode}</span>}
                {cruise.status && <TernBadge variant="outline">{cruise.status}</TernBadge>}
              </div>
              <div className="flex items-center gap-2 text-sm text-tern-gray-600">
                <CalendarDays className="h-4 w-4" />
                <span>
                  {formatDate(cruise.startDate)} &ndash; {formatDate(cruise.endDate)}
                </span>
                <span className="text-tern-gray-400">|</span>
                <span>{cruise.nights} nights</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tern-gray-600">
                <span>Ship: {shipName}</span>
                {cruise.cabin && (
                  <>
                    <span className="text-tern-gray-400">|</span>
                    <span>
                      Cabin: {cruise.cabin.number || 'TBA'}
                      {cruise.cabin.name ? ` (${cruise.cabin.name})` : ''}
                      {cruise.cabin.cabintype ? ` - ${cruise.cabin.cabintype}` : ''}
                    </span>
                  </>
                )}
              </div>
              {cruise.supplier && (
                <div className="text-sm text-tern-gray-600">
                  Supplier: {cruise.supplier}
                </div>
              )}
              {catalog.region && (
                <div className="flex items-center gap-2 text-sm text-tern-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>Region: {catalog.region}</span>
                </div>
              )}
            </div>
            {shipImage && (
              <div className="hidden sm:block flex-shrink-0">
                <Image
                  src={shipImage}
                  alt={shipName}
                  width={200}
                  height={140}
                  className="rounded-lg object-cover"
                  unoptimized
                />
              </div>
            )}
          </div>
        </TernCardContent>
      </TernCard>

      {/* Itinerary */}
      {itinerary.length > 0 && (
        <TernCard>
          <TernCardHeader>
            <TernCardTitle>Itinerary</TernCardTitle>
          </TernCardHeader>
          <TernCardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-tern-gray-200 text-left text-xs text-tern-gray-500">
                    <th className="pb-2 pr-4">Day</th>
                    <th className="pb-2 pr-4">Port</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Arrive</th>
                    <th className="pb-2">Depart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tern-gray-100">
                  {itinerary.map((port, idx) => (
                    <tr key={idx} className="text-tern-gray-700">
                      <td className="py-2 pr-4">{port.day}</td>
                      <td className="py-2 pr-4 font-medium">{port.itineraryname}</td>
                      <td className="py-2 pr-4">{formatDate(port.arrivedate)}</td>
                      <td className="py-2 pr-4">{port.arrivetime || ''}</td>
                      <td className="py-2">{port.departtime || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TernCardContent>
        </TernCard>
      )}

      {/* Passengers */}
      {passengers.length > 0 && (
        <TernCard>
          <TernCardHeader>
            <TernCardTitle>Passengers ({passengers.length})</TernCardTitle>
          </TernCardHeader>
          <TernCardContent>
            <PassengerList passengers={passengers} />
          </TernCardContent>
        </TernCard>
      )}

      {/* Pricing */}
      {cruise.pricing && (
        <TernCard>
          <TernCardHeader>
            <TernCardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing
            </TernCardTitle>
          </TernCardHeader>
          <TernCardContent>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {cruise.pricing.grossPrice && (
                <div>
                  <span className="text-tern-gray-500">Gross: </span>
                  <span className="font-medium text-tern-gray-900">
                    {formatCurrency(cruise.pricing.grossPrice, currency)}
                  </span>
                </div>
              )}
              {cruise.pricing.netPrice && (
                <div>
                  <span className="text-tern-gray-500">Net: </span>
                  <span className="font-medium text-tern-gray-900">
                    {formatCurrency(cruise.pricing.netPrice, currency)}
                  </span>
                </div>
              )}
              {preview.commission > 0 && (
                <div>
                  <span className="text-tern-gray-500">Commission: </span>
                  <span className="font-medium text-green-700">
                    {formatCurrency(preview.commission, currency)}
                  </span>
                </div>
              )}
            </div>
          </TernCardContent>
        </TernCard>
      )}

      {/* Trip Setup */}
      <TernCard>
        <TernCardHeader>
          <TernCardTitle>Trip Setup</TernCardTitle>
        </TernCardHeader>
        <TernCardContent>
          {existingTripId ? (
            <p className="text-sm text-tern-gray-600">
              Adding to existing trip: <span className="font-medium text-tern-gray-900">{existingTripName || existingTripId}</span>
            </p>
          ) : (
            <div className="space-y-2 max-w-md">
              <Label htmlFor="trip-name">Trip Name</Label>
              <Input
                id="trip-name"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Enter trip name"
              />
            </div>
          )}
        </TernCardContent>
      </TernCard>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={confirmMutation.isPending}>
          Back
        </Button>
        <TernButton onClick={handleConfirm} disabled={confirmMutation.isPending}>
          {confirmMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Import Booking'
          )}
        </TernButton>
      </div>
    </div>
  )
}
