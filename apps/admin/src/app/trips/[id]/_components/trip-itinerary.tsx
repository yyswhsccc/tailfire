'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid, Table2, Map, CalendarPlus, Download } from 'lucide-react'
import type { TripResponseDto, ItineraryResponseDto, ActivityResponseDto, MoveActivityDto, ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { useToast } from '@/hooks/use-toast'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import { useItineraries, useSelectItinerary } from '@/hooks/use-itineraries'
import { useLoading } from '@/context/loading-context'
import { useItineraryDaysWithActivities, itineraryDayKeys } from '@/hooks/use-itinerary-days'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core'
import { useDndSensors, dndCollisionDetectionCenter } from '@/lib/dnd-config'
import { DRAG_OVERLAY_STYLES } from '@/lib/itinerary-styles'
import { isValidActivityType, getActivityTypeMetadata } from '@/lib/activity-constants'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared'
import { ItineraryDaysList } from './itinerary-days-list'
import { ItinerarySelector } from './itinerary-selector'
import { ItineraryTableView } from './itinerary-table-view'
import { CreateItineraryDialog } from './create-itinerary-dialog'
import { ComponentLibrarySidebar } from './component-library-sidebar'
import { AddDaysDialog } from './add-days-dialog'
import { ClientFeedbackBanner } from './client-feedback-banner'
import { useActivityResponses } from '@/hooks/use-activity-responses'
import { useProposalComments } from '@/hooks/use-proposal-comments'

type ViewMode = 'board' | 'table'

interface TripItineraryProps {
  trip: TripResponseDto
}

/**
 * Trip Itinerary Component
 *
 * Matches TERN's pattern with:
 * - Itinerary selector at the top (multiple options)
 * - Selected itinerary's days displayed below
 * - Create Itinerary modal for adding new options
 */
export function TripItinerary({ trip }: TripItineraryProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { startLoading } = useLoading()
  const queryClient = useQueryClient()
  const { storeReturnContext, getReturnContext, clearReturnContext } = useActivityNavigation()
  const hasScrolledToDay = useRef(false)
  const [selectedItinerary, setSelectedItinerary] = useState<ItineraryResponseDto | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAddDaysDialog, setShowAddDaysDialog] = useState(false)
  const [activeDragItem, setActiveDragItem] = useState<any>(null)

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>('board')

  // Load view preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`tailfire-view-${trip.id}`)
    if (stored === 'board' || stored === 'table') {
      setViewMode(stored)
    }
  }, [trip.id])

  // Scroll to target day on return from activity form
  // Context lifecycle:
  // 1. Stored when navigating TO activity form (by entry point components)
  // 2. Used here on successful return to scroll to the target day
  // 3. Cleared immediately after use to prevent bleeding into subsequent navigations
  // 4. If navigation fails, context is preserved for retry (cleared here on next successful return)
  // 5. Context expires after 1 hour if not used
  useEffect(() => {
    // Only run once per page load
    if (hasScrolledToDay.current) return

    const context = getReturnContext()
    if (context) {
      hasScrolledToDay.current = true
      // Clear the context immediately after reading - this is critical to prevent
      // the context from bleeding into subsequent navigations (e.g., user manually
      // navigates to another trip, then back)
      clearReturnContext()

      // If we have a dayId, scroll to that day
      if (context.dayId) {
        // Wait for DOM to render, then scroll to day
        requestAnimationFrame(() => {
          const dayElement = document.getElementById(`day-${context.dayId}`)
          if (dayElement) {
            dayElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      }
    }
  }, [getReturnContext, clearReturnContext])

  // Save view preference to localStorage
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(`tailfire-view-${trip.id}`, mode)
  }

  const { data: itineraries, isLoading } = useItineraries(trip.id)
  const selectItinerary = useSelectItinerary(trip.id)

  // Fetch days for DnD operations
  const { data: days } = useItineraryDaysWithActivities(selectedItinerary?.id || '')

  // Client feedback data — only fetch for proposal-related statuses
  const isProposalStatus = selectedItinerary && ['proposing', 'approved'].includes(selectedItinerary.status)
  const { data: activityResponsesData } = useActivityResponses(
    trip.id,
    selectedItinerary?.id || '',
    isProposalStatus ? (selectedItinerary?.publishedVersion ?? null) : null,
  )
  const { data: commentsData } = useProposalComments(
    trip.id,
    selectedItinerary?.id || '',
  )
  const responseMap = isProposalStatus ? activityResponsesData?.responseMap : undefined
  const commentCounts = isProposalStatus ? commentsData?.commentCounts : undefined

  // DnD sensors
  const sensors = useDndSensors()

  // Cross-day move mutation with optimistic updates
  const moveActivity = useMutation({
    mutationFn: ({ sourceDayId, activityId, targetDayId }: {
      sourceDayId: string
      activityId: string
      targetDayId: string
    }) => {
      const data: MoveActivityDto = { targetDayId }
      return api.post<ActivityResponseDto>(`/days/${sourceDayId}/activities/${activityId}/move`, data)
    },
    onMutate: async ({ sourceDayId, activityId, targetDayId }) => {
      if (!selectedItinerary) return {}

      const queryKey = itineraryDayKeys.withActivities(selectedItinerary.id)
      await queryClient.cancelQueries({ queryKey })

      const previousDays = queryClient.getQueryData<ItineraryDayWithActivitiesDto[]>(queryKey)
      if (!previousDays) return { previousDays }

      const sourceDay = previousDays.find((d) => d.id === sourceDayId)
      const activityToMove = sourceDay?.activities?.find((a) => a.id === activityId)
      if (!activityToMove) return { previousDays }

      queryClient.setQueryData<ItineraryDayWithActivitiesDto[]>(queryKey, (old = []) => {
        return old.map((day) => {
          if (day.id === sourceDayId) {
            return {
              ...day,
              activities: day.activities?.filter((a) => a.id !== activityId) || [],
            }
          }
          if (day.id === targetDayId) {
            const movedActivity: ActivityResponseDto = {
              ...activityToMove,
              itineraryDayId: targetDayId,
              sequenceOrder: day.activities?.length || 0,
            }
            return {
              ...day,
              activities: [...(day.activities || []), movedActivity],
            }
          }
          return day
        })
      })

      return { previousDays }
    },
    onSuccess: () => {
      if (!selectedItinerary) return
      queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(selectedItinerary.id) })
      toast({
        title: 'Activity moved',
        description: 'The activity has been moved to the new day.',
      })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDays && selectedItinerary) {
        queryClient.setQueryData(
          itineraryDayKeys.withActivities(selectedItinerary.id),
          context.previousDays
        )
      }
      toast({
        title: 'Error',
        description: 'Failed to move activity. Please try again.',
        variant: 'destructive',
      })
    },
  })

  const handleDragStart = (event: any) => {
    setActiveDragItem(event.active.data.current)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    // Always reset active drag item
    setActiveDragItem(null)

    // Early return: No drop target or cancel zone
    if (!over) return
    if (over.data.current?.type === 'cancel') return

    // Extract drag source data
    const dragType = active.data.current?.type
    const componentType = active.data.current?.componentType
    const componentLabel = active.data.current?.label
    const sourceDayId = active.data.current?.sourceDayId
    const draggedActivity = active.data.current?.activity

    // Extract drop target data
    const dropType = over.data.current?.type
    const targetDayId = over.data.current?.dayId

    // CASE 1: Activity to different day
    if (dragType === 'activity' && dropType === 'day-column' && draggedActivity && targetDayId) {
      if (sourceDayId && sourceDayId !== targetDayId) {
        moveActivity.mutate({
          sourceDayId,
          activityId: draggedActivity.id,
          targetDayId,
        })
      }
      return
    }

    // CASE 2: Component to trip summary
    if (componentType && dropType === 'trip-summary') {
      toast({
        title: 'Add to Trip Summary',
        description: `Please select which day(s) this ${componentLabel || 'component'} belongs to.`,
      })
      return
    }

    // CASE 3: Library item to day column (e.g., Cruise Library, Package Library)
    if (componentType === 'library-item' && dropType === 'day-column' && targetDayId) {
      const activeId = String(active.id)

      // Handle Package Library
      if (activeId === 'library-itinerary') {
        if (!selectedItinerary) {
          toast({
            title: 'No itinerary selected',
            description: 'Please select an itinerary before adding a package.',
            variant: 'destructive',
          })
          return
        }

        // Find the target day to get its date for display
        const targetDay = days?.find((d) => d.id === targetDayId)

        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          itineraryId: selectedItinerary.id,
          dayId: targetDayId,
          returnUrl,
        })
        if (targetDay?.date) {
          params.append('dayDate', targetDay.date)
        }
        startLoading('package-templates', 'Opening Package Library...')
        router.push(`/library/packages?${params.toString()}`)
        return
      }

      // Handle Cruise Library
      if (activeId === 'library-cruise') {
        if (!selectedItinerary) {
          toast({
            title: 'No itinerary selected',
            description: 'Please select an itinerary before adding a cruise.',
            variant: 'destructive',
          })
          return
        }

        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: targetDayId,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        startLoading('cruise-library', 'Opening Cruise Library...')
        router.push(`/library/cruises?${params.toString()}`)
        return
      }

      // Handle Tour Library
      if (activeId === 'library-tour') {
        if (!selectedItinerary) {
          toast({
            title: 'No itinerary selected',
            description: 'Please select an itinerary before adding a tour.',
            variant: 'destructive',
          })
          return
        }

        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: targetDayId,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        startLoading('tour-library', 'Opening Tour Library...')
        router.push(`/library/tours?${params.toString()}`)
        return
      }

      // Handle Vacation Library
      if (activeId === 'library-vacation') {
        if (!selectedItinerary) {
          toast({
            title: 'No itinerary selected',
            description: 'Please select an itinerary before adding a vacation package.',
            variant: 'destructive',
          })
          return
        }
        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: targetDayId,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        if (selectedItinerary.startDate) {
          params.set('startDate', selectedItinerary.startDate)
        }
        startLoading('vacation-library', 'Opening Vacation Library...')
        router.push(`/library/vacation?${params.toString()}`)
        return
      }

      // Other library items can be handled here in the future
      toast({
        title: 'Not yet available',
        description: `${componentLabel || 'This library'} is in development.`,
      })
      return
    }

    // CASE 4: Component to day column (regular activity types)
    if (componentType && dropType === 'day-column' && targetDayId) {
      if (!isValidActivityType(componentType)) {
        toast({
          title: 'Invalid component type',
          description: `${componentLabel || 'This component'} cannot be added as an activity yet.`,
          variant: 'destructive',
        })
        return
      }

      const metadata = getActivityTypeMetadata(componentType)
      const params = new URLSearchParams({
        dayId: targetDayId,
        itineraryId: selectedItinerary?.id || '',
        type: componentType,
        name: componentLabel || metadata.defaultName,
      })
      // Store return context for navigation back after form submission
      storeReturnContext({
        tripId: trip.id,
        itineraryId: selectedItinerary?.id || '',
        dayId: targetDayId,
        viewMode: viewMode,
      })
      startLoading('activity-create', `Opening ${componentLabel || metadata.label} form...`)
      router.push(`/trips/${trip.id}/activities/new?${params.toString()}`)
      return
    }

    // CASE 5: Library item to table view
    if (componentType === 'library-item' && dropType === 'table') {
      const activeId = String(active.id)

      // Handle Package Library - use first day as anchor
      if (activeId === 'library-itinerary') {
        if (!selectedItinerary || !days || days.length === 0) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a package.',
            variant: 'destructive',
          })
          return
        }

        // Use the first day as the anchor day for table view drops
        const firstDay = days[0]
        if (!firstDay) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a package.',
            variant: 'destructive',
          })
          return
        }

        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          itineraryId: selectedItinerary.id,
          dayId: firstDay.id,
          returnUrl,
        })
        if (firstDay.date) {
          params.append('dayDate', firstDay.date)
        }
        startLoading('package-templates', 'Opening Package Library...')
        router.push(`/library/packages?${params.toString()}`)
        return
      }

      // Handle Cruise Library - requires a day, so we need to show a picker or use first day
      if (activeId === 'library-cruise') {
        if (!selectedItinerary || !days || days.length === 0) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a cruise.',
            variant: 'destructive',
          })
          return
        }

        // Use the first day as the target day for table view drops
        const firstDay = days[0]
        if (!firstDay) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a cruise.',
            variant: 'destructive',
          })
          return
        }
        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: firstDay.id,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        startLoading('cruise-library', 'Opening Cruise Library...')
        router.push(`/library/cruises?${params.toString()}`)
        return
      }

      // Handle Tour Library - requires a day, so we need to use first day
      if (activeId === 'library-tour') {
        if (!selectedItinerary || !days || days.length === 0) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a tour.',
            variant: 'destructive',
          })
          return
        }

        // Use the first day as the target day for table view drops
        const firstDay = days[0]
        if (!firstDay) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a tour.',
            variant: 'destructive',
          })
          return
        }
        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: firstDay.id,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        startLoading('tour-library', 'Opening Tour Library...')
        router.push(`/library/tours?${params.toString()}`)
        return
      }

      // Handle Vacation Library - requires a day, so we need to use first day
      if (activeId === 'library-vacation') {
        if (!selectedItinerary || !days || days.length === 0) {
          toast({
            title: 'No days available',
            description: 'Create itinerary days before adding a vacation package.',
            variant: 'destructive',
          })
          return
        }
        const firstDay = days[0]!
        const returnUrl = `/trips/${trip.id}?tab=itinerary`
        const params = new URLSearchParams({
          tripId: trip.id,
          dayId: firstDay.id,
          itineraryId: selectedItinerary.id,
          returnUrl,
        })
        if (selectedItinerary.startDate) {
          params.set('startDate', selectedItinerary.startDate)
        }
        startLoading('vacation-library', 'Opening Vacation Library...')
        router.push(`/library/vacation?${params.toString()}`)
        return
      }

      toast({
        title: 'Not yet available',
        description: `${componentLabel || 'This library'} is in development.`,
      })
      return
    }

    // CASE 6: Component to table view - "Pending Day" mode
    // User sets the activity DATE in the form, system calculates which Day
    if (componentType && dropType === 'table') {
      // Guard: ensure we have days
      if (!days || days.length === 0) {
        toast({
          title: 'No days available',
          description: 'Create itinerary days before adding activities.',
          variant: 'destructive',
        })
        return
      }

      if (!isValidActivityType(componentType)) {
        toast({
          title: 'Invalid component type',
          description: `${componentLabel || 'This component'} cannot be added as an activity yet.`,
          variant: 'destructive',
        })
        return
      }

      // Use pendingDay mode - form will require user to select a date
      // and will calculate the appropriate day based on that date
      const metadata = getActivityTypeMetadata(componentType)
      const params = new URLSearchParams({
        pendingDay: 'true',
        itineraryId: selectedItinerary?.id || '',
        type: componentType,
        name: componentLabel || metadata.defaultName,
      })
      // Store return context for navigation back after form submission
      // No specific dayId in pendingDay mode - will be determined by form
      storeReturnContext({
        tripId: trip.id,
        itineraryId: selectedItinerary?.id || '',
        viewMode: viewMode,
      })
      startLoading('activity-create', `Opening ${componentLabel || metadata.label} form...`)
      router.push(`/trips/${trip.id}/activities/new?${params.toString()}`)
      return
    }
  }

  // Auto-select first itinerary or the one marked as selected
  useEffect(() => {
    if (itineraries && itineraries.length > 0 && !selectedItinerary) {
      // Find the selected itinerary or default to the first one
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
      const currentSelected = itineraries?.find((it) => it.isSelected)
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
    <DndContext
      sensors={sensors}
      collisionDetection={dndCollisionDetectionCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragItem(null)}
    >
      {/* TODO: Implement keyboard-based drag and drop
       * @dnd-kit supports keyboard sensors but requires:
       * 1. KeyboardSensor configuration
       * 2. Accessible announcements via LiveRegion
       * 3. Custom keyboard coordinates getter
       * See: https://docs.dndkit.com/guides/accessibility
       */}
      <div className="flex gap-4">
        {/* Main Content Area - min-w-0 allows shrinking to fit sidebar */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Control Bar - minimal like TERN */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <ItinerarySelector
                tripId={trip.id}
                tripStartDate={trip.startDate}
                tripEndDate={trip.endDate}
                itineraries={itineraries || []}
                selectedItinerary={selectedItinerary}
                onSelectItinerary={handleSelectItinerary}
                onCreateClick={() => setShowCreateDialog(true)}
                isLoading={isLoading}
                clientSelectedItineraryId={trip.clientSelectedItineraryId}
              />
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              {/* Add Days Button - only when itinerary is selected */}
              {selectedItinerary && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddDaysDialog(true)}
                    className="h-7 text-xs"
                    aria-label="Add days to itinerary"
                  >
                    <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                    Add Days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => router.push(`/trips/import?tripId=${trip.id}`)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Import Booking
                  </Button>
                </>
              )}

              {/* View Toggle - icon only */}
              <div className="flex items-center gap-1 rounded-md border border-ash-200 p-0.5 bg-ash-50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewModeChange('board')}
                  className={`h-7 w-7 p-0 ${viewMode === 'board' ? 'bg-white shadow-sm' : ''}`}
                  aria-label="Board view"
                >
                  <LayoutGrid className="h-4 w-4 text-ash-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewModeChange('table')}
                  className={`h-7 w-7 p-0 ${viewMode === 'table' ? 'bg-white shadow-sm' : ''}`}
                  aria-label="Table view"
                >
                  <Table2 className="h-4 w-4 text-ash-600" />
                </Button>
              </div>
            </div>
          </div>

          {/* Client Feedback Banner */}
          {selectedItinerary && isProposalStatus && (
            <ClientFeedbackBanner
              itinerary={selectedItinerary}
              responseMap={responseMap}
              commentCounts={commentCounts}
            />
          )}

          {/* Content with Empty State fallback */}
          {selectedItinerary ? (
            viewMode === 'board' ? (
              <ItineraryDaysList trip={trip} itinerary={selectedItinerary} responseMap={responseMap} commentCounts={commentCounts} />
            ) : (
              <ItineraryTableView trip={trip} itinerary={selectedItinerary} responseMap={responseMap} commentCounts={commentCounts} />
            )
          ) : (
            <EmptyState
              icon={<Map className="h-8 w-8" />}
              title="Select an Itinerary"
              description="Select an itinerary option above or create a new one to begin building."
            />
          )}
        </div>

        {/* Right Sidebar - fixed width, never shrinks */}
        {selectedItinerary && <div className="flex-shrink-0"><ComponentLibrarySidebar isDragging={!!activeDragItem} /></div>}
      </div>

      {/* Create Itinerary Dialog (TERN pattern) */}
      <CreateItineraryDialog
        tripId={trip.id}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSuccess}
      />

      {/* Add Days Dialog */}
      {selectedItinerary && (
        <AddDaysDialog
          itineraryId={selectedItinerary.id}
          existingDays={days || []}
          tripStartDate={trip.startDate}
          tripEndDate={trip.endDate}
          open={showAddDaysDialog}
          onOpenChange={setShowAddDaysDialog}
        />
      )}

      {/* Drag Overlay */}
      <DragOverlay>
        {activeDragItem ? (
          <div className={DRAG_OVERLAY_STYLES}>
            <div className="flex items-center gap-2">
              {activeDragItem.componentType && isValidActivityType(activeDragItem.componentType) && (
                <ActivityIconBadge type={activeDragItem.componentType} size="md" shape="rounded" />
              )}
              <p className="text-sm font-medium text-ash-900">{activeDragItem.label}</p>
            </div>
            <p className="text-[10px] text-ash-400 mt-1">Press Esc to cancel</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
