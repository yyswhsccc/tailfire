'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, LayoutGrid, List, Upload } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useContacts } from '@/hooks/use-contacts'
import { ContactsTable } from './_components/contacts-table'
import { ContactsKanban } from './_components/contacts-kanban'
import { ContactsFilterPanel } from './_components/contacts-filter-panel'
import { BulkActionsToolbar } from './_components/bulk-actions-toolbar'
import { QuickContactDialog } from './_components/quick-contact-dialog'
import { ContactImportWizard } from './_components/contact-import-wizard'
import { MergeEditorDialog } from './_components/merge-editor-dialog'
import { TripFormDialog } from '@/app/trips/_components/trip-form-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ContactFilterDto, TripResponseDto } from '@tailfire/shared-types/api'

type ContactsView = 'table' | 'kanban'

export default function ContactsPageWrapper() {
  return (
    <Suspense>
      <ContactsPage />
    </Suspense>
  )
}

function ContactsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const urlSearch = searchParams?.get('search') || ''
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeIds, setMergeIds] = useState<[string, string] | null>(null)
  const [view, setView] = useState<ContactsView>('table')
  const [filters, setFilters] = useState<ContactFilterDto>({
    page: 1,
    limit: 25,
  })

  // ---------------------------------------------------------------------------
  // View toggle — persist to localStorage
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const stored = localStorage.getItem('contacts-view-preference')
    if (stored === 'table' || stored === 'kanban') {
      setView(stored)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('contacts-view-preference', view)
  }, [view])

  const handleViewChange = useCallback((next: string) => {
    if (next === 'table' || next === 'kanban') setView(next)
  }, [])

  // ---------------------------------------------------------------------------
  // URL search sync
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (urlSearch) {
      setSearchInput(urlSearch)
      setFilters((prev) => ({ ...prev, search: urlSearch, page: 1 }))
    }
  }, [urlSearch])

  // ---------------------------------------------------------------------------
  // Debounced search input (500ms)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        search: searchInput || undefined,
        page: 1,
      }))
    }, 500)

    return () => clearTimeout(timer)
  }, [searchInput])

  // ---------------------------------------------------------------------------
  // Sort handler — stored in filters
  // ---------------------------------------------------------------------------

  const handleSortChange = useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      setFilters((prev) => ({
        ...prev,
        sortBy: sortBy as ContactFilterDto['sortBy'],
        sortOrder,
        page: 1,
      }))
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Filters change handler
  // ---------------------------------------------------------------------------

  const handleFiltersChange = useCallback((newFilters: ContactFilterDto) => {
    setFilters(newFilters)
  }, [])

  // ---------------------------------------------------------------------------
  // Create trip from selected contacts
  // ---------------------------------------------------------------------------

  const handleTripCreated = useCallback(async (newTrip: TripResponseDto) => {
    const contactIds = Array.from(selectedIds)

    for (let i = 0; i < contactIds.length; i++) {
      try {
        await api.post(`/trips/${newTrip.id}/travelers`, {
          contactId: contactIds[i],
          role: i === 0 ? 'primary_contact' : 'full_access',
          isPrimaryTraveler: i === 0,
          travelerType: 'adult',
        })
      } catch (err) {
        console.error(`Failed to add traveler ${contactIds[i]}:`, err)
      }
    }

    toast({
      title: 'Trip created',
      description: `${newTrip.name} created with ${contactIds.length} traveler${contactIds.length !== 1 ? 's' : ''}`,
    })

    setSelectedIds(new Set())
    setShowCreateTrip(false)
    router.push(`/trips/${newTrip.id}?tab=travelers`)
  }, [selectedIds, toast, router])

  // ---------------------------------------------------------------------------
  // Clear selection on filter/page change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setSelectedIds(new Set())
  }, [filters.page, filters.search, filters.tags, filters.contactType, filters.contactStatus])

  // ---------------------------------------------------------------------------
  // Effective filters — kanban fetches all contacts (limit 500)
  // ---------------------------------------------------------------------------

  const effectiveFilters = useMemo(() => {
    if (view === 'kanban') {
      return { ...filters, limit: 500, page: 1 }
    }
    return filters
  }, [filters, view])

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const { data, isLoading, error } = useContacts(effectiveFilters)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DashboardLayout>
      {/* Page Header */}
      <PageHeader
        title={data?.pagination?.total != null ? `Contacts (${data.pagination.total})` : 'Contacts'}
        actions={
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={handleViewChange}
              className="gap-0"
            >
              <ToggleGroupItem
                value="table"
                aria-label="Table view"
                className={cn(
                  'rounded-r-none border border-r-0',
                  view === 'table' && 'bg-muted',
                )}
              >
                <List className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="kanban"
                aria-label="Pipeline view"
                className={cn(
                  'rounded-l-none border',
                  view === 'kanban' && 'bg-muted',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Filters */}
            <ContactsFilterPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search contacts..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-64 pl-9"
              />
            </div>

            {/* Import */}
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Button>

            {/* New Contact */}
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Contact
            </Button>
          </div>
        }
      />

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedIds={selectedIds}
          onDeselect={() => setSelectedIds(new Set())}
          onCreateTrip={() => setShowCreateTrip(true)}
          onMerge={() => setMergeIds(Array.from(selectedIds) as [string, string])}
        />
      )}

      {/* Content */}
      {view === 'kanban' ? (
        <ContactsKanban
          contacts={data?.data || []}
          isLoading={isLoading}
          onContactClick={(id) => router.push(`/contacts/${id}`)}
        />
      ) : (
        <div className="bg-white border border-ash-200 rounded-lg">
          {error ? (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">
                Failed to load contacts. Please try again.
              </p>
              <Button variant="outline">Retry</Button>
            </div>
          ) : isLoading ? (
            <TableSkeleton rows={filters.limit || 25} />
          ) : !data?.data || data.data.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-ash-500">
                {(filters.search || (filters.tags?.length ?? 0) > 0 || filters.contactType || (filters.contactStatus?.length ?? 0) > 0)
                  ? 'No contacts found matching your filters'
                  : 'No contacts found'}
              </p>
              {!filters.search && !(filters.tags?.length) && !filters.contactType && !(filters.contactStatus?.length) && (
                <Button
                  className="mt-4 bg-phoenix-gold-500 hover:bg-phoenix-gold-600 text-white"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Contact
                </Button>
              )}
            </div>
          ) : (
            <>
              <ContactsTable
                contacts={data.data}
                isLoading={isLoading}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                sortBy={filters.sortBy}
                sortOrder={filters.sortOrder}
                onSortChange={handleSortChange}
                onContactClick={(id) => router.push(`/contacts/${id}`)}
              />
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-ash-200">
                  <p className="text-sm text-ash-600">
                    Showing {data.pagination.total} contact{data.pagination.total === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
                      disabled={(filters.page || 1) === 1}
                    >
                      &larr;
                    </Button>
                    <span className="text-sm text-ash-700">
                      {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                      disabled={(filters.page || 1) >= data.pagination.totalPages}
                    >
                      &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <QuickContactDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <TripFormDialog
        open={showCreateTrip}
        onOpenChange={setShowCreateTrip}
        mode="create"
        redirectOnCreate={false}
        onCreated={handleTripCreated}
      />

      <ContactImportWizard open={showImport} onOpenChange={setShowImport} />

      {mergeIds && (
        <MergeEditorDialog
          open={!!mergeIds}
          onOpenChange={(open) => { if (!open) setMergeIds(null) }}
          contactIds={mergeIds}
          onMergeComplete={() => { setMergeIds(null); setSelectedIds(new Set()) }}
        />
      )}
    </DashboardLayout>
  )
}
