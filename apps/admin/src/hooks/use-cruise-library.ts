/**
 * Cruise Library React Query Hooks
 *
 * Provides hooks for browsing cruise sailings from the repository:
 * - Search with filters and pagination
 * - Sailing detail for modal view
 * - Filter options for UI dropdowns
 * - Ship images gallery
 * - Add cruise to itinerary mutation
 */

import { createElement } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { itineraryDayKeys } from './use-itinerary-days'
import { useToast } from './use-toast'
import { ToastAction, type ToastActionElement } from '@/components/ui/toast'
import type {
  CreateCustomCruiseActivityDto,
  CustomCruiseActivityDto,
  PortInfoActivityDto,
  CustomCruiseDetailsDto,
  ItineraryDayWithActivitiesDto,
  ActivityResponseDto,
} from '@tailfire/shared-types/api'

// ============================================================================
// Types
// ============================================================================

export type SortField = 'sailDate' | 'price' | 'nights' | 'shipName' | 'lineName'
export type SortDirection = 'asc' | 'desc'
export type CabinCategory = 'inside' | 'oceanview' | 'balcony' | 'suite'

export interface SailingSearchFilters {
  q?: string
  cruiseLineId?: string
  shipId?: string
  regionId?: string
  embarkPortId?: string
  disembarkPortId?: string
  portOfCallIds?: string[]  // Filter sailings that visit these ports
  sailDateFrom?: string
  sailDateTo?: string
  nightsMin?: number
  nightsMax?: number
  priceMinCents?: number
  priceMaxCents?: number
  cabinCategory?: CabinCategory
  sortBy?: SortField
  sortDir?: SortDirection
  page?: number
  pageSize?: number
}

export interface SailingSearchItem {
  id: string
  name: string
  sailDate: string
  endDate: string
  nights: number
  ship: {
    id: string
    name: string
    imageUrl: string | null
  }
  cruiseLine: {
    id: string
    name: string
    logoUrl: string | null
  }
  embarkPort: {
    id: string | null
    name: string
  }
  disembarkPort: {
    id: string | null
    name: string
  }
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
  lastSyncedAt: string
  pricesUpdating?: boolean
}

export interface SailingSearchResponse {
  items: SailingSearchItem[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasMore: boolean
  }
  sync: {
    syncInProgress: boolean
    pricesUpdating: boolean
    lastSyncedAt: string | null
  }
  filters: Record<string, unknown>
}

export interface FilterOption {
  id: string
  name: string
  count?: number
  allIds?: string[]  // All IDs with this name (for deduped ports)
}

export interface SailingFiltersResponse {
  cruiseLines: FilterOption[]
  ships: FilterOption[]
  regions: FilterOption[]
  embarkPorts: FilterOption[]
  disembarkPorts: FilterOption[]
  portsOfCall: FilterOption[]  // All ports visited during sailings
  dateRange: {
    min: string | null
    max: string | null
  }
  nightsRange: {
    min: number | null
    max: number | null
  }
  priceRange: {
    min: number | null
    max: number | null
  }
}

export interface ItineraryStop {
  dayNumber: number
  portName: string
  portId: string | null
  isSeaDay: boolean
  arrivalTime: string | null
  departureTime: string | null
}

export interface CabinPrice {
  cabinCode: string
  cabinCategory: string
  occupancy: number
  basePriceCents: number
  taxesCents: number
  totalPriceCents: number
  isPerPerson: boolean
}

export interface ShipImageMetadata {
  url: string | null
  urlHd: string | null
  url2k: string | null
  caption: string | null
  isDefault: boolean
}

export interface ShipDetail {
  id: string
  name: string
  shipClass: string | null
  imageUrl: string | null
  yearBuilt: number | null
  tonnage: number | null
  passengerCapacity: number | null
  crewCount: number | null
  amenities: string[] | null
  images: ShipImageMetadata[] | null
}

export interface CruiseLineDetail {
  id: string
  name: string
  logoUrl: string | null
  websiteUrl: string | null
}

