'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Ship,
  Calendar,
  Check,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useTrips, useCreateTrip } from '@/hooks/use-trips'
import type { ItineraryResponseDto } from '@tailfire/shared-types/api'

export interface AddToTripDialogProps {
  isOpen: boolean
  onClose: () => void
  activityName: string
  activityDates?: { start: string; end?: string }
  onTripAndItinerarySelected: (params: {
    tripId: string
    itineraryId: string
    isNewTrip: boolean
    isNewItinerary: boolean
  }) => Promise<void>
  isProcessing?: boolean
}

type Step = 'select-trip' | 'select-itinerary'

export function AddToTripDialog({
  isOpen,
  onClose,
  activityName,
  activityDates,
  onTripAndItinerarySelected,
  isProcessing: externalProcessing = false,
}: AddToTripDialogProps) {
  const [step, setStep] = useState<Step>('select-trip')
  const [searchQuery, setSearchQuery] = useState('')

  // Create new trip state
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [newTripName, setNewTripName] = useState('')

  // Existing trip -> itinerary picker state (only shown when trip has 2+ itineraries)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [itineraries, setItineraries] = useState<ItineraryResponseDto[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null)
  const [createNewItinerary, setCreateNewItinerary] = useState(false)
  const [newItineraryName, setNewItineraryName] = useState('')

  // Loading state for when a trip is being processed
  const [processingTripId, setProcessingTripId] = useState<string | null>(null)

  // Fetch trips (excluding archived)
  const { data: tripsData, isLoading: isLoadingTrips } = useTrips({
    limit: 50,
    search: searchQuery || undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  })

  // Mutations
  const createTripMutation = useCreateTrip()

  const trips = tripsData?.data ?? []

  const isProcessing = externalProcessing || !!processingTripId || createTripMutation.isPending

  // Format date range for display
  const formatDateRange = () => {
    if (!activityDates?.start) return null
    const startFormatted = format(parseISO(activityDates.start), 'MMM d')
    if (activityDates.end) {
      const endFormatted = format(parseISO(activityDates.end), 'MMM d, yyyy')
      return `${startFormatted} - ${endFormatted}`
    }
    return format(parseISO(activityDates.start), 'MMM d, yyyy')
  }

  const dateRangeText = formatDateRange()

  /**
   * Click on an existing trip.
   * - 0 itineraries -> create one and call callback directly
   * - 1 itinerary -> call callback directly (consumer handles date checks)
   * - 2+ itineraries -> show itinerary picker
   */
  const handleTripSelect = async (tripId: string) => {
    if (processingTripId) return // Prevent double-click race
    setProcessingTripId(tripId)

    try {
      const tripItineraries = await api.get<ItineraryResponseDto[]>(`/trips/${tripId}/itineraries`)

      if (tripItineraries.length === 0) {
        // No itineraries -- create one with activity dates
        const newItinerary = await api.post<{ id: string }>(`/trips/${tripId}/itineraries`, {
          name: `${activityName} Itinerary`,
          startDate: activityDates?.start,
          endDate: activityDates?.end,
        })
        await onTripAndItinerarySelected({
          tripId,
          itineraryId: newItinerary.id,
          isNewTrip: false,
          isNewItinerary: true,
        })
      } else if (tripItineraries.length === 1) {
        const itinerary = tripItineraries[0]!
        await onTripAndItinerarySelected({
          tripId,
          itineraryId: itinerary.id,
          isNewTrip: false,
          isNewItinerary: false,
        })
      } else {
        // Multiple itineraries -- show picker
        setSelectedTripId(tripId)
        setItineraries(tripItineraries)
        setSelectedItineraryId(null)
        setCreateNewItinerary(false)
        setNewItineraryName(`${activityName} Itinerary`)
        setStep('select-itinerary')
      }
    } catch {
      // Errors handled by consumer's mutation onError callbacks
    } finally {
      setProcessingTripId(null)
    }
  }

  /**
   * Create a new trip, auto-create an itinerary, and call callback -- all in one action
   */
  const handleCreateTripAndAdd = async () => {
    const tripName = newTripName.trim()
    if (!tripName) return

    setProcessingTripId('new')

    try {
      const newTrip = await createTripMutation.mutateAsync({
        name: tripName,
        startDate: activityDates?.start,
        endDate: activityDates?.end,
        tripType: 'leisure',
      })

      const newItinerary = await api.post<{ id: string }>(`/trips/${newTrip.id}/itineraries`, {
        name: `${activityName} Itinerary`,
        startDate: activityDates?.start,
        endDate: activityDates?.end,
      })

      await onTripAndItinerarySelected({
        tripId: newTrip.id,
        itineraryId: newItinerary.id,
        isNewTrip: true,
        isNewItinerary: true,
      })
    } catch {
      // Errors handled by consumer's mutation onError callbacks
    } finally {
      setProcessingTripId(null)
    }
  }

  /**
   * Add to selected itinerary (step 2 -- only used when trip has multiple itineraries)
   */
  const handleAddToSelectedItinerary = async () => {
    if (!selectedTripId) return

    setProcessingTripId(selectedTripId)

    try {
      if (createNewItinerary) {
        // New itinerary uses activity dates -- no date conflict possible
        const newItinerary = await api.post<{ id: string }>(`/trips/${selectedTripId}/itineraries`, {
          name: newItineraryName || `${activityName} Itinerary`,
          startDate: activityDates?.start,
          endDate: activityDates?.end,
        })
        await onTripAndItinerarySelected({
          tripId: selectedTripId,
          itineraryId: newItinerary.id,
          isNewTrip: false,
          isNewItinerary: true,
        })
      } else {
        if (!selectedItineraryId) return
        await onTripAndItinerarySelected({
          tripId: selectedTripId,
          itineraryId: selectedItineraryId,
          isNewTrip: false,
          isNewItinerary: false,
        })
      }
    } catch {
      // Errors handled by consumer's mutation onError callbacks
    } finally {
      setProcessingTripId(null)
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
                {dateRangeText && (
                  <span className="block mt-1 text-phoenix-gold-600 font-medium">
                    {dateRangeText}
                  </span>
                )}
              </>
            ) : (
              <>
                This trip has multiple itineraries. Choose one.
                {dateRangeText && (
                  <span className="block mt-1 text-phoenix-gold-600 font-medium">
                    Activity dates: {dateRangeText}
                  </span>
                )}
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
                  ? 'border-phoenix-gold-500 bg-phoenix-gold-50'
                  : 'border-ash-200 hover:border-phoenix-gold-300 hover:bg-ash-50'
              )}
              onClick={() => setShowCreateTrip(true)}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-full',
                  showCreateTrip ? 'bg-phoenix-gold-100' : 'bg-ash-100'
                )}>
                  <Plus className={cn(
                    'h-4 w-4',
                    showCreateTrip ? 'text-phoenix-gold-600' : 'text-ash-500'
                  )} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-ash-900">Create New Trip</p>
                  <p className="text-xs text-ash-500">Start a new trip with this activity</p>
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
                    className="w-full bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
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
                        Create Trip & Add Activity
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
                <span className="bg-white px-2 text-ash-500">
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
                  <Ship className="h-12 w-12 text-ash-300 mb-2" />
                  <p className="text-sm text-ash-500">No trips found</p>
                  {searchQuery && (
                    <p className="text-xs text-ash-400 mt-1">
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
                            ? 'border-phoenix-gold-500 bg-phoenix-gold-50'
                            : 'hover:bg-ash-50 hover:border-phoenix-gold-300',
                          'focus:outline-none focus:ring-2 focus:ring-phoenix-gold-500',
                          isProcessing && !isBusy && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-ash-900 truncate">
                              {trip.name}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-ash-500">
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
                            <Loader2 className="h-4 w-4 text-phoenix-gold-600 animate-spin flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-ash-400 flex-shrink-0" />
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
          /* Step 2: Itinerary picker -- only shown when trip has 2+ itineraries */
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
                <Label className="text-xs text-ash-500 uppercase tracking-wide">
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
                          ? 'border-phoenix-gold-500 bg-phoenix-gold-50'
                          : 'hover:bg-ash-50'
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
                        <p className="text-xs text-ash-500 mt-0.5">
                          {itinerary.startDate && itinerary.endDate ? (
                            <>
                              {format(parseISO(itinerary.startDate), 'MMM d')} - {format(parseISO(itinerary.endDate), 'MMM d, yyyy')}
                              <span className="mx-1">&bull;</span>
                            </>
                          ) : (
                            <span className="text-ash-400">No dates set &bull; </span>
                          )}
                          {itinerary.status}
                        </p>
                      </div>
                      {itinerary.isSelected && (
                        <Check className="h-4 w-4 text-phoenix-gold-600 flex-shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Create New Itinerary Option */}
              <div className="pt-2">
                <Label className="text-xs text-ash-500 uppercase tracking-wide">
                  Or Create New
                </Label>
                <div
                  className={cn(
                    'flex items-start space-x-3 p-3 mt-2 rounded-lg border cursor-pointer transition-colors',
                    createNewItinerary
                      ? 'border-phoenix-gold-500 bg-phoenix-gold-50'
                      : 'hover:bg-ash-50'
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
                    {dateRangeText && (
                      <p className="text-xs text-ash-500 mt-0.5">
                        Will use activity dates: {dateRangeText}
                      </p>
                    )}
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
              className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
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
  )
}
