'use client'

import { useState, useMemo } from 'react'
import { useCalendarStore } from '@/stores/calendar.store'
import { useCalendarEvents, useCalendarDateRange } from '@/hooks/use-calendar'
import { CalendarToolbar } from './calendar-toolbar'
import { CalendarMonthView } from './calendar-month-view'
import { CalendarWeekView } from './calendar-week-view'
import { CalendarDayView } from './calendar-day-view'
import { CalendarListView } from './calendar-list-view'
import { EventDetailModal } from './event-detail-modal'
import { TableSkeleton } from '@/components/tern/shared/loading-skeleton'
import type { CalendarEvent } from '@tailfire/shared-types/api'

interface CalendarViewProps {
  userOptions?: { id: string; name: string }[]
  isAdmin?: boolean
}

export function CalendarView({ userOptions = [], isAdmin = false }: CalendarViewProps) {
  const { currentView, currentDate, selectedUserId, enabledEventTypes, setDate, setView } =
    useCalendarStore()

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const currentDateObj = useMemo(() => new Date(currentDate), [currentDate])

  // Calculate date range based on current view
  const { start, end } = useCalendarDateRange(currentView, currentDateObj)

  // Fetch calendar events
  const { data, isLoading, error } = useCalendarEvents({
    start,
    end,
    types: enabledEventTypes,
    userId: selectedUserId || undefined,
  })

  // Filter events by enabled types
  const filteredEvents = useMemo(() => {
    if (!data?.events) return []
    return data.events.filter((event) => enabledEventTypes.includes(event.type))
  }, [data?.events, enabledEventTypes])

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setIsModalOpen(true)
  }

  const handleDateClick = (date: Date) => {
    setDate(date.toISOString())
    if (currentView === 'month') {
      setView('day')
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-destructive mb-4">Failed to load calendar events</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <CalendarToolbar userOptions={userOptions} isAdmin={isAdmin} />

      <div className="flex-1 mt-4 min-h-0">
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : currentView === 'month' ? (
          <CalendarMonthView
            currentDate={currentDateObj}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
          />
        ) : currentView === 'week' ? (
          <CalendarWeekView
            currentDate={currentDateObj}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onDateClick={handleDateClick}
          />
        ) : currentView === 'day' ? (
          <CalendarDayView
            currentDate={currentDateObj}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onTimeClick={handleDateClick}
          />
        ) : (
          <CalendarListView events={filteredEvents} onEventClick={handleEventClick} />
        )}
      </div>

      <EventDetailModal
        event={selectedEvent}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  )
}
