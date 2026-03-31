'use client'

import { useState, useMemo, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useVacationGateways,
  useVacationDestinations,
  type VacationSearchParams,
} from '@/hooks/use-vacation-library'

// ============================================================================
// Types
// ============================================================================

interface VacationSearchFormProps {
  onSearch: (params: VacationSearchParams) => void
  isSearching: boolean
  defaults?: {
    startDate?: string    // ISO YYYY-MM-DD
    travelers?: number
    gateway?: string      // airport code
  }
}

// ============================================================================
// Constants
// ============================================================================

const DURATION_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 14, 21]

// ============================================================================
// Component
// ============================================================================

export function VacationSearchForm({ onSearch, isSearching, defaults }: VacationSearchFormProps) {
  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------
  const [gateway, setGateway] = useState<string | null>(defaults?.gateway ?? null)
  const [gatewayId, setGatewayId] = useState<string | null>(null)
  const [destination, setDestination] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(defaults?.startDate ?? null)
  const [duration, setDuration] = useState('7')
  const [adults, setAdults] = useState(String(defaults?.travelers ?? 2))
  const [rooms, setRooms] = useState('1')
  const [allInclusive, setAllInclusive] = useState(true)

  // ---------------------------------------------------------------------------
  // Data hooks
  // ---------------------------------------------------------------------------
  const { data: gateways } = useVacationGateways()
  const { data: destinations } = useVacationDestinations(gatewayId ?? undefined)

  // ---------------------------------------------------------------------------
  // Derived options
  // ---------------------------------------------------------------------------
  const gatewayOptions = useMemo(
    () =>
      (gateways ?? []).map((g) => ({
        value: g.airportCode,
        label: `${g.name} (${g.airportCode})`,
      })),
    [gateways]
  )

  const destinationOptions = useMemo(
    () => {
      // Group by name to deduplicate (e.g., "Bahamas" with IDs 25 and 188)
      // Join provider IDs with commas so VCO searches all sub-destinations
      const byName = new Map<string, string[]>()
      for (const d of destinations ?? []) {
        const existing = byName.get(d.name)
        if (existing) {
          existing.push(d.providerIdentifier)
        } else {
          byName.set(d.name, [d.providerIdentifier])
        }
      }
      return Array.from(byName.entries()).map(([name, ids]) => ({
        value: ids.join(','),
        label: name,
      }))
    },
    [destinations]
  )

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleGatewayChange = useCallback(
    (airportCode: string | null) => {
      setGateway(airportCode)
      // Reset destination when gateway changes
      setDestination(null)

      // Look up the UUID id for the selected gateway to pass to useVacationDestinations
      if (airportCode && gateways) {
        const selected = gateways.find((g) => g.airportCode === airportCode)
        setGatewayId(selected?.id ?? null)
      } else {
        setGatewayId(null)
      }
    },
    [gateways]
  )

  const handleSearch = useCallback(() => {
    if (!gateway || !destination || !date) return

    // Convert ISO date (YYYY-MM-DD) to YYYYMMDD format
    const dateDep = date.replace(/-/g, '')

    onSearch({
      gatewayCode: gateway,
      destDep: destination,
      dateDep,
      duration,
      nbAdults: Number(adults),
      nbRooms: Number(rooms),
      allInclusive,
    })
  }, [gateway, destination, date, duration, adults, rooms, allInclusive, onSearch])

  const canSearch = gateway && destination && date && !isSearching

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Row 1: Gateway, Destination, Date, Duration */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Gateway</Label>
          <Combobox
            options={gatewayOptions}
            value={gateway}
            onValueChange={handleGatewayChange}
            placeholder="Select departure..."
            searchPlaceholder="Search airports..."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Destination</Label>
          <Combobox
            options={destinationOptions}
            value={destination}
            onValueChange={setDestination}
            placeholder="Select destination..."
            searchPlaceholder="Search destinations..."
            disabled={!gatewayId}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Departure Date</Label>
          <DatePickerEnhanced
            value={date}
            onChange={setDate}
            placeholder="YYYY-MM-DD"
            minDate={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue placeholder="Nights" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} nights
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Adults, Rooms, All-Inclusive, Search */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Adults</Label>
          <Select value={adults} onValueChange={setAdults}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Rooms</Label>
          <Select value={rooms} onValueChange={setRooms}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="all-inclusive"
            checked={allInclusive}
            onCheckedChange={setAllInclusive}
          />
          <Label htmlFor="all-inclusive" className="cursor-pointer">
            All-Inclusive
          </Label>
        </div>

        <div className="flex-1" />

        <Button
          onClick={handleSearch}
          disabled={!canSearch}
          className="gap-2"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </div>
    </div>
  )
}
