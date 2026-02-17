'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  useTrips,
  useBulkDeleteTrips,
  useBulkArchiveTrips,
  useBulkChangeStatus,
} from '@/hooks/use-trips'
import {
  TripsKanban,
  TripsFilterPanel,
  TripsViewSwitcher,
  TripsDataTable,
  TripsBulkActions,
  TripsPagination,
  type TripsViewMode,
} from '@/components/trips'
import { TripFormDialog } from './_components/trip-form-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/hooks/use-toast'
import type { TripFilterDto } from '@tailfire/shared-types/api'
import type { TripStatus } from '@tailfire/shared-types'

/**
 * Trips Page
 * Supports both Kanban and Table views with bulk operations
 */
export default function TernTripsPage() {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewMode, setViewMode] = useState<TripsViewMode>('kanban')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // Filter state - all filtering is now server-side
  const [filters, setFilters] = useState<TripFilterDto>({
    page: 1,
    limit: 25,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })

  // Debounced search - updates on blur or enter
  const [searchInput, setSearchInput] = useState('')

  // Fetch trips with server-side filtering
  const { data, isLoading, error, refetch } = useTrips(filters)

  // Bulk operation mutations
  const bulkDelete = useBulkDeleteTrips()
  const bulkArchive = useBulkArchiveTrips()
  const bulkChangeStatus = useBulkChangeStatus()

  // Handle search submit
  const handleSearchSubmit = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      search: searchInput || undefined,
      page: 1,
    }))
  }, [searchInput])

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: TripFilterDto) => {
    setFilters(newFilters)
  }, [])

  // Handle pagination
  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }))
    setSelectedIds(new Set()) // Clear selection on page change
  }, [])

  const handleLimitChange = useCallback((limit: number) => {
    setFilters((prev) => ({ ...prev, limit, page: 1 })) // Reset to page 1
    setSelectedIds(new Set())
  }, [])

  // Memoize trips to prevent unnecessary re-renders
  const trips = useMemo(() => data?.data || [], [data?.data])

  // Check if we have active filters
  const hasActiveFilters = filters.status || filters.tripType || filters.search

  // Bulk operations handlers
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    try {
      const result = await bulkDelete.mutateAsync(ids)
      if (result.success.length > 0) {
        toast({
          title: `Deleted ${result.success.length} trip(s)`,
          description: result.failed.length > 0
            ? `${result.failed.length} could not be deleted`
            : undefined,
        })
      }
      if (result.failed.length > 0 && result.success.length === 0) {
        toast({
          title: 'Delete failed',
          description: result.failed[0]?.reason || 'Unknown error',
          variant: 'destructive',
        })
      }
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Error', description: 'Failed to delete trips', variant: 'destructive' })
    }
  }

  const handleBulkArchive = async () => {
    const ids = Array.from(selectedIds)
    try {
      const result = await bulkArchive.mutateAsync({ tripIds: ids, archive: true })
      toast({ title: `Archived ${result.success.length} trip(s)` })
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Error', description: 'Failed to archive trips', variant: 'destructive' })
    }
  }

  const handleBulkUnarchive = async () => {
    const ids = Array.from(selectedIds)
    try {
      const result = await bulkArchive.mutateAsync({ tripIds: ids, archive: false })
      toast({ title: `Unarchived ${result.success.length} trip(s)` })
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Error', description: 'Failed to unarchive trips', variant: 'destructive' })
    }
  }

  const handleBulkChangeStatus = async (status: TripStatus) => {
    const ids = Array.from(selectedIds)
    try {
      const result = await bulkChangeStatus.mutateAsync({ tripIds: ids, status })
      if (result.success.length > 0) {
        toast({
          title: `Updated ${result.success.length} trip(s)`,
          description: result.failed.length > 0
            ? `${result.failed.length} could not be updated`
            : undefined,
        })
      }
      if (result.failed.length > 0 && result.success.length === 0) {
        toast({
          title: 'Status change failed',
          description: result.failed[0]?.reason || 'Unknown error',
          variant: 'destructive',
        })
      }
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' })
    }
  }

  return (
    <DashboardLayout>
      {/* Page Header */}
      <PageHeader
        title="Trips"
        actions={
          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <TripsViewSwitcher view={viewMode} onViewChange={setViewMode} />

            {/* Filter Panel */}
            <TripsFilterPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search trips..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                onBlur={handleSearchSubmit}
                className="w-64 pl-9"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/trips/import')}
            >
              <Download className="mr-2 h-4 w-4" />
              Import Booking
            </Button>

            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Trip
            </Button>
          </div>
        }
      />

      {/* Bulk Actions Toolbar - shows when items selected in table view */}
      {viewMode === 'table' && selectedIds.size > 0 && (
        <div className="mb-4">
          <TripsBulkActions
            selectedCount={selectedIds.size}
            onDelete={handleBulkDelete}
            onArchive={handleBulkArchive}
            onUnarchive={handleBulkUnarchive}
            onChangeStatus={handleBulkChangeStatus}
            onClearSelection={() => setSelectedIds(new Set())}
            isDeleting={bulkDelete.isPending}
            isArchiving={bulkArchive.isPending}
            isChangingStatus={bulkChangeStatus.isPending}
          />
        </div>
      )}

      {/* Content */}
      {error ? (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">
            Failed to load trips. Please try again.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <TableSkeleton rows={8} />
      ) : trips.length === 0 && !hasActiveFilters ? (
        <EmptyState
          title="No trips yet"
          description="Get started by creating your first trip"
          action={{
            label: 'Create Trip',
            onClick: () => setIsCreateOpen(true),
          }}
        />
      ) : trips.length === 0 && hasActiveFilters ? (
        <EmptyState
          title="No matching trips"
          description="Try adjusting your filters or search query"
          action={{
            label: 'Clear Filters',
            onClick: () => {
              setFilters({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc' })
              setSearchInput('')
            },
          }}
        />
      ) : viewMode === 'kanban' ? (
        <TripsKanban trips={trips} />
      ) : (
        <>
          <TripsDataTable
            trips={trips}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
          {data?.pagination && data.pagination.totalPages > 1 && (
            <TripsPagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              limit={data.pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          )}
        </>
      )}

      {/* Create Trip Dialog */}
      <TripFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
      />
    </DashboardLayout>
  )
}
