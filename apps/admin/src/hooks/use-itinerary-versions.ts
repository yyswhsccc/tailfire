import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { itineraryKeys } from './use-itineraries'
import type {
  ItineraryVersionSummaryDto,
  SharedItineraryDto,
  PublishItineraryDto,
} from '@tailfire/shared-types/api'

// Query Keys
export const itineraryVersionKeys = {
  all: ['itinerary-versions'] as const,
  list: (itineraryId: string) =>
    [...itineraryVersionKeys.all, 'list', itineraryId] as const,
  snapshot: (itineraryId: string, version: number) =>
    [...itineraryVersionKeys.all, 'snapshot', itineraryId, version] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch version history for an itinerary
 */
export function useItineraryVersions(tripId: string, itineraryId: string | undefined) {
  return useQuery({
    queryKey: itineraryVersionKeys.list(itineraryId || ''),
    queryFn: () =>
      api.get<ItineraryVersionSummaryDto[]>(
        `/trips/${tripId}/itineraries/${itineraryId}/versions`,
      ),
    enabled: !!tripId && !!itineraryId,
  })
}

/**
 * Fetch a specific version snapshot
 */
export function useItineraryVersionSnapshot(
  tripId: string,
  itineraryId: string,
  version: number,
) {
  return useQuery({
    queryKey: itineraryVersionKeys.snapshot(itineraryId, version),
    queryFn: () =>
      api.get<SharedItineraryDto>(
        `/trips/${tripId}/itineraries/${itineraryId}/versions/${version}`,
      ),
    enabled: !!tripId && !!itineraryId && version > 0,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Publish a new version of an itinerary
 */
export function usePublishItinerary(tripId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      itineraryId,
      changeSummary,
    }: {
      itineraryId: string
      changeSummary?: string
    }) =>
      api.post<{ versionNumber: number; publishedAt: string; itineraryId: string }>(
        `/trips/${tripId}/itineraries/${itineraryId}/publish`,
        { changeSummary } satisfies PublishItineraryDto,
      ),
    onSuccess: (_, variables) => {
      // Invalidate version list and itinerary data (to refresh hasUnpublishedChanges)
      queryClient.invalidateQueries({
        queryKey: itineraryVersionKeys.list(variables.itineraryId),
      })
      queryClient.invalidateQueries({
        queryKey: itineraryKeys.list(tripId),
      })
      queryClient.invalidateQueries({
        queryKey: itineraryKeys.detail(tripId, variables.itineraryId),
      })
    },
  })
}
