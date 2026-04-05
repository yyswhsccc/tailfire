// apps/ota/src/components/cards/flight-product-card.tsx
'use client'

import { useState } from 'react'
import { Plane } from 'lucide-react'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlightSegment {
  departureAirport: string   // IATA code "YOW"
  departureCity?: string     // "Ottawa"
  departureTime: string      // "06:45"
  arrivalAirport: string     // IATA code "CZM"
  arrivalCity?: string       // "Cozumel"
  arrivalTime: string        // "11:40"
  duration: string           // "4h 55m"
  airline?: string
  flightNumber?: string
  aircraft?: string
}

export interface FlightProductCardProps {
  id: string
  segments: FlightSegment[]
  totalDuration: string      // "6h 45m"
  stops: number
  airline: string
  airlineCode?: string
  cabinClass?: string
  priceCents?: number | null
  priceLoading?: boolean
  baggageIncluded?: string
  destinationImageUrl?: string | null
  variant?: CardVariant
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/**
 * Parse a time string like "06:45" or "13:30" into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Calculate layover minutes between two consecutive segments.
 * Uses arrival time of segment N and departure time of segment N+1.
 * If next departure appears earlier (crosses midnight), adds 24h.
 */
function getLayoverMinutes(arrivalTime: string, departureTime: string): number {
  const arrMins = parseTimeToMinutes(arrivalTime)
  const depMins = parseTimeToMinutes(departureTime)
  let diff = depMins - arrMins
  if (diff < 0) diff += 24 * 60 // crosses midnight
  return diff
}

/**
 * Return layover badge color classes based on duration.
 * < 60 min: red (tight), 60-180 min: amber (comfortable), > 180 min: gray (long)
 */
function getLayoverColors(minutes: number): string {
  if (minutes < 60) return 'bg-[#fee2e2] text-[#991b1b]'
  if (minutes <= 180) return 'bg-[#fef3c7] text-[#92400e]'
  return 'bg-[#f0f0f0] text-[#555]'
}

function formatLayoverDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m'
}

