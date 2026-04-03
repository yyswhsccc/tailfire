// apps/ota/src/components/hub/sections/flights-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import { FlightProductCard } from '@/components/cards/flight-product-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'
import type { FlightProductCardProps } from '@/components/cards/flight-product-card'

// ---------------------------------------------------------------------------
// FlightsSection
//
// Mode A: sectionProps.flights is an array of FlightProductCardProps — renders
//         compact flight cards (for future browse-mode price data).
// Mode B: No flights data — renders a CTA card linking to the flights search.
// ---------------------------------------------------------------------------

export function FlightsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const flights = (sectionProps.flights as FlightProductCardProps[] | undefined) ?? []
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'
  const detectedAirport = sectionProps.detectedAirport as string | undefined

  // Mode A: real flight data provided
  if (flights.length > 0) {
    return (
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flights.slice(0, 6).map((flight) => (
            <FlightProductCard key={flight.id} variant="compact" {...flight} />
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
