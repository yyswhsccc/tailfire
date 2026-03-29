'use client'

import { Suspense, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Palmtree, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  useVacationSearch,
  type VacationSearchParams,
  type VacationSearchResult,
  type VacationPackageOption,
} from '@/hooks/use-vacation-library'
import { VacationSearchForm } from './_components/vacation-search-form'
import { VacationHotelCard } from './_components/vacation-hotel-card'
import { VacationDetailModal } from './_components/vacation-detail-modal'

// =============================================================================
// Content Component (requires useSearchParams inside Suspense)
// =============================================================================

function VacationLibraryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ---------------------------------------------------------------------------
  // Trip context from URL (when navigated from itinerary sidebar)
  // ---------------------------------------------------------------------------
  const tripId = searchParams.get('tripId')
  const dayId = searchParams.get('dayId')
  const itineraryId = searchParams.get('itineraryId')
  const returnUrl = searchParams.get('returnUrl')

  const tripContext =
    tripId && itineraryId
      ? { tripId, dayId: dayId ?? '', itineraryId }
      : undefined

  const defaults = {
    startDate: searchParams.get('startDate') ?? undefined,
    travelers: searchParams.get('travelers')
      ? Number(searchParams.get('travelers'))
      : undefined,
    gateway: searchParams.get('gateway') ?? undefined,
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [results, setResults] = useState<VacationSearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [priceMode, setPriceMode] = useState<'perPerson' | 'grandTotal'>('perPerson')
  const [selectedResult, setSelectedResult] = useState<VacationSearchResult | null>(null)
  const [searchDate, setSearchDate] = useState<string | null>(null)

  const searchMutation = useVacationSearch()

  // ---------------------------------------------------------------------------
  // Sorted results (cheapest first)
  // ---------------------------------------------------------------------------
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const aMin = a.packages.length > 0
        ? Math.min(...a.packages.map((p) => p.totalPrice))
        : Infinity
      const bMin = b.packages.length > 0
        ? Math.min(...b.packages.map((p) => p.totalPrice))
        : Infinity
      return aMin - bMin
    })
  }, [results])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleSearch = useCallback(
    async (params: VacationSearchParams) => {
      setHasSearched(true)
      // Convert dateDep (YYYYMMDD) to ISO (YYYY-MM-DD)
      const raw = params.dateDep
      if (raw && raw.length === 8) {
        setSearchDate(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`)
      } else {
        setSearchDate(null)
      }
      try {
        const searchResults = await searchMutation.mutateAsync(params)
        setResults(searchResults)
      } catch {
        setResults([])
      }
    },
    [searchMutation],
  )

  const handleBackToTrip = useCallback(() => {
    if (returnUrl) {
      router.push(returnUrl)
    }
  }, [returnUrl, router])

  // Stub: will be wired in Task 9
  const handleAddToTrip = useCallback(
    (_result: VacationSearchResult, _pkg: VacationPackageOption) => {
      setSelectedResult(null)
    },
    [],
  )

  // Stub: will be wired in Task 9
  const handleCreateTrip = useCallback(
    (_result: VacationSearchResult, _pkg: VacationPackageOption) => {
      setSelectedResult(null)
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Palmtree className="h-6 w-6 text-amber-500" />
              <h1 className="text-xl font-semibold text-ash-900">Vacation Packages</h1>
            </div>
            <p className="mt-1 text-sm text-ash-500">
              Search all-inclusive vacation packages from Softvoyage
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Price toggle — only when results are shown */}
            {sortedResults.length > 0 && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="price-mode"
                  className={`text-xs cursor-pointer ${priceMode === 'perPerson' ? 'font-medium text-ash-700' : 'text-ash-500'}`}
                >
                  Per Person
                </Label>
                <Switch
                  id="price-mode"
                  checked={priceMode === 'grandTotal'}
                  onCheckedChange={(checked) =>
                    setPriceMode(checked ? 'grandTotal' : 'perPerson')
                  }
                />
                <Label
                  htmlFor="price-mode"
                  className={`text-xs cursor-pointer ${priceMode === 'grandTotal' ? 'font-medium text-ash-700' : 'text-ash-500'}`}
                >
                  Grand Total
                </Label>
              </div>
            )}

            {/* Back to Trip button */}
            {tripContext && returnUrl && (
              <Button variant="outline" onClick={handleBackToTrip}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Trip
              </Button>
            )}
          </div>
        </div>

        {/* Search Form */}
        <VacationSearchForm
          onSearch={handleSearch}
          isSearching={searchMutation.isPending}
          defaults={defaults}
        />

        {/* Content States */}
        {!hasSearched ? (
          /* 1. Initial — no search yet */
          <div className="text-center py-16">
            <Palmtree className="mx-auto h-16 w-16 text-amber-500/30" />
            <h3 className="mt-4 text-sm font-medium text-ash-900">
              Search for vacation packages
            </h3>
            <p className="mt-1 text-sm text-ash-500">
              Select a departure city, destination, and travel dates above
            </p>
          </div>
        ) : searchMutation.isPending ? (
          /* 2. Searching */
          <div className="text-center py-16">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-amber-500" />
            <h3 className="mt-4 text-sm font-medium text-ash-900">
              Searching vacation packages...
            </h3>
            <p className="mt-1 text-sm text-ash-500">
              This may take a few seconds
            </p>
          </div>
        ) : searchMutation.isError ? (
          /* 3. Error */
          <div className="text-center py-16">
            <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-ash-900">Search failed</h3>
            <p className="mt-1 text-sm text-ash-500">
              {searchMutation.error instanceof Error
                ? searchMutation.error.message
                : 'An unexpected error occurred. Please try again.'}
            </p>
          </div>
        ) : sortedResults.length === 0 ? (
          /* 4. No results */
          <div className="text-center py-16">
            <Palmtree className="mx-auto h-12 w-12 text-ash-400" />
            <h3 className="mt-2 text-sm font-medium text-ash-900">No packages found</h3>
            <p className="mt-1 text-sm text-ash-500">
              Try adjusting your search criteria
            </p>
          </div>
        ) : (
          /* 5. Results */
          <>
            <div className="text-sm text-ash-500">
              Found {sortedResults.length} {sortedResults.length === 1 ? 'hotel' : 'hotels'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedResults.map((result) => (
                <VacationHotelCard
                  key={result.hotelId}
                  result={result}
                  onSelect={() => setSelectedResult(result)}
                  priceMode={priceMode}
                />
              ))}
            </div>
          </>
        )}

        {/* Detail Modal */}
        <VacationDetailModal
          result={selectedResult}
          isOpen={!!selectedResult}
          onClose={() => setSelectedResult(null)}
          tripContext={tripContext}
          onAddToTrip={handleAddToTrip}
          onCreateTrip={handleCreateTrip}
        />
      </div>
    </TooltipProvider>
  )
}

// =============================================================================
// Loading Fallback (for Suspense)
// =============================================================================

function VacationLibraryLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Palmtree className="h-6 w-6 text-amber-500" />
            <h1 className="text-xl font-semibold text-ash-900">Vacation Packages</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Search all-inclusive vacation packages from Softvoyage
          </p>
        </div>
      </div>

      {/* Search form skeleton */}
      <div className="bg-white border border-ash-200 rounded-lg p-4">
        <div className="h-10 bg-ash-100 rounded animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="text-center py-16">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-ash-300" />
      </div>
    </div>
  )
}

// =============================================================================
// Page Export
// =============================================================================

export default function VacationLibraryPage() {
  return (
    <Suspense fallback={<VacationLibraryLoading />}>
      <VacationLibraryContent />
    </Suspense>
  )
}
