'use client'

import { useState } from 'react'
import { Building2, Plus, Loader2, AlertCircle, Search, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useSuppliers, useDeleteSupplier } from '@/hooks/use-suppliers'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { SupplierDialog } from './_components/supplier-dialog'
import type { SupplierDto } from '@tailfire/shared-types/api'

/**
 * Suppliers Library Page
 *
 * Manage suppliers (hotels, airlines, tour operators, cruise lines, etc.)
 * used in trip bookings and pricing.
 */
export default function SuppliersLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | null>(null)

  // Debounce search input
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
    setPage(1)
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSetSearch(value)
  }

  // Fetch suppliers
  const { data, isLoading, error } = useSuppliers({
    search: debouncedSearch || undefined,
    page,
    limit: 20,
  })

  const deleteSupplierMutation = useDeleteSupplier()

  const suppliers = data?.suppliers ?? []
  const totalPages = data?.totalPages ?? 1

  const handleNewSupplier = () => {
    setEditingSupplier(null)
    setIsDialogOpen(true)
  }

  const handleEditSupplier = (supplier: SupplierDto) => {
    setEditingSupplier(supplier)
    setIsDialogOpen(true)
  }

  const handleDeleteSupplier = async (supplier: SupplierDto) => {
    if (confirm(`Are you sure you want to delete "${supplier.name}"?`)) {
      await deleteSupplierMutation.mutateAsync(supplier.id)
    }
  }

  const getSupplierTypeBadge = (type: string | null) => {
    if (!type) return null
    const typeColors: Record<string, string> = {
      hotel: 'bg-blue-100 text-blue-800',
      airline: 'bg-purple-100 text-purple-800',
      tour_operator: 'bg-green-100 text-green-800',
      cruise_line: 'bg-cyan-100 text-cyan-800',
      transfer: 'bg-orange-100 text-orange-800',
      restaurant: 'bg-pink-100 text-pink-800',
      activity_provider: 'bg-yellow-100 text-yellow-800',
      insurance: 'bg-red-100 text-red-800',
      other: 'bg-gray-100 text-gray-800',
    }
    return (
      <Badge variant="secondary" className={typeColors[type] || typeColors.other}>
        {type.replace(/_/g, ' ')}
      </Badge>
    )
  }

  const formatCommission = (rate: string | null) => {
    if (!rate) return '-'
    return `${rate}%`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Suppliers</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Manage suppliers for hotels, airlines, tour operators, and other travel services
          </p>
        </div>
        <Button onClick={handleNewSupplier}>
          <Plus className="mr-2 h-4 w-4" />
          New Supplier
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search suppliers..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">Error loading suppliers</h3>
          <p className="mt-1 text-sm text-ash-500">{error.message}</p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
          <Building2 className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">
            {debouncedSearch ? 'No suppliers found' : 'No suppliers yet'}
          </h3>
          <p className="mt-1 text-sm text-ash-500">
            {debouncedSearch
              ? 'Try adjusting your search query'
              : 'Create your first supplier to get started'}
          </p>
          {!debouncedSearch && (
            <Button className="mt-4" onClick={handleNewSupplier}>
              <Plus className="mr-2 h-4 w-4" />
              Create Supplier
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="border border-ash-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id} className={!supplier.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{supplier.name}</span>
                        {supplier.contactInfo?.email && (
                          <p className="text-xs text-muted-foreground">
                            {supplier.contactInfo.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getSupplierTypeBadge(supplier.supplierType)}</TableCell>
                    <TableCell>
                      <span className="text-sm">{formatCommission(supplier.defaultCommissionRate)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {supplier.isPreferred && (
                          <Badge variant="outline" className="border-yellow-400 text-yellow-700 bg-yellow-50">
                            Preferred
                          </Badge>
                        )}
                        {!supplier.isActive && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSupplier(supplier)}
                          disabled={deleteSupplierMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({data?.total ?? 0} suppliers)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Supplier Dialog */}
      <SupplierDialog
        supplier={editingSupplier}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  )
}
