'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTravelSession } from '@/stores/travel-session-store'
import { FlightProductCard } from '@/components/cards/flight-product-card'
import type { FlightProductCardProps, FlightSegment } from '@/components/cards/flight-product-card'

// ---------------------------------------------------------------------------
// Amadeus response shape (matches API response from /ota/search/flights)
// ---------------------------------------------------------------------------

interface AmadeusSegment {
  departure: { iataCode: string; terminal?: string; at: string }
  arrival: { iataCode: string; terminal?: string; at: string }
  carrier: string
  carrierName?: string
  flightNumber: string
  aircraft?: string
  duration: string
  stops: number
  cabin?: string
}

interface AmadeusFlightOffer {
  id: string
  source: string
  segments: AmadeusSegment[]
  price: { currency: string; total: string; perTraveler: string; base?: string }
  validatingAirline: string
  fareClass?: string
  fareFamily?: string
  cabin?: string
  baggageAllowance?: {
    checked?: { quantity: number; weight?: string }
    cabin?: { quantity: number }
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers (moved from the server component)
// ---------------------------------------------------------------------------

/** Extract "HH:MM" from an ISO datetime like "2026-05-10T06:45:00" */
function extractTime(isoString: string): string {
  const d = new Date(isoString)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Parse ISO 8601 duration "PT6H45M" -> "6h 45m" */
function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return iso
  const h = match[1] ? `${match[1]}h` : ''
  const m = match[2] ? `${match[2]}m` : ''
  return [h, m].filter(Boolean).join(' ') || '0m'
}

/** Compute total duration across all segments (sum of individual durations). */
function computeTotalDuration(segments: AmadeusSegment[]): string {
  let totalMinutes = 0
  for (const seg of segments) {
    const match = seg.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    if (match) {
      totalMinutes += (parseInt(match[1] || '0', 10) * 60) + parseInt(match[2] || '0', 10)
    }
  }
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m'
}

function mapOfferToCardProps(
  offer: AmadeusFlightOffer,
  destinationImageUrl?: string | null,
): FlightProductCardProps {
  const segments: FlightSegment[] = offer.segments.map((seg) => ({
    departureAirport: seg.departure.iataCode,
    departureTime: extractTime(seg.departure.at),
    arrivalAirport: seg.arrival.iataCode,
    arrivalTime: extractTime(seg.arrival.at),
    duration: formatDuration(seg.duration),
    airline: seg.carrierName || seg.carrier,
    flightNumber: seg.flightNumber,
    aircraft: seg.aircraft,
  }))

  const stops = Math.max(0, offer.segments.length - 1)
  const totalDuration = computeTotalDuration(offer.segments)
  const priceCents = Math.round(parseFloat(offer.price.total) * 100) || null

  const baggageLabel = offer.baggageAllowance?.checked
    ? `${offer.baggageAllowance.checked.quantity} bag${offer.baggageAllowance.checked.quantity !== 1 ? 's' : ''}`
    : undefined

  return {
    id: offer.id,
    segments,
    totalDuration,
    stops,
    airline: offer.validatingAirline,
    airlineCode: offer.validatingAirline,
    cabinClass: offer.cabin || offer.segments[0]?.cabin,
    priceCents,
    baggageIncluded: baggageLabel,
    destinationImageUrl: destinationImageUrl ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ClientFlightResultsProps {
  destinationName: string
  destinationImageUrl?: string | null
  airportIata?: string | null  // preferred over destinationName for Amadeus lookup
  /** Server-rendered date prompt fallback */
  children: React.ReactNode
}

export function ClientFlightResults({
  destinationName,
  destinationImageUrl,
  airportIata,
  children,
}: ClientFlightResultsProps) {
  const { departureDate, origin, adults } = useTravelSession()
  const [flights, setFlights] = useState<FlightProductCardProps[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const hasDates = !!(departureDate && origin)

  const fetchFlights = useCallback(async () => {
    if (!departureDate || !origin) return

    const destination = airportIata || destinationName
    const qs = new URLSearchParams({
      origin,
      destination,
      departureDate,
      adults: String(adults),
    })

    const res = await fetch(`/api/flights/search?${qs}`)
    if (!res.ok) throw new Error('Flight search failed')

    const data: { results?: AmadeusFlightOffer[] } = await res.json()
    const results = (data.results || []).slice(0, 3)
    return results.map((offer) => mapOfferToCardProps(offer, destinationImageUrl))
  }, [departureDate, origin, adults, destinationName, airportIata, destinationImageUrl])

  useEffect(() => {
    if (!hasDates) {
      setFlights([])
      setFetched(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetchFlights()
      .then((mapped) => {
        if (!cancelled) {
          setFlights(mapped ?? [])
          setFetched(true)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlights([])
          setFetched(true)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [hasDates, fetchFlights])

  // Loading skeleton
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  // Real data available
  if (fetched && flights.length > 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flights.map((flight) => (
          <FlightProductCard
            key={flight.id}
            variant="full"
            {...flight}
            destinationImageUrl={flight.destinationImageUrl ?? destinationImageUrl ?? undefined}
          />
        ))}
      </div>
    )
  }

  // No dates set or fetch returned no results — show server-rendered fallback
  return <>{children}</>
}
