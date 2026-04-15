/**
 * Tour Library React Query Hooks
 *
 * Provides hooks for browsing Globus tours from the real-time proxy:
 * - Search by keyword
 * - List all tours
 * - Departures with pricing
 * - Filter options (locations, travel styles)
 * - Promotions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { CustomTourActivityDto } from '@tailfire/shared-types/api'

// ============================================================================
// Types (matching API response shapes from globus-api.types.ts)
// ============================================================================

export type GlobusBrand = 'Globus' | 'Cosmos' | 'Monograms'

export interface GlobusSearchResult {
  tourCode: string
  season: string
  name: string
}

export interface GlobusTour {
  tourNumber: string
  brand: string
  name: string
}

export interface GlobusCabinPricing {
  price: number
  discount: number
  cabinCategory: string | null
  promotions: { promotionId: string; amount: number }[]
}

export interface GlobusDeparture {
  brand: string
  name: string
  airStartDate: string
  landStartDate: string
  landEndDate: string
  landOnlyPrice: number
  shipName: string
  status: string
  departureCode: string
  guaranteedDeparture: boolean
  popularDeparture: boolean
  intraTourAirRequired: boolean
  intraTourAir: number
  intraTourAirTax: number
  singleSupplement: number
  tripleReduction: number
  tourStartAirportCity: string
  tourEndAirportCity: string
  pricing: GlobusCabinPricing[]
}

export interface GlobusPromotion {
  promotionId: number
  headline: string
  disclaimer: string
  category: string
  bookStartDate: string
  bookEndDate: string
  travelStartDate: string
  travelEndDate: string
  askReceiveCode: string
  requiresAir: boolean
  tours: { tourCode: string; year: number; brand: string }[]
}

export interface TourSearchFilters {
  keywords?: string
  brand?: GlobusBrand
  season?: string
}

// ============================================================================
// Tour Repository Types (catalog data from tour-repository API)
// ============================================================================

export interface TourItineraryDay {
  dayNumber: number
  title?: string
  description?: string
  overnightCity?: string
}

export interface TourHotel {
  dayNumber?: number
  hotelName: string
  city?: string
  description?: string
}

export interface TourMedia {
  mediaType: 'image' | 'brochure' | 'video' | 'map'
  url: string
  caption?: string
}

export interface TourInclusion {
  inclusionType: 'included' | 'excluded' | 'highlight'
  category?: string
  description: string
}

export interface TourDetail {
  id: string
  provider: string
  providerIdentifier: string
  operatorCode: string
  name: string
  season?: string
  days?: number
  nights?: number
  description?: string
  itinerary: TourItineraryDay[]
  hotels: TourHotel[]
  media: TourMedia[]
  inclusions: TourInclusion[]
  departureCount?: number
  lowestPriceCents?: number
}

export interface CabinPricing {
  cabinCategory?: string
  priceCents: number
  discountCents?: number
  currency: string
}

export interface TourDeparture {
  id: string
  departureCode: string
  season?: string
  landStartDate?: string
  landEndDate?: string
  status?: string
  basePriceCents?: number
  currency: string
  guaranteedDeparture: boolean
  shipName?: string
  startCity?: string
  endCity?: string
  cabinPricing: CabinPricing[]
}

export interface TourDeparturesResponse {
  tourId: string
  departures: TourDeparture[]
  total: number
}

// ============================================================================
// Query Keys
// ============================================================================

export const tourLibraryKeys = {
  all: ['tour-library'] as const,
  search: (filters: TourSearchFilters) =>
    [...tourLibraryKeys.all, 'search', filters.keywords, filters.brand, filters.season] as const,
  tours: (filters: Omit<TourSearchFilters, 'keywords'>) =>
    [...tourLibraryKeys.all, 'tours', filters.brand, filters.season] as const,
  departures: (tourCode: string, brand: GlobusBrand, currency?: string) =>
    [...tourLibraryKeys.all, 'departures', tourCode, brand, currency] as const,
  locations: (brand?: GlobusBrand) => [...tourLibraryKeys.all, 'locations', brand] as const,
  styles: (brand?: GlobusBrand) => [...tourLibraryKeys.all, 'styles', brand] as const,
  promotions: (brand?: GlobusBrand, season?: string) => [...tourLibraryKeys.all, 'promotions', brand, season] as const,
}

// Tour Repository query keys (catalog data)
export const tourRepositoryKeys = {
  all: ['tour-repository'] as const,
  list: (params: CatalogTourFilters) =>
    [...tourRepositoryKeys.all, 'list', params.q, params.operator, params.season, params.page, params.pageSize] as const,
  search: (params: { provider?: string; providerIdentifier?: string }) =>
    [...tourRepositoryKeys.all, 'search', params.provider, params.providerIdentifier] as const,
  detail: (tourId: string) => [...tourRepositoryKeys.all, 'detail', tourId] as const,
  departures: (tourId: string) => [...tourRepositoryKeys.all, 'departures', tourId] as const,
  filters: () => [...tourRepositoryKeys.all, 'filters'] as const,
}

// Catalog tour search filters
export interface CatalogTourFilters {
  q?: string
  operator?: string // globus, cosmos, monograms
  season?: string
  page?: number
  pageSize?: number
}

// Catalog tour summary (from tour-repository API)
export interface CatalogTourSummary {
  id: string
  provider: string
  providerIdentifier: string
  operatorCode: string
  name: string
  season?: string
  days?: number
  nights?: number
  description?: string
  imageUrl?: string
  lowestPriceCents?: number
  departureCount?: number
}

export interface CatalogTourSearchResponse {
  tours: CatalogTourSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CatalogFilterOptions {
  operators: { code: string; name: string; count: number }[]
  seasons: { season: string; count: number }[]
  minDays: number
  maxDays: number
}

// ============================================================================
// Helper
// ============================================================================

function buildGlobusQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, v)
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Search tours by keyword
 */
