import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type {
  FlightActivityDto,
  CreateFlightActivityDto,
  UpdateFlightActivityDto,
  FlightSearchResponse,
  NormalizedFlightStatus,
} from '@tailfire/shared-types/api'
import { itineraryDayKeys } from './use-itinerary-days'
import { bookingKeys } from './use-bookings'
import { useToast } from './use-toast'
import { useDebounce } from './use-debounce'

// Query Keys for flight CRUD
export const flightKeys = {
  all: ['flights'] as const,
  details: () => [...flightKeys.all, 'detail'] as const,
  detail: (id: string) => [...flightKeys.details(), id] as const,
}

// Query Keys for external flight search API
export const flightSearchKeys = {
  all: ['flight-search'] as const,
  search: (flightNumber: string, date: string, provider?: string) =>
    [...flightSearchKeys.all, 'search', flightNumber, date, provider ?? 'default'] as const,
  details: (flightNumber: string, date?: string) =>
    [...flightSearchKeys.all, 'details', flightNumber, date] as const,
  health: () => [...flightSearchKeys.all, 'health'] as const,
}

// Query Keys for airport lookup
export const airportKeys = {
  all: ['airports'] as const,
  lookup: (code: string) => [...airportKeys.all, 'lookup', code.toUpperCase()] as const,
  search: (keyword: string) => [...airportKeys.all, 'search', keyword.toLowerCase()] as const,
}

// Airport lookup response type
export interface AirportLookupResponse {
  success: boolean
  data?: {
    iata: string
    icao: string
    name: string
    city: string
    countryCode: string
    lat?: number
    lon?: number
    timezone?: string
  }
  error?: string
}

// =============================================================================
// RATE LIMIT TYPES
// =============================================================================

export interface RateLimitState {
  isLimited: boolean
  retryAfter: number
  expiresAt: number
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch a single flight by ID
 */
export function useFlight(id: string) {
  return useQuery({
    queryKey: flightKeys.detail(id),
    queryFn: async () => api.get<FlightActivityDto>(`/activities/flights/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new flight
 * Optimistically updates the day's activity list
 */
export function useCreateFlight(itineraryId: string, _dayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (data: CreateFlightActivityDto) => {
      return api.post<FlightActivityDto>('/activities/flights', data)
    },
    onSuccess: (_newFlight) => {
      // Invalidate itinerary-specific day lists to refetch activities
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      // Invalidate bookings cache (new flight affects unlinked activities list)
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
    onError: (_error) => {
      toast({
        title: 'Error',
        description: 'Failed to create flight. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Update an existing flight
 */
export function useUpdateFlight(itineraryId: string, _dayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateFlightActivityDto }) => {
      return api.patch<FlightActivityDto>(`/activities/flights/${id}`, data)
    },
    onSuccess: (updatedFlight) => {
      // Update the flight detail query
      queryClient.setQueryData(flightKeys.detail(updatedFlight.id), updatedFlight)

      // Invalidate itinerary-specific day lists to refetch activities
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      // Invalidate bookings cache (flight pricing updates affect bookings tab)
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
    onError: (_error) => {
      toast({
        title: 'Error',
        description: 'Failed to update flight. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Delete a flight
 */
export function useDeleteFlight(itineraryId: string, _dayId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/activities/flights/${id}`)
    },
    onSuccess: (_, id) => {
      // Remove from flight detail cache
      void queryClient.removeQueries({ queryKey: flightKeys.detail(id) })

      // Invalidate itinerary-specific day lists to refetch activities
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.list(itineraryId) })
      void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      // Invalidate bookings cache (deleted flight affects unlinked activities list)
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
    onError: (_error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete flight. Please try again.',
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// EXTERNAL FLIGHT SEARCH (Aerodatabox API)
// ============================================================================

/**
 * Basic flight search hook with caching
 *
 * @auth This hook calls /external-apis/flights endpoints protected by AdminGuard.
 *       The API client must attach the admin JWT token (from Supabase session).
 *       If token is missing/expired, calls will 401.
 *
 * @rateLimit Aerodatabox paid plan: 60 req/min. This hook:
 *   - Caches results for 5 min (staleTime)
 *   - Does NOT retry on 429 (rate limit)
 *   - Does NOT retry on 404 (not found)
 */
export function useExternalFlightSearch(
  flightNumber: string,
  dateLocal: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = false } = options

  return useQuery({
    queryKey: flightSearchKeys.search(flightNumber, dateLocal),
    queryFn: async (): Promise<FlightSearchResponse> => {
      const params = new URLSearchParams({
        flightNumber,
        dateLocal,
      })
      // api.get returns T directly, not { data: T }
      return api.get<FlightSearchResponse>(`/external-apis/flights/search?${params}`)
    },
    enabled: enabled && !!flightNumber && !!dateLocal,
    staleTime: 5 * 60 * 1000, // Cache for 5 min to avoid repeat calls
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 min
    retry: (failureCount, error) => {
      // Check ApiError status - our api helper throws ApiError, not AxiosError
      if (error instanceof ApiError) {
        // Don't retry client errors - these won't succeed on retry:
        // 401 = Invalid/expired API key (configuration issue)
        // 403 = Forbidden (permission issue)
        // 404 = Flight not found (data doesn't exist)
        // 429 = Rate limited (need to wait, not retry immediately)
        if (error.status === 401) return false
        if (error.status === 403) return false
        if (error.status === 404) return false
        if (error.status === 429) return false
      }
      // Only retry transient server errors (5xx) once
      return failureCount < 1
    },
  })
}

/**
 * Flight search hook with error handling
 *
 * With Aerodatabox paid plan (60 req/min), rate limiting is rarely a concern.
 * This hook handles errors gracefully:
 * - Shows toast on 429 with retry-after countdown
 * - Does NOT block refetches or manage rate limit state
 * - Caches results for 5 minutes
 *
 * @note Name kept for backwards compatibility - consider using alias
 *       `useExternalFlightSearch` if renaming in the future.
 */
export function useExternalFlightSearchWithRateLimit(
  flightNumber: string,
  dateLocal: string,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: flightSearchKeys.search(flightNumber, dateLocal),
    queryFn: async (): Promise<FlightSearchResponse> => {
      const params = new URLSearchParams({
        flightNumber,
        dateLocal,
      })
      try {
        // api.get returns T directly, not { data: T }
        return await api.get<FlightSearchResponse>(
          `/external-apis/flights/search?${params}`
        )
      } catch (error) {
        // Show friendly message for rate limit errors
        if (error instanceof ApiError && error.status === 429) {
          const retryAfter = error.metadata?.retryAfter ?? 60
          toast({
            title: 'Rate limit reached',
            description: `Please wait ${retryAfter} seconds before searching again.`,
            variant: 'default',
          })
        }
        throw error
      }
    },
    enabled: enabled && !!flightNumber && !!dateLocal,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Don't retry on client errors
      if (error instanceof ApiError) {
        if (error.status === 401) return false
        if (error.status === 403) return false
        if (error.status === 404) return false
        if (error.status === 429) return false
      }
      return failureCount < 1
    },
  })

  const refetchSearch = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: flightSearchKeys.search(flightNumber, dateLocal),
    })
  }, [queryClient, flightNumber, dateLocal])

  return {
    ...query,
    refetchSearch,
  }
}

