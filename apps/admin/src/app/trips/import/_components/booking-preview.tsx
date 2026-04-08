'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { Loader2, Ship, MapPin, CalendarDays, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Cruise Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="flex-1 space-y-3">
              <h3 className="text-lg font-semibold text-ash-900">
                {shipName} &mdash; {cruise.name}
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ash-600">
                {cruise.voyageCode && <span>Voyage: {cruise.voyageCode}</span>}
                {cruise.status && <Badge variant="outline">{cruise.status}</Badge>}
              </div>
              <div className="flex items-center gap-2 text-sm text-ash-600">
                <CalendarDays className="h-4 w-4" />
                <span>
                  {formatDate(cruise.startDate)} &ndash; {formatDate(cruise.endDate)}
                </span>
                <span className="text-ash-400">|</span>
                <span>{cruise.nights} nights</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ash-600">
                <span>Ship: {shipName}</span>
                {cruise.cabin && (
                  <>
                    <span className="text-ash-400">|</span>
                    <span>
                      Cabin: {cruise.cabin.number || 'TBA'}
                      {cruise.cabin.name ? ` (${cruise.cabin.name})` : ''}
                      {cruise.cabin.cabintype ? ` - ${cruise.cabin.cabintype}` : ''}
                    </span>
                  </>
                )}
              </div>
              {cruise.supplier && (
                <div className="text-sm text-ash-600">
                  Supplier: {cruise.supplier}
                </div>
              )}
              {catalog.region && (
                <div className="flex items-center gap-2 text-sm text-ash-600">
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
        </CardContent>
      </Card>

      {/* Itinerary */}
      {itinerary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Itinerary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ash-200 text-left text-xs text-ash-500">
                    <th className="pb-2 pr-4">Day</th>
                    <th className="pb-2 pr-4">Port</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Arrive</th>
                    <th className="pb-2">Depart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ash-100">
                  {itinerary.map((port, idx) => (
                    <tr key={idx} className="text-ash-700">
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
          </CardContent>
        </Card>
      )}

      {/* Passengers */}
      {passengers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Passengers ({passengers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <PassengerList passengers={passengers} />
          </CardContent>
        </Card>
      )}

      {/* Pricing */}
      {cruise.pricing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {cruise.pricing.grossPrice && (
                <div>
                  <span className="text-ash-500">Gross: </span>
                  <span className="font-medium text-ash-900">
                    {formatCurrency(cruise.pricing.grossPrice, currency)}
                  </span>
                </div>
              )}
              {cruise.pricing.netPrice && (
                <div>
                  <span className="text-ash-500">Net: </span>
                  <span className="font-medium text-ash-900">
                    {formatCurrency(cruise.pricing.netPrice, currency)}
                  </span>
                </div>
              )}
              {(cruise.pricing.commission ?? preview.commission) > 0 && (
                <div>
                  <span className="text-ash-500">Commission: </span>
                  <span className="font-medium text-green-700">
                    {formatCurrency(cruise.pricing.commission ?? preview.commission, currency)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trip Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Trip Setup</CardTitle>
        </CardHeader>
        <CardContent>
          {existingTripId ? (
            <p className="text-sm text-ash-600">
              Adding to existing trip: <span className="font-medium text-ash-900">{existingTripName || existingTripId}</span>
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
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={confirmMutation.isPending}>
          Back
        </Button>
        <Button onClick={handleConfirm} disabled={confirmMutation.isPending}>
          {confirmMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Import Booking'
          )}
        </Button>
      </div>
    </div>
  )
}
