'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { Loader2, Package } from 'lucide-react'
import { DetailLayout } from '@/components/layout'
import { ActivityForm } from '../../../_components/activity-form'
import { FlightForm } from '../../../_components/flight-form'
import { CustomCruiseForm } from '../../../_components/custom-cruise-form'
import { LodgingForm } from '../../../_components/lodging-form'
import { TransportationForm } from '../../../_components/transportation-form'
import { DiningForm } from '../../../_components/dining-form'
import { PortInfoForm } from '../../../_components/port-info-form'
import { TourForm } from '../../../_components/tour-form'
import { OptionsForm } from '../../../_components/options-form'
import { PackageForm } from '../../../_components/package-form'
import { buildActivityNavSidebar } from '../../../_components/activity-nav-sidebar'
import { useActivity } from '@/hooks/use-activities'
import { useItineraries } from '@/hooks/use-itineraries'
import { useItineraryDaysWithActivities } from '@/hooks/use-itinerary-days'
import { useTrip } from '@/hooks/use-trips'
import { useBooking } from '@/hooks/use-bookings'
import { parseISODate } from '@/lib/date-utils'
import type { ActivityResponseDto } from '@tailfire/shared-types/api'

/**
 * Renders the appropriate form based on component type.
 * Uses switch-case for maintainability and clear routing.
 */
