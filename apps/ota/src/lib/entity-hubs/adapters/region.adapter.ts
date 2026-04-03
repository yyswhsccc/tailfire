// apps/ota/src/lib/entity-hubs/adapters/region.adapter.ts

import type { RegionDetail } from '@/types/entities'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'

export const regionAdapter: HubAdapter<RegionDetail> = {
  heroData(region): HeroData {
    return {
      imageUrl: null,
      badge: 'REGION',
      title: region.name,
      description: region.description ?? undefined,
      ctaLabel: `Explore the ${region.name}`,
    }
  },

  contextPills(region): ContextPill[] {
    const pills: ContextPill[] = []

    if (region.sailingCount > 0) {
      pills.push({ icon: '\uD83D\uDEA2', label: `${region.sailingCount.toLocaleString()} Sailings` })
    }
    if (region.upcomingSailingCount > 0) {
      pills.push({ icon: '\uD83D\uDCC5', label: `${region.upcomingSailingCount.toLocaleString()} Upcoming` })
    }
    if (region.destinations.length > 0) {
      pills.push({ icon: '\uD83D\uDCCD', label: `${region.destinations.length} Destinations` })
    }

    return pills
  },

  sections(region): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []

    // Top destinations in this region
    if (region.destinations.length > 0) {
      sections.push({
        key: 'destinations',
        title: `\uD83D\uDCCD Destinations in the ${region.name}`,
        props: {
          destinations: region.destinations,
        },
        priority: 'high',
      })
    }

    // Cruises sailing in this region
    sections.push({
      key: 'cruises',
      title: `\uD83D\uDEA2 Cruises in the ${region.name}`,
      viewAllHref: `/regions/${region.slug}/cruises`,
      props: {},
      priority: 'high',
    })

    return sections
  },

  aiContext(region): AiPageContext {
    return {
      entityType: 'region',
      entityName: region.name,
      entitySlug: region.slug,
      availableProducts: [
        ...(region.sailingCount > 0
          ? [{ type: 'cruise', count: region.sailingCount }]
          : []),
      ],
    }
  },
}