export function useTourSearch(filters: TourSearchFilters) {
  return useQuery({
    queryKey: tourLibraryKeys.search(filters),
    queryFn: async () => {
      const qs = buildGlobusQuery({
        keywords: filters.keywords,
        brand: filters.brand,
        season: filters.season,
      })
      return api.get<GlobusSearchResult[]>(`/globus/search${qs}`)
    },
    enabled: !!filters.keywords,
    staleTime: 5 * 60_000,
  })
}

/**
 * List all available tours
 */
export function useAllTours(
  filters: Omit<TourSearchFilters, 'keywords'> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: tourLibraryKeys.tours(filters),
    queryFn: async () => {
      const qs = buildGlobusQuery({
        brand: filters.brand,
        season: filters.season,
      })
      return api.get<GlobusTour[]>(`/globus/tours${qs}`)
    },
    staleTime: 10 * 60_000,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Get departures with pricing for a tour
 */
export function useTourDepartures(
  tourCode: string | null,
  brand: GlobusBrand | null,
  currency?: string,
) {
  return useQuery({
    queryKey: tourLibraryKeys.departures(tourCode ?? '', brand ?? 'Globus', currency),
    queryFn: async () => {
      const qs = buildGlobusQuery({ brand: brand!, currency })
      return api.get<GlobusDeparture[]>(`/globus/tours/${tourCode}/departures${qs}`)
    },
    enabled: !!tourCode && !!brand,
    staleTime: 5 * 60_000,
  })
}

/**
 * Get location keywords for autocomplete
 */
export function useTourLocations(brand?: GlobusBrand) {
  return useQuery({
    queryKey: tourLibraryKeys.locations(brand),
    queryFn: async () => {
      const qs = buildGlobusQuery({ brand })
      return api.get<string[]>(`/globus/filters/locations${qs}`)
    },
    staleTime: 24 * 60 * 60_000,
  })
}

/**
 * Get travel style keywords for filters
 */
export function useTourStyles(brand?: GlobusBrand) {
  return useQuery({
    queryKey: tourLibraryKeys.styles(brand),
    queryFn: async () => {
      const qs = buildGlobusQuery({ brand })
      return api.get<string[]>(`/globus/filters/styles${qs}`)
    },
    staleTime: 24 * 60 * 60_000,
  })
}

/**
 * Get current promotions
 */
export function useTourPromotions(brand?: GlobusBrand, season?: string) {
  return useQuery({
    queryKey: tourLibraryKeys.promotions(brand, season),
    queryFn: async () => {
      const qs = buildGlobusQuery({ brand, season })
      return api.get<GlobusPromotion[]>(`/globus/promotions${qs}`)
    },
    staleTime: 24 * 60 * 60_000,
  })
}

// ============================================================================
// Tour Repository Queries (catalog data)
// ============================================================================

/**
 * Search tours in catalog by provider/identifier
 */
export function useTourSearch2(params: { provider?: string; providerIdentifier?: string }) {
  return useQuery({
    queryKey: tourRepositoryKeys.search(params),
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (params.provider) qs.set('provider', params.provider)
      if (params.providerIdentifier) qs.set('providerIdentifier', params.providerIdentifier)
      const queryString = qs.toString()
      return api.get<{ tours: TourDetail[]; total: number }>(
        `/tour-repository/tours${queryString ? `?${queryString}` : ''}`
      )
    },
    enabled: !!params.providerIdentifier,
    staleTime: 10 * 60_000, // 10 minutes
  })
}

