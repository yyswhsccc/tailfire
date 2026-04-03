// apps/ota/src/lib/entity-hubs/adapters/destination.adapter.ts

import type { DestinationDetail } from '@/types/entities'
import type { HubAdapter, HeroData, ContextPill, SectionDescriptor, AiPageContext } from '../types'

const DESTINATION_TYPE_LABELS: Record<string, string> = {
  port_city: 'Port City',
  island: 'Island',
  resort_area: 'Resort Area',
  city: 'City',
  country: 'Country',
  region: 'Region',
}

const DESTINATION_TYPE_PLURALS: Record<string, string> = {
  port_city: 'Port Cities',
  island: 'Islands',
  resort_area: 'Resort Areas',
  city: 'Cities',
  country: 'Countries',
  region: 'Regions',
}

export const destinationAdapter: HubAdapter<DestinationDetail> = {
  heroData(dest): HeroData {
    const enrichment = dest.enrichment

    // Build subtitle from rating + review count (mirrors old page meta items)
    const subtitleParts: string[] = []
    if (enrichment?.averageRating) {
      subtitleParts.push(`\u2B50 ${enrichment.averageRating.toFixed(1)}`)
    }
    if (enrichment?.totalReviewCount) {
      subtitleParts.push(`${enrichment.totalReviewCount.toLocaleString()} reviews`)
    }

    return {
      imageUrl: dest.heroImageUrl || enrichment?.photos?.[0]?.url || null,
      fallbackGradient: 'bg-gradient-to-br from-[#1a3a5c] via-[#0d2137] to-[#1A1A1A]',
      badge: dest.countryCode ? `${dest.countryCode} · DESTINATION` : 'DESTINATION',
      title: dest.name,
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(' \u00B7 ') : undefined,
      description: enrichment?.summary || dest.summary || undefined,
      ctaLabel: `Plan a Trip to ${dest.name}`,
    }
  },

  contextPills(dest, counts): ContextPill[] {
    const pills: ContextPill[] = []

    if (counts?.cruises) {
      pills.push({ icon: '\uD83D\uDEA2', label: `${counts.cruises} Cruises` })
    }
    if (dest.stats?.tourCount) {
      pills.push({ icon: '\uD83C\uDFAF', label: `${dest.stats.tourCount} Tours` })
    }
    if (dest.countryCode) {
      pills.push({ icon: '\uD83D\uDCCD', label: dest.countryCode })
    }
    if (dest.destinationType) {
      pills.push({ label: DESTINATION_TYPE_LABELS[dest.destinationType] ?? dest.destinationType })
    }

    return pills
  },

  sections(dest): SectionDescriptor[] {
    const sections: SectionDescriptor[] = []
    const enrichment = dest.enrichment

    // Cruises -- always present; the shared CruisesSection fetches data itself
    sections.push({
      key: 'cruises',
      title: `\uD83D\uDEA2 Cruises Visiting ${dest.name}`,
      viewAllHref: `/destinations/${dest.slug}/cruises`,
      props: {},
      priority: 'high',
    })

    // Flights CTA — links to flight search; upgrades to live data when available
    sections.push({
      key: 'flights',
      title: `\u2708\uFE0F Flights to ${dest.name}`,
      viewAllHref: `/search/flights`,
      viewAllLabel: 'Search flights \u2192',
      props: { destinationName: dest.name },
      priority: 'high',
    })

    // Tours -- ToursSection self-fetches via tour-repository API
    sections.push({
      key: 'tours',
      title: `\uD83C\uDFDE Tours in ${dest.name}`,
      viewAllHref: `/search/tours?q=${encodeURIComponent(dest.name)}`,
      viewAllLabel: 'Browse all tours \u2192',
      props: { destinationName: dest.name },
      priority: 'medium',
    })

    // Activities from enrichment topAttractions
    const attractions = enrichment?.topAttractions ?? []
    if (attractions.length > 0) {
      sections.push({
        key: 'activities',
        title: `\uD83C\uDFAF Things to Do in ${dest.name}`,
        props: {
          // Map topAttractions shape to what shared ActivitiesSection expects
          activities: attractions.map((a) => ({
            name: a.title,
            category: a.description,
            rating: a.rating,
          })),
        },
        priority: 'medium',
      })
    }

    // Photos from enrichment
    const photos = enrichment?.photos ?? []
    if (photos.length > 0) {
      sections.push({
        key: 'photoMosaic',
        title: '\uD83D\uDCF8 Photos',
        props: { photos },
        priority: 'low',
      })
    }

    // Nearby destinations — self-fetching section that finds same-type destinations
    sections.push({
      key: 'nearby',
      title: `\uD83D\uDDFA\uFE0F More ${DESTINATION_TYPE_PLURALS[dest.destinationType] ?? 'Destinations'} to Explore`,
      subtitle: 'Discover similar destinations',
      viewAllHref: '/destinations',
      viewAllLabel: 'View all destinations \u2192',
      props: {
        destinationType: dest.destinationType,
      },
      priority: 'low',
    })

    return sections
  },

  aiContext(dest): AiPageContext {
    return {
      entityType: 'destination',
      entityName: dest.name,
      entitySlug: dest.slug,
      availableProducts: dest.stats
        ? [
            ...(dest.stats.cruiseCount > 0
              ? [{ type: 'cruise', count: dest.stats.cruiseCount }]
              : []),
            ...(dest.stats.tourCount > 0
              ? [{ type: 'tour', count: dest.stats.tourCount }]
              : []),
          ]
        : undefined,
    }
  },
}
