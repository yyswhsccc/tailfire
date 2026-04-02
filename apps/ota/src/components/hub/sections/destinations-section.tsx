// apps/ota/src/components/hub/sections/destinations-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { DestinationCard } from '@/components/destinations/destination-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function DestinationsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinations = (sectionProps.destinations as any[]) ?? []
  if (destinations.length === 0) return null

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {destinations.slice(0, 6).map((d: any) => (
          <div key={d.slug} className="w-64 shrink-0 sm:w-auto">
            <DestinationCard destination={d} />
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
