import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  TripTravelerResponseDto,
  CreateTripTravelerDto,
  UpdateTripTravelerDto,
  TripTravelerFilterDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const tripTravelerKeys = {
  all: ['trip-travelers'] as const,
  lists: () => [...tripTravelerKeys.all, 'list'] as const,
  list: (tripId: string, filters?: TripTravelerFilterDto) =>
    [...tripTravelerKeys.lists(), tripId, filters] as const,
  details: () => [...tripTravelerKeys.all, 'detail'] as const,
  detail: (id: string) => [...tripTravelerKeys.details(), id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

interface UseTripTravelersOptions {
  filters?: TripTravelerFilterDto
  enabled?: boolean
}

/**
 * Fetch all travelers for a trip
 */
export function useTripTravelers(tripId: string, options?: UseTripTravelersOptions) {
  const { filters, enabled = true } = options ?? {}

  return useQuery({
    queryKey: tripTravelerKeys.list(tripId, filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.contactId) params.append('contactId', filters.contactId)
      if (filters?.role) params.append('role', filters.role)
      if (filters?.isPrimaryTraveler !== undefined) {
        params.append('isPrimaryTraveler', filters.isPrimaryTraveler.toString())
      }
      if (filters?.travelerType) params.append('travelerType', filters.travelerType)

      const queryString = params.toString()
      return api.get<TripTravelerResponseDto[]>(
        `/trips/${tripId}/travelers${queryString ? `?${queryString}` : ''}`
      )
    },
    enabled: !!tripId && enabled,
  })
}

/**
 * Fetch single traveler by ID
 */
export function useTripTraveler(travelerId: string | null, tripId?: string) {
  return useQuery({
    queryKey: tripTravelerKeys.detail(travelerId || ''),
    queryFn: () => {
      const url = tripId
        ? `/trips/${tripId}/travelers/${travelerId}`
        : `/trip-travelers/${travelerId}`
      return api.get<TripTravelerResponseDto>(url)
    },
    enabled: !!travelerId,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Add a traveler to a trip
 */
export function useCreateTripTraveler(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTripTravelerDto & { addToAllActivities?: boolean }) => {
      const { addToAllActivities, ...body } = data
      const url = addToAllActivities
        ? `/trips/${tripId}/travelers?addToAllActivities=true`
        : `/trips/${tripId}/travelers`
      return api.post<TripTravelerResponseDto>(url, body as CreateTripTravelerDto)
    },
    onSuccess: (_data, variables) => {
      // Invalidate travelers list for this trip
      queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
      // When auto-assigning to activities, also invalidate activity-traveler
      // queries so the per-activity Travelers list reflects the new traveler.
      if (variables?.addToAllActivities) {
        queryClient.invalidateQueries({ queryKey: ['activity-travelers'] })
        queryClient.invalidateQueries({ queryKey: ['activities'] })
      }
    },
  })
}

/**
 * Update a traveler
 */
export function useUpdateTripTraveler(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTripTravelerDto }) =>
      api.patch<TripTravelerResponseDto>(
        `/trips/${tripId}/travelers/${id}`,
        data
      ),

    // Optimistically update cache
    onMutate: async (variables) => {
      const { id, data } = variables

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tripTravelerKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: tripTravelerKeys.lists() })

      // Snapshot previous value
      const previousTraveler = queryClient.getQueryData<TripTravelerResponseDto>(
        tripTravelerKeys.detail(id)
      )

      // Optimistically update detail cache
      if (previousTraveler) {
        queryClient.setQueryData<TripTravelerResponseDto>(
          tripTravelerKeys.detail(id),
          (old) => {
            if (!old) return old
            return { ...old, ...data } as TripTravelerResponseDto
          }
        )
      }

      // Optimistically update list cache
      queryClient.setQueriesData<TripTravelerResponseDto[]>(
        { queryKey: tripTravelerKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((traveler) =>
            traveler.id === id
              ? ({ ...traveler, ...data } as TripTravelerResponseDto)
              : traveler
          )
        }
      )

      return { previousTraveler }
    },

    // Rollback on error
    onError: (_error, variables, context) => {
      if (context?.previousTraveler) {
        queryClient.setQueryData(
          tripTravelerKeys.detail(variables.id),
          context.previousTraveler
        )
      }
    },

    // Always refetch after success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
    },

    retry: 2,
  })
}

/**
 * Remove a traveler from a trip
 */
export function useDeleteTripTraveler(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (travelerId: string) =>
      api.delete(`/trips/${tripId}/travelers/${travelerId}`),
    onSuccess: () => {
      // Invalidate travelers list
      queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
    },
  })
}

/**
 * Reset traveler snapshot to current contact data
 */
export function useResetTravelerSnapshot(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (travelerId: string) =>
      api.post<TripTravelerResponseDto>(`/trips/${tripId}/travelers/${travelerId}/snapshot/reset`),
    onSuccess: (_data, travelerId) => {
      // Invalidate travelers list and snapshot queries
      queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['travelerSnapshot', tripId, travelerId] })
    },
  })
}