export interface PortDetail {
  id: string
  name: string
  country: string | null
  latitude: number | null
  longitude: number | null
}

export interface RegionDetail {
  id: string
  name: string
  isPrimary: boolean
}

export interface SailingDetailResponse {
  id: string
  provider: string
  providerIdentifier: string
  name: string
  sailDate: string
  endDate: string
  nights: number
  ship: ShipDetail
  cruiseLine: CruiseLineDetail
  embarkPort: PortDetail | null
  embarkPortName: string | null
  disembarkPort: PortDetail | null
  disembarkPortName: string | null
  regions: RegionDetail[]
  itinerary: ItineraryStop[]
  priceSummary: {
    cheapestInside: number | null
    cheapestOceanview: number | null
    cheapestBalcony: number | null
    cheapestSuite: number | null
  }
  prices: CabinPrice[]
  lastSyncedAt: string
  pricesUpdating: boolean
  marketId: number | null
  noFly: boolean | null
  departUk: boolean | null
  metadata: {
    bookingUrl?: string
    cruiseCode?: string
    itineraryName?: string
    promoText?: string
    [key: string]: unknown
  } | null
  createdAt: string
  updatedAt: string
}

export interface ShipImage {
  id: string
  url: string
  thumbnailUrl: string | null
  altText: string | null
  imageType: string
  isHero: boolean
}

export interface ShipImagesResponse {
  images: ShipImage[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasMore: boolean
  }
}

// ============================================================================
// Query Keys
// ============================================================================

export const cruiseLibraryKeys = {
  all: ['cruise-library'] as const,
  sailings: () => [...cruiseLibraryKeys.all, 'sailings'] as const,
  sailingsList: (filters: SailingSearchFilters) => [...cruiseLibraryKeys.sailings(), filters] as const,
  sailingDetail: (id: string) => [...cruiseLibraryKeys.all, 'sailing', id] as const,
  filters: (currentFilters?: Partial<SailingSearchFilters>) => [...cruiseLibraryKeys.all, 'filters', currentFilters] as const,
  shipImages: (shipId: string, page?: number) => [...cruiseLibraryKeys.all, 'ship-images', shipId, page] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Build query string from filters object
 */
function buildQueryString(filters: SailingSearchFilters): string {
  const params = new URLSearchParams()

  if (filters.q) params.set('q', filters.q)
  if (filters.cruiseLineId) params.set('cruiseLineId', filters.cruiseLineId)
  if (filters.shipId) params.set('shipId', filters.shipId)
  if (filters.regionId) params.set('regionId', filters.regionId)
  if (filters.embarkPortId) params.set('embarkPortId', filters.embarkPortId)
  if (filters.disembarkPortId) params.set('disembarkPortId', filters.disembarkPortId)
  // Handle array of port IDs
  if (filters.portOfCallIds && filters.portOfCallIds.length > 0) {
    filters.portOfCallIds.forEach(id => params.append('portOfCallIds', id))
  }
  if (filters.sailDateFrom) params.set('sailDateFrom', filters.sailDateFrom)
  if (filters.sailDateTo) params.set('sailDateTo', filters.sailDateTo)
  if (filters.nightsMin !== undefined) params.set('nightsMin', String(filters.nightsMin))
  if (filters.nightsMax !== undefined) params.set('nightsMax', String(filters.nightsMax))
  if (filters.priceMinCents !== undefined) params.set('priceMinCents', String(filters.priceMinCents))
  if (filters.priceMaxCents !== undefined) params.set('priceMaxCents', String(filters.priceMaxCents))
  if (filters.cabinCategory) params.set('cabinCategory', filters.cabinCategory)
  if (filters.sortBy) params.set('sortBy', filters.sortBy)
  if (filters.sortDir) params.set('sortDir', filters.sortDir)
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))

  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Search sailings with filters and pagination
 */
