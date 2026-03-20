'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Loader2, Car, AlertCircle, Clock, Users, Briefcase, ArrowUpDown, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { AirportAutocomplete } from '@/components/ui/airport-autocomplete'
import { LocationAutocomplete } from '@/components/location-autocomplete'
import type { GeoLocation } from '@tailfire/shared-types/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTransferSearch } from '@/hooks/use-external-apis'
import type { NormalizedTransferResult, TransferLocationType } from '@tailfire/shared-types'
import { cn } from '@/lib/utils'

const ALL_PLACE_TYPES: string[] = []

type SortOption = 'price-asc' | 'price-desc' | 'duration' | 'passengers'

interface TransferSearchPanelProps {
  onSelect: (transfer: NormalizedTransferResult) => void
  defaultPickupAddress?: string
  defaultDropoffAddress?: string
  defaultDate?: string
  defaultTime?: string
  tripCurrency?: string
  className?: string
}

function formatDuration(iso?: string): string {
  if (!iso) return ''
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return iso.replace('PT', '').toLowerCase()
  const h = match[1] ? `${match[1]}h` : ''
  const m = match[2] ? `${match[2]}m` : ''
  return `${h}${h && m ? ' ' : ''}${m}` || iso.replace('PT', '').toLowerCase()
}

function parseDurationMinutes(iso?: string): number {
  if (!iso) return 9999
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return 9999
  return (parseInt(match[1] || '0') * 60) + parseInt(match[2] || '0')
}

