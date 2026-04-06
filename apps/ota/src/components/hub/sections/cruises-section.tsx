// apps/ota/src/components/hub/sections/cruises-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { CruiseProductCard } from '@/components/cards/cruise-product-card'
import { fetchDestinationCruises } from '@/lib/fetchers/destinations'
import { catalogFetch } from '@/lib/api'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

interface CruiseSailing {
  id: string
  name: string
  sailDate: string
  nights: number
  ship: { name: string; imageUrl: string | null }
  cruiseLine: { name: string }
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
}

interface SailingsResponse {
  sailings: CruiseSailing[]
  total: number
}

export async function CruisesSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  let sailings: any[] = []
  let total = 0

  try {
    if (entityType === 'destination') {
      const data = await fetchDestinationCruises(entitySlug, 1, 4)
      sailings = data.sailings
      total = data.total
    } else if (entityType === 'region' && sectionProps.regionId) {
      const data = await catalogFetch<SailingsResponse>(
        `/cruise-repository/sailings?regionId=${sectionProps.regionId}&pageSize=4&sortBy=sailDate&sortDir=asc`,
        { next: { revalidate: 3600 } },
      )
      total = data.total
      sailings = data.sailings.map((s) => {
        const prices = [s.prices.inside, s.prices.oceanview, s.prices.balcony, s.prices.suite]
        const cheapest = prices.filter((p): p is number => p != null)
        return {
          id: s.id,
          name: s.name,
          shipName: s.ship.name,
          shipImageUrl: s.ship.imageUrl,
          cruiseLineName: s.cruiseLine.name,
          sailDate: s.sailDate,
          nights: s.nights,
          cheapestInsideCents: cheapest.length > 0 ? Math.min(...cheapest) : null,
        }
      })
    }
  } catch (err) {
    console.warn('[CruisesSection] Fetch failed:', (err as Error)?.message || 'unknown error')
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
