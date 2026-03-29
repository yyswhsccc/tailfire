/**
 * Vacation Library React Query Hooks
 *
 * Provides hooks for browsing vacation packages from the repository:
 * - Gateways and destinations for search form
 * - Search with polling for async results
 * - Hotel detail with enrichment auto-refresh
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface VacationPackageOption {
  roomType: string
  mealPlan: string
  nights: number
  tourOperator: string
  departureDate: string   // Display format from parser (e.g., "APR 05")
  flightNumber: string
  departureTime: string
  arrivalTime: string
  baggage: string
  basePrice: number       // cents
  taxes: number           // cents
  totalPrice: number      // cents (per person)
  grandTotal: number      // cents (all travelers)
}

export interface VacationSearchResult {
  hotelId: string          // Softvoyage provider ID (NOT a UUID)
  hotelName: string
  destination: string
  starRating: number
  imageUrl: string
  amenities: string[]
  monarcRating: string
  monarcReviewCount: number
  packages: VacationPackageOption[]
}

export interface VacationSearchParams {
  gatewayCode: string
  destDep: string          // Destination providerIdentifier (NOT UUID)
  dateDep: string          // YYYYMMDD
  duration: string
  nbAdults?: number
  nbRooms?: number
  allInclusive?: boolean
}

export interface VacationGateway {
  id: string
  name: string
  airportCode: string
}

export interface VacationDestination {
  id: string
  providerIdentifier: string  // VCO destination ID — used for search
  name: string
  countryCode: string | null
  countryName: string | null
  regionGroup: string | null
  availableDurations: number[] | null
}

export interface VacationHotelDetail {
  id: string
  name: string
  destination: string
  hotelChain: string | null
  starRating: number | null
  imageUrl: string | null
  amenities: Record<string, boolean> | null
  monarcRating: string | null
  monarcReviewCount: number | null
  enrichment: {
    googleRating: string | null
    googleReviewCount: number | null
    tripadvisorRating: string | null
    tripadvisorReviewCount: number | null
    tripadvisorLink: string | null
    latitude: string | null
    longitude: string | null
    address: string | null
    website: string | null
    phone: string | null
    photos: string[]
    enrichedAt: string | null
    isStale: boolean
  } | null
}

// ============================================================================
// Search polling types (internal)
// ============================================================================

interface SearchJobResponse {
  jobId: string
}

interface SearchJobStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  results?: VacationSearchResult[]
  error?: string
}

// ============================================================================
// Query Keys
// ============================================================================

export const vacationLibraryKeys = {
  all: ['vacation-library'] as const,
  gateways: () => [...vacationLibraryKeys.all, 'gateways'] as const,
  destinations: (gatewayId?: string) => [...vacationLibraryKeys.all, 'destinations', gatewayId] as const,
  search: () => [...vacationLibraryKeys.all, 'search'] as const,
  hotelDetail: (providerIdentifier: string) => [...vacationLibraryKeys.all, 'hotel', providerIdentifier] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Fetch available departure gateways (airports)
 */
