'use client'

import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import type { ActivityWithSpan } from '@/lib/spanning-activity-utils'
import { SpanningActivityBar } from './spanning-activity-bar'
import type { CruiseColorSet } from '@/lib/cruise-color-utils'
import type { ClientActivityResponseType } from '@tailfire/shared-types/api'

interface SpanningActivitiesLayerProps {
  spanningActivities: ActivityWithSpan[]
  days: ItineraryDayWithActivitiesDto[]
  itineraryId: string
  cruiseColorMap?: Map<string, CruiseColorSet>
  responseMap?: Record<string, ClientActivityResponseType>
  commentCounts?: Record<string, number>
}

/**
 * Layer that renders Gantt-style bars for multi-day activities.
 *
 * Positioned between the day headers row and the day columns (activities area).
 * Uses CSS Grid with columns matching the day column widths to ensure alignment.
 *
 * IMPORTANT: This component should be invisible (render nothing) when there are
 * no spanning activities, to avoid adding unnecessary whitespace.
 *
 * @example
 * ```tsx
 * // Only render if there are spanning activities
 * {spanningActivities.length > 0 && (
 *   <SpanningActivitiesLayer
 *     spanningActivities={spanningActivities}
 *     days={days}
 *     itineraryId={itineraryId}
 *   />
 * )}
 * ```
 */
export function SpanningActivitiesLayer({
  spanningActivities,
  days,
  itineraryId,
  cruiseColorMap,
  responseMap,
  commentCounts,
}: SpanningActivitiesLayerProps) {
  // Don't render anything if no spanning activities
  if (spanningActivities.length === 0) {
    return null
  }

  // Calculate grid template columns to match day column widths
  // COLUMN_WIDTH is 'w-[248px] min-w-[248px] flex-shrink-0', so we extract 248px
  const columnWidth = '248px'
  const gap = '0.75rem' // gap-3 = 12px = 0.75rem
  const gridTemplateColumns = `repeat(${days.length}, ${columnWidth})`

  return (
    <div
      className="mb-3"
      style={{
        display: 'grid',
        gridTemplateColumns,
        gap,
      }}
      role="list"
      aria-label="Multi-day activities"
    >
      {spanningActivities.map((activity) => (
        <SpanningActivityBar
          key={activity.id}
          activity={activity}
          itineraryId={itineraryId}
          gridColumnStart={activity.spanStartIndex + 1}
          gridColumnSpan={activity.spanWidth}
          cruiseColor={cruiseColorMap?.get(activity.id)}
          clientResponse={responseMap?.[activity.id] ?? null}
          commentCount={commentCounts?.[activity.id]}
        />
      ))}
    </div>
  )
}
