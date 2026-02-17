'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, parseISO, isWithinInterval, addDays } from 'date-fns'
import {
  MapPin,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  X,
  Star,
  Building2,
  Tag,
  CheckCircle2,
  Filter,
  Plane,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { getAirportCity } from '@/lib/airport-utils'
import {
  useTourDetail,
  useTourRepositoryDepartures,
  useAddTourToItinerary,
  type TourDeparture,
  type TourInclusion,
} from '@/hooks/use-tour-library'

// Globus Family image base URL
const GLOBUS_IMAGE_BASE = 'https://images.globusfamily.com'

function getTourImageUrl(tourCode: string): string {
  return `${GLOBUS_IMAGE_BASE}/vacation/${tourCode}.jpg`
}

interface TourDetailModalProps {
  tourId: string | null
  isOpen: boolean
  onClose: () => void
  tripContext?: {
    tripId: string
    dayId: string
    itineraryId: string
    /** Itinerary start date for departure filtering */
    startDate?: string
    /** Itinerary end date for departure filtering */
    endDate?: string
  }
  onAddedToItinerary?: () => void
}

// Departure status filter options
type DepartureStatus = 'available' | 'please_call' | 'not_available'

const STATUS_OPTIONS: { value: DepartureStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'please_call', label: 'Please Call' },
  { value: 'not_available', label: 'Not Available' },
]

// Normalize status string to standard values
function normalizeStatus(status?: string): DepartureStatus {
  if (!status) return 'not_available'
  const s = status.toLowerCase().trim()
  if (s === 'available') return 'available'
  if (s === 'please call' || s === 'pleasecall') return 'please_call'
  return 'not_available'
}

// Format city name from airport code using utility or fallback
function formatCityFromCode(code: string | undefined): string {
  if (!code) return ''
  const city = getAirportCity(code)
  // If unknown, show code directly
  return city === 'Unknown' ? code : city
}

function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

// Brand styling
const BRAND_STYLES: Record<string, { badge: string; text: string }> = {
  globus: {
    badge: 'bg-blue-600 text-white hover:bg-blue-600',
    text: 'text-blue-600',
  },
  cosmos: {
    badge: 'bg-amber-600 text-white hover:bg-amber-600',
    text: 'text-amber-600',
  },
  monograms: {
    badge: 'bg-purple-600 text-white hover:bg-purple-600',
    text: 'text-purple-600',
  },
}

const DEFAULT_STYLE = {
  badge: 'bg-phoenix-gold-600 text-white hover:bg-phoenix-gold-600',
  text: 'text-phoenix-gold-600',
}

function getBrandStyle(operatorCode?: string) {
  if (!operatorCode) return DEFAULT_STYLE
  return BRAND_STYLES[operatorCode.toLowerCase()] || DEFAULT_STYLE
}

