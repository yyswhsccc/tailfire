'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ActivityListItem } from './activity-list-item'
import { ActivityTypeSelector } from './activity-type-selector'
import { useReorderActivities } from '@/hooks/use-activities'
import { useToast } from '@/hooks/use-toast'
import { useRouter, useParams } from 'next/navigation'
import { parseISODate } from '@/lib/date-utils'
import { getActivityTypeMetadata, filterItineraryActivities, type UIActivityType } from '@/lib/activity-constants'
import { useActivityNavigation } from '@/hooks/use-activity-navigation'
import type { CruiseColorSet } from '@/lib/cruise-color-utils'

interface DaySectionProps {
  day: ItineraryDayWithActivitiesDto
  itineraryId: string
  cruiseColorMap?: Map<string, CruiseColorSet>
}

export function DaySection({ day, itineraryId, cruiseColorMap }: DaySectionProps) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const [isExpanded, setIsExpanded] = useState(true)
  // Filter out packages - they belong in Bookings tab, not itinerary
  const [localActivities, setLocalActivities] = useState(
    filterItineraryActivities(day.activities)
  )
  const { storeReturnContext } = useActivityNavigation()

  const reorderActivities = useReorderActivities(day.id)

  // Set up droppable to accept drops from sidebar components
  // This allows the parent DndContext in trip-itinerary.tsx to handle
  // sidebar-to-day drops in single column view (matching day-column.tsx behavior)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: {
      type: 'day-column',
      dayId: day.id,
    },
  })

  const hasActivities = localActivities && localActivities.length > 0

  // Configure sensors for drag interactions
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Sync local activities with props when day.activities changes
  useEffect(() => {
    setLocalActivities(filterItineraryActivities(day.activities))
  }, [day.activities])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    // Find the old and new indices
    const oldIndex = localActivities.findIndex((a) => a.id === active.id)
    const newIndex = localActivities.findIndex((a) => a.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistically update the local state
    const reorderedActivities = arrayMove(localActivities, oldIndex, newIndex)
    setLocalActivities(reorderedActivities)

    // Persist to backend with activity orders
    try {
      const activityOrders = reorderedActivities.map((activity, index) => ({
        id: activity.id,
        sequenceOrder: index,
      }))
      await reorderActivities.mutateAsync({ activityOrders })
    } catch (error) {
      // Revert on error
      setLocalActivities(filterItineraryActivities(day.activities))
      toast({
        title: 'Error',
        description: 'Failed to reorder activities. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card
      ref={setDroppableRef}
      className={`p-6 overflow-hidden transition-all duration-200 ${
        isOver ? 'ring-2 ring-phoenix-gold-500 ring-offset-2 bg-phoenix-gold-50/30' : ''
      }`}
    >
      {/* Day Header */}
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-ash-50 p-6 -m-6 mb-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-ash-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-ash-400" />
          )}
          <div>
            <h3 className="text-lg font-semibold text-ash-900">
              {day.title || `Day ${day.dayNumber}`}
            </h3>
            {day.date && parseISODate(day.date) && (
              <p className="text-sm text-ash-500">
                {parseISODate(day.date)!.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-ash-500">
            {hasActivities ? `${localActivities.length} activities` : 'No activities'}
          </span>
        </div>
      </div>

      {/* Day Content */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* Activities List */}
          {hasActivities ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localActivities.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {localActivities.map((activity) => (
                    <ActivityListItem
                      key={activity.id}
                      itineraryId={itineraryId}
                      activity={activity}
                      dayId={day.id}
                      dayDate={day.date}
                      cruiseColor={cruiseColorMap?.get(activity.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-ash-200 rounded-lg">
              <p className="text-sm text-ash-400">No activities for this day</p>
            </div>
          )}

          {/* Add Activity Button */}
          <div className="pt-2">
            <ActivityTypeSelector
              onSelect={(type: UIActivityType) => {
                // Store return context for navigation back after form submission
                storeReturnContext({
                  tripId: params.id,
                  itineraryId: itineraryId,
                  dayId: day.id,
                  viewMode: 'board',
                })

                const metadata = getActivityTypeMetadata(type)
                const searchParams = new URLSearchParams({
                  dayId: day.id,
                  itineraryId: itineraryId,
                  type: type,
                  name: metadata.defaultName,
                })
                router.push(`/trips/${params.id}/activities/new?${searchParams.toString()}`)
              }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="w-full border-dashed border-ash-300 hover:border-phoenix-gold-500 hover:bg-phoenix-gold-50 hover:text-phoenix-gold-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Activity
              </Button>
            </ActivityTypeSelector>
          </div>
        </div>
      )}
    </Card>
  )
}
