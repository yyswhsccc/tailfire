'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TripLocation } from '@/hooks/use-trip-locations'

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

interface TransportationAddressInputProps {
  value: string
  onChange: (location: {
    address: string
    name: string | null
    lat: number | null
    lng: number | null
    placeId: string | null
  }) => void
  tripLocations?: TripLocation[]
  placeholder?: string
  label?: string
  disabled?: boolean
}

interface GooglePrediction {
  placeId: string
  mainText: string
  secondaryText: string
}

export function TransportationAddressInput({
  value,
  onChange,
  tripLocations = [],
  placeholder = 'Search for an address...',
  label,
  disabled,
}: TransportationAddressInputProps) {
  const [query, setQuery] = useState(value)
  const [googlePredictions, setGooglePredictions] = useState<GooglePrediction[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortRef = useRef<AbortController>()

  // Sync query when external value changes
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter trip locations by query
  const filteredTripLocations = query.trim()
    ? tripLocations.filter(loc => {
        const q = query.toLowerCase()
        return (
          loc.name.toLowerCase().includes(q) ||
          (loc.address?.toLowerCase().includes(q) ?? false)
        )
      })
    : []

  const totalItems = filteredTripLocations.length + googlePredictions.length

  const fetchGooglePredictions = useCallback(async (input: string) => {
    if (!API_KEY || !input.trim()) {
      setGooglePredictions([])
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
        },
        body: JSON.stringify({ input }),
        signal: abortRef.current.signal,
      })

      const data = await res.json()
      const suggestions = data.suggestions || []
      setGooglePredictions(
        suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            mainText:
              s.placePrediction.structuredFormat?.mainText?.text ||
              s.placePrediction.text?.text ||
              '',
            secondaryText:
              s.placePrediction.structuredFormat?.secondaryText?.text || '',
          }))
      )
      setIsOpen(true)
    } catch (e: any) {
      if (e.name !== 'AbortError') setGooglePredictions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setActiveIndex(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!val.trim()) {
      setGooglePredictions([])
      setIsOpen(false)
      // Clear form state when user clears the input
      onChange({ address: '', name: null, lat: null, lng: null, placeId: null })
      return
    }

    setIsOpen(true)
    debounceRef.current = setTimeout(() => fetchGooglePredictions(val), 300)
  }

  // Propagate manual text edits on blur (when user typed without selecting a suggestion)
  const handleBlur = () => {
    // Delay to allow click on dropdown items to fire first
    setTimeout(() => {
      setIsOpen(false)
      // If query differs from current value, user typed manually — persist the text
      if (query.trim() && query !== value) {
        onChange({ address: query, name: null, lat: null, lng: null, placeId: null })
      }
    }, 200)
  }

  const handleSelectTripLocation = (loc: TripLocation) => {
    const address = loc.address ?? loc.name
    setQuery(address)
    setIsOpen(false)
    setActiveIndex(-1)
    onChange({
      address,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      placeId: null,
    })
  }

  const handleSelectGooglePrediction = async (prediction: GooglePrediction) => {
    if (!API_KEY) return

    setIsLoading(true)
    setIsOpen(false)
    setActiveIndex(-1)

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${prediction.placeId}?fields=displayName,location,formattedAddress`,
        {
          headers: {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'displayName,location,formattedAddress',
          },
        }
      )
      const place = await res.json()

      const address =
        place.formattedAddress ||
        prediction.mainText +
          (prediction.secondaryText ? `, ${prediction.secondaryText}` : '')
      const resolvedAddress = address
      setQuery(resolvedAddress)

      onChange({
        address: resolvedAddress,
        name: place.displayName?.text ?? prediction.mainText ?? null,
        lat: place.location?.latitude ?? null,
        lng: place.location?.longitude ?? null,
        placeId: prediction.placeId,
      })
    } catch {
      // Fall back to text if fetch fails
      const fallbackAddress =
        prediction.mainText +
        (prediction.secondaryText ? `, ${prediction.secondaryText}` : '')
      setQuery(fallbackAddress)
      onChange({
        address: fallbackAddress,
        name: prediction.mainText || null,
        lat: null,
        lng: null,
        placeId: prediction.placeId,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || totalItems === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i <= 0 ? totalItems - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < filteredTripLocations.length) {
        handleSelectTripLocation(filteredTripLocations[activeIndex]!)
      } else if (activeIndex >= filteredTripLocations.length) {
        const googleIdx = activeIndex - filteredTripLocations.length
        if (googlePredictions[googleIdx]) {
          handleSelectGooglePrediction(googlePredictions[googleIdx]!)
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  const showDropdown =
    isOpen &&
    query.trim().length > 0 &&
    (filteredTripLocations.length > 0 || googlePredictions.length > 0 || isLoading)

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (
              query.trim() &&
              (filteredTripLocations.length > 0 || googlePredictions.length > 0)
            ) {
              setIsOpen(true)
            }
          }}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-8"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <ul className="max-h-72 overflow-auto py-1" role="listbox">
            {filteredTripLocations.length > 0 && (
              <>
                <li className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Trip Locations
                </li>
                {filteredTripLocations.map((loc, idx) => (
                  <li
                    key={`trip-${loc.type}-${loc.name}-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                        idx === activeIndex && 'bg-accent'
                      )}
                      onClick={() => handleSelectTripLocation(loc)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{loc.name}</div>
                        {loc.address && (
                          <div className="text-xs text-muted-foreground">
                            {loc.address}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground capitalize">
                          {loc.type.replace('_', ' ')}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </>
            )}

            {googlePredictions.length > 0 && (
              <>
                <li className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Search Results
                </li>
                {googlePredictions.map((p, idx) => {
                  const globalIdx = filteredTripLocations.length + idx
                  return (
                    <li
                      key={`google-${p.placeId}`}
                      role="option"
                      aria-selected={globalIdx === activeIndex}
                    >
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                          globalIdx === activeIndex && 'bg-accent'
                        )}
                        onClick={() => handleSelectGooglePrediction(p)}
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{p.mainText}</div>
                          {p.secondaryText && (
                            <div className="text-xs text-muted-foreground">
                              {p.secondaryText}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </>
            )}

            {isLoading && googlePredictions.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
