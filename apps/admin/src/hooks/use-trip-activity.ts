import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ActivityLog {
  id: string
  entityType:
    | 'trip'
    | 'trip_traveler'
    | 'itinerary'
    | 'contact'
    | 'user'
    | 'activity'
    | 'booking'
    | 'installment'
    | 'activity_document'
    | 'booking_document'
    | 'activity_media'
    | 'trip_media'
    | 'trip_group'
  entityId: string
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'published' | 'unpublished' | 'moved_to_group' | 'removed_from_group'
  actorId: string | null
  actorType: 'user' | 'system' | 'api'
  description: string
  metadata: Record<string, any>
  tripId: string | null
  createdAt: string
}

export interface UseTripActivityOptions {
  tripId: string
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook for fetching trip activity logs
 */
export function useTripActivity({
  tripId,
  limit = 50,
  offset = 0,
  enabled = true,
}: UseTripActivityOptions) {
  return useQuery({
    queryKey: ['trips', tripId, 'activity', { limit, offset }],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      return api.get<ActivityLog[]>(`/trips/${tripId}/activity?${params.toString()}`)
    },
    enabled: enabled && Boolean(tripId),
  })
}
