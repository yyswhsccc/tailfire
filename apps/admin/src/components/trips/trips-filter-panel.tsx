'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { useTripFilterOptions } from '@/hooks/use-trips'
import { cn } from '@/lib/utils'
import type { TripFilterDto } from '@tailfire/shared-types/api'
import { TRIP_STATUS_LABELS } from '@/lib/trip-status-constants'

interface TripsFilterPanelProps {
  filters: TripFilterDto
  onFiltersChange: (filters: TripFilterDto) => void
}

const TRIP_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  business: 'Business',
  group: 'Group',
  honeymoon: 'Honeymoon',
  corporate: 'Corporate',
  custom: 'Custom',
}

export function TripsFilterPanel({ filters, onFiltersChange }: TripsFilterPanelProps) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [tripTypeOpen, setTripTypeOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const { data: filterOptions } = useTripFilterOptions()

  const activeFilterCount = [
    filters.status,
    filters.tripType,
    filters.tripGroupId,
    filters.isArchived !== undefined,
  ].filter(Boolean).length

  const handleStatusSelect = (status: string) => {
    onFiltersChange({
      ...filters,
      status: filters.status === status ? undefined : status as TripFilterDto['status'],
      page: 1, // Reset to first page on filter change
    })
    setStatusOpen(false)
  }

  const handleTripTypeSelect = (tripType: string) => {
    onFiltersChange({
      ...filters,
      tripType: filters.tripType === tripType ? undefined : tripType as TripFilterDto['tripType'],
      page: 1,
    })
    setTripTypeOpen(false)
  }

  const handleGroupSelect = (groupId: string) => {
    onFiltersChange({
      ...filters,
      tripGroupId: filters.tripGroupId === groupId ? undefined : groupId,
      page: 1,
    })
    setGroupOpen(false)
  }

  const handleClearFilters = () => {
    onFiltersChange({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    })
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status Filter */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(filters.status && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
          >
            Status
            {filters.status && (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {TRIP_STATUS_LABELS[filters.status] || filters.status}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search status..." />
            <CommandList>
              <CommandEmpty>No status found.</CommandEmpty>
              <CommandGroup>
                {(filterOptions?.statuses || []).map((status) => (
                  <CommandItem
                    key={status}
                    value={status}
                    onSelect={() => handleStatusSelect(status)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        filters.status === status ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {TRIP_STATUS_LABELS[status] || status}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Trip Type Filter */}
      <Popover open={tripTypeOpen} onOpenChange={setTripTypeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(filters.tripType && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
          >
            Type
            {filters.tripType && (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {TRIP_TYPE_LABELS[filters.tripType] || filters.tripType}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search type..." />
            <CommandList>
              <CommandEmpty>No type found.</CommandEmpty>
              <CommandGroup>
                {(filterOptions?.tripTypes || []).map((type) => (
                  <CommandItem
                    key={type}
                    value={type}
                    onSelect={() => handleTripTypeSelect(type)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        filters.tripType === type ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {TRIP_TYPE_LABELS[type] || type}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Group Filter */}
      {(filterOptions?.groups?.length ?? 0) > 0 && (
        <Popover open={groupOpen} onOpenChange={setGroupOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(filters.tripGroupId && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
            >
              Group
              {filters.tripGroupId && (
                <Badge variant="secondary" className="ml-2 px-1.5">
                  {filterOptions?.groups?.find((g) => g.id === filters.tripGroupId)?.name || 'Selected'}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search group..." />
              <CommandList>
                <CommandEmpty>No group found.</CommandEmpty>
                <CommandGroup>
                  {(filterOptions?.groups || []).map((group) => (
                    <CommandItem
                      key={group.id}
                      value={group.name}
                      onSelect={() => handleGroupSelect(group.id)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          filters.tripGroupId === group.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {group.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear ({activeFilterCount})
        </Button>
      )}
    </div>
  )
}
