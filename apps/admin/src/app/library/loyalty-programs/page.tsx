'use client'

import { useState } from 'react'
import { Award, Plus, Loader2, AlertCircle, Search, Pencil, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useLoyaltyProgramsCatalog,
  useDeleteLoyaltyProgramCatalog,
} from '@/hooks/use-loyalty-programs-catalog'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { LoyaltyProgramCatalogDialog } from './loyalty-program-dialog'
import type { LoyaltyProgramCatalogDto } from '@tailfire/shared-types/api'

const TYPE_BADGE_COLORS: Record<string, string> = {
  cruise: 'bg-cyan-100 text-cyan-800',
  airline: 'bg-purple-100 text-purple-800',
  hotel: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function LoyaltyProgramsLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgramCatalogDto | null>(null)

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
    setPage(1)
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSetSearch(value)
  }

  const { data, isLoading, error } = useLoyaltyProgramsCatalog({
    search: debouncedSearch || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    page,
    limit: 20,
  })

  const deleteMutation = useDeleteLoyaltyProgramCatalog()

  const programs = data?.programs ?? []
  const totalPages = data?.totalPages ?? 1

  const handleNew = () => {
    setEditingProgram(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (program: LoyaltyProgramCatalogDto) => {
    setEditingProgram(program)
    setIsDialogOpen(true)
  }

  const handleDelete = async (program: LoyaltyProgramCatalogDto) => {
    if (confirm(`Are you sure you want to deactivate "${program.providerName} — ${program.programName}"?`)) {
      await deleteMutation.mutateAsync(program.id)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Award className="h-8 w-8 text-phoenix-gold-600" />
            <h1 className="text-2xl font-bold text-ash-900">Loyalty Programs</h1>
          </div>
          <p className="mt-1 text-sm text-ash-500">
            Manage loyalty and rewards programs for cruise lines, airlines, and hotels
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Program
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search programs..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="cruise">Cruise</SelectItem>
            <SelectItem value="airline">Airline</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ash-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">Error loading programs</h3>
          <p className="mt-1 text-sm text-ash-500">{error.message}</p>
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-ash-200 rounded-lg">
          <Award className="mx-auto h-12 w-12 text-ash-400" />
          <h3 className="mt-2 text-sm font-medium text-ash-900">
            {debouncedSearch || typeFilter !== 'all' ? 'No programs found' : 'No loyalty programs yet'}
          </h3>
          <p className="mt-1 text-sm text-ash-500">
            {debouncedSearch || typeFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Add loyalty programs to your catalog'}
          </p>
          {!debouncedSearch && typeFilter === 'all' && (
            <Button className="mt-4" onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Program
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="border border-ash-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Program Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((program) => (
                  <TableRow key={program.id} className={!program.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <span className="font-medium">{program.providerName}</span>
                    </TableCell>
                    <TableCell>{program.programName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={TYPE_BADGE_COLORS[program.programType] || TYPE_BADGE_COLORS.other}
                      >
                        {program.programType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!program.isActive && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(program)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(program)}
                          disabled={deleteMutation.isPending || !program.isActive}
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
                Page {page} of {totalPages} ({data?.total ?? 0} programs)
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

      {/* Dialog */}
      <LoyaltyProgramCatalogDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        program={editingProgram}
      />
    </div>
  )
}
