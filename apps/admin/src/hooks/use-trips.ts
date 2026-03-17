import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createQueryKeys } from '@/lib/query-keys'
import { buildQueryString } from '@/lib/query-params'
import type {
  TripResponseDto,
  TripWithDetailsResponseDto,
  CreateTripDto,
  UpdateTripDto,
  TripFilterDto,
  PaginatedTripsResponseDto,
  BulkTripOperationResult,
  TripFilterOptionsResponseDto,
  TripGroupDto,
  UpdateTripGroupApiDto,
  TripGroupTripDto,
  TripGroupSummaryDto,
  TripGroupDocumentDto,
  TripGroupMediaDto,
  GroupTravelerDto,
} from '@tailfire/shared-types/api'
import type { TripStatus } from '@tailfire/shared-types'

// Query Keys - uses shared factory with custom filterOptions extension
const baseKeys = createQueryKeys<TripFilterDto>('trips')
export const tripKeys = {
  ...baseKeys,
  filterOptions: () => [...baseKeys.all, 'filterOptions'] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated list of trips
 */
export function useTrips(filters: TripFilterDto = {}) {
  return useQuery({
    queryKey: tripKeys.list(filters),
    queryFn: () => {
      const query = buildQueryString({
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        status: filters.status,
        tripType: filters.tripType,
        tripGroupId: filters.tripGroupId,
        tags: filters.tags,
        startDateFrom: filters.startDateFrom,
        startDateTo: filters.startDateTo,
        endDateFrom: filters.endDateFrom,
        endDateTo: filters.endDateTo,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      })

      return api.get<PaginatedTripsResponseDto>(`/trips${query}`)
    },
    placeholderData: keepPreviousData,
  })
}

interface UseTripOptions {
  enabled?: boolean
}

/**
 * Fetch single trip by ID (returns full details with itineraries)
 */
export function useTrip(id: string | null, options?: UseTripOptions) {
  const { enabled = true } = options ?? {}

  return useQuery({
    queryKey: tripKeys.detail(id || ''),
    queryFn: () => api.get<TripWithDetailsResponseDto>(`/trips/${id}`),
    enabled: !!id && enabled,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new trip
 */
export function useCreateTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTripDto) =>
      api.post<TripResponseDto>('/trips', data),
    onSuccess: () => {
      // Invalidate and refetch trips list
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

/**
 * Update existing trip with optimistic updates
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTripDto }) =>
      api.patch<TripResponseDto>(`/trips/${id}`, data),

    // Optimistically update cache before server responds
    onMutate: async (variables) => {
      const { id, data } = variables

      // Cancel any outgoing refetches for this trip and lists
      await queryClient.cancelQueries({ queryKey: tripKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: tripKeys.lists() })

      // Snapshot previous values for rollback
      const previousTrip = queryClient.getQueryData<TripResponseDto>(
        tripKeys.detail(id)
      )
      const previousLists = queryClient.getQueriesData<PaginatedTripsResponseDto>({
        queryKey: tripKeys.lists(),
      })

      // Optimistically update the trip detail cache
      if (previousTrip) {
        queryClient.setQueryData<TripResponseDto>(tripKeys.detail(id), (old) => {
          if (!old) return old
          return { ...old, ...data } as TripResponseDto
        })
      }

      // Optimistically update all list caches containing this trip
      previousLists.forEach(([queryKey, listData]) => {
        if (listData?.data) {
          queryClient.setQueryData<PaginatedTripsResponseDto>(queryKey, {
            ...listData,
            data: listData.data.map((trip) =>
              trip.id === id ? ({ ...trip, ...data } as TripResponseDto) : trip
            ),
          })
        }
      })

      // Return context for rollback
      return { previousTrip, previousLists }
    },

    // Rollback on error
    onError: (_error, variables, context) => {
      if (context?.previousTrip) {
        queryClient.setQueryData(
          tripKeys.detail(variables.id),
          context.previousTrip
        )
      }
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, listData]) => {
          queryClient.setQueryData(queryKey, listData)
        })
      }
    },

    // Always refetch after success to ensure consistency
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: tripKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      // Refresh activity feed to show new audit entries
      queryClient.invalidateQueries({
        queryKey: ['trips', variables.id, 'activity'],
      })
    },

    // Retry failed mutations
    retry: 2,
  })
}

/**
 * Cancel a trip (sets status to cancelled with a reason)
 */
export function useCancelTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripId, reason, notifyTravelers }: { tripId: string; reason: string; notifyTravelers?: boolean }) =>
      api.post(`/trips/${tripId}/cancel`, { reason, notifyTravelers }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(variables.tripId) })
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
    },
  })
}

