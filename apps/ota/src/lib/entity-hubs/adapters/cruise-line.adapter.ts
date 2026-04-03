// apps/ota/src/lib/entity-hubs/adapters/cruise-line.adapter.ts

import type { CruiseLineDetail } from '@/types/entities'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'

export const cruiseLineAdapter: HubAdapter<CruiseLineDetail> = {
  heroData(line): HeroData {
    // Use the first ship image as the hero background, fall back to logo, then null
    const imageUrl = line.ships[0]?.imageUrl ?? null

    return {
      imageUrl,
      badge: 'CRUISE LINE',
      title: line.name,
      subtitle: line.logoUrl ? undefined : undefined,
      description: undefined,
      ctaLabel: `Explore ${line.name} Sailings`,
    }
  },

  contextPills(line): ContextPill[] {
    const pills: ContextPill[] = []

    if (line.shipCount > 0) {
      pills.push({ icon: '\uD83D\uDEA2', label: `${line.shipCount} Ships` })
    }

    const sailingCount = line.upcomingSailingCount ?? line.sailingCount
    if (sailingCount > 0) {
      pills.push({ icon: '\uD83D\uDCC5', label: `${sailingCount.toLocaleString()} Sailings` })
    }

    return pills
  },

  sections(line): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []

    // Fleet section — ships are embedded in the detail response
    sections.push({
      key: 'ships',
      title: `\uD83D\uDEA2 ${line.name} Fleet`,
      props: {
        ships: line.ships,
      },
      priority: 'high',
    })

    // NOTE: Sailings section removed — no cruise-line-specific sailings fetcher
    // exists yet. SailingsSection only supports ship and sailing entity types.
    // Re-add once a fetchCruiseLineSailings() fetcher is available.

    return sections
  },

  aiContext(line): AiPageContext {
    const products: { type: string; count: number }[] = []

    if (line.shipCount > 0) {
      products.push({ type: 'ship', count: line.shipCount })
    }

    const sailingCount = line.upcomingSailingCount ?? line.sailingCount
    if (sailingCount > 0) {
      products.push({ type: 'sailing', count: sailingCount })
    }

    return {
      entityType: 'cruise_line',
      entityName: line.name,
      entitySlug: line.slug,
      availableProducts: products.length > 0 ? products : undefined,
    }
  },
}
