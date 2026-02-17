'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown, ChevronUp, Filter, Check, ChevronsUpDown, Anchor } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { Slider } from '@/components/ui/slider'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Combobox } from '@/components/ui/combobox'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import type { SailingSearchFilters, SailingFiltersResponse, CabinCategory } from '@/hooks/use-cruise-library'

interface CruiseFiltersProps {
  filters: SailingSearchFilters
  filterOptions: SailingFiltersResponse | undefined
  isLoading: boolean
  onChange: (filters: Partial<SailingSearchFilters>) => void
}

const DURATION_OPTIONS = [
  { value: 'any', label: 'Any Duration', min: undefined, max: undefined },
  { value: '1-3', label: '1-3 Nights', min: 1, max: 3 },
  { value: '4-6', label: '4-6 Nights', min: 4, max: 6 },
  { value: '7-9', label: '7-9 Nights', min: 7, max: 9 },
  { value: '10-14', label: '10-14 Nights', min: 10, max: 14 },
  { value: '15+', label: '15+ Nights', min: 15, max: undefined },
]

export function CruiseFilters({
  filters,
  filterOptions,
  isLoading,
  onChange,
}: CruiseFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.q ?? '')
  const [portsPopoverOpen, setPortsPopoverOpen] = useState(false)

  // Live debounced search
  const debouncedSearch = useDebounce(searchInput, 300)
  const prevDebouncedRef = useRef(debouncedSearch)

  useEffect(() => {
    // Only fire when debounced value actually changes
    if (debouncedSearch === prevDebouncedRef.current) return
    prevDebouncedRef.current = debouncedSearch

    const newQ = debouncedSearch || undefined
    if (newQ !== filters.q) {
      onChange({ q: newQ })
    }
  }, [debouncedSearch, filters.q, onChange])

  // Count only Tier 3 filters for "More Filters (N)" badge
  const tier3FilterCount = [
    filters.disembarkPortId,
    filters.portOfCallIds && filters.portOfCallIds.length > 0,
    filters.priceMinCents !== undefined || filters.priceMaxCents !== undefined,
  ].filter(Boolean).length

  // Handle cabin category change
  const handleCabinCategoryChange = (value: string) => {
    onChange({ cabinCategory: value === 'all' ? undefined : value as CabinCategory })
  }

  const handleSearchClear = () => {
    setSearchInput('')
    prevDebouncedRef.current = ''
    onChange({ q: undefined })
  }

  // Count all active filters for badge display (after handleSearchClear is defined)
  const allActiveFilters = getActiveFilterBadges(filters, filterOptions, onChange, handleSearchClear)

  const handleDurationChange = (value: string) => {
    const option = DURATION_OPTIONS.find((o) => o.value === value)
    if (option) {
      onChange({
        nightsMin: option.min,
        nightsMax: option.max,
      })
    }
  }

  const handleClearAll = () => {
    setSearchInput('')
    prevDebouncedRef.current = ''
    onChange({
      q: undefined,
      cruiseLineId: undefined,
      shipId: undefined,
      regionId: undefined,
      embarkPortId: undefined,
      disembarkPortId: undefined,
      sailDateFrom: undefined,
      sailDateTo: undefined,
      nightsMin: undefined,
      nightsMax: undefined,
      priceMinCents: undefined,
      priceMaxCents: undefined,
      portOfCallIds: undefined,
      cabinCategory: undefined,
    })
  }

  // Handle ports of call selection toggle
  const handlePortOfCallToggle = (port: { id: string; allIds?: string[] }) => {
    const currentPorts = filters.portOfCallIds ?? []
    const portIds = port.allIds ?? [port.id]
    const isSelected = portIds.some(id => currentPorts.includes(id))

    let newPorts: string[]
    if (isSelected) {
      newPorts = currentPorts.filter(id => !portIds.includes(id))
    } else {
      newPorts = [...currentPorts, ...portIds]
    }

    onChange({ portOfCallIds: newPorts.length > 0 ? newPorts : undefined })
  }

  const isPortSelected = (port: { id: string; allIds?: string[] }): boolean => {
    const currentPorts = filters.portOfCallIds ?? []
    const portIds = port.allIds ?? [port.id]
    return portIds.some(id => currentPorts.includes(id))
  }

  const getSelectedPortNames = (): string => {
    const selected = filters.portOfCallIds ?? []
    if (selected.length === 0) return 'Select ports...'
    const selectedPorts = (filterOptions?.portsOfCall ?? []).filter(p => isPortSelected(p))
    if (selectedPorts.length === 0) return 'Select ports...'
    if (selectedPorts.length === 1) return selectedPorts[0]?.name ?? '1 port'
    return `${selectedPorts.length} ports selected`
  }

  const formatPriceDollars = (cents: number): string => {
    return `$${Math.round(cents / 100).toLocaleString()}`
  }

  const getPriceRangeValues = (): [number, number] => {
    const minPrice = filterOptions?.priceRange?.min ?? 0
    const maxPrice = filterOptions?.priceRange?.max ?? 1000000
    return [
      filters.priceMinCents ?? minPrice,
      filters.priceMaxCents ?? maxPrice,
    ]
  }

  const handlePriceRangeChange = (values: number[]) => {
    const minPrice = filterOptions?.priceRange?.min ?? 0
    const maxPrice = filterOptions?.priceRange?.max ?? 1000000
    const newMin = values[0] === minPrice ? undefined : values[0]
    const newMax = values[1] === maxPrice ? undefined : values[1]
    onChange({ priceMinCents: newMin, priceMaxCents: newMax })
  }

  const getCurrentDuration = (): string => {
    const { nightsMin, nightsMax } = filters
    if (nightsMin === undefined && nightsMax === undefined) return 'any'
    const option = DURATION_OPTIONS.find(
      (o) => o.min === nightsMin && o.max === nightsMax
    )
    return option?.value ?? 'any'
  }

  // Build combobox options
  const shipOptions = (filterOptions?.ships ?? []).map(s => ({
    value: s.id,
    label: s.count !== undefined ? `${s.name} (${s.count})` : s.name,
  }))

  const embarkPortOptions = (filterOptions?.embarkPorts ?? []).map(p => ({
    value: p.id,
    label: p.count !== undefined ? `${p.name} (${p.count})` : p.name,
  }))

  const disembarkPortOptions = (filterOptions?.disembarkPorts ?? []).map(p => ({
    value: p.id,
    label: p.count !== undefined ? `${p.name} (${p.count})` : p.name,
  }))

  return (
    <div className="bg-white border border-ash-200 rounded-lg p-4 space-y-3">
      {/* ── TIER 1: Quick Find ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-ash-500 mb-1 block">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ash-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by cruise name, ship, port..."
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
        </div>

        {/* Ship (Combobox with type-ahead) */}
        <div className="w-56">
          <Label className="text-xs text-ash-500 mb-1 block">Ship</Label>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Combobox
              options={shipOptions}
              value={filters.shipId ?? null}
              onValueChange={(v) => onChange({ shipId: v ?? undefined })}
              placeholder="All Ships"
              searchPlaceholder="Search ships..."
              emptyText="No ships found."
            />
          )}
        </div>

        {/* Date From */}
        <div className="w-40">
          <Label className="text-xs text-ash-500 mb-1 block">Departs From</Label>
          <DatePickerEnhanced
            value={filters.sailDateFrom ?? null}
            onChange={(date) => onChange({ sailDateFrom: date || undefined })}
            placeholder="Any date"
            minDate={filterOptions?.dateRange.min ?? undefined}
            maxDate={filterOptions?.dateRange.max ?? undefined}
          />
        </div>

        {/* Date To */}
        <div className="w-40">
          <Label className="text-xs text-ash-500 mb-1 block">Departs To</Label>
          <DatePickerEnhanced
            value={filters.sailDateTo ?? null}
            onChange={(date) => onChange({ sailDateTo: date || undefined })}
            placeholder="Any date"
            minDate={filters.sailDateFrom ?? filterOptions?.dateRange.min ?? undefined}
            maxDate={filterOptions?.dateRange.max ?? undefined}
          />
        </div>
      </div>

      {/* ── TIER 2: Common Filters ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-ash-100">
        {/* Cruise Line */}
        <div className="w-40">
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={filters.cruiseLineId ?? 'all'}
              onValueChange={(v) => onChange({ cruiseLineId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Cruise Line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cruise Lines</SelectItem>
                {filterOptions?.cruiseLines.map((line) => (
                  <SelectItem key={line.id} value={line.id}>
                    {line.name}
                    {line.count !== undefined && (
                      <span className="ml-1 text-ash-400">({line.count})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Region */}
        <div className="w-40">
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={filters.regionId ?? 'all'}
              onValueChange={(v) => onChange({ regionId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {filterOptions?.regions.map((region) => (
                  <SelectItem key={region.id} value={region.id}>
                    {region.name}
                    {region.count !== undefined && (
                      <span className="ml-1 text-ash-400">({region.count})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Duration */}
        <div className="w-36">
          <Select value={getCurrentDuration()} onValueChange={handleDurationChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Departure Port (Combobox) */}
        <div className="w-48">
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Combobox
              options={embarkPortOptions}
              value={filters.embarkPortId ?? null}
              onValueChange={(v) => onChange({ embarkPortId: v ?? undefined })}
              placeholder="Departure Port"
              searchPlaceholder="Search ports..."
              emptyText="No ports found."
            />
          )}
        </div>

        {/* Cabin Type (Tabs - compact) */}
        <div>
          <Tabs
            value={filters.cabinCategory ?? 'all'}
            onValueChange={handleCabinCategoryChange}
            className="w-auto"
          >
            <TabsList className="h-9 bg-ash-100">
              <TabsTrigger value="all" className="text-xs px-3">All</TabsTrigger>
              <TabsTrigger value="inside" className="text-xs px-3">Inside</TabsTrigger>
              <TabsTrigger value="oceanview" className="text-xs px-3">Ocean</TabsTrigger>
              <TabsTrigger value="balcony" className="text-xs px-3">Balcony</TabsTrigger>
              <TabsTrigger value="suite" className="text-xs px-3">Suite</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* More Filters Toggle Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="tier3-filters"
          className={cn(
            'gap-1.5 h-9',
            tier3FilterCount > 0 && 'border-phoenix-gold-500 text-phoenix-gold-600'
          )}
        >
          <Filter className="h-4 w-4" />
          More Filters
          {tier3FilterCount > 0 && (
            <span className="ml-1 bg-phoenix-gold-100 text-phoenix-gold-700 text-xs px-1.5 py-0.5 rounded-full">
              {tier3FilterCount}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* ── TIER 3: More Filters (collapsed, full-width outside flex) ─── */}
      {isExpanded && (
        <div id="tier3-filters" className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-ash-100">
          {/* Return Port (Combobox) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Return Port</Label>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Combobox
                options={disembarkPortOptions}
                value={filters.disembarkPortId ?? null}
                onValueChange={(v) => onChange({ disembarkPortId: v ?? undefined })}
                placeholder="All Ports"
                searchPlaceholder="Search ports..."
                emptyText="No ports found."
              />
            )}
          </div>

          {/* Ports of Call (Multi-select) */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs flex items-center gap-1">
              <Anchor className="h-3 w-3" />
              Ports of Call
            </Label>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Popover open={portsPopoverOpen} onOpenChange={setPortsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={portsPopoverOpen}
                    className={cn(
                      'w-full justify-between font-normal',
                      (filters.portOfCallIds?.length ?? 0) > 0 && 'border-phoenix-gold-500'
                    )}
                  >
                    <span className="truncate">{getSelectedPortNames()}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search ports..." />
                    <CommandList>
                      <CommandEmpty>No ports found.</CommandEmpty>
                      <CommandGroup>
                        {filterOptions?.portsOfCall?.map((port) => {
                          const selected = isPortSelected(port)
                          return (
                            <CommandItem
                              key={port.id}
                              value={port.name}
                              onSelect={() => handlePortOfCallToggle(port)}
                            >
                              <div
                                className={cn(
                                  'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                  selected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'opacity-50 [&_svg]:invisible'
                                )}
                              >
                                <Check className="h-3 w-3" />
                              </div>
                              <span className="truncate">{port.name}</span>
                              {port.count !== undefined && (
                                <span className="ml-auto text-xs text-ash-400">
                                  ({port.count})
                                </span>
                              )}
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {(filters.portOfCallIds?.length ?? 0) > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => onChange({ portOfCallIds: undefined })}
                      >
                        Clear selection
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Price Range Slider */}
          <div className="space-y-1.5">
            {filterOptions?.priceRange?.min != null && filterOptions?.priceRange?.max != null && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Price Range</Label>
                  <span className="text-xs text-ash-500">
                    {formatPriceDollars(getPriceRangeValues()[0])} - {formatPriceDollars(getPriceRangeValues()[1])}
                  </span>
                </div>
                <Slider
                  value={getPriceRangeValues()}
                  onValueCommit={handlePriceRangeChange}
                  min={filterOptions.priceRange.min}
                  max={filterOptions.priceRange.max}
                  step={10000}
                  className="w-full"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Active Filter Badges ──────────────────────────────────── */}
      {allActiveFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-ash-100">
          {allActiveFilters.map((badge) => (
            <Badge
              key={badge.key}
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive gap-1 pr-1"
              onClick={badge.onClear}
            >
              {badge.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          {allActiveFilters.length >= 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-xs text-ash-500 h-6 px-2"
            >
              Clear All
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper: Build active filter badge descriptors ──────────────────
interface FilterBadge {
  key: string
  label: string
  onClear: () => void
}

function getActiveFilterBadges(
  filters: SailingSearchFilters,
  filterOptions: SailingFiltersResponse | undefined,
  onChange: (filters: Partial<SailingSearchFilters>) => void,
  onSearchClear: () => void,
): FilterBadge[] {
  const badges: FilterBadge[] = []

  if (filters.q) {
    badges.push({ key: 'q', label: `Search: ${filters.q}`, onClear: onSearchClear })
  }
  if (filters.cruiseLineId) {
    const name = filterOptions?.cruiseLines.find(l => l.id === filters.cruiseLineId)?.name ?? 'Selected'
    badges.push({ key: 'cruiseLine', label: `Line: ${name}`, onClear: () => onChange({ cruiseLineId: undefined }) })
  }
  if (filters.shipId) {
    const name = filterOptions?.ships.find(s => s.id === filters.shipId)?.name ?? 'Selected'
    badges.push({ key: 'ship', label: `Ship: ${name}`, onClear: () => onChange({ shipId: undefined }) })
  }
  if (filters.regionId) {
    const name = filterOptions?.regions.find(r => r.id === filters.regionId)?.name ?? 'Selected'
    badges.push({ key: 'region', label: `Region: ${name}`, onClear: () => onChange({ regionId: undefined }) })
  }
  if (filters.embarkPortId) {
    const name = filterOptions?.embarkPorts.find(p => p.id === filters.embarkPortId)?.name ?? 'Selected'
    badges.push({ key: 'embarkPort', label: `Depart: ${name}`, onClear: () => onChange({ embarkPortId: undefined }) })
  }
  if (filters.disembarkPortId) {
    const name = filterOptions?.disembarkPorts?.find(p => p.id === filters.disembarkPortId)?.name ?? 'Selected'
    badges.push({ key: 'disembarkPort', label: `Return: ${name}`, onClear: () => onChange({ disembarkPortId: undefined }) })
  }
  if (filters.sailDateFrom) {
    badges.push({ key: 'dateFrom', label: `Date From: ${filters.sailDateFrom}`, onClear: () => onChange({ sailDateFrom: undefined }) })
  }
  if (filters.sailDateTo) {
    badges.push({ key: 'dateTo', label: `Date To: ${filters.sailDateTo}`, onClear: () => onChange({ sailDateTo: undefined }) })
  }
  if (filters.nightsMin !== undefined || filters.nightsMax !== undefined) {
    const min = filters.nightsMin ?? 'any'
    const max = filters.nightsMax ?? 'any'
    badges.push({ key: 'duration', label: `Nights: ${min}-${max}`, onClear: () => onChange({ nightsMin: undefined, nightsMax: undefined }) })
  }
  if (filters.cabinCategory) {
    badges.push({ key: 'cabin', label: `Cabin: ${filters.cabinCategory}`, onClear: () => onChange({ cabinCategory: undefined }) })
  }
  if (filters.portOfCallIds && filters.portOfCallIds.length > 0) {
    // Count unique port names (not IDs) since one port can have multiple IDs
    const selectedPorts = (filterOptions?.portsOfCall ?? []).filter(p => {
      const portIds = p.allIds ?? [p.id]
      return portIds.some(id => filters.portOfCallIds!.includes(id))
    })
    // Fall back to deduped ID count if filterOptions not loaded yet
    const count = selectedPorts.length || new Set(filters.portOfCallIds).size
    badges.push({ key: 'portsOfCall', label: `Ports of Call: ${count} selected`, onClear: () => onChange({ portOfCallIds: undefined }) })
  }
  if (filters.priceMinCents !== undefined || filters.priceMaxCents !== undefined) {
    const min = filters.priceMinCents !== undefined ? `$${Math.round(filters.priceMinCents / 100)}` : 'min'
    const max = filters.priceMaxCents !== undefined ? `$${Math.round(filters.priceMaxCents / 100)}` : 'max'
    badges.push({ key: 'price', label: `Price: ${min}-${max}`, onClear: () => onChange({ priceMinCents: undefined, priceMaxCents: undefined }) })
  }

  return badges
}
