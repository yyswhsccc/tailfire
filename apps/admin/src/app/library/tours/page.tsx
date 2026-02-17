'use client'

import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MapPin, Loader2, AlertCircle } from 'lucide-react'
import { useLoading } from '@/context/loading-context'
import {
  useCatalogTours,
  useCatalogTourFilters,
  type CatalogTourFilters,
} from '@/hooks/use-tour-library'
import { useItinerary } from '@/hooks/use-itineraries'
import { TourCard } from './_components/tour-card'
import { TourFilters } from './_components/tour-filters'
import { TourDetailModal } from './_components/tour-detail-modal'

const PAGE_SIZE = 50

function TourLibraryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { stopLoading } = useLoading()

  // Context from trip itinerary (when navigated from sidebar drag)
  const tripId = searchParams.get('tripId')
  const dayId = searchParams.get('dayId')
  const itineraryId = searchParams.get('itineraryId')
  const returnUrl = searchParams.get('returnUrl')

  const hasTripContext = !!(tripId && dayId && itineraryId)

  // Fetch itinerary to get date bounds for filtering departures
  const { data: itinerary } = useItinerary(tripId || '', itineraryId)

  const [filters, setFilters] = useState<CatalogTourFilters>(() => ({
    q: searchParams.get('q') ?? undefined,
    operator: searchParams.get('operator') ?? undefined,
    season: searchParams.get('season') ?? undefined,
    pageSize: PAGE_SIZE,
  }))

  // Selected tour ID for detail modal
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null)

  // Client-side pagination for streaming effect
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Queries - only catalog data
  const { data: toursResult, isLoading, error } = useCatalogTours(filters)
  const { data: filterOptions, isLoading: filtersLoading } = useCatalogTourFilters()

  const tours = toursResult?.tours ?? []

  useEffect(() => {
    stopLoading('tour-library')
  }, [stopLoading])

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.operator) params.set('operator', filters.operator)
    if (filters.season) params.set('season', filters.season)
    const qs = params.toString()
    const newUrl = qs ? `?${qs}` : '/library/tours'
    router.replace(newUrl, { scroll: false })
  }, [filters, router])

  const items = tours.slice(0, visibleCount)
  const hasMore = visibleCount < tours.length

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, tours.length))
        }
      },
      { rootMargin: '200px' },
    )

    const el = sentinelRef.current
    if (el) observer.observe(el)

    return () => {
      if (el) observer.unobserve(el)
    }
  }, [hasMore, isLoading, tours.length])

  const handleFiltersChange = useCallback((newFilters: Partial<CatalogTourFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }, [])

  const handleSearch = useCallback((q: string) => {
    setFilters((prev) => ({ ...prev, q: q || undefined }))
  }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8 text-phoenix-gold-600" />
          <h1 className="text-2xl font-bold text-ash-900">Tour Library</h1>
        </div>
        <p className="mt-1 text-sm text-ash-500">
          {hasTripContext && itinerary?.startDate && itinerary?.endDate ? (
            <>
              Select a tour for your itinerary: <span className="font-medium text-phoenix-gold-600">{itinerary.startDate}</span> to <span className="font-medium text-phoenix-gold-600">{itinerary.endDate}</span>
            </>
          ) : (
            'Browse tours from Globus, Cosmos, and Monograms'
          )}
        </p>
      </div>

      {/* Filters */}
      <TourFilters
        filters={filters}
        filterOptions={filterOptions}
        isLoading={filtersLoading}
        onChange={handleFiltersChange}
        onSearch={handleSearch}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-ash-500">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tours...
            </span>
          ) : error ? (
            <span className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              Failed to load tours
            </span>
          ) : (
            <span>
              {toursResult?.total.toLocaleString() ?? 0} tour{toursResult?.total !== 1 ? 's' : ''}
              {filters.q && (
                <span className="text-ash-400"> for &ldquo;{filters.q}&rdquo;</span>
              )}
              {hasMore && (
                <span className="text-ash-400">
                  {' '}· showing {items.length.toLocaleString()}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Results Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-52 bg-ash-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">Error loading tours</h3>
          <p className="mt-1 text-sm text-ash-500">
            Unable to load tour catalog. Please try again later.
          </p>
        </div>
      ) : tours.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">No tours found</h3>
          <p className="mt-1 text-sm text-ash-500">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                onSelect={() => setSelectedTourId(tour.id)}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-ash-400" />
            </div>
          )}
        </>
      )}

      {/* Tour Detail Modal */}
      <TourDetailModal
        tourId={selectedTourId}
        isOpen={!!selectedTourId}
        onClose={() => setSelectedTourId(null)}
        tripContext={hasTripContext ? {
          tripId: tripId!,
          dayId: dayId!,
          itineraryId: itineraryId!,
          startDate: itinerary?.startDate ?? undefined,
          endDate: itinerary?.endDate ?? undefined,
        } : undefined}
        onAddedToItinerary={() => {
          setSelectedTourId(null)
          if (returnUrl) {
            router.push(returnUrl)
          }
        }}
      />
    </div>
  )
}

function TourLibraryLoading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8 text-phoenix-gold-600" />
          <h1 className="text-2xl font-bold text-ash-900">Tour Library</h1>
        </div>
        <p className="mt-1 text-sm text-ash-500">
          Browse tours from Globus, Cosmos, and Monograms
        </p>
      </div>

      <div className="bg-white border border-ash-200 rounded-lg p-4">
        <div className="h-10 bg-ash-100 rounded animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-52 bg-ash-100 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function TourLibraryPage() {
  return (
    <Suspense fallback={<TourLibraryLoading />}>
      <TourLibraryContent />
    </Suspense>
  )
}