/**
 * Search with a specific provider (e.g., 'amadeus' for fallback results)
 *
 * This hook is designed for "More Results" functionality where the user
 * wants to try an alternative provider after seeing Aerodatabox results.
 *
 * @param flightNumber Flight number (e.g., "AC123")
 * @param dateLocal Date in YYYY-MM-DD format
 * @param provider Provider to use ('aerodatabox' | 'amadeus')
 * @param options.enabled Whether to enable the query
 */
export function useExternalFlightSearchWithProvider(
  flightNumber: string,
  dateLocal: string,
  provider: 'aerodatabox' | 'amadeus',
  options: { enabled?: boolean } = {}
) {
  const { enabled = false } = options
  const { toast } = useToast()

  return useQuery({
    queryKey: flightSearchKeys.search(flightNumber, dateLocal, provider),
    queryFn: async (): Promise<FlightSearchResponse> => {
      const params = new URLSearchParams({
        flightNumber,
        dateLocal,
        provider,
      })
      try {
        return await api.get<FlightSearchResponse>(`/external-apis/flights/search?${params}`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) {
          const retryAfter = error.metadata?.retryAfter ?? 60
          toast({
            title: 'Rate limit reached',
            description: `Please wait ${retryAfter} seconds before searching again.`,
            variant: 'default',
          })
        }
        throw error
      }
    },
    enabled: enabled && !!flightNumber && !!dateLocal,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 401) return false
        if (error.status === 403) return false
        if (error.status === 404) return false
        if (error.status === 429) return false
      }
      return failureCount < 1
    },
  })
}

/**
 * Debounced search trigger for automatic search as user types
 *
 * Debounces input to avoid excessive API calls during typing.
 */
