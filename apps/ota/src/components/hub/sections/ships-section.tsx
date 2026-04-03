// apps/ota/src/components/hub/sections/ships-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { ShipCard } from '@/components/cards/ship-card'
import { fetchCruiseLineBySlug } from '@/lib/fetchers/cruise-lines'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function ShipsSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps: _sectionProps,
}: SectionComponentProps) {
  if (entityType !== 'cruise_line') return null

  let ships: Array<{
    id: string
    name: string
    slug: string
    imageUrl: string | null
    shipClass: string | null
  }> = []
  let cruiseLineName = ''

  try {
    const data = await fetchCruiseLineBySlug(entitySlug)
    ships = data.ships ?? []
    cruiseLineName = data.name
  } catch {
    return null
  }

  if (ships.length === 0) return null

  const resolvedSubtitle = subtitle ?? `${ships.length} ship${ships.length !== 1 ? 's' : ''} in the fleet`
  const resolvedViewAll = viewAllLabel ?? `View all ${ships.length} →`

  return (
    <FeedSection
      title={title}
      subtitle={resolvedSubtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={resolvedViewAll}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ships.slice(0, 6).map((ship) => (
          <ShipCard
            key={ship.id}
            slug={ship.slug}
            name={ship.name}
            cruiseLineName={cruiseLineName}
            imageUrl={ship.imageUrl}
          />
        ))}
      </div>
    </FeedSection>
  )
}
