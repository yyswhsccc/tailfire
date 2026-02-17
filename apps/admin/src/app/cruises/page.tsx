'use client'

import { useState, useEffect, useMemo } from 'react'
import { Ship, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCruiseSailings,
  useCruiseFilters,
  type SailingSearchFilters,
} from '@/hooks/use-cruise-sailings'
import { SailingsTable } from './_components/sailings-table'
import { SyncStatusBanner } from './_components/sync-status-banner'
import { SailingFiltersSheet } from './_components/sailing-filters-sheet'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { cn } from '@/lib/utils'

export default function CruisesPage() {
  // Filter state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedCruiseLine, setSelectedCruiseLine] = useState<string>('')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedShip, setSelectedShip] = useState<string>('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SailingSearchFilters['sortBy']>('sailDate')
  const [sortDir, setSortDir] = useState<SailingSearchFilters['sortDir']>('asc')
  const pageSize = 20

  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Build filters object
  const filters: SailingSearchFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      cruiseLineId: selectedCruiseLine || undefined,
      regionId: selectedRegion || undefined,
      shipId: selectedShip || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
    }),
    [debouncedSearch, selectedCruiseLine, selectedRegion, selectedShip, sortBy, sortDir, page, pageSize]
  )

  // Fetch data
  const { data, isLoading, error, isFetching, refetch } = useCruiseSailings(filters)
  const { data: filterOptions } = useCruiseFilters()

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedCruiseLine, selectedRegion, selectedShip])

  const clearFilters = () => {
    setSearchInput('')
    setDebouncedSearch('')
    setSelectedCruiseLine('')
    setSelectedRegion('')
    setSelectedShip('')
    setSortBy('sailDate')
    setSortDir('asc')
    setPage(1)
  }

  const hasActiveFilters =
    debouncedSearch ||
    selectedCruiseLine ||
    selectedRegion ||
    selectedShip

  return (
    <DashboardLayout>
      {/* Sync Status Banner */}
      {data?.sync?.syncInProgress && (
        <SyncStatusBanner lastSyncedAt={data.sync.lastSyncedAt} />
      )}

      {/* Page Header */}
      <PageHeader
        title="Cruise Sailings"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(true)}
              className={cn(hasActiveFilters && 'border-phoenix-gold-500 text-phoenix-gold-600')}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 rounded-full bg-phoenix-gold-500 px-1.5 py-0.5 text-xs text-white">
                  {[debouncedSearch, selectedCruiseLine, selectedRegion, selectedShip].filter(Boolean).length}
                </span>
              )}
            </Button>
            <Input
              type="search"
              placeholder="Search sailings..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Quick Filters Bar */}
      <div className="flex items-center gap-3 mb-4">
        <Select value={selectedCruiseLine} onValueChange={setSelectedCruiseLine}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Cruise Lines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Cruise Lines</SelectItem>
            {filterOptions?.cruiseLines.map((line) => (
              <SelectItem key={line.id} value={line.id}>
                {line.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedRegion} onValueChange={setSelectedRegion}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Regions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Regions</SelectItem>
            {filterOptions?.regions.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedShip} onValueChange={setSelectedShip}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Ships" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Ships</SelectItem>
            {filterOptions?.ships.map((ship) => (
              <SelectItem key={ship.id} value={ship.id}>
                {ship.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-ash-500">Sort by:</span>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SailingSearchFilters['sortBy'])}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sailDate">Sail Date</SelectItem>
              <SelectItem value="price">Price</SelectItem>
              <SelectItem value="nights">Nights</SelectItem>
              <SelectItem value="shipName">Ship</SelectItem>
              <SelectItem value="lineName">Cruise Line</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-ash-200 rounded-lg">
        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">Failed to load sailings. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={pageSize} />
        ) : !data?.items || data.items.length === 0 ? (
          <div className="text-center py-12">
            <Ship className="mx-auto h-12 w-12 text-ash-300 mb-4" />
            <p className="text-ash-500">
              {hasActiveFilters
                ? 'No sailings match your filters'
                : 'No sailings found. Run a sync to import cruise data.'}
            </p>
            {hasActiveFilters && (
              <Button variant="link" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <SailingsTable sailings={data.items} />
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-ash-200">
                <p className="text-sm text-ash-600">
                  Showing {((page - 1) * pageSize) + 1}-
                  {Math.min(page * pageSize, data.pagination.totalItems)} of{' '}
                  {data.pagination.totalItems} sailings
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-ash-700 px-2">
                    Page {page} of {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= data.pagination.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Advanced Filters Sheet */}
      <SailingFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filterOptions={filterOptions}
        filters={filters}
        onFiltersChange={(newFilters) => {
          if (newFilters.cruiseLineId !== undefined) setSelectedCruiseLine(newFilters.cruiseLineId || '')
          if (newFilters.regionId !== undefined) setSelectedRegion(newFilters.regionId || '')
          if (newFilters.shipId !== undefined) setSelectedShip(newFilters.shipId || '')
          // Add more filter handlers as needed
        }}
      />
    </DashboardLayout>
  )
}
