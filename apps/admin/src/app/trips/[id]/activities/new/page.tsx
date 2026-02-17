'use client'

import { useMemo, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Plus } from 'lucide-react'
import { useLoading } from '@/context/loading-context'
import { DetailLayout } from '@/components/layout'
import { FlightForm } from '../../_components/flight-form'
import { CustomCruiseForm } from '../../_components/custom-cruise-form'
import { LodgingForm } from '../../_components/lodging-form'
import { TransportationForm } from '../../_components/transportation-form'
import { DiningForm } from '../../_components/dining-form'
import { PortInfoForm } from '../../_components/port-info-form'
import { OptionsForm } from '../../_components/options-form'
import { TourForm } from '../../_components/tour-form'
import { PackageForm } from '../../_components/package-form'
import { buildActivityNavSidebar } from '../../_components/activity-nav-sidebar'
import { useItineraryDaysWithActivities, useAutoGenerateItineraryDays } from '@/hooks/use-itinerary-days'
import { useTrip } from '@/hooks/use-trips'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { parseISODate } from '@/lib/date-utils'
import { ACTIVITY_TYPE_METADATA, getActivityTypeMetadata, type UIActivityType } from '@/lib/activity-constants'
import { cn } from '@/lib/utils'
import type { ActivityResponseDto, ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'

/**
 * Renders the appropriate form based on component type.
 * Uses switch-case for maintainability and clear routing.
 */
function renderActivityForm(
  componentType: string | null,
  props: {
    itineraryId: string
    dayId: string
    dayDate?: string | null
    trip?: any
    activity?: ActivityResponseDto
    activityName?: string | null
    onSuccess: () => void
    onCancel: () => void
    // Pending day mode props
    pendingDay?: boolean
    days?: ItineraryDayWithActivitiesDto[]
  }
) {
  const { itineraryId, dayId, dayDate, trip, activity, onSuccess, onCancel, pendingDay, days } = props

  switch (componentType) {
    // Flight - airline, flight number, departure/arrival airports
    case 'flight':
      return (
        <FlightForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Custom Cruise - cruise line, ship, cabin, port calls
    case 'custom_cruise':
      return (
        <CustomCruiseForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Lodging - hotel, check-in/out, room details
    case 'lodging':
      return (
        <LodgingForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Transportation - car rental, train, bus, transfer
    case 'transportation':
      return (
        <TransportationForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Dining - restaurant reservations, meals
    case 'dining':
      return (
        <DiningForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Port Info - port of call details for cruises
    case 'port_info':
      return (
        <PortInfoForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Options - optional activities, excursions
    case 'options':
      return (
        <OptionsForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Tour - dedicated tour form with tour-specific fields
    case 'tour':
      return (
        <TourForm
          itineraryId={itineraryId}
          dayId={dayId}
          dayDate={dayDate}
          activity={activity}
          trip={trip}
          onSuccess={onSuccess}
          onCancel={onCancel}
          pendingDay={pendingDay}
          days={days}
        />
      )

    // Package - trip-scoped booking package (no dayId required)
    case 'package':
      return (
        <PackageForm
          tripId={trip?.id || ''}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      )

    // No type provided - return null, type selector will be shown at page level
    default:
      return null
  }
}

/**
 * Activity type selector shown when no type is provided in URL params.
 * Allows user to select activity type before showing the form.
 */
function ActivityTypeSelector({
  tripId,
  dayId,
  itineraryId,
  pendingDay,
}: {
  tripId: string
  dayId: string | null
  itineraryId: string
  pendingDay: boolean
}) {
  const router = useRouter()

  const handleSelectType = (type: UIActivityType) => {
    const metadata = getActivityTypeMetadata(type)
    const params = new URLSearchParams()
    if (dayId) params.set('dayId', dayId)
    params.set('itineraryId', itineraryId)
    params.set('type', type)
    params.set('name', metadata.defaultName)
    if (pendingDay) params.set('pendingDay', 'true')

    router.replace(`/trips/${tripId}/activities/new?${params.toString()}`)
  }

  return (
    <div className="bg-white rounded-lg border border-ash-200 p-6">
      <h2 className="text-lg font-semibold text-ash-900 mb-2">
        Select Activity Type
      </h2>
      <p className="text-sm text-ash-500 mb-6">
        Choose the type of activity you want to add
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Object.entries(ACTIVITY_TYPE_METADATA)
          .filter(([_, metadata]) => !metadata.hidden)
          .map(([type, metadata]) => {
          const Icon = metadata.icon
          return (
            <button
              key={type}
              onClick={() => handleSelectType(type as UIActivityType)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg',
                'border border-ash-200',
                'hover:bg-ash-50 hover:border-ash-300',
                'focus:outline-none focus:ring-2 focus:ring-phoenix-gold-500 focus:ring-offset-2',
                'transition-all'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-lg',
                  metadata.colorClass
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-ash-700">
                {metadata.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function NewActivityPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { stopLoading } = useLoading()
  const { toast } = useToast()

  const tripId = params.id
  const dayId = searchParams.get('dayId')
  const activityType = searchParams.get('type')
  const activityName = searchParams.get('name')

  // Pending day mode - when dropped on Table View, user selects date to determine day
  const pendingDay = searchParams.get('pendingDay') === 'true'
  const itineraryIdParam = searchParams.get('itineraryId')

  const { data: trip } = useTrip(tripId)

  // Get the itinerary - prefer param, fall back to selected/first itinerary
  const selectedItinerary = trip?.itineraries?.find((it) => it.isSelected) || trip?.itineraries?.[0]
  const effectiveItineraryId = itineraryIdParam || selectedItinerary?.id || ''

  // Stop the loading overlay when page is ready
  useEffect(() => {
    stopLoading('activity-create')
  }, [stopLoading])

  const { data: days, isLoading: daysLoading } = useItineraryDaysWithActivities(effectiveItineraryId || null)

  // Auto-generate days mutation for empty state CTA
  const autoGenerateDays = useAutoGenerateItineraryDays(effectiveItineraryId)
  const [isGenerating, setIsGenerating] = useState(false)

  const day = days?.find((d) => d.id === dayId)

  // Build sidebar navigation sections (no current activity for new page)
  const sidebarSections = useMemo(
    () => buildActivityNavSidebar(tripId, days),
    [tripId, days]
  )

  // Handler for generating days when none exist
  const handleGenerateDays = async () => {
    if (!effectiveItineraryId) {
      toast({
        title: 'Error',
        description: 'No itinerary found. Please create an itinerary first.',
        variant: 'destructive',
      })
      return
    }

    setIsGenerating(true)
    try {
      await autoGenerateDays.mutateAsync({ includePreTravelDay: true })
      toast({
        title: 'Days generated',
        description: 'Itinerary days have been created based on trip dates.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to generate days. Please ensure the trip has valid dates.',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Case 1: Standard mode requires dayId (except packages which are trip-scoped)
  if (!pendingDay && activityType !== 'package' && !dayId) {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=itinerary`}
        backLabel="Back to Itinerary"
        sidebarSections={sidebarSections}
      >
        <div className="p-6">
          <p className="text-ash-600">Day ID is required to create an activity.</p>
        </div>
      </DetailLayout>
    )
  }

  // Case 2: Pending day mode with no days - show empty state with CTA
  if (pendingDay && (!days || days.length === 0)) {
    return (
      <DetailLayout
        backHref={`/trips/${tripId}?tab=itinerary`}
        backLabel="Back to Itinerary"
        sidebarSections={sidebarSections}
      >
        <div className="p-6">
          <div className="border-b border-ash-200 pb-6 mb-6">
            <h1 className="text-2xl font-bold text-ash-900 mb-2">Add Activity</h1>
            <p className="text-sm text-ash-600">
              Select a date for this activity
            </p>
          </div>

          <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 text-ash-400" />
            <h3 className="text-lg font-medium text-ash-900 mb-2">
              No Days Available
            </h3>
            <p className="text-sm text-ash-500 mb-4 max-w-md mx-auto">
              This itinerary doesn&apos;t have any days yet. Generate days based on trip dates to add activities.
            </p>
            {trip?.startDate && trip?.endDate ? (
              <Button
                onClick={handleGenerateDays}
                disabled={isGenerating || daysLoading}
                className="bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Generate Days'}
              </Button>
            ) : (
              <p className="text-xs text-ash-400">
                Set trip dates first to generate days automatically.
              </p>
            )}
          </div>
        </div>
      </DetailLayout>
    )
  }

  return (
    <DetailLayout
      backHref={`/trips/${tripId}?tab=itinerary`}
      backLabel="Back to Itinerary"
      sidebarSections={sidebarSections}
    >
      <div className="p-6">
        {/* Header */}
        <div className="border-b border-ash-200 pb-6 mb-6">
          <h1 className="text-2xl font-bold text-ash-900 mb-2">Add Activity</h1>
          {pendingDay ? (
            <p className="text-sm text-ash-600">
              Select a date below to assign this activity to the appropriate day
            </p>
          ) : day ? (
            <p className="text-sm text-ash-600">
              {day.title || `Day ${day.dayNumber}`}
              {day.date && parseISODate(day.date) && (
                <span className="ml-2">• {parseISODate(day.date)!.toLocaleDateString()}</span>
              )}
            </p>
          ) : null}
        </div>

        {/* Form Content - show type selector if no type, otherwise show the form */}
        {activityType ? (
          renderActivityForm(activityType, {
            itineraryId: effectiveItineraryId,
            dayId: dayId || '', // Empty for pendingDay mode - form will calculate
            dayDate: day?.date,
            trip,
            activityName,
            onSuccess: () => router.back(),
            onCancel: () => router.back(),
            pendingDay,
            days: days || [],
          })
        ) : (
          <ActivityTypeSelector
            tripId={tripId}
            dayId={dayId}
            itineraryId={effectiveItineraryId}
            pendingDay={pendingDay}
          />
        )}
      </div>
    </DetailLayout>
  )
}
