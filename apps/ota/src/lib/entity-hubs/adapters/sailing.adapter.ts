// apps/ota/src/lib/entity-hubs/adapters/sailing.adapter.ts

import type { SailingDetail } from '@/types/entities'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'
import { formatPrice } from '@/lib/format'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const sailingAdapter: HubAdapter<SailingDetail> = {
  heroData(sailing): HeroData {
    const cheapest = [
      sailing.prices.inside,
      sailing.prices.oceanview,
      sailing.prices.balcony,
      sailing.prices.suite,
    ].filter((p): p is number => p != null)
    const lowestPrice = cheapest.length > 0 ? Math.min(...cheapest) : null

    return {
      imageUrl: sailing.ship.imageUrl,
      badge: `${sailing.cruiseLine.name} · ${sailing.ship.name}`,
      title: sailing.name,
      subtitle: `${fmtDate(sailing.sailDate)} — ${fmtDate(sailing.endDate)}`,
      ctaLabel: 'Inquire About This Sailing',
      ...(lowestPrice != null
        ? { urgencyBadge: `From ${formatPrice(lowestPrice)}/person` }
        : {}),
    }
  },

  contextPills(sailing): ContextPill[] {
    const pills: ContextPill[] = []
    const seaDays = sailing.itinerary.filter((s) => s.isSeaDay).length

    pills.push({ icon: '🌙', label: `${sailing.nights} nights` })
    pills.push({ icon: '🚢', label: `Departs ${sailing.embarkPort.name}` })
    pills.push({ icon: '🏁', label: `Returns ${sailing.disembarkPort.name}` })

    if (seaDays > 0) {
      pills.push({ icon: '🌊', label: `${seaDays} sea day${seaDays > 1 ? 's' : ''}` })
    }

    const portStops = sailing.itinerary.filter((s) => !s.isSeaDay).length
    if (portStops > 0) {
      pills.push({ icon: '📍', label: `${portStops} ports` })
    }

    return pills
  },

  sections(sailing): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []

    // Cabin pricing — pass sailing prices via sectionProps so the shared
    // CabinCategoriesSection can render them without a network fetch.
    const hasAnyPrice =
      sailing.prices.inside != null ||
      sailing.prices.oceanview != null ||
      sailing.prices.balcony != null ||
      sailing.prices.suite != null

    if (hasAnyPrice) {
      sections.push({
        key: 'cabinCategories',
        title: '🛏️ Cabin Pricing',
        subtitle: 'Per person in CAD · Subject to availability',
        props: {
          sailingPrices: sailing.prices,
        },
        priority: 'high',
      })
    }

    // Similar sailings on this ship
    if (sailing.ship.slug) {
      sections.push({
        key: 'sailings',
        title: `🚢 More Sailings on ${sailing.ship.name}`,
        viewAllHref: `/ships/${sailing.ship.slug}`,
        viewAllLabel: `View ${sailing.ship.name}`,
        props: {
          shipSlug: sailing.ship.slug,
          excludeSailingId: sailing.id,
        },
        priority: 'medium',
      })
    }

    return sections
  },

  aiContext(sailing): AiPageContext {
    return {
      entityType: 'sailing',
      entityName: sailing.name,
      entitySlug: sailing.id,
      availableProducts: [{ type: 'cruise', count: 1 }],
    }
  },
}
