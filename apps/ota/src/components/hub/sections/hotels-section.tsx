// apps/ota/src/components/hub/sections/hotels-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { SectionDatePrompt } from './section-date-prompt'
import { ClientHotelResults } from './client-hotel-results'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

// ---------------------------------------------------------------------------
// HotelsSection (Server Component — ISR-safe)
//
// Renders the date prompt as the default server-rendered content.
// ClientHotelResults checks the Zustand travel session store on the client
// and fetches real hotel data from the Next.js API proxy when dates exist.
// ---------------------------------------------------------------------------

export function HotelsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <ClientHotelResults destinationName={destinationName}>
        <SectionDatePrompt
          icon="🏨"
          heading="Set your travel dates to see hotel options"
          subtitle="We'll show top-rated hotels with real prices for your stay"
          buttonLabel="Show hotels"
          searchHref={`/search/hotels?destination=${encodeURIComponent(destinationName)}`}
          searchLabel="Or search hotels manually →"
        />
      </ClientHotelResults>
    </FeedSection>
  )
}
