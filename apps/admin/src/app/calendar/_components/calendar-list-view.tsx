'use client'

import { useMemo } from 'react'
import { format, parseISO, isToday, isTomorrow, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import { EventBadge } from './event-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CalendarEvent } from '@tailfire/shared-types/api'

interface CalendarListViewProps {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}

export function CalendarListView({ events, onEventClick }: CalendarListViewProps) {
  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    // Sort events by start date
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )

    sortedEvents.forEach((event) => {
      const dateKey = format(parseISO(event.start), 'yyyy-MM-dd')
      const existing = map.get(dateKey) || []
      map.set(dateKey, [...existing, event])
    })

    return map
  }, [events])

  const sortedDates = useMemo(
    () => Array.from(eventsByDate.keys()).sort(),
    [eventsByDate]
  )

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr)
    if (isToday(date)) return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'EEEE, MMMM d')
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full border rounded-lg p-8">
        <p className="text-muted-foreground">No events for this period</p>
      </div>
    )
  }

  return (
    <div className="h-full border rounded-lg overflow-hidden">
      <ScrollArea className="h-full">
        <div className="divide-y">
          {sortedDates.map((dateStr) => {
            const dayEvents = eventsByDate.get(dateStr) || []
            const date = parseISO(dateStr)
            const isTodayDate = isToday(date)

            return (
              <div key={dateStr} className={cn('p-4', isTodayDate && 'bg-primary/5')}>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-lg flex flex-col items-center justify-center',
                      isTodayDate ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <div className="text-xs font-medium">{format(date, 'EEE')}</div>
                    <div className="text-lg font-bold">{format(date, 'd')}</div>
                  </div>
                  <div>
                    <div className="font-semibold">{getDateLabel(dateStr)}</div>
                    <div className="text-sm text-muted-foreground">
                      {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pl-15">
                  {dayEvents.map((event) => (
                    <EventBadge
                      key={event.id}
                      event={event}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick?.(event)
                      }}
                      showTime={!event.allDay}
                      expanded
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
