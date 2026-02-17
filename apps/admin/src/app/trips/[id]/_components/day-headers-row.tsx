'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { cn } from '@/lib/utils'
import { parseISODate } from '@/lib/date-utils'
import { COLUMN_WIDTH, ITINERARY_CARD_STYLES, FOCUS_VISIBLE_RING } from '@/lib/itinerary-styles'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DayEditModal } from './day-edit-modal'
import { filterItineraryActivities } from '@/lib/activity-constants'

interface DayHeaderProps {
  day: ItineraryDayWithActivitiesDto
  itineraryId: string
  /** Override activity count (e.g., when filtering out spanning activities) */
  activityCount?: number
}

/**
 * Individual day header cell
 * Shows date, day number, activity count badge, and edit button
 */
function DayHeader({ day, itineraryId, activityCount }: DayHeaderProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  // Filter out packages - they belong in Bookings tab, not itinerary
  const activities = filterItineraryActivities(day.activities)
  const count = activityCount ?? activities.length

  // Format date for display (e.g., "Wed, Sep 9")
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return ''
    const date = parseISODate(dateString)
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const dayHeaderTitle = day.date ? formatDate(day.date) : `Day ${day.dayNumber}`

  return (
    <>
      <div className={cn(COLUMN_WIDTH, ITINERARY_CARD_STYLES, 'p-0')}>
        <div className="group p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-ash-900">
                  {dayHeaderTitle}
                </p>
                <Badge variant="secondary">
                  {count}
                </Badge>
              </div>
              {day.title && (
                <p
                  className="text-xs text-ash-500 truncate mt-0.5"
                  title={day.title}
                >
                  {day.title}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEditModal(true)}
              aria-label="Edit day"
              className={cn(
                'h-6 w-6 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity',
                FOCUS_VISIBLE_RING
              )}
            >
              <Pencil className="h-3.5 w-3.5 text-ash-500" />
            </Button>
          </div>
        </div>
      </div>

      <DayEditModal
        day={day}
        itineraryId={itineraryId}
        open={showEditModal}
        onOpenChange={setShowEditModal}
      />
    </>
  )
}

interface DayHeadersRowProps {
  days: ItineraryDayWithActivitiesDto[]
  itineraryId: string
  /** Map of dayId -> activity count (for when spanning activities are filtered out) */
  dayActivityCounts?: Map<string, number>
}

/**
 * Horizontal row of day headers
 *
 * Extracted from DayColumn to enable the spanning activities layout:
 * - Day Headers Row (this component)
 * - Spanning Activities Layer (Gantt bars)
 * - Day Columns (single-day activities)
 *
 * All three must be inside the same horizontal scroll container
 * to keep them aligned during horizontal scrolling.
 */
export function DayHeadersRow({ days, itineraryId, dayActivityCounts }: DayHeadersRowProps) {
  return (
    <div className="flex gap-3" role="list" aria-label="Day headers">
      {days.map((day) => (
        <DayHeader
          key={day.id}
          day={day}
          itineraryId={itineraryId}
          activityCount={dayActivityCounts?.get(day.id)}
        />
      ))}
    </div>
  )
}
