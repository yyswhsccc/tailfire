'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Ship,
  Calendar,
  Check,
  AlertTriangle,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useTrips, useCreateTrip } from '@/hooks/use-trips'
import { useAddCruiseToItinerary, type SailingDetailResponse } from '@/hooks/use-cruise-library'
import type { ItineraryResponseDto } from '@tailfire/shared-types/api'

interface AddToTripDialogProps {
  sailing: SailingDetailResponse
  isOpen: boolean
  onClose: () => void
  onSuccess?: (tripId: string) => void
}

type Step = 'select-trip' | 'select-itinerary'

export function AddToTripDialog({
  sailing,
  isOpen,
  onClose,
  onSuccess,
}: AddToTripDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('select-trip')
  const [searchQuery, setSearchQuery] = useState('')

  // Create new trip state
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [newTripName, setNewTripName] = useState('')

  // Existing trip → itinerary picker state (only shown when trip has 2+ itineraries)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [itineraries, setItineraries] = useState<ItineraryResponseDto[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null)
  const [createNewItinerary, setCreateNewItinerary] = useState(false)
  const [newItineraryName, setNewItineraryName] = useState('')

  // Loading state for when a trip is being processed
  const [processingTripId, setProcessingTripId] = useState<string | null>(null)

  // Confirmation dialog state for extending itinerary dates
  const [showExtendConfirm, setShowExtendConfirm] = useState(false)
  const [pendingExtendParams, setPendingExtendParams] = useState<{
    itineraryId: string
    tripId: string
    cruiseDates: { start: string; end: string }
    itineraryDates: { start: string; end: string }
  } | null>(null)

  // Fetch trips (excluding archived)
  const { data: tripsData, isLoading: isLoadingTrips } = useTrips({
    limit: 50,
    search: searchQuery || undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  })

  // Mutations
  const createTripMutation = useCreateTrip()
  const addCruiseMutation = useAddCruiseToItinerary()

  const trips = tripsData?.data ?? []

  const isProcessing = !!processingTripId || createTripMutation.isPending || addCruiseMutation.isPending

  /**
   * Navigate to trip after successful add
   */
  const navigateToTrip = (tripId: string) => {
    onSuccess?.(tripId)
    handleClose()
    router.push(`/trips/${tripId}`)
  }

  /**
   * Check if cruise dates fit within itinerary dates (client-side pre-check).
   * Returns true if dates fit or itinerary has no dates set.
   */
  const datesNeedExtending = (itinerary: ItineraryResponseDto): boolean => {
    if (!itinerary.startDate || !itinerary.endDate) return false
    return sailing.sailDate < itinerary.startDate || sailing.endDate > itinerary.endDate
  }

  /**
   * Add cruise to an itinerary (shared logic for all flows).
   * Always uses autoExtendItinerary=true since we pre-check dates client-side.
   */
  const addCruiseToItinerary = async (tripId: string, itineraryId: string) => {
    await addCruiseMutation.mutateAsync({
      sailing,
      itineraryId,
      tripId,
      autoExtendItinerary: true,
    })
    navigateToTrip(tripId)
  }

  /**
   * Show the extend dates confirmation dialog (pre-check, before creating anything)
   */
  const promptExtendDates = (tripId: string, itinerary: ItineraryResponseDto) => {
    setPendingExtendParams({
      itineraryId: itinerary.id,
      tripId,
      cruiseDates: { start: sailing.sailDate, end: sailing.endDate },
      itineraryDates: {
        start: itinerary.startDate || '',
        end: itinerary.endDate || '',
      },
    })
    setShowExtendConfirm(true)
  }

  /**
   * Click on an existing trip.
   * - 0 itineraries → create one and add cruise directly
   * - 1 itinerary → check dates, then add cruise or prompt extend
   * - 2+ itineraries → show itinerary picker
   */
  const handleTripSelect = async (tripId: string) => {
    setProcessingTripId(tripId)

    try {
      const tripItineraries = await api.get<ItineraryResponseDto[]>(`/trips/${tripId}/itineraries`)

      if (tripItineraries.length === 0) {
        // No itineraries — create one with cruise dates (no date conflict possible)
        const newItinerary = await api.post<{ id: string }>(`/trips/${tripId}/itineraries`, {
          name: `${sailing.name} Itinerary`,
          startDate: sailing.sailDate,
          endDate: sailing.endDate,
        })
        await addCruiseToItinerary(tripId, newItinerary.id)
      } else if (tripItineraries.length === 1) {
        const itinerary = tripItineraries[0]!
        if (datesNeedExtending(itinerary)) {
          // Dates don't fit — ask user BEFORE creating anything
          promptExtendDates(tripId, itinerary)
        } else {
          // Dates fit — add cruise directly
          await addCruiseToItinerary(tripId, itinerary.id)
        }
      } else {
        // Multiple itineraries — show picker
        setSelectedTripId(tripId)
        setItineraries(tripItineraries)
        setSelectedItineraryId(null)
        setCreateNewItinerary(false)
        setNewItineraryName(`${sailing.name} Itinerary`)
        setStep('select-itinerary')
      }
    } catch {
      // Errors handled by mutation onError callbacks
    } finally {
      setProcessingTripId(null)
    }
  }

  /**
   * Create a new trip, auto-create an itinerary, and add the cruise — all in one action
   */
  const handleCreateTripAndAdd = async () => {
    const tripName = newTripName.trim()
    if (!tripName) return

    setProcessingTripId('new')

    try {
      const newTrip = await createTripMutation.mutateAsync({
        name: tripName,
        startDate: sailing.sailDate,
        endDate: sailing.endDate,
        tripType: 'leisure',
      })

      const newItinerary = await api.post<{ id: string }>(`/trips/${newTrip.id}/itineraries`, {
        name: `${sailing.name} Itinerary`,
        startDate: sailing.sailDate,
        endDate: sailing.endDate,
      })

      await addCruiseMutation.mutateAsync({
        sailing,
        itineraryId: newItinerary.id,
        tripId: newTrip.id,
        autoExtendItinerary: false,
      })

      navigateToTrip(newTrip.id)
    } catch {
      // Errors handled by mutation onError callbacks
    } finally {
      setProcessingTripId(null)
    }
  }

  /**
   * Add cruise to selected itinerary (step 2 — only used when trip has multiple itineraries)
   */
  const handleAddToSelectedItinerary = async () => {
    if (!selectedTripId) return

    setProcessingTripId(selectedTripId)

    try {
      if (createNewItinerary) {
        // New itinerary uses cruise dates — no date conflict possible
        const newItinerary = await api.post<{ id: string }>(`/trips/${selectedTripId}/itineraries`, {
          name: newItineraryName || `${sailing.name} Itinerary`,
          startDate: sailing.sailDate,
          endDate: sailing.endDate,
        })
        await addCruiseToItinerary(selectedTripId, newItinerary.id)
      } else {
        if (!selectedItineraryId) return
        // Check dates for existing itinerary
        const selectedItin = itineraries.find((i) => i.id === selectedItineraryId)
        if (selectedItin && datesNeedExtending(selectedItin)) {
          promptExtendDates(selectedTripId, selectedItin)
          return
        }
        await addCruiseToItinerary(selectedTripId, selectedItineraryId)
      }
    } catch {
      // Errors handled by mutation onError callbacks
    } finally {
      setProcessingTripId(null)
    }
  }

  const handleConfirmExtend = async () => {
    if (!pendingExtendParams) return

    try {
      await addCruiseMutation.mutateAsync({
        sailing,
        itineraryId: pendingExtendParams.itineraryId,
        tripId: pendingExtendParams.tripId,
        autoExtendItinerary: true,
      })

      setShowExtendConfirm(false)
      setPendingExtendParams(null)
      navigateToTrip(pendingExtendParams.tripId)
    } catch {
      setShowExtendConfirm(false)
      setPendingExtendParams(null)
    }
  }

  const handleClose = () => {
    setStep('select-trip')
    setSelectedTripId(null)
    setSelectedItineraryId(null)
    setCreateNewItinerary(false)
    setNewItineraryName('')
    setSearchQuery('')
    setShowCreateTrip(false)
    setNewTripName('')
    setItineraries([])
    setProcessingTripId(null)
    onClose()
  }

  const handleBack = () => {
    setStep('select-trip')
    setSelectedTripId(null)
    setSelectedItineraryId(null)
    setCreateNewItinerary(false)
    setItineraries([])
  }

  const canProceedItinerary = createNewItinerary
    ? newItineraryName.trim().length > 0
    : !!selectedItineraryId

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'select-trip' ? 'Add to Trip' : 'Select Itinerary'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select-trip' ? (
              <>
                Create a new trip or add to an existing one.
                <span className="block mt-1 text-tern-teal-600 font-medium">
                  {format(parseISO(sailing.sailDate), 'MMM d')} - {format(parseISO(sailing.endDate), 'MMM d, yyyy')} ({sailing.nights} nights)
                </span>
              </>
            ) : (
              <>
                This trip has multiple itineraries. Choose one.
                <span className="block mt-1 text-tern-teal-600 font-medium">
                  Cruise dates: {format(parseISO(sailing.sailDate), 'MMM d')} - {format(parseISO(sailing.endDate), 'MMM d, yyyy')}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === 'select-trip' ? (
          <div className="space-y-4">
            {/* Create New Trip */}
            <div
              className={cn(
                'p-3 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
                showCreateTrip
                  ? 'border-tern-teal-500 bg-tern-teal-50'
                  : 'border-tern-gray-200 hover:border-tern-teal-300 hover:bg-tern-gray-50'
              )}
              onClick={() => setShowCreateTrip(true)}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-full',
                  showCreateTrip ? 'bg-tern-teal-100' : 'bg-tern-gray-100'
                )}>
                  <Plus className={cn(
                    'h-4 w-4',
                    showCreateTrip ? 'text-tern-teal-600' : 'text-tern-gray-500'
                  )} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-tern-gray-900">Create New Trip</p>
                  <p className="text-xs text-tern-gray-500">Start a new trip with this cruise</p>
                </div>
              </div>
              {showCreateTrip && (
                <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <Input
                    placeholder="Trip name (e.g., Mediterranean 2026)"
                    value={newTripName}
                    onChange={(e) => setNewTripName(e.target.value)}
                    autoFocus
                    disabled={isProcessing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTripName.trim() && !isProcessing) {
                        void handleCreateTripAndAdd()
                      }
                    }}
                  />
                  <Button
                    onClick={handleCreateTripAndAdd}
                    disabled={!newTripName.trim() || isProcessing}
                    className="w-full bg-tern-teal-600 hover:bg-tern-teal-700"
                    size="sm"
                  >
                    {processingTripId === 'new' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Trip...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Trip & Add Cruise
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-tern-gray-500">
                  or add to existing trip
                </span>
              </div>
            </div>

            {/* Search */}
            <Input
              placeholder="Search trips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
              disabled={isProcessing}
            />

            {/* Trip List */}
            <ScrollArea className="h-[250px] pr-4">
              {isLoadingTrips ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : trips.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <Ship className="h-12 w-12 text-tern-gray-300 mb-2" />
                  <p className="text-sm text-tern-gray-500">No trips found</p>
                  {searchQuery && (
                    <p className="text-xs text-tern-gray-400 mt-1">
                      Try a different search term
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {trips.map((trip) => {
                    const isBusy = processingTripId === trip.id
                    return (
                      <button
                        key={trip.id}
                        onClick={() => void handleTripSelect(trip.id)}
                        disabled={isProcessing}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left transition-colors',
                          isBusy
                            ? 'border-tern-teal-500 bg-tern-teal-50'
                            : 'hover:bg-tern-gray-50 hover:border-tern-teal-300',
                          'focus:outline-none focus:ring-2 focus:ring-tern-teal-500',
                          isProcessing && !isBusy && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-tern-gray-900 truncate">
                              {trip.name}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-tern-gray-500">
                              {trip.startDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(parseISO(trip.startDate), 'MMM d, yyyy')}
                                </span>
                              )}
                              {trip.status && (
                                <span className="capitalize">{trip.status.replace('_', ' ')}</span>
                              )}
                            </div>
                          </div>
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 text-tern-teal-600 animate-spin flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-tern-gray-400 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          /* Step 2: Itinerary picker — only shown when trip has 2+ itineraries */
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2 -ml-2"
              disabled={isProcessing}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to trips
            </Button>

            <RadioGroup
              value={createNewItinerary ? 'new' : selectedItineraryId || ''}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateNewItinerary(true)
                  setSelectedItineraryId(null)
                } else {
                  setCreateNewItinerary(false)
                  setSelectedItineraryId(value)
                }
              }}
            >
              <div className="space-y-2">
                <Label className="text-xs text-tern-gray-500 uppercase tracking-wide">
                  Existing Itineraries
                </Label>
                {itineraries.map((itinerary) => {
                  const isSelected = selectedItineraryId === itinerary.id
                  return (
                    <div
                      key={itinerary.id}
                      className={cn(
                        'flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer',
                        isSelected
                          ? 'border-tern-teal-500 bg-tern-teal-50'
                          : 'hover:bg-tern-gray-50'
                      )}
                      onClick={() => {
                        setCreateNewItinerary(false)
                        setSelectedItineraryId(itinerary.id)
                      }}
                    >
                      <RadioGroupItem
                        value={itinerary.id}
                        id={itinerary.id}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={itinerary.id}
                          className="font-medium text-sm cursor-pointer"
                        >
                          {itinerary.name}
                        </Label>
                        <p className="text-xs text-tern-gray-500 mt-0.5">
                          {itinerary.startDate && itinerary.endDate ? (
                            <>
                              {format(parseISO(itinerary.startDate), 'MMM d')} - {format(parseISO(itinerary.endDate), 'MMM d, yyyy')}
                              <span className="mx-1">•</span>
                            </>
                          ) : (
                            <span className="text-tern-gray-400">No dates set • </span>
                          )}
                          {itinerary.status}
                        </p>
                      </div>
                      {itinerary.isSelected && (
                        <Check className="h-4 w-4 text-tern-teal-600 flex-shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Create New Itinerary Option */}
              <div className="pt-2">
                <Label className="text-xs text-tern-gray-500 uppercase tracking-wide">
                  Or Create New
                </Label>
                <div
                  className={cn(
                    'flex items-start space-x-3 p-3 mt-2 rounded-lg border cursor-pointer transition-colors',
                    createNewItinerary
                      ? 'border-tern-teal-500 bg-tern-teal-50'
                      : 'hover:bg-tern-gray-50'
                  )}
                  onClick={() => {
                    setCreateNewItinerary(true)
                    setSelectedItineraryId(null)
                  }}
                >
                  <RadioGroupItem value="new" id="new-itinerary" className="mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <Label
                      htmlFor="new-itinerary"
                      className="font-medium text-sm cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create new itinerary
                    </Label>
                    <p className="text-xs text-tern-gray-500 mt-0.5">
                      Will use cruise dates: {format(parseISO(sailing.sailDate), 'MMM d')} - {format(parseISO(sailing.endDate), 'MMM d, yyyy')}
                    </p>
                    {createNewItinerary && (
                      <Input
                        placeholder="Itinerary name"
                        value={newItineraryName}
                        onChange={(e) => setNewItineraryName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2"
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          {step === 'select-itinerary' && (
            <Button
              onClick={handleAddToSelectedItinerary}
              disabled={!canProceedItinerary || isProcessing}
              className="bg-tern-teal-600 hover:bg-tern-teal-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add to Itinerary'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Confirmation dialog for extending itinerary dates */}
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
                {pendingExtendParams && (
                  <div className="bg-amber-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-tern-gray-600">Cruise dates:</span>
                      <span className="font-medium">
                        {format(parseISO(pendingExtendParams.cruiseDates.start), 'MMM d')} -{' '}
                        {format(parseISO(pendingExtendParams.cruiseDates.end), 'MMM d, yyyy')}
                      </span>
                    </div>
                    {pendingExtendParams.itineraryDates.start && pendingExtendParams.itineraryDates.end && (
                      <div className="flex justify-between">
                        <span className="text-tern-gray-600">Itinerary dates:</span>
                        <span className="font-medium">
                          {format(parseISO(pendingExtendParams.itineraryDates.start), 'MMM d')} -{' '}
                          {format(parseISO(pendingExtendParams.itineraryDates.end), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <p>
                  Would you like to extend the itinerary dates to accommodate this cruise?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowExtendConfirm(false); setPendingExtendParams(null) }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExtend}
              className="bg-tern-teal-600 hover:bg-tern-teal-700"
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
    </>
  )
}
