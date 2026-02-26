import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createQueryKeys } from '@/lib/query-keys'
import { buildQueryString } from '@/lib/query-params'
import type {
  TagResponseDto,
  TagWithUsageDto,
  CreateTagDto,
  UpdateTagDto,
  TagFilterDto,
  UpdateEntityTagsDto,
  CreateAndAssignTagDto,
} from '@tailfire/shared-types/api'

// Query Keys - uses shared factory with custom entity tag extensions
const baseKeys = createQueryKeys<TagFilterDto>('tags')
export const tagKeys = {
  ...baseKeys,
  tripTags: (tripId: string) => [...baseKeys.all, 'trip', tripId] as const,
  contactTags: (contactId: string) => [...baseKeys.all, 'contact', contactId] as const,
  calendarEventTags: (eventId: string) => [...baseKeys.all, 'calendar-event', eventId] as const,
}

// ============================================================================
// GLOBAL TAG QUERIES
// ============================================================================

/**
 * Fetch all tags with optional filtering and usage counts
 */
export function useTags(filters: TagFilterDto = {}) {
  const query = buildQueryString({
    search: filters.search,
    category: filters.category,
    type: filters.type,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: filters.limit,
    offset: filters.offset,
  })

  return useQuery({
    queryKey: tagKeys.list(filters),
    queryFn: () => api.get<TagWithUsageDto[]>(`/tags${query}`),
  })
}

/**
 * Fetch single tag by ID
 */
export function useTag(id: string | null) {
  return useQuery({
    queryKey: tagKeys.detail(id || ''),
    queryFn: () => api.get<TagResponseDto>(`/tags/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// GLOBAL TAG MUTATIONS
// ============================================================================

/**
 * Create new tag
 */
export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTagDto) =>
      api.post<TagResponseDto>('/tags', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

/**
 * Update existing tag
 */
export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) =>
      api.patch<TagResponseDto>(`/tags/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

/**
 * Delete tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

// ============================================================================
// TRIP TAG QUERIES & MUTATIONS
// ============================================================================

export function useTripTags(tripId: string | null) {
  return useQuery({
    queryKey: tagKeys.tripTags(tripId || ''),
    queryFn: () => api.get<TagResponseDto[]>(`/trips/${tripId}/tags`),
    enabled: !!tripId,
  })
}

export function useUpdateTripTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripId, tagIds }: { tripId: string; tagIds: string[] }) =>
      api.put<TagResponseDto[]>(`/trips/${tripId}/tags`, { tagIds } as UpdateEntityTagsDto),

    onMutate: async (variables) => {
      const { tripId } = variables
      await queryClient.cancelQueries({ queryKey: tagKeys.tripTags(tripId) })
      const previousTags = queryClient.getQueryData<TagResponseDto[]>(
        tagKeys.tripTags(tripId)
      )
      return { previousTags, tripId }
    },

    onError: (_error, _variables, context) => {
      if (context?.previousTags) {
        queryClient.setQueryData(
          tagKeys.tripTags(context.tripId),
          context.previousTags
        )
      }
    },

    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.tripTags(variables.tripId) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },

    retry: 2,
  })
}

export function useCreateAndAssignTripTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripId, data }: { tripId: string; data: CreateAndAssignTagDto }) =>
      api.post<TagResponseDto>(`/trips/${tripId}/tags`, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.tripTags(variables.tripId) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

// ============================================================================
// CONTACT TAG QUERIES & MUTATIONS
// ============================================================================

export function useContactTags(contactId: string | null) {
  return useQuery({
    queryKey: tagKeys.contactTags(contactId || ''),
    queryFn: () => api.get<TagResponseDto[]>(`/contacts/${contactId}/tags`),
    enabled: !!contactId,
  })
}

export function useUpdateContactTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contactId, tagIds }: { contactId: string; tagIds: string[] }) =>
      api.put<TagResponseDto[]>(`/contacts/${contactId}/tags`, { tagIds } as UpdateEntityTagsDto),

    onMutate: async (variables) => {
      const { contactId } = variables
      await queryClient.cancelQueries({ queryKey: tagKeys.contactTags(contactId) })
      const previousTags = queryClient.getQueryData<TagResponseDto[]>(
        tagKeys.contactTags(contactId)
      )
      return { previousTags, contactId }
    },

    onError: (_error, _variables, context) => {
      if (context?.previousTags) {
        queryClient.setQueryData(
          tagKeys.contactTags(context.contactId),
          context.previousTags
        )
      }
    },

    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.contactTags(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },

    retry: 2,
  })
}

export function useCreateAndAssignContactTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: string; data: CreateAndAssignTagDto }) =>
      api.post<TagResponseDto>(`/contacts/${contactId}/tags`, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.contactTags(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },
  })
}

// ============================================================================
// CALENDAR EVENT TAG QUERIES & MUTATIONS
// ============================================================================

export function useCalendarEventTags(eventId: string | null) {
  return useQuery({
    queryKey: tagKeys.calendarEventTags(eventId || ''),
    queryFn: () => api.get<TagResponseDto[]>(`/calendar-events/${eventId}/tags`),
    enabled: !!eventId,
  })
}

export function useUpdateCalendarEventTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ eventId, tagIds }: { eventId: string; tagIds: string[] }) =>
      api.put<TagResponseDto[]>(`/calendar-events/${eventId}/tags`, { tagIds } as UpdateEntityTagsDto),

    onMutate: async (variables) => {
      const { eventId } = variables
      await queryClient.cancelQueries({ queryKey: tagKeys.calendarEventTags(eventId) })
      const previousTags = queryClient.getQueryData<TagResponseDto[]>(
        tagKeys.calendarEventTags(eventId)
      )
      return { previousTags, eventId }
    },

    onError: (_error, _variables, context) => {
      if (context?.previousTags) {
        queryClient.setQueryData(
          tagKeys.calendarEventTags(context.eventId),
          context.previousTags
        )
      }
    },

    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.calendarEventTags(variables.eventId) })
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() })
    },

    retry: 2,
  })
}
