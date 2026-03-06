'use client'

import { useMemo } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { EventBadge } from './event-badge'
import {
  computeMultiDaySegments,
  type MultiDaySegment,
} from '@/lib/calendar-multi-day-utils'
import {
  CALENDAR_EVENT_COLORS,
  type CalendarEvent,
} from '@tailfire/shared-types/api'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CheckSquare,
  DollarSign,
  Cake,
  Plane,
  Mail,
  CalendarCheck,
  CalendarDays,
} from 'lucide-react'
import type { CalendarEventType } from '@tailfire/shared-types/api'

const EVENT_ICONS: Record<CalendarEventType, typeof CheckSquare> = {
  task: CheckSquare,
  payment_deposit: DollarSign,
  payment_final: DollarSign,
  birthday: Cake,
  trip: Plane,
  scheduled_email: Mail,
  event: CalendarCheck,
  activity: CalendarDays,
}

// Layout constants
const BAR_HEIGHT = 20 // px
const LANE_PITCH = 22 // px (bar + 2px gap)
const TOP_OFFSET = 28 // px below date header

interface CalendarMonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDateClick?: (date: Date) => void
}

export function CalendarMonthView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
}: CalendarMonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const days = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  )

  const weeks = useMemo(() => {
    const result: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7))
    }
    return result
  }, [days])

  // Compute multi-day layouts per week
  const multiDayLayouts = useMemo(
    () => computeMultiDaySegments(events, weeks),
    [events, weeks]
  )

  // Per-date-key set of event IDs rendered as spanning bar segments.
  // Only excludes events from badges on dates where they actually appear as bars.
  // This handles multi-week events that overflow in some weeks but not others.
  const excludedByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()
    multiDayLayouts.forEach((layout, weekIdx) => {
      const week = weeks[weekIdx]
      if (!week) return
      for (const segment of layout.segments) {
        for (let col = segment.startCol; col < segment.startCol + segment.colSpan; col++) {
          const day = week[col]
          if (!day) continue
          const dateKey = format(day, 'yyyy-MM-dd')
          let ids = map.get(dateKey)
          if (!ids) {
            ids = new Set()
            map.set(dateKey, ids)
          }
          ids.add(segment.event.id)
        }
      }
    })
    return map
  }, [multiDayLayouts, weeks])

  // Map single-day events by date (using parseISO to avoid UTC off-by-one)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    events.forEach((event) => {
      const dateKey = format(parseISO(event.start), 'yyyy-MM-dd')
      // Skip if this event is rendered as a bar on this date
      if (excludedByDate.get(dateKey)?.has(event.id)) return
      const existing = map.get(dateKey) || []
      map.set(dateKey, [...existing, event])
    })
    return map
  }, [events, excludedByDate])

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week, weekIndex) => {
          const layout = multiDayLayouts[weekIndex] ?? { segments: [], laneCount: 0, overflowCount: 0 }
          const laneAreaHeight = layout.laneCount > 0
            ? layout.laneCount * LANE_PITCH
            : 0

          return (
            <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0 relative">
              {/* Multi-day spanning bars layer */}
              {layout.segments.length > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  {layout.segments.map((segment) => (
                    <MultiDayEventBar
                      key={`${segment.event.id}-${weekIndex}`}
                      segment={segment}
                      onEventClick={onEventClick}
                    />
                  ))}
                </div>
              )}

              {/* Day cells */}
              {week.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayEvents = eventsByDate.get(dateKey) || []
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isSelectedDay = isSameDay(day, currentDate)
                const isTodayDate = isToday(day)

                return (
                  <div
                    key={dateKey}
                    className={cn(
                      'min-h-[100px] p-1 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors',
                      !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                      isSelectedDay && 'bg-primary/5'
                    )}
                    onClick={() => onDateClick?.(day)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full',
                          isTodayDate && 'bg-primary text-primary-foreground'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    {/* Events container with top padding to reserve space for multi-day lanes */}
                    <div
                      className="space-y-0.5 overflow-hidden"
                      style={{ paddingTop: laneAreaHeight > 0 ? laneAreaHeight : undefined }}
                    >
                      {dayEvents.slice(0, 3).map((event) => (
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
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground pl-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Overflowed multi-day events fall back to their start-day badge list */}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// INLINE COMPONENT: Multi-Day Event Bar
// ============================================================================

function MultiDayEventBar({
  segment,
  onEventClick,
}: {
  segment: MultiDaySegment
  onEventClick?: (event: CalendarEvent) => void
}) {
  const { event, startCol, colSpan, isStart, isEnd, lane } = segment
  const colors = CALENDAR_EVENT_COLORS[event.type]
  const Icon = EVENT_ICONS[event.type] || CheckSquare
  const COL_WIDTH = 100 / 7 // 14.2857%

  const left = `${startCol * COL_WIDTH}%`
  const width = `${colSpan * COL_WIDTH}%`
  const top = TOP_OFFSET + lane * LANE_PITCH

  const dateRange = event.end
    ? `${format(parseISO(event.start), 'MMM d')} - ${format(parseISO(event.end), 'MMM d, yyyy')}`
    : format(parseISO(event.start), 'MMM d, yyyy')

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'absolute flex items-center gap-1 px-1.5 text-xs font-medium truncate cursor-pointer pointer-events-auto',
              'hover:opacity-80 transition-opacity',
              isStart && isEnd && 'rounded',
              isStart && !isEnd && 'rounded-l',
              !isStart && isEnd && 'rounded-r',
              !isStart && !isEnd && 'rounded-none'
            )}
            style={{
              left,
              width,
              top,
              height: BAR_HEIGHT,
              backgroundColor: colors.background,
              color: colors.text,
              lineHeight: `${BAR_HEIGHT}px`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick?.(event)
            }}
          >
            {isStart && <Icon className="h-3 w-3 flex-shrink-0" />}
            <span className="truncate">{isStart ? event.title : `\u2026 ${event.title}`}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px]">
          <div className="space-y-1">
            <div className="font-medium">{event.title}</div>
            {event.description && (
              <div className="text-xs text-muted-foreground">{event.description}</div>
            )}
            <div className="text-xs text-muted-foreground">{dateRange}</div>
            {event.metadata?.contactName ? (
              <div className="text-xs">Contact: {String(event.metadata.contactName)}</div>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