function buildTripComponent(props: FlightProductCardProps): TripComponent {
  const origin = props.segments[0]?.departureAirport ?? ''
  const destination = props.segments[props.segments.length - 1]?.arrivalAirport ?? ''
  return {
    id: `flight-${props.id}`,
    type: 'flight',
    data: {
      segments: props.segments,
      airline: props.airline,
      airlineCode: props.airlineCode,
      cabinClass: props.cabinClass,
      totalDuration: props.totalDuration,
      stops: props.stops,
    },
    display: {
      title: `${origin} \u2192 ${destination}`,
      subtitle: `${props.airline} \u00b7 ${props.totalDuration} \u00b7 ${props.stops === 0 ? 'Direct' : `${props.stops} stop${props.stops > 1 ? 's' : ''}`}`,
      price: props.priceCents != null ? formatPrice(props.priceCents) : undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// Full Variant — Journey Timeline
// ---------------------------------------------------------------------------

function FlightFull(props: FlightProductCardProps) {
  const priceLoading = props.priceLoading || props.priceCents === undefined
  const code = props.airlineCode ?? props.airline.slice(0, 2).toUpperCase()
  const [imgError, setImgError] = useState(false)
  const hasDestImage = props.destinationImageUrl && !imgError

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {/* Header: Airline + Price — with optional destination image background */}
      <div className="relative overflow-hidden">
        {hasDestImage && (
          <>
            <img
              src={props.destinationImageUrl!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
              style={{ opacity: 0.12 }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/60 to-white/90" />
          </>
        )}
        <div className="relative p-4 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A] text-xs font-bold text-[#C59746]">
                {code}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">{props.airline}</p>
                {props.cabinClass && (
                  <p className="text-xs text-[#888]">{props.cabinClass}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              {priceLoading ? (
                <PriceShimmer />
              ) : props.priceCents != null ? (
                <>
                  <span className="text-xl font-bold text-[#C59746] sm:text-2xl">
                    {formatPrice(props.priceCents)}
                  </span>
                  <p className="text-[10px] text-[#888]">per person</p>
                </>
              ) : (
                <span className="text-sm text-[#888]">View pricing &rarr;</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {/* Journey Timeline */}
        <div className="mt-2 overflow-x-auto">
          <div className="flex items-center">
            {props.segments.map((segment, index) => {
              const isLast = index === props.segments.length - 1
              const nextSegment = props.segments[index + 1]

              // Calculate layover
              let layoverMins: number | null = null
              if (!isLast && nextSegment) {
                layoverMins = getLayoverMinutes(segment.arrivalTime, nextSegment.departureTime)
              }

              return (
                <div key={index} className="flex items-center">
                  {/* Departure airport (only for first segment) */}
                  {index === 0 && (
                    <AirportNode
                      code={segment.departureAirport}
                      city={segment.departureCity}
                      time={segment.departureTime}
                    />
                  )}

                  {/* Flight line */}
                  <div className="mx-2 flex min-w-[100px] flex-1 flex-col items-center sm:mx-3 sm:min-w-[120px]">
                    {/* Duration label */}
                    <span className="mb-1 text-[10px] font-medium text-[#888]">
                      {segment.duration}
                    </span>
                    {/* Line with plane */}
                    <div className="relative flex w-full items-center">
                      <div className="h-[2px] flex-1 bg-gradient-to-r from-[#C59746] to-[#E89E4A]" />
                      <div className="mx-1 flex shrink-0 items-center justify-center">
                        <Plane className="h-3.5 w-3.5 rotate-[0deg] text-[#C59746]" />
                      </div>
                      <div className="h-[2px] flex-1 bg-gradient-to-r from-[#E89E4A] to-[#C59746]" />
                    </div>
                    {/* Flight number (if available) */}
                    {segment.flightNumber && (
                      <span className="mt-1 text-[9px] text-[#aaa]">{segment.flightNumber}</span>
                    )}
                  </div>

                  {/* Arrival airport */}
                  <AirportNode
                    code={segment.arrivalAirport}
                    city={segment.arrivalCity}
                    time={segment.arrivalTime}
                  />

                  {/* Layover badge between segments */}
                  {layoverMins != null && (
                    <div className="mx-2 flex flex-col items-center sm:mx-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getLayoverColors(layoverMins)}`}
                      >
                        {formatLayoverDuration(layoverMins)} layover
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tags + AddToTrip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StopsBadge stops={props.stops} />
            {props.cabinClass && (
              <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[11px] font-medium text-[#555]">
                {props.cabinClass}
              </span>
            )}
            {props.baggageIncluded && (
              <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[11px] font-medium text-[#555]">
                {props.baggageIncluded}
              </span>
            )}
          </div>
          <AddToTripButton component={buildTripComponent(props)} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact Variant
// ---------------------------------------------------------------------------

function FlightCompact(props: FlightProductCardProps) {
  const priceLoading = props.priceLoading || props.priceCents === undefined
  const origin = props.segments[0]?.departureAirport ?? ''
  const destination = props.segments[props.segments.length - 1]?.arrivalAirport ?? ''
  const stopsLabel = props.stops === 0 ? 'Direct' : `${props.stops} stop${props.stops > 1 ? 's' : ''}`

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      {/* Left icon area */}
      <div className="flex w-16 shrink-0 items-center justify-center bg-[#1A1A1A] sm:w-20">
        <Plane className="h-6 w-6 text-[#C59746]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">
            {origin} &rarr; {destination}
          </p>
          <span className="shrink-0 text-xs text-[#888]">{props.airline}</span>
        </div>
        <p className="mt-0.5 text-xs text-[#888]">
          {stopsLabel} &middot; {props.totalDuration}
          {props.cabinClass ? ` \u00b7 ${props.cabinClass}` : ''}
        </p>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.priceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">{formatPrice(props.priceCents)}</span>
          ) : (
            <span className="text-xs text-[#888]">View pricing</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini Variant
// ---------------------------------------------------------------------------

function FlightMini(props: FlightProductCardProps) {
  const origin = props.segments[0]?.departureAirport ?? ''
  const destination = props.segments[props.segments.length - 1]?.arrivalAirport ?? ''

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <Plane className="h-3.5 w-3.5 shrink-0 text-[#C59746]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">
          {origin}&rarr;{destination} {props.totalDuration}
        </p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AirportNode({
  code,
  city,
  time,
}: {
  code: string
  city?: string
  time: string
}) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <span className="text-base font-bold text-[#1A1A1A]">{code}</span>
      {city && <span className="text-[10px] text-[#888]">{city}</span>}
      <span className="text-xs text-[#555]">{time}</span>
    </div>
  )
}

function StopsBadge({ stops }: { stops: number }) {
  const label = stops === 0 ? 'Direct' : `${stops} Stop${stops > 1 ? 's' : ''}`
  const colorClass =
    stops === 0
      ? 'bg-emerald-50 text-emerald-700'
      : stops === 1
        ? 'bg-[#fef3c7] text-[#92400e]'
        : 'bg-[#fee2e2] text-[#991b1b]'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colorClass}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function FlightProductCard({ variant = 'full', ...props }: FlightProductCardProps) {
  switch (variant) {
    case 'compact':
      return <FlightCompact {...props} />
    case 'mini':
      return <FlightMini {...props} />
    default:
      return <FlightFull {...props} />
  }
}
