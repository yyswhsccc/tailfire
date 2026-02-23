'use client'

/**
 * Trip Payments Tab
 *
 * Displays comprehensive payment information matching TERN UI design:
 * - Expected Payments table with payment schedules
 * - Past Payments and Authorizations table
 * - Payment status tracking across all bookings
 *
 * TODO: Add @UseGuards(AuthGuard) when auth is implemented
 * TODO: Add tenant scoping to ensure users can only access their own agency's data
 */

import { useMemo } from 'react'
import { ActivityResponseDto } from '@tailfire/shared-types'
import type { TripWithDetailsResponseDto } from '@tailfire/shared-types/api'
import { useItineraries } from '@/hooks/use-itineraries'
import { useItineraryDaysWithActivities } from '@/hooks/use-itinerary-days'
import { PaymentsDataTable } from '@/components/payments/payments-data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity } from 'lucide-react'

export function TripPayments({ trip }: { trip: TripWithDetailsResponseDto }) {
  const { data: itineraries, isLoading: itinerariesLoading } = useItineraries(trip.id, { isSelected: true })
  const selectedItinerary = itineraries?.[0] || null
  const { data: days, isLoading: daysLoading } = useItineraryDaysWithActivities(selectedItinerary?.id || null)

  const currency = trip.currency || 'CAD'

  // Flatten all activities from all days
  const allActivities: ActivityResponseDto[] = useMemo(() => {
    if (!days) return []
    return days.flatMap(day => day.activities || [])
  }, [days])

  const isLoading = itinerariesLoading || daysLoading

  if (isLoading) {
    return <TripPaymentsSkeleton />
  }

  // Empty state: no itinerary yet
  if (!selectedItinerary) {
    return (
      <EmptyState
        title="No itinerary yet"
        description="Create an itinerary for this trip to start tracking payments."
        icon={<Activity className="h-12 w-12 text-gray-400" />}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Payments Table */}
      <PaymentsDataTable
        activities={allActivities}
        currency={currency}
        tripId={trip.id}
      />
    </div>
  )
}

function TripPaymentsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Expected Payments Table Skeleton */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>

      {/* Past Payments Table Skeleton */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-6 w-56" />
        </div>
        <div className="p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}
