'use client'

import { useState, useMemo } from 'react'
import { FileText, Pencil } from 'lucide-react'
import type { ItineraryDayWithActivitiesDto, ItineraryResponseDto } from '@tailfire/shared-types/api'
import { cn } from '@/lib/utils'
import {
  SUMMARY_COLUMN_WIDTH,
  ITINERARY_CARD_STYLES,
  DROP_ZONE_BASE,
  DROP_ZONE_ACTIVE,
  DROP_ZONE_INACTIVE,
  DROP_ZONE_MIN_HEIGHT,
  FOCUS_VISIBLE_RING,
} from '@/lib/itinerary-styles'
import { Button } from '@/components/ui/button'
import { useDroppable } from '@dnd-kit/core'
import { ActivitySummaryItem } from './activity-summary-item'
import { EditItineraryDialog } from './edit-itinerary-dialog'
import { useSpanningActivities } from '@/hooks/use-spanning-activities'
import type { ActivityWithSpan } from '@/lib/spanning-activity-utils'
import { buildCruiseColorMap, getCruiseColor } from '@/lib/cruise-color-utils'
import type { ClientActivityResponseType } from '@tailfire/shared-types/api'

interface TripSummaryColumnProps {
  days: ItineraryDayWithActivitiesDto[]
  tripId: string
  tripStartDate?: string | null
  tripEndDate?: string | null
  itinerary: ItineraryResponseDto
  responseMap?: Record<string, ClientActivityResponseType>
  commentCounts?: Record<string, number>
}

