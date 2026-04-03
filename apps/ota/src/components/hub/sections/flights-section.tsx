// apps/ota/src/components/hub/sections/flights-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { SectionDatePrompt } from './section-date-prompt'
import { ClientFlightResults } from './client-flight-results'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

// ---------------------------------------------------------------------------
// FlightsSection (Server Component — ISR-safe)
//
// Renders the date prompt as the default server-rendered content.
// ClientFlightResults checks the Zustand travel session store on the client
// and fetches real flight data from the Next.js API proxy when dates exist.
// ---------------------------------------------------------------------------

export function FlightsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'
  const destinationImageUrl = sectionProps.destinationImageUrl as string | undefined

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <ClientFlightResults
        destinationName={destinationName}
        destinationImageUrl={destinationImageUrl}
      >
        <SectionDatePrompt
          icon="✈️"
          heading="Set your travel dates to see real flights"
          subtitle="We'll find the best fares from your city to this destination"
          buttonLabel="Show flights"
          searchHref={`/search/flights?to=${encodeURIComponent(destinationName)}`}
          searchLabel="Or search flights manually →"
        />
      </ClientFlightResults>
    </FeedSection>
  )
}
