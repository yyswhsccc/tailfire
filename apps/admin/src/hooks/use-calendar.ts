import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  CalendarEventsResponseDto,
  TodayEventsResponseDto,
  ContactEventsResponseDto,
  TripEventsResponseDto,
  CalendarEventType,
} from '@tailfire/shared-types/api'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const calendarKeys = {
  all: ['calendar'] as const,
  events: () => [...calendarKeys.all, 'events'] as const,
  eventRange: (
    start: string,
    end: string,
    filters: { types?: CalendarEventType[]; userId?: string }
  ) => [...calendarKeys.events(), { start, end, ...filters }] as const,
  today: () => [...calendarKeys.all, 'today'] as const,
  contactEvents: (contactId: string, start: string, end: string) =>
    [...calendarKeys.all, 'contact', contactId, { start, end }] as const,
  tripEvents: (tripId: string, start: string, end: string) =>
    [...calendarKeys.all, 'trip', tripId, { start, end }] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

interface CalendarEventsFilters {
  start: string
  end: string
  types?: CalendarEventType[]
  userId?: string
  tripId?: string
  contactId?: string
}

/**
 * Fetch calendar events within a date range
 */
export function useCalendarEvents(filters: CalendarEventsFilters) {
  return useQuery({
    queryKey: calendarKeys.eventRange(filters.start, filters.end, {
      types: filters.types,
      userId: filters.userId,
    }),
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('start', filters.start)
      params.append('end', filters.end)

      if (filters.types?.length) {
        filters.types.forEach((type) => params.append('types', type))
      }
      if (filters.userId) {
        params.append('userId', filters.userId)
      }
      if (filters.tripId) {
        params.append('tripId', filters.tripId)
      }
      if (filters.contactId) {
        params.append('contactId', filters.contactId)
      }

      return api.get<CalendarEventsResponseDto>(
        `/calendar/events?${params.toString()}`
      )
    },
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Fetch today's events (for navbar preview)
 */
export function useTodayEvents() {
  return useQuery({
    queryKey: calendarKeys.today(),
    queryFn: () => api.get<TodayEventsResponseDto>('/calendar/events/today'),
    staleTime: 60_000, // 1 minute
    refetchInterval: 5 * 60_000, // Refetch every 5 minutes
  })
}

/**
 * Fetch events for a specific contact
 */
export function useContactEvents(
  contactId: string | null,
  start: string,
  end: string
) {
  return useQuery({
    queryKey: calendarKeys.contactEvents(contactId || '', start, end),
    queryFn: () =>
      api.get<ContactEventsResponseDto>(
        `/calendar/contacts/${contactId}/events?start=${start}&end=${end}`
      ),
    enabled: !!contactId,
    staleTime: 30_000,
  })
}

/**
 * Fetch events for a specific trip
 */
export function useTripEvents(tripId: string | null, start: string, end: string) {
  return useQuery({
    queryKey: calendarKeys.tripEvents(tripId || '', start, end),
    queryFn: () =>
      api.get<TripEventsResponseDto>(
        `/calendar/trips/${tripId}/events?start=${start}&end=${end}`
      ),
    enabled: !!tripId,
    staleTime: 30_000,
  })
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Calculate date range for current view
 */
export function useCalendarDateRange(
  view: 'month' | 'week' | 'day' | 'list',
  currentDate: Date
) {
  let start: Date
  let end: Date

  switch (view) {
    case 'month': {
      // Get first and last day of month, extending to full weeks
      const firstOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      )
      const lastOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      )
      // Extend to include full weeks
      start = new Date(firstOfMonth)
      start.setDate(start.getDate() - start.getDay())
      end = new Date(lastOfMonth)
      end.setDate(end.getDate() + (6 - end.getDay()))
      break
    }
    case 'week': {
      start = new Date(currentDate)
      start.setDate(currentDate.getDate() - currentDate.getDay())
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      break
    }
    case 'day': {
      start = new Date(currentDate)
      end = new Date(currentDate)
      break
    }
    case 'list':
    default: {
      // Default to current month
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      break
    }
  }

  return {
    start: start.toISOString().split('T')[0]!,
    end: end.toISOString().split('T')[0]!,
  }
}
