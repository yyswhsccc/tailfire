'use client'

import { Calendar, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTodayEvents } from '@/hooks/use-calendar'
import { CALENDAR_EVENT_COLORS, type CalendarEvent, type CalendarEventType } from '@tailfire/shared-types/api'
import {
  CheckSquare,
  DollarSign,
  Cake,
  Plane,
  Mail,
  CalendarCheck,
} from 'lucide-react'

const EVENT_ICONS: Record<CalendarEventType, typeof CheckSquare> = {
  task: CheckSquare,
  payment_deposit: DollarSign,
  payment_final: DollarSign,
  birthday: Cake,
  trip: Plane,
  scheduled_email: Mail,
  event: CalendarCheck,
}

function EventListItem({ event }: { event: CalendarEvent }) {
  const Icon = EVENT_ICONS[event.type] || CheckSquare
  const colors = CALENDAR_EVENT_COLORS[event.type]

  const getEventLink = () => {
    switch (event.type) {
      case 'task':
        return `/tasks?id=${event.sourceId}`
      case 'trip':
        return `/trips/${event.tripId || event.sourceId}`
      case 'payment_deposit':
      case 'payment_final':
        return event.tripId ? `/trips/${event.tripId}#financials` : null
      case 'birthday':
        return event.contactId ? `/contacts/${event.contactId}` : null
      default:
        return null
    }
  }

  const link = getEventLink()
  const content = (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
    >
      <div
        className="p-1 rounded"
        style={{ backgroundColor: colors.background }}
      >
        <Icon className="h-3 w-3" style={{ color: colors.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{event.title}</div>
        {!event.allDay && (
          <div className="text-xs text-muted-foreground">
            {format(parseISO(event.start), 'h:mm a')}
          </div>
        )}
      </div>
    </div>
  )

  if (link) {
    return <Link href={link}>{content}</Link>
  }

  return content
}

export function CalendarNavbarPopover() {
  const { data, isLoading } = useTodayEvents()
  const todayEvents = data?.events || []
  const eventCount = todayEvents.length

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" asChild>
          <Link href="/calendar">
            <Calendar className="h-4 w-4 text-ash-600" />
            {eventCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-phoenix-gold-500 text-[10px] text-white flex items-center justify-center font-medium">
                {eventCount > 9 ? '9+' : eventCount}
              </span>
            )}
          </Link>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">Today&apos;s Events</h4>
              <p className="text-xs text-muted-foreground">
                {format(new Date(), 'EEEE, MMMM d')}
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calendar" className="text-xs">
                View Calendar
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : todayEvents.length === 0 ? (
          <div className="p-6 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No events today</p>
            <Button variant="link" size="sm" asChild className="mt-2">
              <Link href="/calendar">View Calendar</Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="p-2 space-y-1">
              {todayEvents.map((event) => (
                <EventListItem key={event.id} event={event} />
              ))}
            </div>
          </ScrollArea>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
