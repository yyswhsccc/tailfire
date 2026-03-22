'use client'

import { Separator } from '@tailfire/ui-public'
import type {
  SharedItineraryDayDto,
  SharedActivityDto,
  ClientActivityResponseType,
} from '@tailfire/shared-types/api'
import { ActivityCard } from './ActivityCard'

function formatDayDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function DaySection({
  day,
  currency,
  renderDayCommentButton,
  renderCommentButton,
  onActivityClick,
  responseMap,
  onConfirmActivity,
  onDeclineActivity,
}: {
  day: SharedItineraryDayDto
  currency: string
  renderDayCommentButton?: (props: { dayId: string }) => React.ReactNode
  renderCommentButton?: (activityId: string) => React.ReactNode
  onActivityClick?: (activity: SharedActivityDto) => void
  responseMap?: Record<string, ClientActivityResponseType>
  onConfirmActivity?: (activityId: string) => void
  onDeclineActivity?: (activityId: string) => void
}) {
  const dayLabel = day.dayNumber === 0 ? 'Pre-Travel' : `Day ${day.dayNumber}`
  const dateLabel = formatDayDate(day.date)

  return (
    <section>
      {/* Day header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-bold text-primary">{dayLabel}</h2>
          {dateLabel && <span className="text-muted-foreground text-sm">{dateLabel}</span>}
          {day.title && <span className="text-muted-foreground text-sm">&mdash; {day.title}</span>}
        </div>
        {renderDayCommentButton?.({ dayId: day.id })}
      </div>

      {/* Activities or empty state */}
      {day.activities.length > 0 ? (
        <div className="space-y-3">
          {day.activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              currency={currency}
              commentButton={renderCommentButton?.(activity.id)}
              onClickTitle={onActivityClick ? () => onActivityClick(activity) : undefined}
              response={responseMap?.[activity.id] ?? null}
              onConfirm={activity.proposalStatus !== 'approved' && onConfirmActivity ? () => onConfirmActivity(activity.id) : undefined}
              onDecline={activity.proposalStatus !== 'approved' && onDeclineActivity ? () => onDeclineActivity(activity.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-muted-foreground border border-dashed border-border rounded-lg">
          Free day — enjoy at your leisure
        </div>
      )}

      <Separator className="mt-8" />
    </section>
  )
}
