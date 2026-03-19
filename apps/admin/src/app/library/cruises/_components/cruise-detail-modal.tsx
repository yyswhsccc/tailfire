'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import {
  Ship,
  Calendar,
  MapPin,
  Clock,
  Anchor,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
  Ruler,
  Building2,
  Plus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useCruiseSailing, useAddCruiseToItinerary } from '@/hooks/use-cruise-library'
import { PortScheduleList } from './port-schedule-list'
import { CabinPricingGrid } from './cabin-pricing-grid'
import { AddToTripDialog } from '@/components/library/add-to-trip-dialog'

interface CruiseDetailModalProps {
  sailingId: string | null
  isOpen: boolean
  onClose: () => void
  tripContext?: {
    tripId: string
    dayId: string
    itineraryId: string
  }
  onAddedToItinerary?: () => void
}

export function CruiseDetailModal({
  sailingId,
  isOpen,
  onClose,
  tripContext,
  onAddedToItinerary,
}: CruiseDetailModalProps) {
  const router = useRouter()
  const { data: sailing, isLoading, error } = useCruiseSailing(sailingId)
  const addCruiseMutation = useAddCruiseToItinerary(tripContext?.itineraryId ?? '')

  // Image gallery state
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [failedImageIndices, setFailedImageIndices] = useState<Set<number>>(new Set())
  const [logoImageError, setLogoImageError] = useState(false)

  // Add to trip dialog state (when no tripContext)
  const [showAddToTripDialog, setShowAddToTripDialog] = useState(false)

  // Confirmation dialog state for extending itinerary dates (tripContext flow)
  const [showExtendConfirm, setShowExtendConfirm] = useState(false)

  // Pending params for the Add to Trip flow (extend confirmation)
  const [pendingAddToTrip, setPendingAddToTrip] = useState<{
    tripId: string
    itineraryId: string
    isNewTrip: boolean
    isNewItinerary: boolean
  } | null>(null)

  const images = sailing?.ship.images ?? []
  const hasMultipleImages = images.length > 1

  // Reset image error states when sailing changes
  useEffect(() => {
    setCurrentImageIndex(0)
    setFailedImageIndices(new Set())
    setLogoImageError(false)
  }, [sailingId])

  // Compute a reliable end date for cruise: use catalog endDate if reasonable,
  // otherwise sailDate + nights. Catalog endDate can be corrupt (Traveltek data quality).
  const reliableEndDate = (() => {
    if (!sailing) return undefined
    const computedEnd = new Date(sailing.sailDate + 'T00:00:00')
    computedEnd.setDate(computedEnd.getDate() + sailing.nights)
    const expectedEndDate = computedEnd.toISOString().split('T')[0]!
    const catalogEndDate = sailing.endDate
    const maxReasonableGap = 14
    const catalogEndMs = new Date(catalogEndDate + 'T00:00:00').getTime()
    const expectedEndMs = new Date(expectedEndDate + 'T00:00:00').getTime()
    return (catalogEndMs - expectedEndMs) > maxReasonableGap * 86400000 || catalogEndMs < expectedEndMs
      ? expectedEndDate
      : catalogEndDate
  })()

  /**
   * Callback for the shared AddToTripDialog.
   * Handles date checking, extend confirmation, and calling the cruise mutation.
   */
  const handleTripAndItinerarySelected = useCallback(async (params: {
    tripId: string
    itineraryId: string
    isNewTrip: boolean
    isNewItinerary: boolean
  }) => {
    if (!sailing) return

    // For new itineraries, dates were set from the cruise -- no conflict possible
    if (params.isNewItinerary) {
      await addCruiseMutation.mutateAsync({
        sailing,
        itineraryId: params.itineraryId,
        tripId: params.tripId,
        autoExtendItinerary: false,
      })
      setShowAddToTripDialog(false)
      onAddedToItinerary?.()
      onClose()
      router.push(`/trips/${params.tripId}`)
      return
    }

    // Existing itinerary -- try without extending first, prompt if needed
    try {
      await addCruiseMutation.mutateAsync({
        sailing,
        itineraryId: params.itineraryId,
        tripId: params.tripId,
        autoExtendItinerary: false,
      })
      setShowAddToTripDialog(false)
      onAddedToItinerary?.()
      onClose()
      router.push(`/trips/${params.tripId}`)
    } catch (err) {
      if (err instanceof Error && err.message.includes('do not fit within itinerary dates')) {
        // Store params and show extend confirmation
        setPendingAddToTrip(params)
        setShowAddToTripDialog(false)
        setShowExtendConfirm(true)
      } else {
        throw err
      }
    }
  }, [sailing, addCruiseMutation, onAddedToItinerary, onClose, router])

  const handleAddToItinerary = async () => {
    if (!sailing || !tripContext) return

    try {
      // The mutation will automatically place the cruise on the day matching the departure date
      await addCruiseMutation.mutateAsync({
        sailing,
        tripId: tripContext.tripId,
        autoExtendItinerary: false,
      })

      onAddedToItinerary?.()
    } catch (error) {
      // Check if it's a date mismatch error
      if (error instanceof Error && error.message.includes('do not fit within itinerary dates')) {
        setShowExtendConfirm(true)
      } else {
        throw error
      }
    }
  }

  // Confirm extension and retry with autoExtendItinerary=true
  // Handles both tripContext flow and add-to-trip flow
  const handleConfirmExtend = async () => {
    if (!sailing) return

    if (pendingAddToTrip) {
      // Add-to-trip flow: extend and add cruise
      try {
        await addCruiseMutation.mutateAsync({
          sailing,
          itineraryId: pendingAddToTrip.itineraryId,
          tripId: pendingAddToTrip.tripId,
          autoExtendItinerary: true,
        })
        setShowExtendConfirm(false)
        onAddedToItinerary?.()
        onClose()
        router.push(`/trips/${pendingAddToTrip.tripId}`)
      } catch {
        setShowExtendConfirm(false)
      } finally {
        setPendingAddToTrip(null)
      }
      return
    }

    // tripContext flow
    if (!tripContext) return
    try {
      await addCruiseMutation.mutateAsync({
        sailing,
        tripId: tripContext.tripId,
        autoExtendItinerary: true,
      })

      setShowExtendConfirm(false)
      onAddedToItinerary?.()
    } catch {
      setShowExtendConfirm(false)
    }
  }

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  const handleImageError = () => {
    setFailedImageIndices((prev) => new Set([...prev, currentImageIndex]))
    // Try to skip to next image if there are more
    if (images.length > 1 && failedImageIndices.size < images.length - 1) {
      handleNextImage()
    }
  }

  // Get current image URL, checking if all images have failed
  const allImagesFailed = failedImageIndices.size >= images.length
  const currentImage = images[currentImageIndex]
  const imageUrl = allImagesFailed
    ? null
    : (currentImage?.url2k ?? currentImage?.urlHd ?? currentImage?.url ?? sailing?.ship.imageUrl)

  // Calculate sea days
  const seaDays = sailing?.itinerary.filter((s) => s.isSeaDay).length ?? 0
  const portDays = sailing?.nights ? sailing.nights - seaDays + 1 : 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[min(85vh,calc(100dvh-2rem))] flex flex-col p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <>
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="sr-only">Loading cruise details</DialogTitle>
              <DialogDescription className="sr-only">Please wait while cruise details are loading</DialogDescription>
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
              <DialogTitle className="sr-only">Error loading cruise</DialogTitle>
              <DialogDescription className="sr-only">An error occurred while loading cruise details</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <AlertCircle className="h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-lg font-medium text-ash-900">Error loading sailing</h3>
              <p className="mt-1 text-sm text-ash-500">
                Unable to load sailing details. Please try again.
              </p>
              <Button variant="outline" onClick={onClose} className="mt-4">
                Close
              </Button>
            </div>
          </>
        ) : sailing ? (
          <>
            <DialogHeader className="flex-shrink-0 p-6 pb-4">
              <DialogDescription className="sr-only">
                View details for {sailing.name} by {sailing.cruiseLine.name}
              </DialogDescription>
              <div className="flex items-start gap-4">
                {/* Cruise Line Logo */}
                {sailing.cruiseLine.logoUrl && !logoImageError && (
                  <div className="flex-shrink-0">
                    <Image
                      src={sailing.cruiseLine.logoUrl}
                      alt={sailing.cruiseLine.name}
                      width={48}
                      height={48}
                      className="rounded-lg object-contain"
                      onError={() => setLogoImageError(true)}
                    />
                  </div>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-xl font-bold text-ash-900">
                    {sailing.name}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1 text-sm text-ash-500">
                    <span>{sailing.cruiseLine.name}</span>
                    <span>-</span>
                    <span>{sailing.ship.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-phoenix-gold-100 text-phoenix-gold-700">
                    {sailing.nights} Nights
                  </Badge>
                  {sailing.regions[0] && (
                    <Badge variant="outline">{sailing.regions[0].name}</Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 h-0 overflow-y-auto">
                <div className="space-y-6 px-6 pb-6">
                {/* Ship Image Gallery */}
                <div className="relative h-64 bg-ash-100 rounded-lg overflow-hidden">
                  {imageUrl ? (
                    <>
                      <Image
                        src={imageUrl}
                        alt={sailing.ship.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 896px) 100vw, 896px"
                        onError={handleImageError}
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
                          {/* Image Counter */}
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                            {currentImageIndex + 1} / {images.length}
                          </div>
                        </>
                      )}
                      {/* Image Caption */}
                      {currentImage?.caption && (
                        <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded text-center">
                          {currentImage.caption}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Ship className="h-16 w-16 text-ash-300" />
                    </div>
                  )}
                </div>

                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-ash-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Departure
                    </div>
                    <p className="font-medium text-sm">
                      {format(parseISO(sailing.sailDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="bg-ash-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Return
                    </div>
                    <p className="font-medium text-sm">
                      {format(parseISO(sailing.endDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="bg-ash-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                      <MapPin className="h-3.5 w-3.5" />
                      From
                    </div>
                    <p className="font-medium text-sm truncate">
                      {sailing.embarkPort?.name ?? sailing.embarkPortName ?? 'TBD'}
                    </p>
                  </div>
                  <div className="bg-ash-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-ash-500 text-xs mb-1">
                      <Clock className="h-3.5 w-3.5" />
                      Duration
                    </div>
                    <p className="font-medium text-sm">
                      {sailing.nights} nights ({portDays} ports, {seaDays} sea)
                    </p>
                  </div>
                </div>

                {/* Ship Details */}
                {(sailing.ship.yearBuilt || sailing.ship.passengerCapacity || sailing.ship.tonnage) && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
                        <Anchor className="h-4 w-4" />
                        Ship Details - {sailing.ship.name}
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        {sailing.ship.yearBuilt && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-ash-400" />
                            <span className="text-ash-500">Built:</span>
                            <span className="font-medium">{sailing.ship.yearBuilt}</span>
                          </div>
                        )}
                        {sailing.ship.passengerCapacity && (
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4 text-ash-400" />
                            <span className="text-ash-500">Capacity:</span>
                            <span className="font-medium">
                              {sailing.ship.passengerCapacity.toLocaleString()} guests
                            </span>
                          </div>
                        )}
                        {sailing.ship.tonnage && (
                          <div className="flex items-center gap-2 text-sm">
                            <Ruler className="h-4 w-4 text-ash-400" />
                            <span className="text-ash-500">Tonnage:</span>
                            <span className="font-medium">
                              {sailing.ship.tonnage.toLocaleString()} GT
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Cabin Pricing */}
                <Separator />
                <CabinPricingGrid sailing={sailing} />

                {/* Port Schedule */}
                <Separator />
                <PortScheduleList sailing={sailing} />
                </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t border-ash-200 p-6 pt-4">
              <div className="flex justify-end w-full">
                <div className="flex gap-3">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  {tripContext ? (
                    <Button
                      onClick={handleAddToItinerary}
                      disabled={addCruiseMutation.isPending}
                      className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                    >
                      {addCruiseMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add to Itinerary'
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowAddToTripDialog(true)}
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

      {/* Add to Trip Dialog - shown when no tripContext */}
      {sailing && (
        <AddToTripDialog
          isOpen={showAddToTripDialog}
          onClose={() => setShowAddToTripDialog(false)}
          activityName={sailing.name}
          activityDates={{ start: sailing.sailDate, end: reliableEndDate }}
          onTripAndItinerarySelected={handleTripAndItinerarySelected}
          isProcessing={addCruiseMutation.isPending}
        />
      )}

      {/* Confirmation dialog for extending itinerary dates */}
      {sailing && (
        <AlertDialog open={showExtendConfirm} onOpenChange={setShowExtendConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Extend Itinerary Dates?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    The cruise dates extend beyond the current itinerary dates.
                  </p>
                  <div className="bg-amber-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-ash-600">Cruise dates:</span>
                      <span className="font-medium">
                        {format(parseISO(sailing.sailDate), 'MMM d')} -{' '}
                        {format(parseISO(sailing.endDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <p>
                    Would you like to extend the itinerary dates to accommodate this cruise?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowExtendConfirm(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmExtend}
                className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                disabled={addCruiseMutation.isPending}
              >
                {addCruiseMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extending...
                  </>
                ) : (
                  'Extend Dates & Add Cruise'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  )
}
