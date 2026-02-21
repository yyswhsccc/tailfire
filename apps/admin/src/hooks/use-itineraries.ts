import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ItineraryResponseDto,
  CreateItineraryDto,
  UpdateItineraryDto,
  ItineraryFilterDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const itineraryKeys = {
  all: ['itineraries'] as const,
  lists: () => [...itineraryKeys.all, 'list'] as const,
  list: (tripId: string, filters?: ItineraryFilterDto) =>
    [...itineraryKeys.lists(), tripId, filters] as const,
  details: () => [...itineraryKeys.all, 'detail'] as const,
  detail: (tripId: string, id: string) =>
    [...itineraryKeys.details(), tripId, id] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch all itineraries for a trip
 */
export function useItineraries(tripId: string, filters?: ItineraryFilterDto) {
  return useQuery({
    queryKey: itineraryKeys.list(tripId, filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.append('status', filters.status)
      if (filters?.isSelected !== undefined)
        params.append('isSelected', filters.isSelected.toString())

      const query = params.toString()
      return api.get<ItineraryResponseDto[]>(
        `/trips/${tripId}/itineraries${query ? `?${query}` : ''}`
      )
    },
    enabled: !!tripId,
  })
}

/**
 * Fetch single itinerary by ID
 */
export function useItinerary(tripId: string, id: string | null) {
  return useQuery({
    queryKey: itineraryKeys.detail(tripId, id || ''),
    queryFn: () => api.get<ItineraryResponseDto>(`/trips/${tripId}/itineraries/${id}`),
    enabled: !!tripId && !!id,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new itinerary
 */
export function useCreateItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateItineraryDto) =>
      api.post<ItineraryResponseDto>(`/trips/${tripId}/itineraries`, data),
    onSuccess: () => {
      // Invalidate and refetch itineraries list for this specific trip only
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
    },
  })
}

/**
 * Update existing itinerary
 */
export function useUpdateItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateItineraryDto }) =>
      api.patch<ItineraryResponseDto>(`/trips/${tripId}/itineraries/${id}`, data),
    onSuccess: (_, variables) => {
      // Invalidate specific itinerary and lists for this trip only
      queryClient.invalidateQueries({
        queryKey: itineraryKeys.detail(tripId, variables.id),
      })
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
    },
  })
}

/**
 * Select an itinerary for viewing/editing
 * Sets isSelected=true for this itinerary and false for all others in the trip
 * Does NOT change status - use useUpdateItineraryStatus for status changes
 */
export function useSelectItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.patch<ItineraryResponseDto>(`/trips/${tripId}/itineraries/${id}/select`, {}),
    onSuccess: (_, id) => {
      // Invalidate all itinerary queries for this trip to refresh selection state
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
      queryClient.invalidateQueries({
        queryKey: itineraryKeys.detail(tripId, id),
      })
    },
  })
}

/**
 * Delete itinerary
 */
export function useDeleteItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${tripId}/itineraries/${id}`),
    onSuccess: () => {
      // Invalidate lists for this trip only
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
    },
  })
}

/**
 * Duplicate an itinerary within the same trip
 * Creates a copy with all days and activities
 */
export function useDuplicateItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itineraryId: string) =>
      api.post<ItineraryResponseDto>(`/trips/${tripId}/itineraries/${itineraryId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
    },
  })
}

/**
 * Update itinerary status
 * Specialized mutation for status transitions with proper cache invalidation
 * When status is set to 'approved', backend enforces single-approved rule
 */
export type ItineraryStatus = 'draft' | 'proposing' | 'approved' | 'archived'

export function useUpdateItineraryStatus(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ItineraryStatus }) =>
      api.patch<ItineraryResponseDto>(`/trips/${tripId}/itineraries/${id}`, { status }),
    onSuccess: (_, variables) => {
      // Invalidate all itineraries for this trip (approved status affects siblings)
      queryClient.invalidateQueries({ queryKey: itineraryKeys.list(tripId) })
      queryClient.invalidateQueries({
        queryKey: itineraryKeys.detail(tripId, variables.id),
      })
    },
  })
}
