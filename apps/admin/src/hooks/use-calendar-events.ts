import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { calendarKeys } from './use-calendar'
import type {
  CalendarEventResponseDto,
  PaginatedCalendarEventsResponseDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  CalendarEventFilterDto,
} from '@tailfire/shared-types/api'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const calendarEventKeys = {
  all: ['calendar-events'] as const,
  lists: () => [...calendarEventKeys.all, 'list'] as const,
  list: (filters: CalendarEventFilterDto) => [...calendarEventKeys.lists(), filters] as const,
  details: () => [...calendarEventKeys.all, 'detail'] as const,
  detail: (id: string) => [...calendarEventKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated list of calendar events
 */
export function useCalendarEventsList(filters: CalendarEventFilterDto = {}) {
  return useQuery({
    queryKey: calendarEventKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()

      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())
      if (filters.search) params.append('search', filters.search)
      if (filters.contactId) params.append('contactId', filters.contactId)
      if (filters.tripId) params.append('tripId', filters.tripId)
      if (filters.upcoming) params.append('upcoming', 'true')

      return api.get<PaginatedCalendarEventsResponseDto>(`/calendar-events?${params.toString()}`)
    },
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

interface OptimisticUserInfo {
  userId: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

/**
 * Create a new calendar event (with optimistic insert)
 */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCalendarEventDto & { _optimistic?: OptimisticUserInfo }) => {
      const { _optimistic, ...payload } = data
      return api.post<CalendarEventResponseDto>('/calendar-events', payload)
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: calendarEventKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedCalendarEventsResponseDto>({
          queryKey: calendarEventKeys.lists(),
        })

      if (data._optimistic) {
        const tempId = `temp-${Date.now()}`
        const now = new Date().toISOString()
        const optimisticEvent: CalendarEventResponseDto = {
          id: tempId,
          agencyId: '',
          title: data.title,
          description: data.description,
          startAt: data.startAt,
          endAt: data.endAt,
          allDay: data.allDay ?? false,
          eventType: data.eventType ?? 'meeting',
          contactId: data.contactId,
          tripId: data.tripId,
          createdBy: data._optimistic.userId,
          createdByUser: {
            id: data._optimistic.userId,
            firstName: data._optimistic.firstName,
            lastName: data._optimistic.lastName,
            avatarUrl: data._optimistic.avatarUrl,
          },
          createdAt: now,
          updatedAt: now,
        }

        for (const [queryKey, cached] of previousLists) {
          if (!cached) continue
          queryClient.setQueryData<PaginatedCalendarEventsResponseDto>(queryKey, {
            ...cached,
            data: [optimisticEvent, ...cached.data],
            count: cached.count + 1,
          })
        }
      }

      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.lists() })
      // Also invalidate main calendar so new events show up there
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

/**
 * Update an existing calendar event (with optimistic update)
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCalendarEventDto }) =>
      api.put<CalendarEventResponseDto>(`/calendar-events/${id}`, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: calendarEventKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedCalendarEventsResponseDto>({
          queryKey: calendarEventKeys.lists(),
        })

      for (const [queryKey, cached] of previousLists) {
        if (!cached) continue
        queryClient.setQueryData<PaginatedCalendarEventsResponseDto>(queryKey, {
          ...cached,
          data: cached.data.map((event) =>
            event.id === id
              ? { ...event, ...data, updatedAt: new Date().toISOString() }
              : event
          ),
        })
      }

      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}

/**
 * Delete a calendar event (with optimistic removal)
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/calendar-events/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: calendarEventKeys.lists() })

      const previousLists =
        queryClient.getQueriesData<PaginatedCalendarEventsResponseDto>({
          queryKey: calendarEventKeys.lists(),
        })

      for (const [queryKey, cached] of previousLists) {
        if (!cached) continue
        queryClient.setQueryData<PaginatedCalendarEventsResponseDto>(queryKey, {
          ...cached,
          data: cached.data.filter((event) => event.id !== id),
          count: cached.count - 1,
        })
      }

      return { previousLists }
    },
    onError: (_err, _id, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    },
  })
}
