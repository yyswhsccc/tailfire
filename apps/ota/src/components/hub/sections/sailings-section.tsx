// apps/ota/src/components/hub/sections/sailings-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { CruiseProductCard } from '@/components/cards/cruise-product-card'
import { fetchShipSailings } from '@/lib/fetchers/ships'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function SailingsSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps: _sectionProps,
}: SectionComponentProps) {
  let sailings: Array<{
    id: string
    name: string
    sailDate: string
    nights: number
    shipName: string
    shipImageUrl: string | null
    cruiseLineName: string
    cheapestInsideCents: number | null
  }> = []
  let total = 0

  try {
    if (entityType === 'ship') {
      const data = await fetchShipSailings(entitySlug)
      sailings = data.sailings
      total = data.total
    }
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
        {sailings.slice(0, 4).map((s) => (
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
