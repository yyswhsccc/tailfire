/**
 * Admin Activity Responses Hook
 *
 * React Query hook for fetching client activity responses (confirmed/declined).
 * Uses polling (refetchInterval) since client_activity_responses table lacks
 * Supabase realtime publication.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ActivityResponsesSummaryDto } from '@tailfire/shared-types'

export const activityResponseKeys = {
  all: ['activity-responses'] as const,
  list: (tripId: string, itineraryId: string, publishedVersion: number | null) =>
    [...activityResponseKeys.all, tripId, itineraryId, publishedVersion] as const,
}

/**
 * Fetch activity responses for a trip's itinerary (admin endpoint).
 * Only enabled when the itinerary has a published version.
 * Polls every 30s since realtime is not available for this table.
 */
export function useActivityResponses(
  tripId: string,
  itineraryId: string,
  publishedVersion: number | null,
) {
  return useQuery({
    queryKey: activityResponseKeys.list(tripId, itineraryId, publishedVersion),
    queryFn: async () => {
      return api.get<ActivityResponsesSummaryDto>(
        `/trips/${tripId}/itineraries/${itineraryId}/responses`,
      )
    },
    enabled: !!tripId && !!itineraryId && !!publishedVersion,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
