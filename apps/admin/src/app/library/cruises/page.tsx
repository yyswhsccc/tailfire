'use client'

import { Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Ship, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLoading } from '@/context/loading-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useInfiniteCruiseSailings, useCruiseFilters, type SailingSearchFilters, type SortField, type CabinCategory } from '@/hooks/use-cruise-library'
import { useItinerary } from '@/hooks/use-itineraries'
import { CruiseCard } from './_components/cruise-card'
import { CruiseFilters } from './_components/cruise-filters'
import { CruiseDetailModal } from './_components/cruise-detail-modal'

const PAGE_SIZE = 20

function CruiseLibraryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { stopLoading } = useLoading()

  // Context from trip itinerary (when navigated from sidebar drag)
  const tripId = searchParams.get('tripId')
  const dayId = searchParams.get('dayId')
  const itineraryId = searchParams.get('itineraryId')
  const returnUrl = searchParams.get('returnUrl')

  const hasTripContext = !!(tripId && dayId && itineraryId)

  // Fetch itinerary to get date bounds for filtering
  const { data: itinerary } = useItinerary(tripId || '', itineraryId)

  // Track if we've applied initial itinerary date filters
  const hasAppliedItineraryFiltersRef = useRef(false)

  // Parse initial filters from URL (no page - using infinite scroll)
  const [filters, setFilters] = useState<Omit<SailingSearchFilters, 'page'>>(() => ({
    q: searchParams.get('q') ?? undefined,
    cruiseLineId: searchParams.get('cruiseLineId') ?? undefined,
    shipId: searchParams.get('shipId') ?? undefined,
    regionId: searchParams.get('regionId') ?? undefined,
    embarkPortId: searchParams.get('embarkPortId') ?? undefined,
    disembarkPortId: searchParams.get('disembarkPortId') ?? undefined,
    portOfCallIds: searchParams.getAll('portOfCallIds').length > 0 ? searchParams.getAll('portOfCallIds') : undefined,
    sailDateFrom: searchParams.get('sailDateFrom') ?? undefined,
    sailDateTo: searchParams.get('sailDateTo') ?? undefined,
    nightsMin: searchParams.get('nightsMin') ? parseInt(searchParams.get('nightsMin')!, 10) : undefined,
    nightsMax: searchParams.get('nightsMax') ? parseInt(searchParams.get('nightsMax')!, 10) : undefined,
    priceMinCents: searchParams.get('priceMinCents') ? parseInt(searchParams.get('priceMinCents')!, 10) : undefined,
    priceMaxCents: searchParams.get('priceMaxCents') ? parseInt(searchParams.get('priceMaxCents')!, 10) : undefined,
    cabinCategory: (searchParams.get('cabinCategory') as CabinCategory) ?? undefined,
    sortBy: (searchParams.get('sortBy') as SortField) ?? 'sailDate',
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? 'asc',
    pageSize: PAGE_SIZE,
  }))

  // Ref for infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Selected sailing for detail modal
  const [selectedSailingId, setSelectedSailingId] = useState<string | null>(null)

  // Fetch data with infinite scroll
  const {
    data,
    isLoading,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteCruiseSailings(filters)
  // Pass current filters to get dynamic filter options
  // (e.g., when cruise line is selected, only show ships from that line)
  // NOTE: Do NOT pass shipId/embarkPortId/disembarkPortId here — that would
  // self-filter the option lists, showing only the current selection and
  // preventing users from switching without clearing first.
  const { data: filterOptions, isLoading: filtersLoading } = useCruiseFilters({
    cruiseLineId: filters.cruiseLineId,
    regionId: filters.regionId,
    sailDateFrom: filters.sailDateFrom,
    sailDateTo: filters.sailDateTo,
    nightsMin: filters.nightsMin,
    nightsMax: filters.nightsMax,
  })

  // Stop the navigation loading overlay once page has mounted

  useEffect(() => {
    stopLoading('cruise-library')
  }, [stopLoading])

  // Track previous cruiseLineId to gate orphan clearing
  const prevCruiseLineIdRef = useRef(filters.cruiseLineId)

  // Auto-clear orphaned child filters ONLY when cruiseLineId changes
  // (not on date/nights changes which would erase the primary "ship + date" workflow)
  useEffect(() => {
    if (filtersLoading || !filterOptions) return

    // Only run when cruise line actually changed
    if (prevCruiseLineIdRef.current === filters.cruiseLineId) return
    prevCruiseLineIdRef.current = filters.cruiseLineId

    const updates: Partial<SailingSearchFilters> = {}

    // Clear shipId if not in current options after cruise line change
    if (filters.shipId && !filterOptions.ships.some(s => s.id === filters.shipId)) {
      updates.shipId = undefined
    }

    // Clear embarkPortId if not in current options
    if (filters.embarkPortId && !filterOptions.embarkPorts.some(p => p.id === filters.embarkPortId)) {
      updates.embarkPortId = undefined
    }

    // Clear disembarkPortId if not in current options
    if (filters.disembarkPortId && !filterOptions.disembarkPorts.some(p => p.id === filters.disembarkPortId)) {
      updates.disembarkPortId = undefined
    }

    if (Object.keys(updates).length > 0) {
      setFilters(prev => ({ ...prev, ...updates }))
    }
  }, [filterOptions, filtersLoading, filters.cruiseLineId, filters.shipId, filters.embarkPortId, filters.disembarkPortId])

  // Auto-apply itinerary date filters when navigating from trip itinerary
  // Only apply once on initial load, not on subsequent renders
  useEffect(() => {
    if (
      hasTripContext &&
      itinerary &&
      itinerary.startDate &&
      itinerary.endDate &&
      !hasAppliedItineraryFiltersRef.current
    ) {
      hasAppliedItineraryFiltersRef.current = true
      setFilters((prev) => ({
        ...prev,
        sailDateFrom: itinerary.startDate!,
        sailDateTo: itinerary.endDate!,
      }))
    }
  }, [hasTripContext, itinerary])

  // Flatten all pages into a single array, deduplicating by ID
  const allSailings = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? []
    const seen = new Set<string>()
    return items.filter((sailing) => {
      if (seen.has(sailing.id)) return false
      seen.add(sailing.id)
      return true
    })
  }, [data?.pages])
  const totalItems = data?.pages[0]?.pagination.totalItems ?? 0
  const syncStatus = data?.pages[0]?.sync

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '100px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Sync filters to URL (no page parameter - using infinite scroll)
  useEffect(() => {
    const params = new URLSearchParams()

    // Preserve trip context
    if (tripId) params.set('tripId', tripId)
    if (dayId) params.set('dayId', dayId)
    if (itineraryId) params.set('itineraryId', itineraryId)
    if (returnUrl) params.set('returnUrl', returnUrl)

    // Add filters
    if (filters.q) params.set('q', filters.q)
    if (filters.cruiseLineId) params.set('cruiseLineId', filters.cruiseLineId)
    if (filters.shipId) params.set('shipId', filters.shipId)
    if (filters.regionId) params.set('regionId', filters.regionId)
    if (filters.embarkPortId) params.set('embarkPortId', filters.embarkPortId)
    if (filters.disembarkPortId) params.set('disembarkPortId', filters.disembarkPortId)
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
    if (filters.sortBy && filters.sortBy !== 'sailDate') params.set('sortBy', filters.sortBy)
    if (filters.sortDir && filters.sortDir !== 'asc') params.set('sortDir', filters.sortDir)

    const queryString = params.toString()
    const newUrl = queryString ? `?${queryString}` : '/library/cruises'
    router.replace(newUrl, { scroll: false })
  }, [filters, tripId, dayId, itineraryId, returnUrl, router])

  // Handle filter changes (infinite scroll auto-resets)
  const handleFiltersChange = useCallback((newFilters: SailingSearchFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }))
  }, [])

  // Handle sort change
  const handleSortChange = useCallback((value: string) => {
    const [sortBy, sortDir] = value.split('-') as [SortField, 'asc' | 'desc']
    setFilters((prev) => ({ ...prev, sortBy, sortDir }))
  }, [])

  // Handle back to trip
  const handleBackToTrip = useCallback(() => {
    if (returnUrl) {
      router.push(returnUrl)
    }
  }, [returnUrl, router])

  // Handle successful add to itinerary
  const handleAddedToItinerary = useCallback(() => {
    setSelectedSailingId(null)
    if (returnUrl) {
      router.push(returnUrl)
    }
  }, [returnUrl, router])

  const sortValue = `${filters.sortBy ?? 'sailDate'}-${filters.sortDir ?? 'asc'}`

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Ship className="h-8 w-8 text-tern-teal-600" />
            <h1 className="text-2xl font-bold text-tern-gray-900">Cruise Library</h1>
          </div>
          <p className="mt-1 text-sm text-tern-gray-500">
            {hasTripContext && itinerary?.startDate && itinerary?.endDate ? (
              <>
                Showing cruises that fit within your itinerary dates: <span className="font-medium text-tern-teal-600">{itinerary.startDate}</span> to <span className="font-medium text-tern-teal-600">{itinerary.endDate}</span>
              </>
            ) : (
              'Browse and add cruises from our sailing database'
            )}
          </p>
        </div>
        {hasTripContext && returnUrl && (
          <Button variant="outline" onClick={handleBackToTrip}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Trip
          </Button>
        )}
      </div>

      {/* Filters */}
      <CruiseFilters
        filters={filters}
        filterOptions={filterOptions}
        isLoading={filtersLoading}
        onChange={handleFiltersChange}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-tern-gray-500">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading cruises...
            </span>
          ) : error ? (
            <span className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              Failed to load cruises
            </span>
          ) : (
            <>
              Showing {allSailings.length.toLocaleString()} of {totalItems.toLocaleString()} cruises
              {isFetchingNextPage && (
                <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-tern-gray-500">Sort by:</span>
          <Select value={sortValue} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sailDate-asc">Departure Date (Earliest)</SelectItem>
              <SelectItem value="sailDate-desc">Departure Date (Latest)</SelectItem>
              <SelectItem value="price-asc">Price (Low to High)</SelectItem>
              <SelectItem value="price-desc">Price (High to Low)</SelectItem>
              <SelectItem value="nights-asc">Duration (Shortest)</SelectItem>
              <SelectItem value="nights-desc">Duration (Longest)</SelectItem>
              <SelectItem value="shipName-asc">Ship Name (A-Z)</SelectItem>
              <SelectItem value="lineName-asc">Cruise Line (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 bg-tern-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-tern-gray-900">Error loading cruises</h3>
          <p className="mt-1 text-sm text-tern-gray-500">
            Please try again later or contact support if the problem persists.
          </p>
        </div>
      ) : !allSailings.length ? (
        <div className="text-center py-12">
          <Ship className="mx-auto h-12 w-12 text-tern-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-tern-gray-900">No cruises found</h3>
          {hasTripContext && itinerary?.startDate && itinerary?.endDate ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-tern-gray-500">
                No cruises are available that depart and return within your itinerary dates
                ({itinerary.startDate} to {itinerary.endDate}).
              </p>
              <p className="text-sm text-amber-600">
                Consider adjusting the itinerary dates to find available cruises, or clear the date filters to browse all sailings.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-tern-gray-500">
              Try adjusting your filters or search criteria.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allSailings.map((sailing) => (
              <CruiseCard
                key={sailing.id}
                sailing={sailing}
                onSelect={() => setSelectedSailingId(sailing.id)}
              />
            ))}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-tern-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading more cruises...</span>
              </div>
            ) : hasNextPage ? (
              <span className="text-sm text-tern-gray-400">Scroll for more</span>
            ) : allSailings.length > 0 ? (
              <span className="text-sm text-tern-gray-400">
                You&apos;ve seen all {totalItems.toLocaleString()} cruises
              </span>
            ) : null}
          </div>
        </>
      )}

      {/* Sync Status */}
      {syncStatus?.syncInProgress && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 shadow-lg">
          <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
          Cruise data is syncing. Prices may be updating.
        </div>
      )}

      {/* Detail Modal */}
      <CruiseDetailModal
        sailingId={selectedSailingId}
        isOpen={!!selectedSailingId}
        onClose={() => setSelectedSailingId(null)}
        tripContext={hasTripContext ? { tripId: tripId!, dayId: dayId!, itineraryId: itineraryId! } : undefined}
        onAddedToItinerary={handleAddedToItinerary}
      />
    </div>
  )
}

function CruiseLibraryLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Ship className="h-8 w-8 text-tern-teal-600" />
            <h1 className="text-2xl font-bold text-tern-gray-900">Cruise Library</h1>
          </div>
          <p className="mt-1 text-sm text-tern-gray-500">
            Browse and add cruises from our sailing database
          </p>
        </div>
      </div>

      {/* Loading Skeleton */}
      <div className="bg-white border border-tern-gray-200 rounded-lg p-4">
        <div className="h-10 bg-tern-gray-100 rounded animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-64 bg-tern-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function CruiseLibraryPage() {
  return (
    <Suspense fallback={<CruiseLibraryLoading />}>
      <CruiseLibraryContent />
    </Suspense>
  )
}