/**
 * Parse a synthetic tour ID to extract provider info
 * Synthetic IDs are in format: globus-{brand}-{tourCode}-{index}
 * or: globus-search-{tourCode}-{season}-{index}
 */
function parseSyntheticTourId(tourId: string): { provider: string; brand?: string; tourCode: string } | null {
  // Match "globus-{brand}-{tourCode}-{index}"
  const fullMatch = tourId.match(/^globus-([A-Za-z]+)-([A-Z0-9]+)-\d+$/)
  if (fullMatch && fullMatch[1] && fullMatch[2]) {
    return { provider: 'globus', brand: fullMatch[1], tourCode: fullMatch[2] }
  }
  // Match "globus-search-{tourCode}-{season}-{index}"
  const searchMatch = tourId.match(/^globus-search-([A-Z0-9]+)-\d{4}-\d+$/)
  if (searchMatch && searchMatch[1]) {
    return { provider: 'globus', tourCode: searchMatch[1] }
  }
  return null
}

/**
 * Get tour detail by ID from catalog
 *
 * Falls back to Globus API if:
 * 1. tourId is a synthetic ID (local dev using Globus fallback)
 * 2. Catalog API fails
 */
export function useTourDetail(tourId: string | null) {
  return useQuery({
    queryKey: tourRepositoryKeys.detail(tourId ?? ''),
    queryFn: async () => {
      if (!tourId) throw new Error('tourId is required')

      // Check if this is a synthetic ID from Globus fallback
      const syntheticInfo = parseSyntheticTourId(tourId)

      if (syntheticInfo) {
        // Synthetic ID - fetch from Globus API
        const brand = (syntheticInfo.brand ?? 'Globus') as GlobusBrand
        const tourCode = syntheticInfo.tourCode

        // Fetch departures to get additional info
        const departures = await api.get<GlobusDeparture[]>(
          `/globus/tours/${tourCode}/departures?brand=${brand}`
        )

        const firstDep = departures[0]

        // Construct a minimal TourDetail from Globus data
        const tourDetail: TourDetail = {
          id: tourId,
          provider: 'globus',
          providerIdentifier: tourCode,
          operatorCode: brand.toLowerCase(),
          name: firstDep?.name ?? `Tour ${tourCode}`,
          itinerary: [],
          hotels: [],
          media: [],
          inclusions: [],
          departureCount: departures.length,
          lowestPriceCents: firstDep?.landOnlyPrice ? Math.round(firstDep.landOnlyPrice * 100) : undefined,
        }

        return tourDetail
      }

      // Real catalog ID - try catalog API first
      try {
        return await api.get<TourDetail>(`/tour-repository/tours/${tourId}`)
      } catch (catalogError) {
        console.warn('Catalog tour detail unavailable:', catalogError)
        throw catalogError
      }
    },
    enabled: !!tourId,
    staleTime: 10 * 60_000, // 10 minutes
  })
}

