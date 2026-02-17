'use client'

import { format, parseISO } from 'date-fns'
import { Calendar, MapPin, Plane, Tag, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTourDepartures, type GlobusBrand, type GlobusDeparture } from '@/hooks/use-tour-library'

interface TourDeparturesModalProps {
  tourCode: string | null
  tourName: string | null
  brand: GlobusBrand | null
  isOpen: boolean
  onClose: () => void
}

function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString()}`
}

function DepartureRow({ departure }: { departure: GlobusDeparture }) {
  const landStart = departure.landStartDate ? parseISO(departure.landStartDate) : null
  const landEnd = departure.landEndDate ? parseISO(departure.landEndDate) : null
  const lowestPrice = departure.pricing.length > 0
    ? Math.min(...departure.pricing.map((p) => p.price))
    : departure.landOnlyPrice

  return (
    <div className="border border-ash-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {/* Date */}
          <div className="flex items-center gap-1.5 text-sm font-medium text-ash-900">
            <Calendar className="h-4 w-4 text-phoenix-gold-600" />
            {landStart ? format(landStart, 'MMM d, yyyy') : departure.landStartDate}
            {landEnd && (
              <span className="text-ash-400">
                {' '}&mdash; {format(landEnd, 'MMM d, yyyy')}
              </span>
            )}
          </div>

          {/* Code + Status */}
          <div className="flex items-center gap-2 text-xs text-ash-500">
            <Tag className="h-3 w-3" />
            <span>{departure.departureCode}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                departure.status === 'Available'
                  ? 'border-green-300 text-green-700'
                  : 'border-amber-300 text-amber-700',
              )}
            >
              {departure.status}
            </Badge>
            {departure.guaranteedDeparture && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Guaranteed
              </Badge>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="text-xs text-ash-500">From</p>
          <p className="text-lg font-bold text-phoenix-gold-600">
            {formatPrice(lowestPrice)}
          </p>
          <p className="text-xs text-ash-400">land only</p>
        </div>
      </div>

      {/* Cities */}
      <div className="flex items-center gap-4 text-xs text-ash-500">
        {departure.tourStartAirportCity && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{departure.tourStartAirportCity}</span>
          </div>
        )}
        {departure.tourEndAirportCity && departure.tourEndAirportCity !== departure.tourStartAirportCity && (
          <div className="flex items-center gap-1">
            <Plane className="h-3 w-3" />
            <span>{departure.tourEndAirportCity}</span>
          </div>
        )}
        {departure.shipName && (
          <span className="text-ash-400">Ship: {departure.shipName}</span>
        )}
      </div>

      {/* Cabin Pricing */}
      {departure.pricing.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-ash-100">
          {departure.pricing.map((cabin, i) => (
            <div
              key={i}
              className="bg-ash-50 rounded px-2 py-1 text-xs"
            >
              <span className="text-ash-500">
                {cabin.cabinCategory ?? 'Standard'}:
              </span>{' '}
              <span className="font-medium text-ash-900">
                {formatPrice(cabin.price)}
              </span>
              {cabin.discount > 0 && (
                <span className="text-green-600 ml-1">-{formatPrice(cabin.discount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Supplements */}
      {(departure.singleSupplement > 0 || departure.tripleReduction > 0) && (
        <div className="flex gap-3 text-xs text-ash-400">
          {departure.singleSupplement > 0 && (
            <span>Single supplement: {formatPrice(departure.singleSupplement)}</span>
          )}
          {departure.tripleReduction > 0 && (
            <span>Triple reduction: -{formatPrice(departure.tripleReduction)}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function TourDeparturesModal({
  tourCode,
  tourName,
  brand,
  isOpen,
  onClose,
}: TourDeparturesModalProps) {
  const { data: departures, isLoading, error } = useTourDepartures(tourCode, brand)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{tourName ?? tourCode}</span>
            {brand && (
              <Badge variant="secondary" className="text-xs">
                {brand}
              </Badge>
            )}
          </DialogTitle>
          {tourCode && (
            <p className="text-xs text-ash-500">
              Tour Code: {tourCode}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {!brand ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-2 text-sm font-medium text-ash-700">
                Brand required to view departures
              </p>
              <p className="mt-1 text-sm text-ash-500">
                Select a brand filter (Globus, Cosmos, or Monograms) before viewing departures.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-phoenix-gold-500" />
              <span className="ml-2 text-sm text-ash-500">Loading departures...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
              <p className="mt-2 text-sm text-ash-500">
                Failed to load departures. The Globus API may be temporarily unavailable.
              </p>
            </div>
          ) : !departures || departures.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-10 w-10 text-ash-300" />
              <p className="mt-2 text-sm text-ash-500">
                No departures available for this tour.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ash-500">
                {departures.length} departure{departures.length !== 1 ? 's' : ''} available
              </p>
              {departures.map((dep, i) => (
                <DepartureRow key={`${dep.departureCode}-${i}`} departure={dep} />
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
