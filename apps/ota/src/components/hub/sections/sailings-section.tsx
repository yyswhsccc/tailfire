// apps/ota/src/components/hub/sections/sailings-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { CruiseProductCard } from '@/components/cards/cruise-product-card'
import { fetchShipSailings } from '@/lib/fetchers/ships'
import { catalogFetch } from '@/lib/api'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

interface CruiseLineSailing {
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

interface CruiseLineSailingsResponse {
  sailings: CruiseLineSailing[]
  total: number
}

export async function SailingsSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
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
      // Ship adapter passes shipId (UUID) in sectionProps; fall back to entitySlug for compat
      const shipId = (sectionProps.shipId as string) || entitySlug
      const data = await fetchShipSailings(shipId)
      sailings = data.sailings
      total = data.total
    } else if (entityType === 'sailing') {
      // On a sailing page, fetch sibling sailings on the same ship via sectionProps.shipId
      const shipId = (sectionProps.shipId as string) || (sectionProps.shipSlug as string | undefined)
      if (shipId) {
        const data = await fetchShipSailings(shipId)
        const excludeId = sectionProps.excludeSailingId as string | undefined
        sailings = excludeId ? data.sailings.filter((s) => s.id !== excludeId) : data.sailings
        total = sailings.length
      }
    } else if (entityType === 'cruise_line' && sectionProps.cruiseLineId) {
      const data = await catalogFetch<CruiseLineSailingsResponse>(
        `/cruise-repository/sailings?cruiseLineId=${sectionProps.cruiseLineId}&pageSize=4&sortBy=sailDate&sortDir=asc`,
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
    console.warn('[SailingsSection] Fetch failed:', (err as Error)?.message || 'unknown error')
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