export function useDebouncedExternalFlightSearch(delayMs = 500) {
  const [pendingSearch, setPendingSearch] = useState<{
    flightNumber: string
    date: string
  } | null>(null)

  const debouncedValue = useDebounce(pendingSearch, delayMs)

  const query = useExternalFlightSearchWithRateLimit(
    debouncedValue?.flightNumber ?? '',
    debouncedValue?.date ?? ''
  )

  const triggerSearch = useCallback((flightNumber: string, date: string) => {
    setPendingSearch({ flightNumber, date })
  }, [])

  const clearSearch = useCallback(() => {
    setPendingSearch(null)
  }, [])

  return {
    ...query,
    triggerSearch,
    clearSearch,
    isPending: pendingSearch !== null && debouncedValue === null,
  }
}

/**
 * Check if the flight API is available
 */
export function useFlightApiHealth() {
  return useQuery({
    queryKey: flightSearchKeys.health(),
    queryFn: async () => {
      // api.get returns T directly, not { data: T }
      return api.get<{ success: boolean; message: string }>(
        '/external-apis/flights/health/check'
      )
    },
    staleTime: 60 * 1000, // Check every minute at most
    gcTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract the first flight from search results
 */
export function getFirstFlight(response?: FlightSearchResponse): NormalizedFlightStatus | null {
  if (!response?.success || !response.data?.length) return null
  return response.data[0] ?? null
}

/**
 * Error classification for better UI feedback
 */
export type FlightSearchErrorType =
  | 'not_found' // 404 - Flight doesn't exist for this date
  | 'rate_limited' // 429 - Need to wait before retrying
  | 'auth_error' // 401/403 - API key issue (configuration problem)
  | 'server_error' // 5xx - Transient server issue
  | 'unknown' // Other errors

/**
 * Classify a flight search error for UI handling
 */
export function classifyFlightSearchError(error: unknown): FlightSearchErrorType {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'not_found'
    if (error.status === 429) return 'rate_limited'
    if (error.status === 401 || error.status === 403) return 'auth_error'
    if (error.status >= 500) return 'server_error'
  }
  return 'unknown'
}

/**
 * Check if a response or error indicates the flight was not found
 */
export function isFlightNotFound(response?: FlightSearchResponse, error?: unknown): boolean {
  // Check error first - ApiError with 404 is definitive
  if (error instanceof ApiError && error.status === 404) return true
  // Fallback to response check (for backwards compatibility)
  if (!response) return false
  return !response.success && !response.error?.includes('Rate')
}

/**
 * Check if the error is an auth/config issue (won't succeed on retry)
 */
export function isAuthConfigError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || error.status === 403
  }
  return false
}

// ============================================================================
// AIRPORT LOOKUP (Aerodatabox API)
// ============================================================================

/**
 * Look up airport by IATA code via Aerodatabox API
 *
 * Used by airport autocomplete to fetch details for airports not in the static database.
 * Results are cached for 1 hour to minimize API calls.
 *
 * @param code - IATA (3 chars) or ICAO (4 chars) airport code
 * @param options.enabled - Whether to enable the query (default: false)
 */
export function useAirportLookup(code: string, options: { enabled?: boolean } = {}) {
  const { enabled = false } = options

  return useQuery({
    queryKey: airportKeys.lookup(code),
    queryFn: async (): Promise<AirportLookupResponse> => {
      return api.get<AirportLookupResponse>(`/external-apis/flights/airports/${code.toUpperCase()}`)
    },
    enabled: enabled && !!code && code.length >= 3 && code.length <= 4,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    retry: (failureCount, error) => {
      // Don't retry on client errors
      if (error instanceof ApiError) {
        if (error.status === 400) return false // Invalid code
        if (error.status === 401) return false // Auth issue
        if (error.status === 403) return false // Forbidden
        if (error.status === 404) return false // Not found
        if (error.status === 429) return false // Rate limited
      }
      return failureCount < 1
    },
  })
}

// Airport keyword search result
export interface AirportSearchResult {
  iata: string
  name: string
  city: string
  countryCode: string
}

/**
 * Search airports by keyword via Amadeus API
 *
 * Fallback for when static airport database returns no results.
 * Searches by city name, airport name, etc.
 */
export function useAirportSearch(keyword: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: airportKeys.search(keyword),
    queryFn: async (): Promise<AirportSearchResult[]> => {
      return api.get<AirportSearchResult[]>(
        `/external-apis/flights/airports/search?keyword=${encodeURIComponent(keyword.trim())}`,
      )
    },
    enabled: enabled && !!keyword && keyword.trim().length >= 3,
    staleTime: 60 * 1000, // Cache for 1 min
    gcTime: 5 * 60 * 1000,
    retry: false,
  })
}