/**
 * Delete trip
 * Note: Only trips with status 'draft' or 'quoted' can be deleted
 */
/**
 * Restore a trip from cancelled status (admin only)
 */
export function useRestoreTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
    },
  })
}

/**
 * Un-cancel a trip (admin only, returns to previous status)
 */
export function useUncancelTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) => api.post(`/trips/${tripId}/uncancel`),
    onSuccess: (_data, tripId) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) })
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
    },
  })
}

/**
 * Delete trip
 * Note: Only trips with status 'draft' or 'quoted' can be deleted
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${id}`),

    // Cancel and remove queries BEFORE the delete completes to prevent 404s during navigation
    onMutate: async (id) => {
      // Helper to check if a query is related to this trip
      const isTripRelatedQuery = (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey
        // Trip detail: ['trips', 'detail', id]
        if (key[0] === 'trips' && key[1] === 'detail' && key[2] === id) return true
        // Trip activity: ['trips', id, 'activity', ...]
        if (key[0] === 'trips' && key[1] === id && key[2] === 'activity') return true
        // Trip travelers: ['trip-travelers', 'list', tripId, ...]
        if (key[0] === 'trip-travelers' && key[2] === id) return true
        // Traveler snapshot: ['travelerSnapshot', tripId, ...]
        if (key[0] === 'travelerSnapshot' && key[1] === id) return true
        return false
      }

      // Cancel all in-flight queries for this trip
      await queryClient.cancelQueries({ predicate: isTripRelatedQuery })

      // Remove all trip-related queries from cache immediately
      queryClient.removeQueries({ predicate: isTripRelatedQuery })
    },

    onSuccess: () => {
      // Invalidate lists to refresh the trips list
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

// ============================================================================
// FILTER OPTIONS QUERY
// ============================================================================

/**
 * Fetch filter options for trips (statuses, trip types, tags)
 */
