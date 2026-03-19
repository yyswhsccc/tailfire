import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface TripLocation {
  type: 'hotel' | 'airport' | 'port' | 'day_location'
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  iataCode?: string
  dayNumber?: number
}

export function useTripLocations(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId, 'locations'],
    queryFn: () => api.get<TripLocation[]>(`/trips/${tripId}/locations`),
    enabled: !!tripId,
    staleTime: 60_000,
  })
}