function renderActivityForm(
  componentType: string | null,
  props: {
    tripId: string
    itineraryId: string
    dayId: string
    dayDate?: string | null
    trip?: any
    activity?: ActivityResponseDto
    activityIdFromUrl?: string // URL param - reliable during navigation (avoids keepPreviousData stale ID)
    onSuccess: () => void
    onCancel: () => void
    days?: Array<{ id: string; dayNumber: number; date?: string | null; title?: string | null }>
  }
) {
  const { tripId, itineraryId, dayId, dayDate, trip, activity, activityIdFromUrl, onSuccess, onCancel, days } = props

  // Use URL param as key to force React to remount the form when activity changes.
  // This ensures fresh state/refs when navigating between activities.
  // IMPORTANT: Use activityIdFromUrl (URL param) NOT activity?.id to avoid stale data
  // issues during client-side navigation (activity?.id may be stale due to keepPreviousData).
  const formKey = activityIdFromUrl || activity?.id || 'new'

  switch (componentType) {
    // Flight - airline, flight number, departure/arrival airports
    case 'flight':
      return (
        <FlightForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          activityIdFromUrl={activityIdFromUrl}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Cruise - cruise line, ship, cabin, port calls
    case 'cruise':
    case 'custom_cruise':
      return (
        <CustomCruiseForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          days={days}
        />
      )

    // Lodging - hotel, check-in/out, room details
    case 'lodging':
      return (
        <LodgingForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Transportation - car rental, train, bus, transfer
    case 'transportation':
      return (
        <TransportationForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Dining - restaurant reservations, meals
    case 'dining':
      return (
        <DiningForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Port Info - port of call details for cruises
    case 'port_info':
      return (
        <PortInfoForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Tour - excursions, activities, attractions
    case 'tour':
      return (
        <TourForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Options - optional activities, excursions
    case 'options':
      return (
        <OptionsForm
          key={formKey}
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Package - bundled activities with pricing
    case 'package':
      return (
        <PackageForm
          key={formKey}
          tripId={tripId}
          packageId={activityIdFromUrl || activity?.id}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // Fallback - generic activity form for unknown types
    default:
      return (
        <div key={formKey} className="bg-white rounded-lg border border-ash-200 p-6">
          <ActivityForm
            itineraryId={itineraryId}
            dayId={dayId}
            dayDate={dayDate}
            activity={activity}
            onSuccess={onSuccess}
            onCancel={onCancel}
          />
        </div>
      )
  }
}

export default function EditActivityPage() {
  const params = useParams<{ id: string; activityId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get('type')

  const tripId = params.id
  const activityId = params.activityId
  const isPackageRoute = type === 'package'

  const { data: trip } = useTrip(tripId)
  const { data: itineraries, isLoading: isItinerariesLoading } = useItineraries(tripId)

  // Search through all itineraries to find which one contains this activity
  const targetItinerary = useMemo(() => {
    if (!itineraries) return null

    // For now, use the selected itinerary or first one
    // In the future, we could search through all itineraries
    return itineraries.find((it) => it.isSelected) || itineraries[0]
  }, [itineraries])

  // Skip activity-related queries for package routes
  const { data: days, isLoading: isDaysLoading } = useItineraryDaysWithActivities(
    isPackageRoute ? null : (targetItinerary?.id || null)
  )

  // Find the day that contains this activity
  const dayWithActivity = days?.find((d) =>
    d.activities?.some((a) => a.id === activityId)
  )
  const dayId = dayWithActivity?.id

  const { data: activity, isLoading: isActivityLoading } = useActivity(
    isPackageRoute ? null : (dayId || null),
    isPackageRoute ? null : activityId
  )

  // Fallback: Try to fetch as package if activity not found (handles deep links without ?type=package)
  const shouldTryPackageFallback = !isPackageRoute && !dayId && !isDaysLoading && !isItinerariesLoading
  const { data: packageFallback, isLoading: isPackageFallbackLoading } = useBooking(
    shouldTryPackageFallback ? activityId : null
  )

  const isLoading = isPackageRoute
    ? false // PackageForm handles its own loading
    : (isItinerariesLoading || isDaysLoading || isActivityLoading || (shouldTryPackageFallback && isPackageFallbackLoading))

  // Build sidebar navigation sections
  const sidebarSections = useMemo(
    () => buildActivityNavSidebar(tripId, days, activityId),
    [tripId, days, activityId]
  )

  // Additional navigation links
  const additionalBackLinks = [
    {
      href: `/trips/${tripId}?tab=bookings`,
      label: 'Back to Bookings',
    },
  ]

  if (isLoading && type !== 'package') {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=itinerary`}
        backLabel="Back to Itinerary"
        additionalBackLinks={additionalBackLinks}
        sidebarSections={sidebarSections}
      >
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-phoenix-gold-500" />
        </div>
      </DetailLayout>
    )
  }

  // Package edit - PackageForm handles its own data fetching via useBooking()
  if (type === 'package') {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=bookings`}
        backLabel="Back to Bookings"
        sidebarSections={sidebarSections}
      >
        <div className="p-6">
          <PackageForm
            tripId={tripId}
            packageId={activityId}
            onSuccess={() => router.back()}
            onCancel={() => router.back()}
          />
        </div>
      </DetailLayout>
    )
  }

  // Fallback: If activity not found but package fetch succeeded, render PackageForm
  if ((!dayId || !activity) && packageFallback) {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=bookings`}
        backLabel="Back to Bookings"
        sidebarSections={sidebarSections}
      >
        <div className="p-6">
          <PackageForm
            tripId={tripId}
            packageId={activityId}
            onSuccess={() => router.back()}
            onCancel={() => router.back()}
          />
        </div>
      </DetailLayout>
    )
  }

  if (!dayId || !activity) {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=itinerary`}
        backLabel="Back to Itinerary"
        additionalBackLinks={additionalBackLinks}
        sidebarSections={sidebarSections}
      >
        <div className="p-6">
          <p className="text-ash-600">Activity not found.</p>
        </div>
      </DetailLayout>
    )
  }

  const day = days?.find((d) => d.id === dayId)

  return (
    <DetailLayout
      backHref={`/trips/${tripId}?tab=itinerary`}
      backLabel="Back to Itinerary"
      additionalBackLinks={additionalBackLinks}
      sidebarSections={sidebarSections}
    >
      <div className="p-6">
        {/* Header */}
        <div className="border-b border-ash-200 pb-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-ash-900">Edit Activity</h1>
            {activity.packageId && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                <Package className="h-3.5 w-3.5" />
                Linked to Package
              </span>
            )}
          </div>
          {day && (
            <p className="text-sm text-ash-600">
              {day.title || `Day ${day.dayNumber}`}
              {day.date && parseISODate(day.date) && (
                <span className="ml-2">• {parseISODate(day.date)!.toLocaleDateString()}</span>
              )}
            </p>
          )}
        </div>

        {/* Form Content */}
        {renderActivityForm(activity.componentType, {
          tripId,
          itineraryId: targetItinerary?.id || '',
          dayId,
          dayDate: day?.date,
          activity,
          activityIdFromUrl: activityId, // Pass URL param directly for reliable ID during navigation
          trip,
          onSuccess: () => router.back(),
          onCancel: () => router.back(),
          days: days || [],
        })}
      </div>
    </DetailLayout>
  )
}
