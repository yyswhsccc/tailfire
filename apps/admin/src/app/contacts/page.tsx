'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useContacts, useDeleteContact } from '@/hooks/use-contacts'
import { ContactsTable } from './_components/contacts-table'
import { ContactsFilterPanel } from './_components/contacts-filter-panel'
import { QuickContactDialog } from './_components/quick-contact-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/hooks/use-toast'
import type { ContactFilterDto } from '@tailfire/shared-types/api'

export default function ContactsPage() {
  const searchParams = useSearchParams()
  const urlSearch = searchParams?.get('search') || ''
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState<ContactFilterDto>({
    page: 1,
    limit: 10,
  })

  // Sync URL search param into filters and search input
  useEffect(() => {
    if (urlSearch) {
      setSearchInput(urlSearch)
      setFilters((prev) => ({ ...prev, search: urlSearch, page: 1 }))
    }
  }, [urlSearch])

  // Debounce search input (500ms delay)
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

  const handleFiltersChange = useCallback((newFilters: ContactFilterDto) => {
    setFilters(newFilters)
  }, [])

  const { data, isLoading, error } = useContacts(filters)
  const deleteContact = useDeleteContact()
  const { toast } = useToast()

  const handleDelete = async (id: string) => {
    try {
      await deleteContact.mutateAsync(id)
      toast({
        title: 'Contact deleted',
        description: 'The contact has been successfully deleted.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete contact. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <DashboardLayout>
      {/* Page Header */}
      <PageHeader
        title="Contacts"
        actions={
          <div className="flex items-center gap-2">
            <ContactsFilterPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
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
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Contact
            </Button>
          </div>
        }
      />

      {/* Content */}
      <div className="bg-white border border-ash-200 rounded-lg">
        {error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">
              Failed to load contacts. Please try again.
            </p>
            <Button variant="outline">Retry</Button>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={filters.limit || 10} />
        ) : !data?.data || data.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ash-500">
              {(filters.search || (filters.tags?.length ?? 0) > 0)
                ? 'No contacts found matching your filters'
                : 'No contacts found'}
            </p>
            {!filters.search && !(filters.tags?.length) && (
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
              onDelete={handleDelete}
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
                    ←
                  </Button>
                  <span className="text-sm text-ash-700">
                    {data.pagination.page}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                    disabled={(filters.page || 1) >= data.pagination.totalPages}
                  >
                    →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <QuickContactDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </DashboardLayout>
  )
}