export function useVacationGateways() {
  return useQuery({
    queryKey: vacationLibraryKeys.gateways(),
    queryFn: async () => {
      return api.get<VacationGateway[]>('/vacation-repository/gateways')
    },
    staleTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Fetch destinations available from a given gateway
 * Only fetches when gatewayId is provided.
 */
export function useVacationDestinations(gatewayId?: string) {
  return useQuery({
    queryKey: vacationLibraryKeys.destinations(gatewayId),
    queryFn: async () => {
      const params = gatewayId ? `?gatewayId=${encodeURIComponent(gatewayId)}` : ''
      return api.get<VacationDestination[]>(`/vacation-repository/destinations${params}`)
    },
    enabled: !!gatewayId,
    staleTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Search vacation packages via Softvoyage.
 *
 * This is an async search: POST kicks off a job, then we poll GET until
 * the job is completed or failed (max 20 attempts at 1.5s intervals = 30s).
 */
export function useVacationSearch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: VacationSearchParams): Promise<VacationSearchResult[]> => {
      // 1. Kick off the search job
      const { jobId } = await api.post<SearchJobResponse>('/softvoyage/search', params)

      // 2. Poll for results
      const MAX_ATTEMPTS = 20
      const POLL_INTERVAL = 1500 // 1.5 seconds

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

        const status = await api.get<SearchJobStatus>(`/softvoyage/search/${jobId}`)

        if (status.status === 'completed') {
          return status.results ?? []
        }

        if (status.status === 'failed') {
          throw new Error(status.error ?? 'Search failed')
        }

        // 'pending' or 'processing' — keep polling
      }

      throw new Error('Search timed out after 30 seconds')
    },
    onSuccess: () => {
      // Invalidate any previous search cache
      void queryClient.invalidateQueries({ queryKey: vacationLibraryKeys.search() })
    },
  })
}

/**
 * Fetch hotel detail from the vacation repository by provider identifier.
 *
 * Auto-refetches every 10 seconds when enrichment data is missing or stale,
 * so the UI picks up newly enriched data without manual refresh.
 */
export function useVacationHotelDetail(providerIdentifier: string | null) {
  return useQuery({
    queryKey: vacationLibraryKeys.hotelDetail(providerIdentifier ?? ''),
    queryFn: async () => {
      return api.get<VacationHotelDetail>(
        `/vacation-repository/hotels/by-provider/${encodeURIComponent(providerIdentifier!)}`
      )
    },
    enabled: !!providerIdentifier,
    staleTime: 60_000, // 60 seconds
    refetchInterval: (query) => {
      const data = query.state.data as VacationHotelDetail | undefined
      // Auto-refetch every 10s if enrichment is missing or stale
      if (!data) return false
      if (!data.enrichment || data.enrichment.isStale) return 10_000
      return false
    },
  })
}

// ============================================================================
// Mutations
// ============================================================================

/** Add a vacation package to an itinerary (creates lodging activity with flight info) */
export function useAddVacationToItinerary(defaultItineraryId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      result,
      pkg,
      searchDate,
      itineraryId,
      tripId,
    }: {
      result: VacationSearchResult
      pkg: VacationPackageOption
      searchDate: string  // ISO YYYY-MM-DD from search form
      itineraryId?: string
      tripId?: string
    }) => {
      const targetItineraryId = itineraryId ?? defaultItineraryId
      if (!targetItineraryId) throw new Error('No itinerary ID provided')

      // 1. Find or create day for departure date
      const dayResp = await api.post<{ id: string }>(
        `/itineraries/${targetItineraryId}/days/find-or-create-by-date`,
        { date: searchDate }
      )

      // 2. Create lodging activity with flight info in notes
      const activity = await api.post('/activities', {
        itineraryDayId: dayResp.id,
        activityType: 'lodging',
        proposalStatus: 'draft',
        name: `${result.hotelName} - ${pkg.nights}N ${pkg.mealPlan}`,
        propertyName: result.hotelName,
        locationName: result.destination,
        startDate: searchDate,
        nights: pkg.nights,
        notes: [
          `Tour Operator: ${pkg.tourOperator}`,
          `Flight: ${pkg.flightNumber} (${pkg.departureTime} → ${pkg.arrivalTime})`,
          `Room: ${pkg.roomType}`,
          `Meal Plan: ${pkg.mealPlan}`,
          `Baggage: ${pkg.baggage || 'Check with airline'}`,
          `Price: $${(pkg.totalPrice / 100).toLocaleString()}/pp ($${(pkg.grandTotal / 100).toLocaleString()} total)`,
        ].join('\n'),
      })

      return activity
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['itineraries'] })
      void queryClient.invalidateQueries({ queryKey: ['trips'] })
    },
  })
}