/**
 * Get tour departures from catalog
 *
 * Falls back to Globus API if tourId is synthetic
 */
export function useTourRepositoryDepartures(tourId: string | null) {
  return useQuery({
    queryKey: tourRepositoryKeys.departures(tourId ?? ''),
    queryFn: async () => {
      if (!tourId) throw new Error('tourId is required')

      // Check if this is a synthetic ID from Globus fallback
      const syntheticInfo = parseSyntheticTourId(tourId)

      if (syntheticInfo) {
        // Synthetic ID - fetch from Globus API
        const brand = (syntheticInfo.brand ?? 'Globus') as GlobusBrand
        const tourCode = syntheticInfo.tourCode

        const globusDepartures = await api.get<GlobusDeparture[]>(
          `/globus/tours/${tourCode}/departures?brand=${brand}`
        )

        // Map Globus departures to TourDeparture format
        const departures: TourDeparture[] = globusDepartures.map((dep, index) => ({
          id: `globus-dep-${tourCode}-${dep.departureCode}-${index}`,
          departureCode: dep.departureCode,
          landStartDate: dep.landStartDate,
          landEndDate: dep.landEndDate,
          status: dep.status,
          basePriceCents: dep.landOnlyPrice ? Math.round(dep.landOnlyPrice * 100) : undefined,
          currency: 'CAD',
          guaranteedDeparture: dep.guaranteedDeparture,
          shipName: dep.shipName,
          startCity: dep.tourStartAirportCity,
          endCity: dep.tourEndAirportCity,
          cabinPricing: dep.pricing.map((p) => ({
            cabinCategory: p.cabinCategory ?? undefined,
            priceCents: Math.round(p.price * 100),
            discountCents: p.discount ? Math.round(p.discount * 100) : undefined,
            currency: 'CAD',
          })),
        }))

        return {
          tourId,
          departures,
          total: departures.length,
        }
      }

      // Real catalog ID - use catalog API
      try {
        return await api.get<TourDeparturesResponse>(`/tour-repository/tours/${tourId}/departures`)
      } catch (catalogError) {
        console.warn('Catalog departures unavailable:', catalogError)
        throw catalogError
      }
    },
    enabled: !!tourId,
    staleTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * List tours from catalog with filters and pagination
 * Only shows tours that have been synced to the catalog (have departures)
 *
 * Falls back to Globus real-time API if catalog is unavailable (local dev without FDW)
 */
export function useCatalogTours(filters: CatalogTourFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: tourRepositoryKeys.list(filters),
    queryFn: async () => {
      // Try catalog first
      try {
        const qs = new URLSearchParams()
        if (filters.q) qs.set('q', filters.q)
        if (filters.operator) qs.set('operator', filters.operator)
        if (filters.season) qs.set('season', filters.season)
        if (filters.page) qs.set('page', String(filters.page))
        if (filters.pageSize) qs.set('pageSize', String(filters.pageSize))
        const queryString = qs.toString()
        return await api.get<CatalogTourSearchResponse>(
          `/tour-repository/tours${queryString ? `?${queryString}` : ''}`
        )
      } catch (catalogError) {
        // Fall back to Globus API (for local dev without FDW)
        console.warn('Catalog unavailable, falling back to Globus API:', catalogError)

        // Map operator filter to brand
        const brand = filters.operator
          ? (filters.operator.charAt(0).toUpperCase() + filters.operator.slice(1)) as GlobusBrand
          : undefined

        // If searching, use search endpoint
        if (filters.q) {
          const searchResults = await api.get<GlobusSearchResult[]>(
            `/globus/search${buildGlobusQuery({ keywords: filters.q, brand, season: filters.season })}`
          )
          const tours: CatalogTourSummary[] = searchResults.map((r, index) => ({
            id: `globus-search-${r.tourCode}-${r.season}-${index}`,
            provider: 'globus',
            providerIdentifier: r.tourCode,
            operatorCode: 'globus', // Search doesn't return brand info
            name: r.name,
            season: r.season,
          }))
          return {
            tours,
            total: tours.length,
            page: 1,
            pageSize: tours.length,
            totalPages: 1,
          }
        }

        // Otherwise, use tours endpoint
        const globusTours = await api.get<GlobusTour[]>(
          `/globus/tours${buildGlobusQuery({ brand, season: filters.season })}`
        )
        const tours: CatalogTourSummary[] = globusTours.map((t, index) => ({
          id: `globus-${t.brand}-${t.tourNumber}-${index}`,
          provider: 'globus',
          providerIdentifier: t.tourNumber,
          operatorCode: t.brand.toLowerCase(),
          name: t.name,
        }))
        return {
          tours,
          total: tours.length,
          page: 1,
          pageSize: tours.length,
          totalPages: 1,
        }
      }
    },
    staleTime: 10 * 60_000, // 10 minutes
    enabled: options?.enabled ?? true,
  })
}

/**
 * Get catalog filter options (operators, seasons, day ranges)
 *
 * Falls back to static options if catalog is unavailable (local dev without FDW)
 */
export function useCatalogTourFilters() {
  return useQuery({
    queryKey: tourRepositoryKeys.filters(),
    queryFn: async () => {
      try {
        return await api.get<CatalogFilterOptions>('/tour-repository/filters')
      } catch (catalogError) {
        // Fall back to static filter options (for local dev without FDW)
        console.warn('Catalog filters unavailable, using static fallback:', catalogError)
        return {
          operators: [
            { code: 'globus', name: 'Globus', count: 0 },
            { code: 'cosmos', name: 'Cosmos', count: 0 },
            { code: 'monograms', name: 'Monograms', count: 0 },
          ],
          seasons: [
            { season: '2025', count: 0 },
            { season: '2026', count: 0 },
          ],
          minDays: 1,
          maxDays: 30,
        }
      }
    },
    staleTime: 24 * 60 * 60_000, // 24 hours
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Map tour detail and departure to custom_tour activity data
 *
 * Sets startDatetime and endDatetime at the activity level so the tour
 * is recognized as a spanning activity (shown as a Gantt-style bar across days).
 *
 * Uses UTC timezone with 'Z' suffix to avoid timezone shift issues in spanning detection.
 */
function mapTourToCustomTour(
  tour: TourDetail,
  departure: TourDeparture,
  dayId: string
): {
  itineraryDayId: string
  componentType: 'custom_tour'
  name: string
  description: string | null
  startDatetime: string | null
  endDatetime: string | null
  timezone: string
  supplier: string
  customTourDetails: {
    tourId: string
    operatorCode: string
    provider: string
    providerIdentifier: string
    departureId: string
    departureCode: string
    departureStartDate: string | null
    departureEndDate: string | null
    currency: string
    basePriceCents: number | null
    tourName: string
    days: number | null
    nights: number | null
    startCity: string | null
    endCity: string | null
    itineraryJson: TourItineraryDay[]
    inclusionsJson: TourInclusion[]
    hotelsJson: TourHotel[]
  }
} {
  // Convert YYYY-MM-DD dates to ISO datetime strings with UTC timezone (Z suffix)
  // This ensures consistent date handling across timezones for spanning detection
  // Use 00:00:00Z for start and 23:59:59Z for end to ensure full day coverage
  const startDatetime = departure.landStartDate
    ? `${departure.landStartDate}T00:00:00Z`
    : null

  // Derive endDatetime from landEndDate, or fallback to start + (days - 1) if available
  let endDatetime: string | null = null
  if (departure.landEndDate) {
    endDatetime = `${departure.landEndDate}T23:59:59Z`
  } else if (departure.landStartDate && tour.days && tour.days > 1) {
    // Fallback: derive end date from start date + (days - 1)
    const startDate = new Date(departure.landStartDate)
    startDate.setDate(startDate.getDate() + tour.days - 1)
    const endDateStr = startDate.toISOString().split('T')[0]
    endDatetime = `${endDateStr}T23:59:59Z`
  }

  return {
    itineraryDayId: dayId,
    componentType: 'custom_tour' as const,
    name: tour.name,
    description: tour.description ?? null,
    startDatetime,
    endDatetime,
    timezone: 'UTC',
    supplier: tour.operatorCode.charAt(0).toUpperCase() + tour.operatorCode.slice(1),
    customTourDetails: {
      tourId: tour.id,
      operatorCode: tour.operatorCode,
      provider: tour.provider,
      providerIdentifier: tour.providerIdentifier,
      departureId: departure.id,
      departureCode: departure.departureCode,
      departureStartDate: departure.landStartDate ?? null,
      departureEndDate: departure.landEndDate ?? null,
      currency: departure.currency,
      basePriceCents: departure.basePriceCents ?? null,
      tourName: tour.name,
      days: tour.days ?? null,
      nights: tour.nights ?? null,
      startCity: departure.startCity ?? null,
      endCity: departure.endCity ?? null,
      itineraryJson: tour.itinerary,
      inclusionsJson: tour.inclusions,
      hotelsJson: tour.hotels,
    },
  }
}

/**
 * Add a tour to an itinerary
 *
 * Workflow:
 * 1. Find or create the day matching the tour departure date
 * 2. Create the custom_tour activity
 * 3. Generate tour day schedule (creates tour_day child activities)
 */
export function useAddTourToItinerary(defaultItineraryId?: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({
      tour,
      departure,
      itineraryId: dynamicItineraryId,
      tripId,
      autoExtendItinerary = false,
    }: {
      tour: TourDetail
      departure: TourDeparture
      itineraryId?: string
      tripId?: string
      autoExtendItinerary?: boolean
    }) => {
      const itineraryId = dynamicItineraryId || defaultItineraryId
      if (!itineraryId) {
        throw new Error('itineraryId is required - provide it in mutation variables or hook parameter')
      }

      if (!departure.landStartDate) {
        throw new Error('Tour departure must have a start date')
      }

      // 1. Find or create the day matching the tour departure date
      const departureDayResponse = await api.post<{ id: string }>(
        `/itineraries/${itineraryId}/days/find-or-create-by-date`,
        { date: departure.landStartDate }
      )
      const departureDayId = departureDayResponse.id

      // 2. Create the custom_tour activity
      const tourData = mapTourToCustomTour(tour, departure, departureDayId)
      const tourActivity = await api.post<CustomTourActivityDto>('/activities/custom-tour', tourData)

      // 3. Generate tour day schedule (creates tour_day child activities)
      // Pass tour data to avoid re-fetching from DB
      // Include tourId and days for fallback if itinerary is empty (fetch from catalog)
      const tourDaySchedule = await api.post<{ created: unknown[]; deleted: number }>(
        `/activities/custom-tour/${tourActivity.id}/generate-tour-day-schedule`,
        {
          itineraryId,
          customTourDetails: {
            tourId: tour.id,
            departureStartDate: departure.landStartDate,
            departureEndDate: departure.landEndDate,
            days: tour.days,
            itineraryJson: tour.itinerary,
          },
          skipDelete: true, // Newly created tour, no existing children to delete
          autoExtendItinerary,
        }
      )

      return {
        tour: tourActivity,
        tourDaysCreated: tourDaySchedule.created.length,
        tripId,
      }
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['itinerary'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })

      toast({
        title: 'Tour added to itinerary',
        description: `${result.tour.name} with ${result.tourDaysCreated} tour days added successfully.`,
      })

      // Navigate to trip if tripId provided
      if (result.tripId) {
        router.push(`/trips/${result.tripId}`)
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add tour',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}
