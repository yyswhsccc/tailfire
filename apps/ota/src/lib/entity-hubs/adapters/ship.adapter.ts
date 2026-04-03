// apps/ota/src/lib/entity-hubs/adapters/ship.adapter.ts

import type { ShipDetail, ShipImage } from '@/types/entities'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'

interface ShipAdapterExtra {
  images?: ShipImage[]
  destinations?: Array<{ portName: string; sailingCount: number }>
}

export const shipAdapter: HubAdapter<ShipDetail> = {
  heroData(ship): HeroData {
    const specParts: string[] = []
    if (ship.passengerCapacity) {
      specParts.push(`${ship.passengerCapacity.toLocaleString()} guests`)
    }
    if (ship.tonnage) {
      specParts.push(`${Math.round(ship.tonnage / 1000)}K GT`)
    }

    const subtitle = [
      ship.cruiseLine.name,
      ...(specParts.length > 0 ? [specParts.join(' · ')] : []),
    ].join(' · ')

    return {
      imageUrl: ship.imageUrl,
      badge: 'SHIP',
      title: ship.name,
      subtitle,
      ctaLabel: `Explore Sailings on ${ship.name}`,
    }
  },

  contextPills(ship): ContextPill[] {
    const pills: ContextPill[] = []

    pills.push({ icon: '\uD83D\uDEA2', label: `${ship.upcomingSailingCount} Sailings` })

    if (ship.passengerCapacity) {
      pills.push({ icon: '\uD83D\uDC65', label: `${ship.passengerCapacity.toLocaleString()} Guests` })
    }
    if (ship.tonnage) {
      pills.push({ icon: '\u2693', label: `${ship.tonnage.toLocaleString()} GT` })
    }
    if (ship.yearBuilt) {
      pills.push({ icon: '\uD83C\uDFD7\uFE0F', label: `Built ${ship.yearBuilt}` })
    }
    if (ship.shipClass) {
      pills.push({ label: `${ship.shipClass} Class` })
    }
    if (ship.crewCount) {
      pills.push({ icon: '\uD83D\uDC68\u200D\u2708\uFE0F', label: `${ship.crewCount.toLocaleString()} Crew` })
    }

    return pills
  },

  sections(ship, _signals): SectionDescriptor[] {
    // Extra data (images, destinations) is passed via a convention:
    // the page calls shipAdapter.sections(ship) and then patches sectionProps.
    // See shipSections() helper below for the full version with extras.
    const sections: SectionDescriptor[] = []

    // Sailings — self-fetching section
    sections.push({
      key: 'sailings',
      title: `\uD83D\uDEA2 Upcoming Sailings on ${ship.name}`,
      viewAllHref: `/search/cruises?q=${encodeURIComponent(ship.name)}`,
      viewAllLabel: 'Search all sailings \u2192',
      props: { shipId: ship.id },
      priority: 'high',
    })

    // Cabin categories — self-fetching section
    sections.push({
      key: 'cabinCategories',
      title: '\uD83D\uDECF\uFE0F Cabin Categories',
      props: { shipId: ship.id },
      priority: 'medium',
    })

    // Deck plans — self-fetching section
    sections.push({
      key: 'deckPlans',
      title: '🚢 Deck Plans',
      props: { shipId: ship.id },
      priority: 'low' as const,
    })

    // Destinations — receives data via sectionProps (no self-fetcher)
    sections.push({
      key: 'destinations',
      title: `\uD83D\uDCCD Destinations ${ship.name} Visits`,
      props: {},
      priority: 'medium',
    })

    // Photos — receives data via sectionProps (no self-fetcher)
    sections.push({
      key: 'photoMosaic',
      title: '\uD83D\uDCF8 Ship Gallery',
      props: {},
      priority: 'low',
    })

    return sections
  },

  aiContext(ship): AiPageContext {
    return {
      entityType: 'ship',
      entityName: ship.name,
      entitySlug: ship.slug,
      availableProducts: ship.upcomingSailingCount > 0
        ? [{ type: 'sailing', count: ship.upcomingSailingCount }]
        : undefined,
    }
  },
}

/**
 * Build sections with pre-fetched data injected into sectionProps.
 * The page calls this instead of shipAdapter.sections() directly,
 * so that photos and destinations data flows into the section descriptors.
 */
export function shipSections(
  ship: ShipDetail,
  extra: ShipAdapterExtra,
): SectionDescriptor[] {
  const base = shipAdapter.sections(ship)

  return base
    .map((section) => {
      if (section.key === 'destinations' && extra.destinations) {
        if (extra.destinations.length === 0) return null
        return {
          ...section,
          props: {
            ...section.props,
            destinations: extra.destinations.map((d) => ({
              name: d.portName,
              slug: d.portName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              sailingCount: d.sailingCount,
            })),
          },
        }
      }
      if (section.key === 'photoMosaic' && extra.images) {
        if (extra.images.length === 0) return null
        return {
          ...section,
          props: {
            ...section.props,
            photos: extra.images.map((img) => ({
              url: img.imageUrl,
              caption: img.caption || 'Ship photo',
            })),
          },
        }
      }
      return section
    })
    .filter((s): s is SectionDescriptor => s !== null)
}
