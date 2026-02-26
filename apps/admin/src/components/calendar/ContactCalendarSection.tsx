'use client'

import { useState, useMemo } from 'react'
import { format, parseISO, addDays, isSameDay, startOfDay } from 'date-fns'
import {
  CalendarCheck,
  Plus,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { EventBadge } from '@/app/calendar/_components/event-badge'
import { useContactEvents } from '@/hooks/use-calendar'
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/use-calendar-events'
import { useUser } from '@/hooks/use-user'
import { useMyProfile } from '@/hooks/use-user-profile'
import { useCalendarEventTags, useUpdateCalendarEventTags } from '@/hooks/use-tags'
import { TagInput } from '@/components/ui/tag-input'
import { useToast } from '@/hooks/use-toast'
import type { CalendarEvent, CalendarEventSubType } from '@tailfire/shared-types/api'

const EVENT_TYPE_OPTIONS: { value: CalendarEventSubType; label: string }[] = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'other', label: 'Other' },
]

interface ContactCalendarSectionProps {
  contactId: string
}

export function ContactCalendarSection({ contactId }: ContactCalendarSectionProps) {
  const { userId } = useUser()
  const { data: profile } = useMyProfile()
  const { toast } = useToast()

  // Date range: today to 90 days ahead
  const today = useMemo(() => new Date().toISOString().split('T')[0]!, [])
  const futureEnd = useMemo(
    () => addDays(new Date(), 90).toISOString().split('T')[0]!,
    []
  )

  const { data: contactEventsData, isLoading } = useContactEvents(contactId, today, futureEnd)
  const events = contactEventsData?.events ?? []

  // Calendar event tags
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const { data: eventTags = [] } = useCalendarEventTags(editingEventId)
  const updateEventTags = useUpdateCalendarEventTags()

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formEventType, setFormEventType] = useState<CalendarEventSubType>('meeting')
  const [formStartDate, setFormStartDate] = useState('')
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndDate, setFormEndDate] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formAllDay, setFormAllDay] = useState(false)
  const [formDescription, setFormDescription] = useState('')

  const createEvent = useCreateCalendarEvent()
  const updateEvent = useUpdateCalendarEvent()
  const deleteEvent = useDeleteCalendarEvent()

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const dateKey = event.start.split('T')[0]!
      if (!groups.has(dateKey)) {
        groups.set(dateKey, [])
      }
      groups.get(dateKey)!.push(event)
    }
    // Sort groups by date ascending
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  function openCreateDialog() {
    setEditingEvent(null)
    setEditingEventId(null)
    setFormTitle('')
    setFormEventType('meeting')
    setFormStartDate(today)
    setFormStartTime('09:00')
    setFormEndDate('')
    setFormEndTime('')
    setFormAllDay(false)
    setFormDescription('')
    setDialogOpen(true)
  }

  function openEditDialog(event: CalendarEvent) {
    setEditingEvent(event)
    setEditingEventId(event.sourceId)
    const startDate = event.start.split('T')[0] || ''
    const startTime = event.allDay ? '09:00' : format(parseISO(event.start), 'HH:mm')
    setFormTitle(event.title)
    setFormEventType((event.metadata?.eventType as CalendarEventSubType) ?? 'meeting')
    setFormStartDate(startDate)
    setFormStartTime(startTime)
    setFormEndDate(event.end?.split('T')[0] || '')
    setFormEndTime(event.end && !event.allDay ? format(parseISO(event.end), 'HH:mm') : '')
    setFormAllDay(event.allDay)
    setFormDescription(event.description ?? '')
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!formTitle.trim() || !formStartDate || !userId) return

    const startAt = formAllDay
      ? `${formStartDate}T00:00:00.000Z`
      : `${formStartDate}T${formStartTime}:00.000Z`

    let endAt: string | undefined
    if (formEndDate) {
      endAt = formAllDay
        ? `${formEndDate}T23:59:59.000Z`
        : formEndTime
          ? `${formEndDate}T${formEndTime}:00.000Z`
          : undefined
    }

    if (editingEvent) {
      // Update — use the sourceId (not the prefixed id)
      updateEvent.mutate(
        {
          id: editingEvent.sourceId,
          data: {
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
            startAt,
            endAt,
            allDay: formAllDay,
            eventType: formEventType,
          },
        },
        {
          onSuccess: () => {
            setDialogOpen(false)
            toast({ title: 'Event updated' })
          },
          onError: () => {
            toast({ title: 'Failed to update event', variant: 'destructive' })
          },
        }
      )
    } else {
      // Create
      createEvent.mutate(
        {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          startAt,
          endAt,
          allDay: formAllDay,
          eventType: formEventType,
          contactId,
          _optimistic: {
            userId,
            firstName: profile?.firstName ?? undefined,
            lastName: profile?.lastName ?? undefined,
            avatarUrl: profile?.avatarUrl ?? undefined,
          },
        },
        {
          onSuccess: () => {
            setDialogOpen(false)
            toast({ title: 'Event created' })
          },
          onError: () => {
            toast({ title: 'Failed to create event', variant: 'destructive' })
          },
        }
      )
    }
  }

  function handleDelete(event: CalendarEvent) {
    deleteEvent.mutate(event.sourceId, {
      onSuccess: () => {
        toast({ title: 'Event deleted' })
      },
      onError: () => {
        toast({ title: 'Failed to delete event', variant: 'destructive' })
      },
    })
  }

  function handleEventClick(event: CalendarEvent) {
    // For standalone events, open edit dialog
    if (event.type === 'event') {
      openEditDialog(event)
      return
    }
    // For other types, navigate to source entity
    if (event.sourceType === 'trip' && event.tripId) {
      window.location.href = `/trips/${event.tripId}`
    } else if (event.sourceType === 'task') {
      window.location.href = `/tasks?taskId=${event.sourceId}`
    } else if (event.sourceType === 'contact' && event.contactId) {
      // Birthday — already on contact page, do nothing
    }
  }

  const isToday = (dateStr: string) =>
    isSameDay(parseISO(dateStr), startOfDay(new Date()))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          Calendar
        </h3>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          New Event
        </Button>
      </div>

      {/* Events list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-10 w-10" />}
          title="No upcoming events"
          description="No events found for this contact in the next 90 days."
          action={{
            label: 'Create Event',
            onClick: openCreateDialog,
          }}
        />
      ) : (
        <div className="space-y-4">
          {groupedEvents.map(([dateStr, dateEvents]) => (
            <div key={dateStr}>
              <div className="text-sm font-medium text-muted-foreground mb-1.5">
                {isToday(dateStr)
                  ? 'Today'
                  : format(parseISO(dateStr), 'EEEE, MMM d, yyyy')}
              </div>
              <div className="space-y-1">
                {dateEvents.map((event) => (
                  <div key={event.id} className="group flex items-center gap-1">
                    <div className="flex-1">
                      <EventBadge
                        event={event}
                        onClick={() => handleEventClick(event)}
                        showTime
                      />
                    </div>
                    {event.type === 'event' && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEditDialog(event)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDelete(event)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? 'Edit Event' : 'New Event'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Meeting with client..."
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formEventType}
                onValueChange={(v) => setFormEventType(v as CalendarEventSubType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="all-day"
                checked={formAllDay}
                onCheckedChange={setFormAllDay}
              />
              <Label htmlFor="all-day">All day</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  min="1900-01-01"
                  max="2099-12-31"
                />
              </div>
              {!formAllDay && (
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>End date (optional)</Label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  min="1900-01-01"
                  max="2099-12-31"
                />
              </div>
              {!formAllDay && (
                <div className="space-y-2">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-desc">Description (optional)</Label>
              <Textarea
                id="event-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Add notes about this event..."
                rows={3}
              />
            </div>

            {editingEvent && editingEventId && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  value={eventTags.map(t => t.id)}
                  onChange={(tagIds) => {
                    updateEventTags.mutate({ eventId: editingEventId, tagIds })
                  }}
                  placeholder="Add tag..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formTitle.trim() || !formStartDate || createEvent.isPending || updateEvent.isPending}
            >
              {(createEvent.isPending || updateEvent.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {editingEvent ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