// Inclusions section component
function InclusionsSection({ inclusions }: { inclusions: TourInclusion[] }) {
  const highlights = inclusions.filter((i) => i.inclusionType === 'highlight')
  const included = inclusions.filter((i) => i.inclusionType === 'included')
  const excluded = inclusions.filter((i) => i.inclusionType === 'excluded')

  return (
    <div className="space-y-6">
      {/* Highlights */}
      {highlights.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Highlights
          </h4>
          <div className="space-y-2">
            {highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-ash-700">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Included */}
      {included.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            What's Included
          </h4>
          <div className="space-y-2">
            {included.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  {item.category && (
                    <span className="font-medium text-ash-900">{item.category}: </span>
                  )}
                  <span className="text-ash-700">{item.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Excluded */}
      {excluded.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
            <X className="h-4 w-4 text-red-500" />
            Not Included
          </h4>
          <div className="space-y-2">
            {excluded.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <span className="text-ash-500">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inclusions.length === 0 && (
        <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg bg-ash-50/50">
          <Check className="mx-auto h-8 w-8 text-ash-300" />
          <p className="mt-2 text-sm font-medium text-ash-500">
            Inclusions not available
          </p>
          <p className="mt-1 text-xs text-ash-400 max-w-xs mx-auto">
            What&apos;s included and excluded is available in the production catalog.
          </p>
        </div>
      )}
    </div>
  )
}

// Departure row component
function DepartureRow({
  departure,
  isSelected,
  onSelect,
}: {
  departure: TourDeparture
  isSelected: boolean
  onSelect: () => void
}) {
  const startDate = departure.landStartDate ? parseISO(departure.landStartDate) : null
  const endDate = departure.landEndDate ? parseISO(departure.landEndDate) : null
  const lowestPrice = departure.basePriceCents ?? 0

  return (
    <div
      className={cn(
        'border rounded-lg p-4 space-y-3 cursor-pointer transition-colors',
        isSelected
          ? 'border-phoenix-gold-500 bg-phoenix-gold-50'
          : 'border-ash-200 hover:border-phoenix-gold-300'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {/* Date */}
          <div className="flex items-center gap-1.5 text-sm font-medium text-ash-900">
            <Calendar className="h-4 w-4 text-phoenix-gold-600" />
            {startDate ? format(startDate, 'MMM d, yyyy') : departure.landStartDate}
            {endDate && (
              <span className="text-ash-400">
                {' '}&mdash; {format(endDate, 'MMM d, yyyy')}
              </span>
            )}
          </div>

          {/* Code + Status */}
          <div className="flex items-center gap-2 text-xs text-ash-500">
            <Tag className="h-3 w-3" />
            <span>{departure.departureCode}</span>
            {departure.status && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  departure.status.toLowerCase() === 'available'
                    ? 'border-green-300 text-green-700'
                    : 'border-amber-300 text-amber-700'
                )}
              >
                {departure.status}
              </Badge>
            )}
            {departure.guaranteedDeparture && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Guaranteed
              </Badge>
            )}
          </div>
        </div>

        {/* Price + Selection */}
        <div className="text-right flex items-center gap-3">
          <div>
            <p className="text-xs text-ash-500">From</p>
            <p className="text-lg font-bold text-phoenix-gold-600">
              {lowestPrice > 0 ? formatPrice(lowestPrice) : 'TBD'}
            </p>
            <p className="text-xs text-ash-400">{departure.currency}</p>
          </div>
          {isSelected && (
            <div className="h-6 w-6 rounded-full bg-phoenix-gold-500 flex items-center justify-center">
              <Check className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Cities */}
      {(departure.startCity || departure.endCity) && (
        <div className="flex items-center gap-2 text-xs text-ash-500">
          <Plane className="h-3 w-3 text-phoenix-gold-500" />
          {departure.startCity && (
            <span className="font-medium text-ash-700">
              {formatCityFromCode(departure.startCity)}
            </span>
          )}
          {departure.endCity && departure.endCity !== departure.startCity && (
            <>
              <span className="text-ash-400">&rarr;</span>
              <span className="font-medium text-ash-700">
                {formatCityFromCode(departure.endCity)}
              </span>
            </>
          )}
          {/* Show codes in smaller text for reference */}
          <span className="text-ash-400 text-[10px]">
            ({departure.startCity}
            {departure.endCity && departure.endCity !== departure.startCity && ` → ${departure.endCity}`})
          </span>
        </div>
      )}

      {/* Cabin Pricing */}
      {departure.cabinPricing.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-ash-100">
          {departure.cabinPricing.map((cabin, i) => (
            <div key={i} className="bg-ash-50 rounded px-2 py-1 text-xs">
              <span className="text-ash-500">{cabin.cabinCategory ?? 'Standard'}:</span>{' '}
              <span className="font-medium text-ash-900">
                {formatPrice(cabin.priceCents)}
              </span>
              {cabin.discountCents && cabin.discountCents > 0 && (
                <span className="text-green-600 ml-1">-{formatPrice(cabin.discountCents)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TourDetailModal({
  tourId,
  isOpen,
  onClose,
  tripContext,
  onAddedToItinerary,
}: TourDetailModalProps) {
  const { data: tour, isLoading, error } = useTourDetail(tourId)
  const { data: departuresData, isLoading: departuresLoading } = useTourRepositoryDepartures(tourId)
  const addTourMutation = useAddTourToItinerary(tripContext?.itineraryId)

  // Image gallery state
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imageError, setImageError] = useState(false)

  // Selected departure state
  const [selectedDepartureId, setSelectedDepartureId] = useState<string | null>(null)

  // Current tab
  const [activeTab, setActiveTab] = useState('overview')

  // Extend itinerary confirmation state
  const [showExtendConfirmation, setShowExtendConfirmation] = useState(false)

  // Departure filtering state
  // Default: show Available and Please Call, hide Not Available
  const [statusFilters, setStatusFilters] = useState<Record<DepartureStatus, boolean>>({
    available: true,
    please_call: true,
    not_available: false,
  })
  const [filterByItineraryDates, setFilterByItineraryDates] = useState(true)

  // Reset state when modal opens/closes or tour changes
  useEffect(() => {
    setCurrentImageIndex(0)
    setImageError(false)
    setSelectedDepartureId(null)
    setActiveTab('overview')
    setShowExtendConfirmation(false)
    // Reset filters with default values
    setStatusFilters({
      available: true,
      please_call: true,
      not_available: false,
    })
    setFilterByItineraryDates(true)
  }, [tourId])

  const images = tour?.media.filter((m) => m.mediaType === 'image') ?? []
  const hasMultipleImages = images.length > 1

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  // Get current image URL
  const currentImage = images[currentImageIndex]
  const imageUrl = imageError
    ? null
    : currentImage?.url ?? (tour?.providerIdentifier ? getTourImageUrl(tour.providerIdentifier) : null)

  const brandStyle = getBrandStyle(tour?.operatorCode)
  const allDepartures = departuresData?.departures ?? []

  // Filter departures based on status and date range
  const filteredDepartures = useMemo(() => {
    let filtered = allDepartures

    // Filter by status
    filtered = filtered.filter((dep) => {
      const status = normalizeStatus(dep.status)
      return statusFilters[status]
    })

    // Filter by itinerary dates if enabled and context is available
    if (filterByItineraryDates && tripContext?.startDate && tripContext?.endDate) {
      try {
        const itineraryStart = parseISO(tripContext.startDate)
        const itineraryEnd = parseISO(tripContext.endDate)
        // Add some buffer for tour selection (tours can start a bit before or after)
        const rangeStart = addDays(itineraryStart, -7) // 1 week before
        const rangeEnd = addDays(itineraryEnd, 14) // 2 weeks after

        filtered = filtered.filter((dep) => {
          if (!dep.landStartDate) return true // Keep departures without dates
          const depDate = parseISO(dep.landStartDate)
          return isWithinInterval(depDate, { start: rangeStart, end: rangeEnd })
        })
      } catch {
        // If date parsing fails, don't filter
      }
    }

    return filtered
  }, [allDepartures, statusFilters, filterByItineraryDates, tripContext?.startDate, tripContext?.endDate])

  const selectedDeparture = allDepartures.find((d) => d.id === selectedDepartureId)

  const handleAddToItinerary = () => {
    if (!tour || !selectedDeparture || !tripContext) return

    // For multi-day tours, prompt user to confirm extending itinerary
    const tourDays = tour.days ?? 1
    if (tourDays > 1) {
      setShowExtendConfirmation(true)
      return
    }

    // Single-day tours can be added directly
    performAddToItinerary(false)
  }

  const performAddToItinerary = async (autoExtend: boolean) => {
    if (!tour || !selectedDeparture || !tripContext) return

    try {
      await addTourMutation.mutateAsync({
        tour,
        departure: selectedDeparture,
        itineraryId: tripContext.itineraryId,
        tripId: tripContext.tripId,
        autoExtendItinerary: autoExtend,
      })
      onAddedToItinerary?.()
      onClose()
    } catch {
      // Error is handled by the mutation's onError callback (shows toast)
    }
  }

  const handleConfirmExtend = () => {
    setShowExtendConfirmation(false)
    performAddToItinerary(true)
  }

  return (
  <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[min(85vh,calc(100dvh-2rem))] flex flex-col p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <>
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="sr-only">Loading tour details</DialogTitle>
              <DialogDescription className="sr-only">
                Please wait while tour details are loading
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-6">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-48 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            </div>
          </>
        ) : error ? (
          <>
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="sr-only">Error loading tour</DialogTitle>
              <DialogDescription className="sr-only">
                An error occurred while loading tour details
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <AlertCircle className="h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-lg font-medium text-ash-900">Error loading tour</h3>
              <p className="mt-1 text-sm text-ash-500">
                Unable to load tour details. Please try again.
              </p>
              <Button variant="outline" onClick={onClose} className="mt-4">
                Close
              </Button>
            </div>
          </>
        ) : tour ? (
          <>
            <DialogHeader className="flex-shrink-0 p-6 pb-4">
              <DialogDescription className="sr-only">
                View details for {tour.name}
              </DialogDescription>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <DialogTitle className="text-xl font-bold text-ash-900">
                    {tour.name}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1 text-sm text-ash-500">
                    <span className="font-mono">{tour.providerIdentifier}</span>
                    {tour.operatorCode && (
                      <>
                        <span>-</span>
                        <Badge className={cn('text-xs', brandStyle.badge)}>
                          {tour.operatorCode.charAt(0).toUpperCase() + tour.operatorCode.slice(1)}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tour.days && (
                    <Badge variant="secondary" className="bg-phoenix-gold-100 text-phoenix-gold-700">
                      {tour.days} Days
                    </Badge>
                  )}
                  {tour.nights && (
                    <Badge variant="outline">{tour.nights} Nights</Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 h-0 overflow-y-auto">
              <div className="px-6 pb-6">
                {/* Tour Image */}
                <div className="relative h-36 bg-ash-100 rounded-lg overflow-hidden mb-4">
                  {imageUrl ? (
                    <>
                      <img
                        src={imageUrl}
                        alt={tour.name}
                        className="w-full h-full object-cover"
                        onError={() => setImageError(true)}
                      />
                      {/* Gallery Navigation */}
                      {hasMultipleImages && (
                        <>
                          <button
                            onClick={handlePrevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            onClick={handleNextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                            {currentImageIndex + 1} / {images.length}
                          </div>
                        </>
                      )}
                      {currentImage?.caption && (
                        <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded text-center">
                          {currentImage.caption}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <MapPin className="h-16 w-16 text-ash-300" />
                    </div>
                  )}
                </div>

                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {tour.days && (
                    <div className="bg-ash-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                        <Clock className="h-3.5 w-3.5" />
                        Duration
                      </div>
                      <p className="font-medium text-sm">
                        {tour.days} days / {tour.nights ?? tour.days - 1} nights
                      </p>
                    </div>
                  )}
                  {tour.itinerary.length > 0 && (
                    <div className="bg-ash-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                        <MapPin className="h-3.5 w-3.5" />
                        From
                      </div>
                      <p className="font-medium text-sm truncate">
                        {tour.itinerary[0]?.overnightCity ?? 'Various'}
                      </p>
                    </div>
                  )}
                  {tour.hotels.length > 0 && (
                    <div className="bg-ash-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                        <Building2 className="h-3.5 w-3.5" />
                        Hotels
                      </div>
                      <p className="font-medium text-sm">{tour.hotels.length} properties</p>
                    </div>
                  )}
                  {tour.lowestPriceCents && (
                    <div className="bg-ash-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                        <Calendar className="h-3.5 w-3.5" />
                        From
                      </div>
                      <p className="font-medium text-sm text-phoenix-gold-600">
                        {formatPrice(tour.lowestPriceCents)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="itinerary">
                      Itinerary
                      {tour.itinerary.length > 0 && (
                        <span className="ml-1 text-xs text-ash-400">
                          ({tour.itinerary.length})
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
                    <TabsTrigger value="departures">
                      Departures
                      {allDepartures.length > 0 && (
                        <span className="ml-1 text-xs text-ash-400">
                          ({filteredDepartures.length}/{allDepartures.length})
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="mt-4">
                    {tour.description ? (
                      <div className="prose prose-sm max-w-none">
                        <p className="text-ash-700 whitespace-pre-wrap">{tour.description}</p>
                      </div>
                    ) : (
                      <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg bg-ash-50/50">
                        <MapPin className="mx-auto h-8 w-8 text-ash-300" />
                        <p className="mt-2 text-sm font-medium text-ash-500">
                          Description not available
                        </p>
                        <p className="mt-1 text-xs text-ash-400 max-w-xs mx-auto">
                          Full tour details including description, itinerary, and inclusions are available in the production catalog.
                        </p>
                      </div>
                    )}

                    {/* Hotels Preview */}
                    {tour.hotels.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div>
                          <h4 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Featured Hotels
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {tour.hotels.slice(0, 4).map((hotel, idx) => (
                              <div
                                key={idx}
                                className="bg-ash-50 rounded-lg p-3 text-sm"
                              >
                                <p className="font-medium text-ash-900">{hotel.hotelName}</p>
                                {hotel.city && (
                                  <p className="text-xs text-ash-500">{hotel.city}</p>
                                )}
                              </div>
                            ))}
                          </div>
                          {tour.hotels.length > 4 && (
                            <p className="text-xs text-ash-400 mt-2">
                              +{tour.hotels.length - 4} more hotels
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* Itinerary Tab */}
                  <TabsContent value="itinerary" className="mt-4">
                    {tour.itinerary.length > 0 ? (
                      <div className="space-y-4">
                        {tour.itinerary.map((day) => (
                          <div key={day.dayNumber} className="border-l-2 border-phoenix-gold-200 pl-4">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                Day {day.dayNumber}
                              </Badge>
                              {day.overnightCity && (
                                <span className="text-xs text-ash-500 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {day.overnightCity}
                                </span>
                              )}
                            </div>
                            {day.title && (
                              <h5 className="font-medium text-sm text-ash-900">
                                {day.title}
                              </h5>
                            )}
                            {day.description && (
                              <p className="text-sm text-ash-600 mt-1">{day.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg bg-ash-50/50">
                        <Calendar className="mx-auto h-8 w-8 text-ash-300" />
                        <p className="mt-2 text-sm font-medium text-ash-500">
                          Day-by-day itinerary not available
                        </p>
                        <p className="mt-1 text-xs text-ash-400 max-w-xs mx-auto">
                          The detailed daily itinerary is available in the production catalog after data sync.
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Inclusions Tab */}
                  <TabsContent value="inclusions" className="mt-4">
                    <InclusionsSection inclusions={tour.inclusions} />
                  </TabsContent>

                  {/* Departures Tab */}
                  <TabsContent value="departures" className="mt-4">
                    {departuresLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-phoenix-gold-500" />
                        <span className="ml-2 text-sm text-ash-500">
                          Loading departures...
                        </span>
                      </div>
                    ) : allDepartures.length > 0 ? (
                      <div className="space-y-3">
                        {/* Filters */}
                        <div className="flex flex-col gap-3 p-3 bg-ash-50 rounded-lg">
                          <div className="flex items-center gap-2 text-sm font-medium text-ash-700">
                            <Filter className="h-4 w-4" />
                            <span>Filter Departures</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4">
                            {/* Status filters */}
                            <div className="flex items-center gap-3">
                              {STATUS_OPTIONS.map((opt) => (
                                <div key={opt.value} className="flex items-center gap-1.5">
                                  <Checkbox
                                    id={`status-${opt.value}`}
                                    checked={statusFilters[opt.value]}
                                    onCheckedChange={(checked) =>
                                      setStatusFilters((prev) => ({
                                        ...prev,
                                        [opt.value]: checked === true,
                                      }))
                                    }
                                  />
                                  <Label
                                    htmlFor={`status-${opt.value}`}
                                    className="text-xs cursor-pointer"
                                  >
                                    {opt.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                            {/* Itinerary date filter (only when coming from trip context) */}
                            {tripContext?.startDate && tripContext?.endDate && (
                              <>
                                <Separator orientation="vertical" className="h-4" />
                                <div className="flex items-center gap-1.5">
                                  <Checkbox
                                    id="filter-by-dates"
                                    checked={filterByItineraryDates}
                                    onCheckedChange={(checked) =>
                                      setFilterByItineraryDates(checked === true)
                                    }
                                  />
                                  <Label
                                    htmlFor="filter-by-dates"
                                    className="text-xs cursor-pointer"
                                  >
                                    Near itinerary dates ({format(parseISO(tripContext.startDate), 'MMM d')} - {format(parseISO(tripContext.endDate), 'MMM d')})
                                  </Label>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Results count */}
                        <p className="text-sm text-ash-500">
                          Showing {filteredDepartures.length} of {allDepartures.length} departure{allDepartures.length !== 1 ? 's' : ''}.
                          {filteredDepartures.length > 0 && ' Select a departure to add to itinerary.'}
                        </p>

                        {/* Departures list */}
                        {filteredDepartures.length > 0 ? (
                          filteredDepartures.map((dep) => (
                            <DepartureRow
                              key={dep.id}
                              departure={dep}
                              isSelected={selectedDepartureId === dep.id}
                              onSelect={() => setSelectedDepartureId(dep.id)}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8 border border-dashed border-ash-200 rounded-lg">
                            <Filter className="mx-auto h-8 w-8 text-ash-300" />
                            <p className="mt-2 text-sm text-ash-500">
                              No departures match your filters.
                            </p>
                            <Button
                              variant="link"
                              size="sm"
                              className="mt-1"
                              onClick={() => {
                                setStatusFilters({
                                  available: true,
                                  please_call: true,
                                  not_available: true,
                                })
                                setFilterByItineraryDates(false)
                              }}
                            >
                              Show all departures
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Calendar className="mx-auto h-8 w-8 text-ash-300" />
                        <p className="mt-2 text-sm text-ash-500">
                          No departures available for this tour.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t border-ash-200 p-6 pt-4">
              <div className="flex justify-between w-full items-center">
                <div className="text-sm text-ash-500">
                  {selectedDeparture ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-phoenix-gold-500" />
                      Selected: {selectedDeparture.departureCode}
                      {selectedDeparture.landStartDate && (
                        <span>
                          ({format(parseISO(selectedDeparture.landStartDate), 'MMM d, yyyy')})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>Select a departure to add to itinerary</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  {tripContext ? (
                    <Button
                      onClick={handleAddToItinerary}
                      disabled={!selectedDeparture || addTourMutation.isPending}
                      className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                    >
                      {addTourMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      {addTourMutation.isPending ? 'Adding...' : 'Add to Itinerary'}
                    </Button>
                  ) : (
                    <Button
                      disabled={!selectedDeparture}
                      className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add to Trip
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>

    {/* Extend Itinerary Confirmation Dialog */}
    <AlertDialog open={showExtendConfirmation} onOpenChange={setShowExtendConfirmation}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Extend Itinerary?</AlertDialogTitle>
          <AlertDialogDescription>
            This {tour?.days}-day tour may extend beyond your current itinerary dates.
            Do you want to automatically extend your itinerary to accommodate all tour days?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmExtend}
            className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
          >
            Extend & Add Tour
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
