'use client'

import { useMemo } from 'react'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
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

interface CalendarWeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
}

export function CalendarWeekView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
}: CalendarWeekViewProps) {
  const weekStart = startOfWeek(currentDate)
  const weekEnd = endOfWeek(currentDate)
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const hours = eachHourOfInterval({
    start: startOfDay(currentDate),
    end: endOfDay(currentDate),
  })

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

  // Group all-day events by date
  const allDayByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    allDayEvents.forEach((event) => {
      const dateKey = format(parseISO(event.start), 'yyyy-MM-dd')
      const existing = map.get(dateKey) || []
      map.set(dateKey, [...existing, event])
    })
    return map
  }, [allDayEvents])

  // Group timed events by date and hour
  const timedByDateHour = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    timedEvents.forEach((event) => {
      const eventDate = parseISO(event.start)
      const dateKey = format(eventDate, 'yyyy-MM-dd')
      const hour = getHours(eventDate)
      const key = `${dateKey}-${hour}`
      const existing = map.get(key) || []
      map.set(key, [...existing, event])
    })
    return map
  }, [timedEvents])

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* Header row with day names */}
      <div className="flex border-b bg-muted/50">
        <div className="w-16 flex-shrink-0 border-r" />
        {days.map((day) => {
          const isTodayDate = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex-1 px-2 py-2 text-center border-r last:border-r-0',
                isTodayDate && 'bg-primary/5'
              )}
            >
              <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
              <div
                className={cn(
                  'text-lg font-semibold',
                  isTodayDate && 'text-primary'
                )}
              >
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day events row */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b">
          <div className="w-16 flex-shrink-0 border-r px-2 py-1 text-xs text-muted-foreground">
            All day
          </div>
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const dayEvents = allDayByDate.get(dateKey) || []
            return (
              <div
                key={day.toISOString()}
                className="flex-1 min-h-[40px] p-1 border-r last:border-r-0"
              >
                {dayEvents.map((event) => (
                  <EventBadge
                    key={event.id}
                    event={event}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick?.(event)
                    }}
                    compact
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <ScrollArea className="flex-1">
        <div className="flex">
          {/* Time column */}
          <div className="w-16 flex-shrink-0 border-r">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="h-12 px-2 text-xs text-muted-foreground text-right pr-2 border-b"
              >
                {format(hour, 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const isTodayDate = isToday(day)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 border-r last:border-r-0',
                  isTodayDate && 'bg-primary/5'
                )}
              >
                {hours.map((hour) => {
                  const hourNum = getHours(hour)
                  const key = `${dateKey}-${hourNum}`
                  const hourEvents = timedByDateHour.get(key) || []

                  return (
                    <div
                      key={hour.toISOString()}
                      className="h-12 border-b p-0.5 cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        const clickedDate = new Date(day)
                        clickedDate.setHours(hourNum)
                        onDateClick?.(clickedDate)
                      }}
                    >
                      {hourEvents.map((event) => (
                        <EventBadge
                          key={event.id}
                          event={event}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEventClick?.(event)
                          }}
                          compact
                          showTime
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
