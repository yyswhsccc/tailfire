// apps/ota/src/components/hub/sections/cruises-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { CruiseProductCard } from '@/components/cards/cruise-product-card'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function CruisesSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps: _sectionProps,
}: SectionComponentProps) {
  let sailings: any[] = []
  let total = 0

  try {
    if (entityType === 'destination') {
      const data = await fetchDestinationCruises(entitySlug, 1, 4)
      sailings = data.sailings
      total = data.total
    }
    // Region pages declare a cruises section but no region-specific cruises
    // fetcher exists yet. Return null gracefully rather than crashing.
  } catch {
    return null
  }

  if (sailings.length === 0) return null

  const resolvedSubtitle = subtitle ?? `${total} sailings`
  const resolvedViewAll = viewAllLabel ?? `View all ${total} →`

  return (
    <FeedSection
      title={title}
      subtitle={resolvedSubtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={resolvedViewAll}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {sailings.slice(0, 4).map((s: any) => (
          <CruiseProductCard
            key={s.id}
            id={s.id}
            name={s.name}
            shipName={s.shipName}
            shipImageUrl={s.shipImageUrl}
            cruiseLineName={s.cruiseLineName}
            sailDate={s.sailDate}
            nights={s.nights}
            priceCents={s.cheapestInsideCents}
          />
        ))}
      </div>
    </FeedSection>
  )
}
