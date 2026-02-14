'use client'

import { useMemo } from 'react'
import {
  format,
  eachHourOfInterval,
  startOfDay,
  endOfDay,
  isToday,
  getHours,
  parseISO,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { EventBadge } from './event-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CalendarEvent } from '@tailfire/shared-types/api'

interface CalendarDayViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onTimeClick?: (date: Date) => void
}

export function CalendarDayView({
  currentDate,
  events,
  onEventClick,
  onTimeClick,
}: CalendarDayViewProps) {
  const hours = eachHourOfInterval({
    start: startOfDay(currentDate),
    end: endOfDay(currentDate),
  })

  const isTodayDate = isToday(currentDate)

  // Separate all-day events from timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = []
    const timed: CalendarEvent[] = []

    events.forEach((event) => {
      if (event.allDay) {
        allDay.push(event)
      } else {
        timed.push(event)
      }
    })

    return { allDayEvents: allDay, timedEvents: timed }
  }, [events])

  // Group timed events by hour
  const eventsByHour = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    timedEvents.forEach((event) => {
      const hour = getHours(parseISO(event.start))
      const existing = map.get(hour) || []
      map.set(hour, [...existing, event])
    })
    return map
  }, [timedEvents])

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* Header */}
      <div className={cn('p-4 border-b bg-muted/50', isTodayDate && 'bg-primary/5')}>
        <div className="text-sm text-muted-foreground">{format(currentDate, 'EEEE')}</div>
        <div className={cn('text-2xl font-bold', isTodayDate && 'text-primary')}>
          {format(currentDate, 'MMMM d, yyyy')}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="p-2 border-b bg-muted/30">
          <div className="text-xs text-muted-foreground mb-1">All day</div>
          <div className="space-y-1">
            {allDayEvents.map((event) => (
              <EventBadge
                key={event.id}
                event={event}
                onClick={(e) => {
                  e.stopPropagation()
                  onEventClick?.(event)
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <ScrollArea className="flex-1">
        <div className="min-h-full">
          {hours.map((hour) => {
            const hourNum = getHours(hour)
            const hourEvents = eventsByHour.get(hourNum) || []

            return (
              <div
                key={hour.toISOString()}
                className="flex border-b hover:bg-muted/50 cursor-pointer min-h-[60px]"
                onClick={() => {
                  const clickedDate = new Date(currentDate)
                  clickedDate.setHours(hourNum)
                  onTimeClick?.(clickedDate)
                }}
              >
                <div className="w-20 flex-shrink-0 px-3 py-2 text-sm text-muted-foreground text-right border-r">
                  {format(hour, 'h:mm a')}
                </div>
                <div className="flex-1 p-1">
                  {hourEvents.map((event) => (
                    <EventBadge
                      key={event.id}
                      event={event}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick?.(event)
                      }}
                      showTime
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
