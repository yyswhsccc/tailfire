'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useContactFilterOptions } from '@/hooks/use-contacts'
import { cn } from '@/lib/utils'
import type { ContactFilterDto } from '@tailfire/shared-types/api'

interface ContactsFilterPanelProps {
  filters: ContactFilterDto
  onFiltersChange: (filters: ContactFilterDto) => void
}

const STATUS_OPTIONS = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'traveling', label: 'Traveling' },
  { value: 'returned', label: 'Returned' },
  { value: 'awaiting_next', label: 'Awaiting Next' },
  { value: 'inactive', label: 'Inactive' },
]

export function ContactsFilterPanel({ filters, onFiltersChange }: ContactsFilterPanelProps) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const { data: filterOptions } = useContactFilterOptions()

  const activeFilterCount = [
    (filters.tags?.length ?? 0) > 0,
    !!filters.contactType,
    (filters.contactStatus?.length ?? 0) > 0,
    filters.isActive !== undefined,
    filters.hasPassport === true || filters.passportExpiring === true,
  ].filter(Boolean).length

  // Tags
  const handleTagToggle = (tagName: string) => {
    const current = filters.tags || []
    const updated = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName]
    onFiltersChange({ ...filters, tags: updated.length > 0 ? updated : undefined, page: 1 })
  }

  // Contact Type
  const handleContactTypeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      contactType: value === 'all' ? undefined : (value as 'lead' | 'client'),
      page: 1,
    })
  }

  // Contact Status
  const handleStatusToggle = (statusValue: string) => {
    const current = filters.contactStatus || []
    const updated = current.includes(statusValue)
      ? current.filter((s) => s !== statusValue)
      : [...current, statusValue]
    onFiltersChange({
      ...filters,
      contactStatus: updated.length > 0 ? updated : undefined,
      page: 1,
    })
  }

  // Active/Inactive
  const handleActiveChange = (value: string) => {
    if (value === 'active') {
      onFiltersChange({ ...filters, isActive: true, page: 1 })
    } else if (value === 'inactive') {
      onFiltersChange({ ...filters, isActive: false, page: 1 })
    } else {
      // "All" — remove isActive so API returns all contacts
      const { isActive: _removed, ...rest } = filters
      onFiltersChange({ ...rest, page: 1 })
    }
  }

  // Passport
  const handlePassportChange = (value: string) => {
    if (value === 'has') {
      onFiltersChange({ ...filters, hasPassport: true, passportExpiring: undefined, page: 1 })
    } else if (value === 'expiring') {
      onFiltersChange({ ...filters, hasPassport: undefined, passportExpiring: true, page: 1 })
    } else {
      onFiltersChange({ ...filters, hasPassport: undefined, passportExpiring: undefined, page: 1 })
    }
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

  // Derive current passport select value
  const passportValue = filters.passportExpiring ? 'expiring' : filters.hasPassport ? 'has' : 'all'

  // Derive current active select value
  const activeValue =
    filters.isActive === true ? 'active' : filters.isActive === false ? 'inactive' : 'all'

  return (
    <div className="flex flex-wrap items-center gap-2">

      {/* Contact Type */}
      <Select
        value={filters.contactType ?? 'all'}
        onValueChange={handleContactTypeChange}
      >
        <SelectTrigger
          className={cn(
            'h-8 w-[120px] text-xs',
            filters.contactType && 'border-phoenix-gold-500 bg-phoenix-gold-50'
          )}
        >
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="lead">Lead</SelectItem>
          <SelectItem value="client">Client</SelectItem>
        </SelectContent>
      </Select>

      {/* Contact Status (multi-select) */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 text-xs',
              (filters.contactStatus?.length ?? 0) > 0 && 'border-phoenix-gold-500 bg-phoenix-gold-50'
            )}
          >
            Status
            {(filters.contactStatus?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 text-xs">
                {filters.contactStatus!.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search status..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No status found.</CommandEmpty>
              <CommandGroup>
                {STATUS_OPTIONS.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => handleStatusToggle(opt.value)}
                    className="text-xs"
                  >
                    <Checkbox
                      checked={filters.contactStatus?.includes(opt.value) ?? false}
                      className="mr-2 h-3.5 w-3.5"
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Active / Inactive */}
      <Select value={activeValue} onValueChange={handleActiveChange}>
        <SelectTrigger
          className={cn(
            'h-8 w-[110px] text-xs',
            filters.isActive === false && 'border-phoenix-gold-500 bg-phoenix-gold-50'
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>

      {/* Passport */}
      <Select value={passportValue} onValueChange={handlePassportChange}>
        <SelectTrigger
          className={cn(
            'h-8 w-[140px] text-xs',
            (filters.hasPassport || filters.passportExpiring) && 'border-phoenix-gold-500 bg-phoenix-gold-50'
          )}
        >
          <SelectValue placeholder="Passport" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="has">Has Passport</SelectItem>
          <SelectItem value="expiring">Expiring Soon</SelectItem>
        </SelectContent>
      </Select>

      {/* Tags Filter (multi-select) */}
      {(filterOptions?.tags?.length ?? 0) > 0 && (
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-8 text-xs',
                (filters.tags?.length ?? 0) > 0 && 'border-phoenix-gold-500 bg-phoenix-gold-50'
              )}
            >
              Tags
              {(filters.tags?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 text-xs">
                  {filters.tags!.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tags..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandGroup>
                  {(filterOptions?.tags || []).map((tagName) => (
                    <CommandItem
                      key={tagName}
                      value={tagName}
                      onSelect={() => handleTagToggle(tagName)}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          filters.tags?.includes(tagName) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {tagName}
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
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear
          <Badge variant="secondary" className="ml-1.5 px-1.5 text-xs">
            {activeFilterCount}
          </Badge>
        </Button>
      )}
    </div>
  )
}
