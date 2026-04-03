// apps/ota/src/components/hub/sections/flights-section.tsx

import Link from 'next/link'
import { cookies } from 'next/headers'
import { FeedSection } from '@/components/hub/feed-section'
import { FlightProductCard } from '@/components/cards/flight-product-card'
import { parseTravelSessionCookie, TRAVEL_SESSION_COOKIE } from '@/lib/travel-session'
import { API_URL, OTA_SERVICE_KEY } from '@/lib/config'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'
import type { FlightProductCardProps, FlightSegment } from '@/components/cards/flight-product-card'

// ---------------------------------------------------------------------------
// FlightsSection (async Server Component)
//
// When travel dates + origin exist in the cookie, fetches real flight data
// from the OTA flights search endpoint and renders up to 3 full cards.
// Falls back to a CTA card when dates are missing or the fetch fails.
// ---------------------------------------------------------------------------

// -- Amadeus response shape (matches FlightOffer in flight-search-store) ----

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

interface FlightSearchResponse {
  results: AmadeusFlightOffer[]
  warning?: string
}

// -- Helpers ----------------------------------------------------------------

/** Extract "HH:MM" from an ISO datetime like "2026-05-10T06:45:00" */
function extractTime(isoString: string): string {
  const d = new Date(isoString)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Parse ISO 8601 duration "PT6H45M" → "6h 45m" */
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

// -- Component --------------------------------------------------------------

export async function FlightsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'
  const detectedAirport = sectionProps.detectedAirport as string | undefined
  const destinationImageUrl = sectionProps.destinationImageUrl as string | undefined

  // ---- Try to fetch real flight data from the travel session ----
  let flights: FlightProductCardProps[] =
    (sectionProps.flights as FlightProductCardProps[] | undefined) ?? []

  if (flights.length === 0) {
    try {
      const cookieStore = await cookies()
      const session = parseTravelSessionCookie(cookieStore.get(TRAVEL_SESSION_COOKIE)?.value)

      if (session.departureDate && session.origin) {
        const qs = new URLSearchParams({
          origin: session.origin,
          destination: destinationName,
          departureDate: session.departureDate,
          adults: String(session.adults),
        })

        // Use raw fetch (not serviceFetch) to pass Next.js ISR `next` option
        const res = await fetch(`${API_URL}/ota/search/flights?${qs}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-ota-service-key': OTA_SERVICE_KEY,
          },
          next: { revalidate: 1800 },
        } as RequestInit)

        if (res.ok) {
          const data: FlightSearchResponse = await res.json()
          if (data.results?.length) {
            flights = data.results.slice(0, 3).map((offer) =>
              mapOfferToCardProps(offer, destinationImageUrl),
            )
          }
        }
      }
    } catch {
      // Graceful degradation — fall through to CTA card
    }
  }

  // Mode A: real flight data available — render full cards
  if (flights.length > 0) {
    return (
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flights.slice(0, 3).map((flight) => (
            <FlightProductCard
              key={flight.id}
              variant="full"
              {...flight}
              destinationImageUrl={flight.destinationImageUrl ?? destinationImageUrl}
            />
          ))}
        </div>
      </FeedSection>
    )
  }

  // Mode B: no data — render CTA card
  const searchHref = `/search/flights?to=${encodeURIComponent(destinationName)}`
  const ctaHeading = detectedAirport
    ? `Flights from ${detectedAirport} to ${destinationName}`
    : `Search flights to ${destinationName}`

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm border-l-4 border-l-[#C59746]">
        <div className="flex items-center gap-5 p-5 sm:p-6">
          {/* Plane icon area */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A] text-2xl">
            ✈️
          </div>

          {/* Text + CTA */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#1A1A1A] sm:text-lg">{ctaHeading}</p>
            <p className="mt-0.5 text-sm text-[#666]">
              Compare fares and find the best deals for your travel dates.
            </p>
            <Link
              href={searchHref}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#C59746] hover:underline"
            >
              Find the best fares →
            </Link>
          </div>
        </div>
      </div>
    </FeedSection>
  )
}