export function TripSummaryColumn({ days, tripId, tripStartDate, tripEndDate, itinerary, responseMap, commentCounts }: TripSummaryColumnProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  // Droppable zone for the summary column
  const { setNodeRef, isOver } = useDroppable({
    id: 'trip-summary',
    data: {
      type: 'trip-summary',
      itineraryId: itinerary.id,
    },
  })

  // Process spanning activities
  const { spanningActivities, dayActivities } = useSpanningActivities(days)

  // Build cruise color map from full activity list
  const cruiseColorMap = useMemo(() => {
    const allActivities = days.flatMap((d) => d.activities)
    return buildCruiseColorMap(allActivities)
  }, [days])

  // Build a map of dayId -> spanning activities that are continuing through this day
  // (not starting, just continuing from a previous day)
  const continuingSpansByDay = useMemo(() => {
    const map = new Map<string, ActivityWithSpan[]>()
    for (const spanning of spanningActivities) {
      // For each day the activity spans (except the first/start day), mark it as continuing
      for (let i = 1; i < spanning.spannedDayIds.length; i++) {
        const dayId = spanning.spannedDayIds[i]
        if (dayId) {
          const existing = map.get(dayId) || []
          existing.push(spanning)
          map.set(dayId, existing)
        }
      }
    }
    return map
  }, [spanningActivities])

  // Collect activities organized by day, including spanning activities at their start day
  const activitiesByDay = useMemo(() => {
    const result: Array<{
      dayId: string
      day: ItineraryDayWithActivitiesDto
      activities: Array<{ activity: typeof days[0]['activities'][0]; dayId: string; dayDate: string | null }>
      spanningStarts: ActivityWithSpan[]
      continuingSpans: ActivityWithSpan[]
    }> = []

    for (const day of days) {
      // Get non-spanning activities for this day
      const nonSpanning = dayActivities.get(day.id) || []

      // Get spanning activities that START on this day
      const spanningStarts = spanningActivities.filter(
        (s) => s.spannedDayIds[0] === day.id
      )

      // Get spanning activities that are CONTINUING through this day
      const continuingSpans = continuingSpansByDay.get(day.id) || []

      result.push({
        dayId: day.id,
        day,
        activities: nonSpanning.map((a) => ({
          activity: a,
          dayId: day.id,
          dayDate: day.date,
        })),
        spanningStarts,
        continuingSpans,
      })
    }

    return result
  }, [days, dayActivities, spanningActivities, continuingSpansByDay])

  return (
    <div className={cn(SUMMARY_COLUMN_WIDTH, ITINERARY_CARD_STYLES, 'p-0 bg-ash-50/50')}>
      {/* Summary Header */}
      <div className="p-3 border-b border-ash-200">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-ash-500" />
            <h3 className="font-semibold text-sm text-ash-900">Trip Summary</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Edit itinerary"
            className={cn('h-8 w-8 p-0 hover:bg-ash-100', FOCUS_VISIBLE_RING)}
            onClick={() => setEditDialogOpen(true)}
          >
            <Pencil className="h-4 w-4 text-ash-500" />
          </Button>
        </div>
        <p className="text-xs text-ash-500 line-clamp-1" title={itinerary.name}>
          {itinerary.name}
        </p>
      </div>

      {/* Instructional Text */}
      <div className="p-2 border-b border-ash-200">
        <p className="text-xs text-ash-500 leading-snug">
          Drag and drop activities here to add them to both the summary and their scheduled day.
        </p>
      </div>

      {/* Drop Zone for All Activities */}
      <div
        ref={setNodeRef}
        aria-label="Drop zone for trip summary activities"
        className={cn(
          DROP_ZONE_MIN_HEIGHT,
          DROP_ZONE_BASE,
          'p-2.5',
          isOver ? DROP_ZONE_ACTIVE : DROP_ZONE_INACTIVE
        )}
      >
        {activitiesByDay.every(d => d.activities.length === 0 && d.spanningStarts.length === 0) ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 text-ash-300 mx-auto mb-2" />
            <p className="text-xs text-ash-500">No activities yet</p>
            <p className="text-xs text-ash-400 mt-1">
              Drag components from the sidebar
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activitiesByDay.map(({ dayId, day, activities, spanningStarts, continuingSpans }) => {
              const hasContent = activities.length > 0 || spanningStarts.length > 0 || continuingSpans.length > 0

              if (!hasContent) return null

              return (
                <div key={dayId}>
                  {/* Day label */}
                  <p className="text-[10px] font-medium text-ash-400 uppercase tracking-wide mb-1 mt-2 first:mt-0">
                    {day.title || `Day ${day.dayNumber}`}
                  </p>

                  {/* Spanning activities that START on this day */}
                  {spanningStarts.map((spanning) => {
                    const color = getCruiseColor(spanning, cruiseColorMap)
                    return (
                      <div key={spanning.id} className="relative">
                        <ActivitySummaryItem
                          itineraryId={itinerary.id}
                          activity={spanning}
                          dayId={dayId}
                          cruiseColor={color}
                          clientResponse={responseMap?.[spanning.id] ?? null}
                          commentCount={commentCounts?.[spanning.id]}
                        />
                        {/* Vertical line indicator extending down */}
                        <div
                          className={cn("absolute left-3 top-full w-0.5", color ? color.line : 'bg-phoenix-gold-300')}
                          style={{ height: '8px' }}
                          aria-hidden="true"
                        />
                      </div>
                    )
                  })}

                  {/* Continuation lines for spanning activities that continue through this day */}
                  {continuingSpans.map((spanning) => {
                    const isLastDay = spanning.spannedDayIds[spanning.spannedDayIds.length - 1] === dayId
                    const color = getCruiseColor(spanning, cruiseColorMap)
                    return (
                      <div
                        key={`continuing-${spanning.id}`}
                        className="relative flex items-center gap-2 py-1 px-2"
                      >
                        {/* Vertical continuation line */}
                        <div
                          className={cn(
                            'w-0.5 flex-shrink-0',
                            color ? color.line : 'bg-phoenix-gold-300',
                            isLastDay ? 'h-2 rounded-b' : 'h-full min-h-[16px]'
                          )}
                          aria-hidden="true"
                        />
                        {/* Dotted continuation indicator */}
                        <span className="text-[10px] text-ash-400 italic truncate">
                          {spanning.name} {isLastDay ? '(ends)' : '(continues)'}
                        </span>
                      </div>
                    )
                  })}

                  {/* Regular non-spanning activities */}
                  {activities.map(({ activity }) => (
                    <ActivitySummaryItem
                      key={activity.id}
                      itineraryId={itinerary.id}
                      activity={activity}
                      dayId={dayId}
                      cruiseColor={getCruiseColor(activity, cruiseColorMap)}
                      clientResponse={responseMap?.[activity.id] ?? null}
                      commentCount={commentCounts?.[activity.id]}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Itinerary Dialog */}
      <EditItineraryDialog
        tripId={tripId}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        itinerary={itinerary}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  )
}
