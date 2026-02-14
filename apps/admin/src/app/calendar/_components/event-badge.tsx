'use client'

import { format, parseISO } from 'date-fns'
import {
  CheckSquare,
  DollarSign,
  Cake,
  Plane,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CALENDAR_EVENT_COLORS, type CalendarEvent, type CalendarEventType } from '@tailfire/shared-types/api'

const EVENT_ICONS: Record<CalendarEventType, typeof CheckSquare> = {
  task: CheckSquare,
  payment_deposit: DollarSign,
  payment_final: DollarSign,
  birthday: Cake,
  trip: Plane,
  scheduled_email: Mail,
}

interface EventBadgeProps {
  event: CalendarEvent
  onClick?: (e: React.MouseEvent) => void
  compact?: boolean
  showTime?: boolean
  expanded?: boolean
}

export function EventBadge({
  event,
  onClick,
  compact = false,
  showTime = false,
  expanded = false,
}: EventBadgeProps) {
  const Icon = EVENT_ICONS[event.type] || CheckSquare
  const colors = CALENDAR_EVENT_COLORS[event.type]

  const eventTime = !event.allDay && showTime
    ? format(parseISO(event.start), 'h:mm a')
    : null

  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded cursor-pointer transition-colors',
        'hover:opacity-80',
        compact ? 'px-1 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        expanded && 'p-3 border'
      )}
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        color: colors.text,
      }}
      onClick={onClick}
    >
      <Icon className={cn('flex-shrink-0', compact ? 'h-3 w-3' : 'h-4 w-4')} />
      {eventTime && (
        <span className="text-xs opacity-80 flex-shrink-0">{eventTime}</span>
      )}
      <span className={cn('truncate', expanded && 'font-medium')}>
        {event.title}
      </span>
      {expanded && event.description && (
        <p className="text-xs opacity-80 mt-1 line-clamp-2">{event.description}</p>
      )}
    </div>
  )

  if (compact && !expanded) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[300px]">
            <div className="space-y-1">
              <div className="font-medium">{event.title}</div>
              {event.description && (
                <div className="text-xs text-muted-foreground">{event.description}</div>
              )}
              <div className="text-xs text-muted-foreground">
                {event.allDay
                  ? format(parseISO(event.start), 'MMM d, yyyy')
                  : format(parseISO(event.start), 'MMM d, yyyy h:mm a')}
                {event.end && !event.allDay && (
                  <> - {format(parseISO(event.end), 'h:mm a')}</>
                )}
              </div>
              {event.metadata?.contactName && (
                <div className="text-xs">Contact: {event.metadata.contactName}</div>
              )}
              {event.metadata?.tripName && (
                <div className="text-xs">Trip: {event.metadata.tripName}</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}
