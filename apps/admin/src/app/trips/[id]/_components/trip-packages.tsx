'use client'

/**
 * Trip Bookings Tab
 *
 * Displays bookings for a trip matching TERN design:
 * - Itinerary selector tabs (same as Itinerary tab)
 * - Compact overview section with financial metrics
 * - Unified bookings table with packages + standalone activities
 * - Activity linking/unlinking via multi-select
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import type { TripWithDetailsResponseDto, ItineraryResponseDto } from '@tailfire/shared-types'
import { PackagesTable } from '@/components/packages/packages-table'
import { Button } from '@/components/ui/button'
import { useItineraries, useSelectItinerary } from '@/hooks/use-itineraries'
import { useToast } from '@/hooks/use-toast'
import { ItinerarySelector } from './itinerary-selector'
import { CreateItineraryDialog } from './create-itinerary-dialog'

export function TripPackages({ trip }: { trip: TripWithDetailsResponseDto }) {
  const router = useRouter()
  const currency = trip.currency || 'CAD'
  const { toast } = useToast()

  // Fetch itineraries
  const { data: itineraries = [], isLoading: itinerariesLoading } = useItineraries(trip.id)
  const selectItinerary = useSelectItinerary(trip.id)

  // Selected itinerary state (matches Itinerary tab pattern)
  const [selectedItinerary, setSelectedItinerary] = useState<ItineraryResponseDto | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Sync selected itinerary when data loads
  useEffect(() => {
    if (itineraries.length > 0 && !selectedItinerary) {
      const selected = itineraries.find((it) => it.isSelected) || itineraries[0]
      setSelectedItinerary(selected ?? null)
    }
  }, [itineraries, selectedItinerary])

  const handleSelectItinerary = async (itinerary: ItineraryResponseDto) => {
    // Optimistically update UI
    setSelectedItinerary(itinerary)

    // Persist selection to backend
    try {
      await selectItinerary.mutateAsync(itinerary.id)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update itinerary selection.',
        variant: 'destructive',
      })
      // Revert to previous selection on error
      const currentSelected = itineraries.find((it) => it.isSelected)
      if (currentSelected) {
        setSelectedItinerary(currentSelected)
      }
    }
  }

  const handleCreateSuccess = async (newItinerary: ItineraryResponseDto) => {
    // Select the newly created itinerary
    setSelectedItinerary(newItinerary)

    // Persist selection to backend
    try {
      await selectItinerary.mutateAsync(newItinerary.id)
    } catch {
      // Selection failed, but itinerary was created - not critical
    }

    toast({
      title: 'Success',
      description: 'Itinerary created successfully',
    })
  }

  return (
    <div className="space-y-3">
      {/* Itinerary Selector + Import Button */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ItinerarySelector
            tripId={trip.id}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            itineraries={itineraries}
            selectedItinerary={selectedItinerary}
            onSelectItinerary={handleSelectItinerary}
            onCreateClick={() => setShowCreateDialog(true)}
            isLoading={itinerariesLoading}
            hideActionButtons
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/trips/import?tripId=${trip.id}`)}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Import Booking
        </Button>
      </div>

      {/* Bookings Table with Overview */}
      <PackagesTable
        tripId={trip.id}
        currency={currency}
        itineraryId={selectedItinerary?.id}
        filterItineraryId={selectedItinerary?.id || null}
      />

      {/* Create Itinerary Dialog */}
      <CreateItineraryDialog
        tripId={trip.id}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
