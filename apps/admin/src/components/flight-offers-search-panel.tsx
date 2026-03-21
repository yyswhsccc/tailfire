'use client'

import { useState, useMemo } from 'react'
import { Search, Loader2, Plane, AlertCircle, Clock, Luggage, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// ScrollArea removed — native overflow-y-auto is more reliable for contained result scrolling
import { AirportAutocomplete } from '@/components/ui/airport-autocomplete'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFlightOfferSearch } from '@/hooks/use-external-apis'
import type { NormalizedFlightOffer, FlightOfferSearchParams } from '@tailfire/shared-types'
import { cn } from '@/lib/utils'

interface FlightOffersSearchPanelProps {
  onSelect: (offer: NormalizedFlightOffer) => void
  defaultOrigin?: string
  defaultDestination?: string
  defaultDate?: string
  currencyCode?: string
  className?: string
}

export function FlightOffersSearchPanel({
  onSelect,
  defaultOrigin = '',
  defaultDestination = '',
  defaultDate = '',
  currencyCode = 'CAD',
  className,
}: FlightOffersSearchPanelProps) {
  const [origin, setOrigin] = useState(defaultOrigin)
  const [destination, setDestination] = useState(defaultDestination)
  const [departureDate, setDepartureDate] = useState(defaultDate)
  const [adults] = useState('1')
  const [travelClass, setTravelClass] = useState<FlightOfferSearchParams['travelClass']>()
  const [searchEnabled, setSearchEnabled] = useState(false)
  const [stopsFilter, setStopsFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('price')

  const { data, isLoading, error } = useFlightOfferSearch(
    { origin, destination, departureDate, adults: parseInt(adults, 10), travelClass, currencyCode },
    { enabled: searchEnabled && !!origin && !!destination && !!departureDate }
  )

  const handleSearch = () => {
    if (origin && destination && departureDate) {
      setSearchEnabled(true)
    }
  }

  const handleSelect = (offer: NormalizedFlightOffer) => {
    onSelect(offer)
    setSearchEnabled(false)
  }

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!data?.results) return []
    let results = [...data.results]

    // Filter by stops
    if (stopsFilter === 'direct') {
      results = results.filter(o => o.segments.length === 1)
    } else if (stopsFilter === '1stop') {
      results = results.filter(o => o.segments.length <= 2)
    }

    // Sort
    if (sortBy === 'price') {
      results.sort((a, b) => parseFloat(a.price.total) - parseFloat(b.price.total))
    } else if (sortBy === 'duration') {
      results.sort((a, b) => {
        const durA = a.segments[0]?.duration || ''
        const durB = b.segments[0]?.duration || ''
        return durA.localeCompare(durB)
      })
    } else if (sortBy === 'stops') {
      results.sort((a, b) => a.segments.length - b.segments.length)
    }

    return results
  }, [data?.results, stopsFilter, sortBy])

  const hasResults = filteredResults.length > 0
  const totalResults = data?.results?.length || 0

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Form */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AirportAutocomplete
          value={origin || null}
          onValueChange={(v) => { setOrigin(v || ''); setSearchEnabled(false) }}
          placeholder="Departure airport"
        />
        <AirportAutocomplete
          value={destination || null}
          onValueChange={(v) => { setDestination(v || ''); setSearchEnabled(false) }}
          placeholder="Arrival airport"
        />
        <Input
          type="date"
          value={departureDate}
          onChange={(e) => { setDepartureDate(e.target.value); setSearchEnabled(false) }}
          min="1900-01-01"
          max="2099-12-31"
        />
        <div className="flex gap-1">
          <Select value={travelClass || ''} onValueChange={(v) => { setTravelClass(v as any || undefined); setSearchEnabled(false) }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ECONOMY">Economy</SelectItem>
              <SelectItem value="PREMIUM_ECONOMY">Premium</SelectItem>
              <SelectItem value="BUSINESS">Business</SelectItem>
              <SelectItem value="FIRST">First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSearch}
        disabled={!origin || !destination || !departureDate || isLoading}
        className="w-full"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
        Search Flight Offers
      </Button>

      {/* Error */}
      {error && !isLoading && (
        <div className="p-3 text-center text-sm text-gray-600">
          <AlertCircle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
          {data?.warning || 'Search failed. Try again.'}
        </div>
      )}

      {/* Filters — only show when we have results */}
      {totalResults > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{totalResults} result{totalResults !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1 ml-auto">
            <Select value={stopsFilter} onValueChange={setStopsFilter}>
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stops</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="1stop">1 stop max</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-28">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="stops">Fewest stops</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Results */}
      {searchEnabled && !isLoading && !error && !hasResults && totalResults > 0 && (
        <p className="text-sm text-gray-500 text-center py-2">No results match your filters</p>
      )}
      {searchEnabled && !isLoading && !error && totalResults === 0 && (
        <p className="text-sm text-gray-500 text-center py-2">No flight offers found</p>
      )}

      {hasResults && (
        <div className="max-h-96 overflow-y-auto border rounded-lg">
          <ul className="divide-y divide-gray-100">
            {filteredResults.map((offer) => {
              const firstSeg = offer.segments[0]
              const lastSeg = offer.segments[offer.segments.length - 1]
              return (
                <li key={offer.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(offer)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Plane className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">
                          {firstSeg?.carrierName || offer.validatingAirline}
                        </span>
                        <span className="text-xs text-gray-500">
                          {firstSeg?.flightNumber}
                        </span>
                      </div>
                      <span className="font-semibold text-sm">
                        {offer.price.currency} {offer.price.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>{firstSeg?.departure.iataCode} → {lastSeg?.arrival.iataCode}</span>
                      {firstSeg?.duration && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {firstSeg.duration.replace('PT', '').toLowerCase()}
                        </span>
                      )}
                      <span>{offer.segments.length > 1 ? `${offer.segments.length - 1} stop(s)` : 'Direct'}</span>
                      {offer.cabin && <span>{offer.cabin}</span>}
                      {offer.baggageAllowance?.checked && (
                        <span className="flex items-center gap-0.5">
                          <Luggage className="h-3 w-3" />
                          {offer.baggageAllowance.checked.quantity}pc
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {offer.price.currency} {offer.price.perTraveler}/traveler
                      {offer.fareFamily && ` · ${offer.fareFamily}`}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