export function useTripFilterOptions() {
  return useQuery({
    queryKey: tripKeys.filterOptions(),
    queryFn: () => api.get<TripFilterOptionsResponseDto>('/trips/filter-options'),
    staleTime: 5 * 60 * 1000, // 5 minutes - options don't change often
  })
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk delete trips
 * Returns per-item success/failure tracking
 */
export function useBulkDeleteTrips() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (tripIds: string[]) =>
      api.post<BulkTripOperationResult>('/trips/bulk-delete', { tripIds }),

    onSuccess: (result) => {
      // Remove deleted trips from cache
      result.success.forEach((id) => {
        queryClient.removeQueries({ queryKey: tripKeys.detail(id) })
      })
      // Invalidate lists to refresh
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

/**
 * Bulk archive/unarchive trips
 * Returns per-item success/failure tracking
 */
export function useBulkArchiveTrips() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripIds, archive }: { tripIds: string[]; archive: boolean }) =>
      api.post<BulkTripOperationResult>('/trips/bulk-archive', { tripIds, archive }),

    onSuccess: () => {
      // Invalidate all trip queries to refresh
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

/**
 * Bulk change status of trips
 * Returns per-item success/failure tracking with transition validation
 */
export function useBulkChangeStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tripIds, status }: { tripIds: string[]; status: TripStatus }) =>
      api.post<BulkTripOperationResult>('/trips/bulk-status', { tripIds, status }),

    onSuccess: () => {
      // Invalidate all trip queries to refresh
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

// ============================================================================
// PUBLISH / UNPUBLISH / DUPLICATE
// ============================================================================

export function usePublishTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) =>
      api.patch<TripResponseDto>(`/trips/${tripId}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function usePublishTripSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) =>
      api.post<TripResponseDto & {
        versionNumber?: number
        publishedItineraries?: Array<{ itineraryId: string; name: string; versionNumber: number }>
      }>(`/trips/${tripId}/publish-snapshot`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function useUnpublishTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) =>
      api.patch<TripResponseDto>(`/trips/${tripId}/unpublish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function useDuplicateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tripId: string) =>
      api.post<TripResponseDto>(`/trips/${tripId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

// ============================================================================
// TRIP GROUPS
// ============================================================================

const tripGroupKeys = {
  all: ['tripGroups'] as const,
  list: () => [...tripGroupKeys.all, 'list'] as const,
}

export function useTripGroups() {
  return useQuery({
    queryKey: tripGroupKeys.list(),
    queryFn: () => api.get<TripGroupDto[]>('/trips/groups'),
  })
}

export function useCreateTripGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      type?: string
      groupNumber?: string
      primarySupplierId?: string
      destination?: string
      startDate?: string
      endDate?: string
      status?: string
      description?: string
    }) => api.post<TripGroupDto>('/trips/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}

export function useUpdateTripGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: UpdateTripGroupApiDto }) =>
      api.patch<TripGroupDto>(`/trips/groups/${groupId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}

export function useDeleteTripGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) =>
      api.delete(`/trips/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useTripsByGroup(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'trips', groupId] as const,
    queryFn: () => api.get<TripGroupTripDto[]>(`/trips/groups/${groupId}/trips`),
    enabled: !!groupId,
  })
}

export function useGroupTravelers(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'travelers', groupId] as const,
    queryFn: () => api.get<GroupTravelerDto[]>(`/trips/groups/${groupId}/travelers`),
    enabled: !!groupId,
  })
}

export function useGroupSummary(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'summary', groupId],
    queryFn: () => api.get<TripGroupSummaryDto>(`/trips/groups/${groupId}/summary`),
    enabled: !!groupId,
  })
}

export function useUpdateGroupStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, status, reason }: { groupId: string; status: string; reason?: string }) =>
      api.patch(`/trips/groups/${groupId}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useAddTripsToGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, tripIds }: { groupId: string; tripIds: string[] }) =>
      api.post(`/trips/groups/${groupId}/trips`, { tripIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useRemoveTripFromGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, tripId }: { groupId: string; tripId: string }) =>
      api.delete(`/trips/groups/${groupId}/trips/${tripId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useGroupDocuments(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'documents', groupId],
    queryFn: () =>
      api.get<{ documents: TripGroupDocumentDto[] }>(`/trips/groups/${groupId}/documents`)
        .then((res) => res.documents),
    enabled: !!groupId,
  })
}

export function useUploadGroupDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, file, documentType }: { groupId: string; file: File; documentType?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (documentType) formData.append('documentType', documentType)
      return api.post(`/trips/groups/${groupId}/documents`, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}

export function useDeleteGroupDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, documentId }: { groupId: string; documentId: string }) =>
      api.delete(`/trips/groups/${groupId}/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}

export function useGroupMedia(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'media', groupId],
    queryFn: () =>
      api.get<{ media: TripGroupMediaDto[] }>(`/trips/groups/${groupId}/media`)
        .then((res) => res.media),
    enabled: !!groupId,
  })
}

export function useUploadGroupMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, file, caption }: { groupId: string; file: File; caption?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (caption) formData.append('caption', caption)
      return api.post(`/trips/groups/${groupId}/media`, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}

export function useDeleteGroupMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, mediaId }: { groupId: string; mediaId: string }) =>
      api.delete(`/trips/groups/${groupId}/media/${mediaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
    },
  })
}
