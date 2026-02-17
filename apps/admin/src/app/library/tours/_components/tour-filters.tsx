'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CatalogTourFilters, CatalogFilterOptions } from '@/hooks/use-tour-library'

interface TourFiltersProps {
  filters: CatalogTourFilters
  filterOptions: CatalogFilterOptions | undefined
  isLoading: boolean
  onChange: (filters: Partial<CatalogTourFilters>) => void
  onSearch: (q: string) => void
}

export function TourFilters({
  filters,
  filterOptions,
  isLoading,
  onChange,
  onSearch,
}: TourFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.q ?? '')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchInput)
  }

  const handleSearchClear = () => {
    setSearchInput('')
    onSearch('')
  }

  const handleClearAll = () => {
    setSearchInput('')
    onChange({ operator: undefined, season: undefined, q: undefined })
  }

  const hasActiveFilters = !!(filters.operator || filters.q)

  return (
    <div className="bg-white border border-ash-200 rounded-lg p-4 space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ash-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by destination, tour name... (e.g. Danube, Italy)"
            className="pl-9 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ash-400 hover:text-ash-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Operator (Brand) */}
        <div className="w-40">
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={filters.operator ?? 'all'}
              onValueChange={(v) => onChange({ operator: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {filterOptions?.operators.map((op) => (
                  <SelectItem key={op.code} value={op.code}>
                    {op.name} ({op.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Season */}
        <div className="w-32">
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={filters.season ?? 'all'}
              onValueChange={(v) => onChange({ season: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Seasons</SelectItem>
                {filterOptions?.seasons.map((s) => (
                  <SelectItem key={s.season} value={s.season}>
                    {s.season} ({s.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Clear All */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-ash-500">
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>
    </div>
  )
}