export function useCruiseSailings(
  filters: SailingSearchFilters = {},
  options?: Omit<UseQueryOptions<SailingSearchResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cruiseLibraryKeys.sailingsList(filters),
    queryFn: async () => {
      const queryString = buildQueryString(filters)
      return api.get<SailingSearchResponse>(`/cruise-repository/sailings${queryString}`)
    },
    staleTime: 30_000, // 30 seconds
    ...options,
  })
}

/**
 * Search sailings with infinite scroll pagination
 * Loads more results as user scrolls
 */
export function useInfiniteCruiseSailings(
  filters: Omit<SailingSearchFilters, 'page'> = {}
) {
  return useInfiniteQuery({
    queryKey: [...cruiseLibraryKeys.sailings(), 'infinite', filters] as const,
    queryFn: async ({ pageParam }) => {
      const queryString = buildQueryString({ ...filters, page: pageParam as number })
      return api.get<SailingSearchResponse>(`/cruise-repository/sailings${queryString}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: SailingSearchResponse) => {
      if (lastPage.pagination.hasMore) {
        return lastPage.pagination.page + 1
      }
      return undefined
    },
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Get full sailing detail for modal view
 */
export function useCruiseSailing(
  id: string | null,
  options?: Omit<UseQueryOptions<SailingDetailResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cruiseLibraryKeys.sailingDetail(id ?? ''),
    queryFn: async () => {
      return api.get<SailingDetailResponse>(`/cruise-repository/sailings/${id}`)
    },
    enabled: !!id,
    staleTime: 60_000, // 1 minute
    ...options,
  })
}

/**
 * Get filter options for dropdowns
 * Pass current filters to get dynamic options that adjust based on selections
 * (e.g., when a cruise line is selected, only show ships from that line)
 */
export function useCruiseFilters(
  currentFilters?: Partial<SailingSearchFilters>,
  options?: Omit<UseQueryOptions<SailingFiltersResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cruiseLibraryKeys.filters(currentFilters),
    queryFn: async () => {
      // Build query string for filter context
      const params = new URLSearchParams()
      if (currentFilters?.cruiseLineId) params.set('cruiseLineId', currentFilters.cruiseLineId)
      if (currentFilters?.shipId) params.set('shipId', currentFilters.shipId)
      if (currentFilters?.regionId) params.set('regionId', currentFilters.regionId)
      if (currentFilters?.embarkPortId) params.set('embarkPortId', currentFilters.embarkPortId)
      if (currentFilters?.disembarkPortId) params.set('disembarkPortId', currentFilters.disembarkPortId)
      if (currentFilters?.sailDateFrom) params.set('sailDateFrom', currentFilters.sailDateFrom)
      if (currentFilters?.sailDateTo) params.set('sailDateTo', currentFilters.sailDateTo)
      if (currentFilters?.nightsMin !== undefined) params.set('nightsMin', String(currentFilters.nightsMin))
      if (currentFilters?.nightsMax !== undefined) params.set('nightsMax', String(currentFilters.nightsMax))

      const queryString = params.toString()
      return api.get<SailingFiltersResponse>(`/cruise-repository/filters${queryString ? `?${queryString}` : ''}`)
    },
    staleTime: 30_000, // 30 seconds - refetch more often since options are dynamic
    ...options,
  })
}

/**
 * Get paginated ship images for gallery
 */
export function useShipImages(
  shipId: string | null,
  page = 1,
  pageSize = 10,
  options?: Omit<UseQueryOptions<ShipImagesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cruiseLibraryKeys.shipImages(shipId ?? '', page),
    queryFn: async () => {
      return api.get<ShipImagesResponse>(
        `/cruise-repository/ships/${shipId}/images?page=${page}&pageSize=${pageSize}`
      )
    },
    enabled: !!shipId,
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Normalize time string to HH:MM:SS format
 * Handles both HH:MM and HH:MM:SS input formats
 */
function normalizeTimeString(time: string | null | undefined, defaultValue: string = '00:00:00'): string {
  if (!time) return defaultValue
  // If already has seconds (HH:MM:SS), return as is
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return time
  // If HH:MM format, add :00 for seconds
  if (/^\d{2}:\d{2}$/.test(time)) return `${time}:00`
  // Fallback to default if format is unexpected
  return defaultValue
}

/**
 * Compute arrival date from sail date and number of nights
 * This is more reliable than using the catalog's endDate which may be corrupted
 */
function computeArrivalDate(sailDate: string, nights: number): string {
  const date = new Date(sailDate + 'T00:00:00')
  date.setDate(date.getDate() + nights)
  return date.toISOString().split('T')[0]!
}

/**
 * Map sailing detail to CreateCustomCruiseActivityDto
 */
export function mapSailingToCustomCruise(
  sailing: SailingDetailResponse,
  dayId: string
): CreateCustomCruiseActivityDto {
  // Get cheapest price for default
  const cheapestPrice = sailing.priceSummary.cheapestInside
    ?? sailing.priceSummary.cheapestOceanview
    ?? sailing.priceSummary.cheapestBalcony
    ?? sailing.priceSummary.cheapestSuite

  // Compute arrival date from sailDate + nights (more reliable than catalog endDate)
  const arrivalDate = computeArrivalDate(sailing.sailDate, sailing.nights)

  // Build port calls JSON from itinerary
  // Note: portId from catalog is a UUID string, not an integer
  const portCallsJson = sailing.itinerary.map((stop) => ({
    day: stop.dayNumber,
    portName: stop.portName,
    portId: stop.portId ?? undefined, // UUID string from catalog
    arriveDate: sailing.sailDate, // Approximate - could be computed from dayNumber
    departDate: sailing.sailDate,
    arriveTime: stop.arrivalTime ?? '',
    departTime: stop.departureTime ?? '',
    tender: false,
    isSeaDay: stop.isSeaDay,
  }))

  // Build cabin pricing JSON from prices
  const cabinPricingJson: Record<string, unknown> = {}
  for (const price of sailing.prices) {
    cabinPricingJson[price.cabinCode] = {
      category: price.cabinCategory,
      basePriceCents: price.basePriceCents,
      taxesCents: price.taxesCents,
      totalPriceCents: price.totalPriceCents,
      isPerPerson: price.isPerPerson,
      occupancy: price.occupancy,
    }
  }

  const customCruiseDetails: CustomCruiseDetailsDto = {
    source: 'traveltek',
    traveltekCruiseId: sailing.providerIdentifier,
    cruiseLineName: sailing.cruiseLine.name,
    cruiseLineCode: undefined, // Not in detail response
    cruiseLineId: sailing.cruiseLine.id,
    shipName: sailing.ship.name,
    shipCode: undefined, // Not in detail response
    shipClass: sailing.ship.shipClass,
    shipImageUrl: sailing.ship.imageUrl,
    cruiseShipId: sailing.ship.id,
    itineraryName: sailing.metadata?.itineraryName ?? sailing.name,
    voyageCode: sailing.metadata?.cruiseCode,
    region: sailing.regions[0]?.name,
    cruiseRegionId: sailing.regions[0]?.id,
    nights: sailing.nights,
    seaDays: sailing.itinerary.filter((s) => s.isSeaDay).length,
    departurePort: sailing.embarkPort?.name ?? sailing.embarkPortName,
    departurePortId: sailing.embarkPort?.id,
    departureDate: sailing.sailDate,
    departureTime: sailing.itinerary[0]?.departureTime ?? '16:00',
    arrivalPort: sailing.disembarkPort?.name ?? sailing.disembarkPortName,
    arrivalPortId: sailing.disembarkPort?.id,
    arrivalDate, // Computed from sailDate + nights (more reliable than catalog endDate)
    arrivalTime: sailing.itinerary[sailing.itinerary.length - 1]?.arrivalTime ?? '10:00',
    portCallsJson,
    cabinPricingJson,
    shipContentJson: {},
  }

  return {
    itineraryDayId: dayId,
    componentType: 'custom_cruise',
    name: `${sailing.nights} Night ${sailing.regions[0]?.name ?? 'Cruise'}`,
    description: sailing.name,
    startDatetime: `${sailing.sailDate}T${normalizeTimeString(customCruiseDetails.departureTime, '16:00:00')}`,
    endDatetime: `${arrivalDate}T${normalizeTimeString(customCruiseDetails.arrivalTime, '10:00:00')}`,
    timezone: 'UTC', // Would need port timezone from API
    location: sailing.embarkPort?.name ?? sailing.embarkPortName,
    proposalStatus: 'draft',
    bookingStatus: 'unbooked',
    pricingType: 'per_person',
    currency: 'CAD',
    totalPriceCents: cheapestPrice,
    supplier: sailing.cruiseLine.name,
    customCruiseDetails,
  }
}

/**
 * Add cruise to itinerary
 * Creates custom_cruise activity and generates port schedule.
 * Automatically assigns the cruise to the day matching the departure date.
 * Also imports ship images from the library to the cruise's media gallery.
 *
 * @param defaultItineraryId - Optional default itineraryId for backward compatibility.
 *                             Can be overridden by passing itineraryId in mutation variables.
 */
export function useAddCruiseToItinerary(defaultItineraryId?: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({
      sailing,
      itineraryId: dynamicItineraryId,
      autoExtendItinerary = false,
    }: {
      sailing: SailingDetailResponse
      itineraryId?: string  // Dynamic itineraryId - overrides hook-level default
      tripId?: string       // Trip ID for navigation after success
      dayId?: string        // Deprecated: no longer used - day is determined by sailing.sailDate
      autoExtendItinerary?: boolean // If true, extend itinerary dates to fit cruise; otherwise throw error
    }) => {
      // Use dynamic itineraryId if provided, otherwise fall back to hook-level default
      const itineraryId = dynamicItineraryId || defaultItineraryId
      if (!itineraryId) {
        throw new Error('itineraryId is required - provide it in mutation variables or hook parameter')
      }

      // 1. Find or create the day matching the cruise departure date
      const departureDayResponse = await api.post<{ id: string }>(
        `/itineraries/${itineraryId}/days/find-or-create-by-date`,
        { date: sailing.sailDate }
      )
      const departureDayId = departureDayResponse.id

      // 2. Create the custom_cruise activity on the correct departure day
      const cruiseData = mapSailingToCustomCruise(sailing, departureDayId)
      const cruise = await api.post<CustomCruiseActivityDto>('/activities/custom-cruise', cruiseData)

      // 3. Generate port schedule (creates port_info activities)
      // Pass cruise data to avoid re-fetching from DB (~1500ms+ savings)
      // skipDelete=true because this is a newly created cruise with no existing ports
      // autoExtendItinerary: if cruise dates extend beyond itinerary, either extend dates or throw error
      const portSchedule = await api.post<{ created: PortInfoActivityDto[]; deleted: number }>(
        `/activities/custom-cruise/${cruise.id}/generate-port-schedule`,
        {
          itineraryId,
          customCruiseDetails: {
            departureDate: cruiseData.customCruiseDetails?.departureDate || sailing.sailDate,
            // Use cruiseData arrivalDate (computed from sailDate + nights) - don't fall back to sailing.endDate which may be corrupted
            arrivalDate: cruiseData.customCruiseDetails?.arrivalDate || computeArrivalDate(sailing.sailDate, sailing.nights),
            portCallsJson: cruiseData.customCruiseDetails?.portCallsJson,
            departurePort: cruiseData.customCruiseDetails?.departurePort,
            arrivalPort: cruiseData.customCruiseDetails?.arrivalPort,
          },
          skipDelete: true, // New cruise has no existing port activities
          autoExtendItinerary, // If true, extend itinerary dates; otherwise throw error for user confirmation
        }
      )

      // 4. Import ship images to cruise media gallery using batch endpoint
      // Build list of images to import (max 10, with best quality URLs)
      const shipImages = sailing.ship.images ?? []
      const imagesToImport: Array<{
        url: string
        caption: string
        attribution: { source: string; sourceUrl: string }
      }> = []

      // Add up to 5 gallery images
      for (const image of shipImages.slice(0, 5)) {
        const imageUrl = image.url2k ?? image.urlHd ?? image.url
        if (!imageUrl) continue
        imagesToImport.push({
          url: imageUrl,
          caption: image.caption ?? `${sailing.ship.name}`,
          attribution: { source: 'traveltek', sourceUrl: imageUrl },
        })
      }

      // Add main ship image if not already in the list
      if (
        sailing.ship.imageUrl &&
        !imagesToImport.some((img) => img.url === sailing.ship.imageUrl)
      ) {
        imagesToImport.push({
          url: sailing.ship.imageUrl,
          caption: `${sailing.ship.name}`,
          attribution: { source: 'traveltek', sourceUrl: sailing.ship.imageUrl },
        })
      }

      // Import all images in a single batch request (much faster than N sequential calls)
      let importedImagesCount = 0
      let failedImagesCount = 0

      if (imagesToImport.length > 0) {
        try {
          const imageResult = await api.post<{
            successful: Array<{ url: string }>
            failed: Array<{ url: string; error: string }>
            skipped: number
          }>(`/activities/${cruise.id}/media/external/batch?entityType=cruise`, {
            images: imagesToImport,
          })

          importedImagesCount = imageResult.successful.length
          failedImagesCount = imageResult.failed.length

          // Log failures but don't fail the operation
          if (imageResult.failed.length > 0) {
            console.warn(
              'Some ship images failed to import:',
              imageResult.failed.map((f) => `${f.url}: ${f.error}`).join(', ')
            )
          }
        } catch (error) {
          // Log but don't fail the entire operation for image import errors
          console.warn('Failed to batch import ship images:', error)
        }
      }

      return { cruise, portSchedule, importedImagesCount, failedImagesCount }
    },
    onMutate: async ({ sailing, itineraryId: dynamicItineraryId, tripId }) => {
      // Resolve the itineraryId
      const itineraryId = dynamicItineraryId || defaultItineraryId
      if (!itineraryId) {
        // Can't do optimistic update without itineraryId
        return { previousDaysWithActivities: undefined, itineraryId: undefined, tripId: undefined }
      }

      // Cancel outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })

      // Snapshot previous state for rollback
      const previousDaysWithActivities = queryClient.getQueryData<ItineraryDayWithActivitiesDto[]>(
        itineraryDayKeys.withActivities(itineraryId)
      )

      // Find or create the optimistic day for the cruise departure date
      const sailDate = sailing.sailDate // ISO date string e.g. "2025-03-15"

      // Create optimistic cruise activity
      // Compute arrival date from sailDate + nights (don't use sailing.endDate which may be corrupted)
      const optimisticArrivalDate = computeArrivalDate(sailing.sailDate, sailing.nights)
      const optimisticCruise: ActivityResponseDto = {
        id: `temp-cruise-${Date.now()}`,
        itineraryDayId: '', // Will be set when we find/create the day
        parentActivityId: null,
        activityType: 'custom_cruise',
        componentType: 'custom_cruise',
        name: `${sailing.nights} Night ${sailing.regions[0]?.name ?? 'Cruise'}`,
        description: sailing.name,
        sequenceOrder: 0,
        startDatetime: `${sailing.sailDate}T16:00:00`,
        endDatetime: `${optimisticArrivalDate}T10:00:00`,
        timezone: 'UTC',
        location: sailing.embarkPort?.name ?? sailing.embarkPortName ?? null,
        address: null,
        coordinates: null,
        notes: null,
        confirmationNumber: null,
        proposalStatus: 'draft',
        bookingStatus: 'unbooked',
        isVisibleInCalendar: true,
        bookingDate: null,
        packageId: null,
        pricing: null,
        pricingType: 'per_person',
        currency: 'CAD',
        photos: null,
        thumbnail: sailing.ship.imageUrl ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Optimistically update the cache
      queryClient.setQueryData<ItineraryDayWithActivitiesDto[]>(
        itineraryDayKeys.withActivities(itineraryId),
        (oldDays = []) => {
          // Find existing day matching the sail date
          const existingDayIndex = oldDays.findIndex((day) => day.date === sailDate)

          if (existingDayIndex >= 0) {
            // Day exists - add cruise to it
            const updatedDays = [...oldDays]
            const existingDay = updatedDays[existingDayIndex]
            if (!existingDay) return oldDays // Type guard - shouldn't happen
            optimisticCruise.itineraryDayId = existingDay.id
            updatedDays[existingDayIndex] = {
              ...existingDay,
              activities: [...existingDay.activities, optimisticCruise],
            }
            return updatedDays
          } else {
            // Day doesn't exist - create an optimistic day
            const optimisticDay: ItineraryDayWithActivitiesDto = {
              id: `temp-day-${Date.now()}`,
              itineraryId,
              dayNumber: oldDays.length + 1,
              date: sailDate,
              title: null,
              notes: null,
              sequenceOrder: oldDays.length,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              startLocationName: null,
              startLocationLat: null,
              startLocationLng: null,
              endLocationName: null,
              endLocationLat: null,
              endLocationLng: null,
              startLocationOverride: false,
              endLocationOverride: false,
              activities: [{ ...optimisticCruise, itineraryDayId: `temp-day-${Date.now()}` }],
            }
            // Insert in date order
            const newDays = [...oldDays, optimisticDay].sort((a, b) => {
              if (!a.date || !b.date) return 0
              return a.date.localeCompare(b.date)
            })
            return newDays
          }
        }
      )

      // Return itineraryId and tripId in context for onSuccess/onError
      return { previousDaysWithActivities, itineraryId, tripId }
    },
    onSuccess: (result, _variables, context) => {
      // Use itineraryId from context (set in onMutate)
      const itineraryId = context?.itineraryId
      const tripId = context?.tripId
      if (itineraryId) {
        // Invalidate itinerary queries to show new activities
        // Single invalidation - withActivities includes all needed data
        void queryClient.invalidateQueries({ queryKey: itineraryDayKeys.withActivities(itineraryId) })
      }

      const portCount = result.portSchedule.created.length
      const imageText = result.importedImagesCount > 0
        ? ` and ${result.importedImagesCount} ${result.importedImagesCount === 1 ? 'image' : 'images'}`
        : ''

      // Create action button to view trip (if tripId available)
      const viewTripAction = tripId
        ? (createElement(ToastAction, {
            altText: 'View Trip',
            onClick: () => router.push(`/trips/${tripId}`),
          }, 'View Trip') as unknown as ToastActionElement)
        : undefined

      // Show toast - note if some images failed
      if (result.failedImagesCount > 0) {
        toast({
          title: 'Cruise added (some images failed)',
          description: `Created cruise with ${portCount} port ${portCount === 1 ? 'stop' : 'stops'}${imageText}. ${result.failedImagesCount} image(s) could not be imported.`,
          action: viewTripAction,
        })
      } else {
        toast({
          title: 'Cruise added to itinerary',
          description: `Created cruise with ${portCount} port ${portCount === 1 ? 'stop' : 'stops'}${imageText}.`,
          action: viewTripAction,
        })
      }
    },
    onError: (error, _variables, context) => {
      // Rollback to previous state on error
      const itineraryId = context?.itineraryId
      if (context?.previousDaysWithActivities && itineraryId) {
        queryClient.setQueryData(
          itineraryDayKeys.withActivities(itineraryId),
          context.previousDaysWithActivities
        )
      }

      // Don't show toast for date mismatch errors - handled by confirmation dialog
      if (error instanceof Error && error.message.includes('do not fit within itinerary dates')) {
        return
      }

      console.error('Failed to add cruise to itinerary:', error)
      toast({
        title: 'Error',
        description: 'Failed to add cruise to itinerary. Please try again.',
        variant: 'destructive',
      })
    },
  })
}
