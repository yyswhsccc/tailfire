'use client'

import { useState, useEffect } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useContacts, useDeleteContact } from '@/hooks/use-contacts'
import { ContactsTable } from './_components/contacts-table'
import { QuickContactDialog } from './_components/quick-contact-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/hooks/use-toast'

export default function ContactsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const limit = 10

  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1) // Reset to page 1 when search changes
    }, 500)

    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, isLoading, error } = useContacts({
    page,
    limit,
    search: debouncedSearch || undefined
  })
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
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Input
              type="search"
              placeholder="Search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64"
            />
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
          <TableSkeleton rows={limit} />
        ) : !data?.data || data.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ash-500">
              {debouncedSearch ? `No contacts found matching "${debouncedSearch}"` : 'No contacts found'}
            </p>
            {!debouncedSearch && (
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ←
                  </Button>
                  <span className="text-sm text-ash-700">
                    {data.pagination.page}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= data.pagination.totalPages}
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
