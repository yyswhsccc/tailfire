'use client'

import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import {
  CheckSquare,
  DollarSign,
  Cake,
  Plane,
  Mail,
  ExternalLink,
  User,
  MapPin,
  Clock,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CALENDAR_EVENT_COLORS, type CalendarEvent, type CalendarEventType } from '@tailfire/shared-types/api'

const EVENT_ICONS: Record<CalendarEventType, typeof CheckSquare> = {
  task: CheckSquare,
  payment_deposit: DollarSign,
  payment_final: DollarSign,
  birthday: Cake,
  trip: Plane,
  scheduled_email: Mail,
}

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  task: 'Task',
  payment_deposit: 'Deposit Due',
  payment_final: 'Final Payment Due',
  birthday: 'Birthday',
  trip: 'Trip',
  scheduled_email: 'Scheduled Email',
}

interface EventDetailModalProps {
  event: CalendarEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EventDetailModal({ event, open, onOpenChange }: EventDetailModalProps) {
  if (!event) return null

  const Icon = EVENT_ICONS[event.type] || CheckSquare
  const colors = CALENDAR_EVENT_COLORS[event.type]

  const formatDateTime = () => {
    if (event.allDay) {
      return format(parseISO(event.start), 'EEEE, MMMM d, yyyy')
    }
    const start = format(parseISO(event.start), 'EEEE, MMMM d, yyyy h:mm a')
    if (event.end) {
      return `${start} - ${format(parseISO(event.end), 'h:mm a')}`
    }
    return start
  }

  const getDetailLink = () => {
    switch (event.type) {
      case 'task':
        return `/tasks?id=${event.id}`
      case 'trip':
        return `/trips/${event.metadata?.tripId}`
      case 'payment_deposit':
      case 'payment_final':
        return event.metadata?.tripId ? `/trips/${event.metadata.tripId}#financials` : null
      case 'birthday':
        return event.metadata?.contactId ? `/contacts/${event.metadata.contactId}` : null
      default:
        return null
    }
  }

  const detailLink = getDetailLink()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: colors.background }}
            >
              <Icon className="h-5 w-5" style={{ color: colors.text }} />
            </div>
            <div className="flex-1">
              <Badge
                variant="secondary"
                className="mb-1"
                style={{
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                }}
              >
                {EVENT_TYPE_LABELS[event.type]}
              </Badge>
              <DialogTitle className="text-xl">{event.title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Date/Time */}
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{formatDateTime()}</span>
          </div>

          {/* Description */}
          {event.description && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </>
          )}

          {/* Metadata */}
          {(event.metadata?.contactName || event.metadata?.tripName) ? (
            <>
              <Separator />
              <div className="space-y-2">
                {event.metadata.contactName ? (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{String(event.metadata.contactName)}</span>
                    {event.metadata.contactId ? (
                      <Link
                        href={`/contacts/${String(event.metadata.contactId)}`}
                        className="text-primary hover:underline ml-auto"
                      >
                        View Contact
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {event.metadata.tripName ? (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{String(event.metadata.tripName)}</span>
                    {event.metadata.tripId ? (
                      <Link
                        href={`/trips/${String(event.metadata.tripId)}`}
                        className="text-primary hover:underline ml-auto"
                      >
                        View Trip
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* Amount for payment events */}
          {event.metadata?.amount !== undefined && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-lg">
                  ${Number(event.metadata.amount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                </span>
                {event.metadata.currency && String(event.metadata.currency) !== 'CAD' ? (
                  <span className="text-sm text-muted-foreground">
                    {String(event.metadata.currency)}
                  </span>
                ) : null}
              </div>
            </>
          )}

          {/* Actions */}
          {detailLink && (
            <>
              <Separator />
              <div className="flex justify-end">
                <Button asChild>
                  <Link href={detailLink}>
                    View Details
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
