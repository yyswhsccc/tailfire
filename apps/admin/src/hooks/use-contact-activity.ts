import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ActivityLog } from './use-trip-activity'

export interface UseContactActivityOptions {
  contactId: string
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook for fetching contact activity logs (combined contact changes + related trip activity)
 */
export function useContactActivity({
  contactId,
  limit = 50,
  offset = 0,
  enabled = true,
}: UseContactActivityOptions) {
  return useQuery({
    queryKey: ['contacts', contactId, 'activity', { limit, offset }],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      return api.get<ActivityLog[]>(`/contacts/${contactId}/activity?${params.toString()}`)
    },
    enabled: enabled && Boolean(contactId),
  })
}