export function TransferSearchPanel({
  onSelect,
  defaultPickupAddress = '',
  defaultDropoffAddress = '',
  defaultDate = '',
  defaultTime = '',
  tripCurrency,
  className,
}: TransferSearchPanelProps) {
  const [pickupType, setPickupType] = useState<TransferLocationType>('airport')
  const [pickupCode, setPickupCode] = useState('')
  const [pickupAddress, setPickupAddress] = useState(defaultPickupAddress)
  const [pickupLocation, setPickupLocation] = useState<GeoLocation | null>(null)
  const [dropoffType, setDropoffType] = useState<TransferLocationType>('hotel')
  const [dropoffCode, setDropoffCode] = useState('')
  const [dropoffAddress, setDropoffAddress] = useState(defaultDropoffAddress)
  const [dropoffLocation, setDropoffLocation] = useState<GeoLocation | null>(null)

  // Currency conversion cache: maps "EUR" -> rate to tripCurrency
  const [fxRates, setFxRates] = useState<Record<string, number>>({})
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState(defaultTime || '10:00')
  const [passengers, setPassengers] = useState('2')
  const [searchEnabled, setSearchEnabled] = useState(false)

  // Filtering & sorting
  const [vehicleFilter, setVehicleFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('price-asc')

  const { data, isLoading, error } = useTransferSearch(
    {
      pickupType,
      pickupCode: pickupCode || undefined,
      pickupAddress: pickupAddress || undefined,
      pickupLat: pickupLocation?.lat,
      pickupLng: pickupLocation?.lng,
      pickupCountryCode: pickupLocation?.countryCode,
      dropoffType,
      dropoffCode: dropoffCode || undefined,
      dropoffAddress: dropoffAddress || undefined,
      dropoffLat: dropoffLocation?.lat,
      dropoffLng: dropoffLocation?.lng,
      dropoffCountryCode: dropoffLocation?.countryCode,
      date,
      time,
      passengers: parseInt(passengers, 10),
    },
    { enabled: searchEnabled }
  )

  const canSearch = date && time && (pickupCode || pickupAddress) && (dropoffCode || dropoffAddress)

  const handleSearch = () => {
    if (canSearch) {
      setVehicleFilter('all')
      setSearchEnabled(true)
    }
  }

  const handleSelect = (transfer: NormalizedTransferResult) => {
    onSelect(transfer)
    setSearchEnabled(false)
  }

  // Derive unique vehicle types for filter
  const vehicleTypes = useMemo(() => {
    if (!data?.results) return []
    const types = new Set(data.results.map(t => t.vehicle.type))
    return Array.from(types).sort()
  }, [data?.results])

  // Filtered and sorted results
  const filteredResults = useMemo(() => {
    if (!data?.results) return []
    let results = [...data.results]

    if (vehicleFilter !== 'all') {
      results = results.filter(t => t.vehicle.type === vehicleFilter)
    }

    results.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return parseFloat(a.price.total) - parseFloat(b.price.total)
        case 'price-desc':
          return parseFloat(b.price.total) - parseFloat(a.price.total)
        case 'duration':
          return parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration)
        case 'passengers':
          return b.vehicle.maxPassengers - a.vehicle.maxPassengers
        default:
          return 0
      }
    })

    return results
  }, [data?.results, vehicleFilter, sortBy])

  const hasResults = filteredResults.length > 0
  const totalResults = data?.results?.length || 0

  // Fetch FX rates for provider currencies that differ from trip currency
  const fetchFxRates = useCallback(async (currencies: string[]) => {
    if (!tripCurrency) return
    const newRates: Record<string, number> = {}
    for (const cur of currencies) {
      if (cur === tripCurrency) continue
      try {
        const resp = await api.get<{ rate: string }>(
          `/exchange-rates/${cur}/${tripCurrency}`
        )
        newRates[cur] = parseFloat(resp.rate)
      } catch {
        // silently skip — will show original currency
      }
    }
    if (Object.keys(newRates).length > 0) {
      setFxRates(prev => ({ ...prev, ...newRates }))
    }
  }, [tripCurrency])

  useEffect(() => {
    if (!data?.results?.length || !tripCurrency) return
    const currencies = [...new Set(data.results.map(t => t.price.currency))]
    const needFetch = currencies.filter(c => c !== tripCurrency && !fxRates[c])
    if (needFetch.length > 0) fetchFxRates(needFetch)
  }, [data?.results, tripCurrency, fxRates, fetchFxRates])

  // Helper to format price with optional conversion
  const formatPrice = (currency: string, total: string) => {
    const amount = parseFloat(total)
    if (!tripCurrency || currency === tripCurrency || !fxRates[currency]) {
      return `${currency} ${amount.toFixed(2)}`
    }
    const converted = amount * fxRates[currency]
    return `~${tripCurrency} ${converted.toFixed(2)}`
  }

  const formatPriceSubtext = (currency: string, total: string) => {
    if (!tripCurrency || currency === tripCurrency || !fxRates[currency]) return null
    return `${currency} ${parseFloat(total).toFixed(2)}`
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Pickup */}
      <div className="grid grid-cols-3 gap-2">
        <Select value={pickupType} onValueChange={(v) => { setPickupType(v as TransferLocationType); setSearchEnabled(false) }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="airport">Airport</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="address">Address</SelectItem>
          </SelectContent>
        </Select>
        {pickupType === 'airport' ? (
          <AirportAutocomplete
            value={pickupCode || null}
            onValueChange={(code) => { setPickupCode(code || ''); setSearchEnabled(false) }}
            placeholder="Search airport..."
            className="col-span-2"
          />
        ) : (
          <LocationAutocomplete
            value={pickupLocation}
            onChange={(loc) => { setPickupLocation(loc); setPickupAddress(loc?.name || ''); setSearchEnabled(false) }}
            placeholder="Search pickup location..."
            types={ALL_PLACE_TYPES}
            className="col-span-2"
          />
        )}
      </div>

      {/* Dropoff */}
      <div className="grid grid-cols-3 gap-2">
        <Select value={dropoffType} onValueChange={(v) => { setDropoffType(v as TransferLocationType); setSearchEnabled(false) }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="airport">Airport</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="address">Address</SelectItem>
          </SelectContent>
        </Select>
        {dropoffType === 'airport' ? (
          <AirportAutocomplete
            value={dropoffCode || null}
            onValueChange={(code) => { setDropoffCode(code || ''); setSearchEnabled(false) }}
            placeholder="Search airport..."
            className="col-span-2"
          />
        ) : (
          <LocationAutocomplete
            value={dropoffLocation}
            onChange={(loc) => { setDropoffLocation(loc); setDropoffAddress(loc?.name || ''); setSearchEnabled(false) }}
            placeholder="Search dropoff location..."
            types={ALL_PLACE_TYPES}
            className="col-span-2"
          />
        )}
      </div>

      {/* Date/Time/Passengers */}
      <div className="grid grid-cols-3 gap-2">
        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSearchEnabled(false) }} min="1900-01-01" max="2099-12-31" />
        <TimePicker value={time || null} onChange={(t) => { setTime(t || ''); setSearchEnabled(false) }} placeholder="Time" />
        <Input type="number" min={1} max={20} value={passengers} onChange={(e) => { setPassengers(e.target.value); setSearchEnabled(false) }} placeholder="Pax" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSearch}
        disabled={!canSearch || isLoading}
        className="w-full"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
        Search Transfers
      </Button>

      {error && !isLoading && (
        <div className="p-3 text-center text-sm text-gray-600">
          <AlertCircle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
          {data?.warning || 'Search failed. Try again.'}
        </div>
      )}

      {searchEnabled && !isLoading && !error && totalResults === 0 && (
        <p className="text-sm text-gray-500 text-center py-2">No transfers found</p>
      )}

      {/* Filter & Sort Bar */}
      {totalResults > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              {filteredResults.length} of {totalResults} results
            </span>
            <div className="flex items-center gap-2">
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-7 text-xs w-[130px]">
                  <SelectValue placeholder="Vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vehicles</SelectItem>
                  {vehicleTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-7 text-xs w-[130px]">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price-asc">Price: Low-High</SelectItem>
                  <SelectItem value="price-desc">Price: High-Low</SelectItem>
                  <SelectItem value="duration">Fastest</SelectItem>
                  <SelectItem value="passengers">Most seats</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!hasResults && (
            <p className="text-sm text-gray-500 text-center py-2">No results match filter</p>
          )}

          {hasResults && (
            <div className="max-h-72 overflow-y-auto border rounded-lg">
              <ul className="divide-y divide-gray-100">
                {filteredResults.map((transfer) => (
                  <li key={transfer.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(transfer)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      {/* Row 1: Vehicle + Price */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span className="font-medium text-sm">{transfer.vehicle.type}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                            {transfer.transferType}
                          </span>
                        </div>
                        <span className="text-right">
                          <span className="font-semibold text-sm whitespace-nowrap">
                            {formatPrice(transfer.price.currency, transfer.price.total)}
                          </span>
                          {formatPriceSubtext(transfer.price.currency, transfer.price.total) && (
                            <span className="block text-[10px] text-gray-400">
                              {formatPriceSubtext(transfer.price.currency, transfer.price.total)}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Row 2: Description */}
                      <p className="text-xs text-gray-600 mt-1 truncate">{transfer.vehicle.description}</p>

                      {/* Row 3: Stats */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                        <span className="flex items-center gap-0.5">
                          <Users className="h-3 w-3" />
                          {transfer.vehicle.maxPassengers} seats
                        </span>
                        {transfer.vehicle.maxBags !== undefined && transfer.vehicle.maxBags > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Briefcase className="h-3 w-3" />
                            {transfer.vehicle.maxBags} bags
                          </span>
                        )}
                        {transfer.duration && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(transfer.duration)}
                          </span>
                        )}
                        {transfer.provider && transfer.provider !== 'amadeus' && (
                          <span className="text-gray-400">{transfer.provider}</span>
                        )}
                      </div>

                      {/* Row 4: Cancellation */}
                      {transfer.cancellationPolicy && (
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          {transfer.cancellationPolicy.refundable ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              <span className="text-green-600">Free cancellation</span>
                            </>
                          ) : (
                            <span className="text-gray-400">Non-refundable</span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
