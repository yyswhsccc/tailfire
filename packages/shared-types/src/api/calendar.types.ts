/**
 * Calendar API Types
 *
 * Types for calendar event aggregation and display.
 * Supports multiple event sources: tasks, trips, payments, birthdays, scheduled emails.
 */

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * All supported calendar event types
 */
export type CalendarEventType =
  | 'task'
  | 'payment_deposit'
  | 'payment_final'
  | 'birthday'
  | 'trip'
  | 'scheduled_email'

/**
 * Event color scheme for UI consistency
 */
export const CALENDAR_EVENT_COLORS: Record<CalendarEventType, { background: string; border: string; text: string }> = {
  task: { background: '#3b82f6', border: '#2563eb', text: '#ffffff' }, // blue-500
  payment_deposit: { background: '#f59e0b', border: '#d97706', text: '#ffffff' }, // amber-500
  payment_final: { background: '#ef4444', border: '#dc2626', text: '#ffffff' }, // red-500
  birthday: { background: '#ec4899', border: '#db2777', text: '#ffffff' }, // pink-500
  trip: { background: '#10b981', border: '#059669', text: '#ffffff' }, // emerald-500
  scheduled_email: { background: '#64748b', border: '#475569', text: '#ffffff' }, // slate-500
}

// ============================================================================
// CALENDAR EVENT
// ============================================================================

/**
 * Unified calendar event structure for all event types
 */
export interface CalendarEvent {
  id: string
  type: CalendarEventType
  title: string
  description?: string

  // Timing
  start: string // ISO datetime or date
  end?: string // ISO datetime or date (for multi-day events)
  allDay: boolean

  // Display
  color?: string // Hex color override
  backgroundColor?: string
  borderColor?: string
  textColor?: string

  // Source reference (for navigation)
  sourceId: string // ID of the source entity
  sourceType: 'task' | 'trip' | 'contact' | 'payment' | 'email'

  // Related entities (for context)
  tripId?: string
  tripName?: string
  contactId?: string
  contactName?: string

  // Metadata
  metadata?: Record<string, unknown>

  // Interaction flags
  editable?: boolean // Can be dragged/resized
  clickable?: boolean // Can be clicked for details
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export interface CalendarQueryDto {
  start: string // ISO date (required)
  end: string // ISO date (required)
  types?: CalendarEventType[] // Filter by event types
  userId?: string // Filter by user (admin only)
  tripId?: string // Filter by trip
  contactId?: string // Filter by contact
}

export interface DateRangeQueryDto {
  start: string // ISO date
  end: string // ISO date
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface CalendarEventsResponseDto {
  events: CalendarEvent[]
  range: {
    start: string
    end: string
  }
  filters: {
    types?: CalendarEventType[]
    userId?: string
  }
}

export interface TodayEventsResponseDto {
  events: CalendarEvent[]
  date: string // ISO date
  count: number
}

// ============================================================================
// PER-ENTITY EVENTS
// ============================================================================

/**
 * Events related to a specific contact
 */
export interface ContactEventsResponseDto {
  contactId: string
  contactName: string
  events: CalendarEvent[]
  range: {
    start: string
    end: string
  }
}

/**
 * Events related to a specific trip
 */
export interface TripEventsResponseDto {
  tripId: string
  tripName: string
  events: CalendarEvent[]
  range: {
    start: string
    end: string
  }
}

// ============================================================================
// FULLCALENDAR INTEGRATION
// ============================================================================

/**
 * FullCalendar event source configuration
 */
export interface FullCalendarEventSource {
  url: string
  method: 'GET'
  extraParams?: Record<string, string>
  failure?: (error: Error) => void
}

/**
 * FullCalendar event format (extends CalendarEvent)
 */
export interface FullCalendarEvent extends CalendarEvent {
  // FullCalendar specific fields
  classNames?: string[]
  display?: 'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none'
  extendedProps?: {
    type: CalendarEventType
    sourceId: string
    sourceType: string
    tripId?: string
    contactId?: string
    metadata?: Record<string, unknown>
  }
}

// ============================================================================
// VIEW PREFERENCES
// ============================================================================

export type CalendarView = 'month' | 'week' | 'day' | 'list'

export interface CalendarPreferences {
  currentView: CalendarView
  currentDate: string // ISO date
  selectedUserId?: string // For admin filtering
  enabledEventTypes: CalendarEventType[]
}

// ============================================================================
// DRAG & DROP
// ============================================================================

export interface CalendarEventDropDto {
  eventId: string
  eventType: CalendarEventType
  newStart: string // ISO datetime or date
  newEnd?: string // ISO datetime or date
  allDay: boolean
}

export interface CalendarEventResizeDto {
  eventId: string
  eventType: CalendarEventType
  newEnd: string // ISO datetime or date
}
