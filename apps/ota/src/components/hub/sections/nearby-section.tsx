// apps/ota/src/components/hub/sections/nearby-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import { publicFetch } from '@/lib/api'
import type { DestinationSummary } from '@/types/entities'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'
import { getCuratedImage } from '@/lib/curated-images'

/**
 * Lightweight card for nearby destinations.
 * Works with objects that have at minimum { name } — slug and country are optional.
 */
function NearbyDestinationCard({
  name,
  country,
  slug,
  heroImageUrl,
  destinationType,
}: {
  name: string
  country?: string | null
  slug?: string | null
  heroImageUrl?: string | null
  destinationType?: string | null
}) {
  const imageUrl = heroImageUrl || getCuratedImage(name, destinationType ?? undefined)

  const inner = (
    <div className="group w-64 shrink-0 overflow-hidden rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Hero area — curated image background */}
      <div
        className="relative h-32 bg-[#1A1A1A]"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="truncate text-sm font-bold text-white drop-shadow">{name}</p>
          {country && (
            <p className="text-[11px] text-white/80 drop-shadow">{country}</p>
          )}
        </div>
      </div>
    </div>
  )

  if (slug) {
    return (
      <Link href={`/destinations/${slug}`} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}

interface DestinationLike {
  name: string
  slug?: string | null
  country?: string | null
  countryCode?: string | null
  heroImageUrl?: string | null
  destinationType?: string | null
}

export async function NearbySection({
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  let destinations: DestinationLike[] = (sectionProps.destinations as DestinationLike[]) ?? []

  // Self-fetch when no destinations are pre-populated but a destinationType is provided
  if (destinations.length === 0 && sectionProps.destinationType) {
    try {
      const result = await publicFetch<{ destinations: DestinationSummary[] }>(
        `/destinations?type=${encodeURIComponent(sectionProps.destinationType as string)}&pageSize=12`,
        { next: { revalidate: 3600, tags: ['destinations'] } },
      )
      // Exclude the current destination page from the nearby list
      destinations = (result.destinations ?? [])
        .filter((d) => d.slug !== entitySlug)
        .slice(0, 8)
    } catch (err) {
      console.warn('[NearbySection] Fetch failed:', (err as Error)?.message || 'unknown error')
    }
  }

  if (destinations.length === 0) return null

  return (
    <div className="bg-[#faf6f0] py-8 -mx-4 px-4 sm:-mx-10 sm:px-10 lg:-mx-[60px] lg:px-[60px]">
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        <div
          className="flex gap-4 overflow-x-auto pb-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {destinations.map((d, i) => {
            const name = typeof d === 'string' ? d : d.name
            const country = typeof d === 'string' ? null : (d.country ?? d.countryCode ?? null)
            const slug = typeof d === 'string' ? null : (d.slug ?? null)
            const heroImageUrl = typeof d === 'string' ? null : (d.heroImageUrl ?? null)
            const destinationType = typeof d === 'string' ? null : ((d as DestinationLike).destinationType ?? null)
            return (
              <NearbyDestinationCard
                key={slug || name || i}
                name={name}
                country={country}
                slug={slug}
                heroImageUrl={heroImageUrl}
                destinationType={destinationType}
              />
            )
          })}
        </div>
      </FeedSection>
    </div>
  )
}
