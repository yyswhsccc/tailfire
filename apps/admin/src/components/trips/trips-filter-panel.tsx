'use client'

import { useState } from 'react'
import { X, Check, UserCircle, SlidersHorizontal } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTripFilterOptions } from '@/hooks/use-trips'
import { useUsers } from '@/hooks/use-users'
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
  const [tagsOpen, setTagsOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { data: filterOptions } = useTripFilterOptions()
  const { data: usersData } = useUsers({ status: 'active', limit: 100 })
  const users = usersData?.users ?? []

  const activeFilterCount = [
    filters.status,
    filters.tripType,
    filters.tripGroupId,
    filters.ownerId,
    filters.unassigned,
    filters.hasBookings,
    filters.isArchived !== undefined,
    (filters.tags?.length ?? 0) > 0,
    filters.startDateFrom || filters.startDateTo,
    filters.endDateFrom || filters.endDateTo,
    filters.createdAtFrom || filters.createdAtTo,
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

  const handleTagToggle = (tagName: string) => {
    const current = filters.tags || []
    const updated = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName]
    onFiltersChange({ ...filters, tags: updated.length > 0 ? updated : undefined, page: 1 })
  }

  const handleClearFilters = () => {
    onFiltersChange({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ownerId: undefined,
      unassigned: undefined,
      hasBookings: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      endDateFrom: undefined,
      endDateTo: undefined,
      createdAtFrom: undefined,
      createdAtTo: undefined,
      isArchived: undefined,
      primaryContactId: undefined,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {/* Tags Filter (multi-select) */}
      {(filterOptions?.tags?.length ?? 0) > 0 && (
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn((filters.tags?.length ?? 0) > 0 && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
            >
              Tags
              {(filters.tags?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5">
                  {filters.tags!.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandGroup>
                  {(filterOptions?.tags || []).map((tag) => (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => handleTagToggle(tag)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          filters.tags?.includes(tag) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Assigned Agent */}
      <Popover open={agentOpen} onOpenChange={setAgentOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('gap-1', filters.ownerId && 'border-blue-500 text-blue-700')}>
            <UserCircle className="h-4 w-4" />
            Agent
            {filters.ownerId && <span className="ml-1 rounded bg-blue-100 px-1 text-xs">{1}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-2" align="start">
          <Command>
            <CommandInput placeholder="Search agents..." />
            <CommandList>
              <CommandEmpty>No agents found</CommandEmpty>
              <CommandGroup>
                {users.map((user) => (
                  <CommandItem
                    key={user.id}
                    onSelect={() => {
                      onFiltersChange({ ...filters, ownerId: filters.ownerId === user.id ? undefined : user.id, unassigned: undefined, page: 1 })
                      setAgentOpen(false)
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', filters.ownerId === user.id ? 'opacity-100' : 'opacity-0')} />
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* More Filters Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setMoreOpen(!moreOpen)}
        className={cn(moreOpen && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
      >
        <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
        More
      </Button>

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

      {/* Expanded Filters */}
      {moreOpen && (
        <div className="w-full border-t border-ash-200 pt-3 mt-1 flex flex-wrap items-center gap-3">
          {/* Unassigned */}
          <label className="flex items-center gap-2 text-sm text-ash-700">
            <Checkbox
              checked={!!filters.unassigned}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, unassigned: checked ? true : undefined, ownerId: checked ? undefined : filters.ownerId, page: 1 })
              }
            />
            Unassigned
          </label>

          {/* Has Bookings */}
          <Select
            value={filters.hasBookings || 'any'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, hasBookings: value === 'any' ? undefined : value as 'yes' | 'no', page: 1 })
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue placeholder="Bookings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any Bookings</SelectItem>
              <SelectItem value="yes">Has Bookings</SelectItem>
              <SelectItem value="no">No Bookings</SelectItem>
            </SelectContent>
          </Select>

          {/* Show Archived */}
          <label className="flex items-center gap-2 text-sm text-ash-700">
            <Checkbox
              checked={filters.isArchived === true}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, isArchived: checked ? true : undefined, page: 1 })
              }
            />
            Archived
          </label>

          {/* Date Ranges */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
            {/* Start Date Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ash-500 w-16 flex-shrink-0">Departs:</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.startDateFrom || ''}
                onChange={(e) => onFiltersChange({ ...filters, startDateFrom: e.target.value || undefined, page: 1 })}
              />
              <span className="text-xs text-ash-400">&mdash;</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.startDateTo || ''}
                onChange={(e) => onFiltersChange({ ...filters, startDateTo: e.target.value || undefined, page: 1 })}
              />
            </div>

            {/* End Date Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ash-500 w-16 flex-shrink-0">Returns:</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.endDateFrom || ''}
                onChange={(e) => onFiltersChange({ ...filters, endDateFrom: e.target.value || undefined, page: 1 })}
              />
              <span className="text-xs text-ash-400">&mdash;</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.endDateTo || ''}
                onChange={(e) => onFiltersChange({ ...filters, endDateTo: e.target.value || undefined, page: 1 })}
              />
            </div>

            {/* Created Date Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ash-500 w-16 flex-shrink-0">Created:</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.createdAtFrom || ''}
                onChange={(e) => onFiltersChange({ ...filters, createdAtFrom: e.target.value || undefined, page: 1 })}
              />
              <span className="text-xs text-ash-400">&mdash;</span>
              <input
                type="date"
                className="h-8 rounded-md border border-ash-200 px-2 text-xs flex-1 min-w-0"
                value={filters.createdAtTo || ''}
                onChange={(e) => onFiltersChange({ ...filters, createdAtTo: e.target.value || undefined, page: 1 })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
