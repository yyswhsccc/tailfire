// apps/ota/src/components/hub/sections/hotels-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

// ---------------------------------------------------------------------------
// HotelsSection
//
// Mode A: sectionProps.hotels is an array of HotelProductCardProps — renders
//         compact hotel cards (for future browse-mode price data).
// Mode B: No hotels data — renders a CTA card linking to the hotels search.
//         Hotels require check-in/check-out dates so live results can't be
//         shown on browse pages; the CTA sends the user to /search/hotels.
// ---------------------------------------------------------------------------

export function HotelsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const hotels = (sectionProps.hotels as unknown[] | undefined) ?? []
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'

  // Mode A: real hotel data provided (future use)
  if (hotels.length > 0) {
    return (
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        {/* HotelProductCard compact grid — wired when data is available */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* placeholder — replace with HotelProductCard when component exists */}
        </div>
      </FeedSection>
    )
  }

  // Mode B: no data — render CTA card
  const searchHref = `/search/hotels?destination=${encodeURIComponent(destinationName)}`

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm border-l-4 border-l-[#C59746]">
        <div className="flex items-center gap-5 p-5 sm:p-6">
          {/* Hotel icon area */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A] text-2xl">
            🏨
          </div>

          {/* Text + CTA */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#1A1A1A] sm:text-lg">
              Find hotels in {destinationName}
            </p>
            <p className="mt-0.5 text-sm text-[#666]">
              Compare rates and availability for your travel dates.
            </p>
            <Link
              href={searchHref}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#C59746] hover:underline"
            >
              Compare rates and availability →
            </Link>
          </div>
        </div>
      </div>
    </FeedSection>
  )
}
