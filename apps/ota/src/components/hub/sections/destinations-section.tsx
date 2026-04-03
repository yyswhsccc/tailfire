// apps/ota/src/components/hub/sections/destinations-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import { DestinationCard } from '@/components/destinations/destination-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

/**
 * Lightweight card for destinations that only have basic data (name, maybe country)
 * but lack slug, heroImageUrl, etc. — e.g. region destinations or deal destination strings.
 */
function LightweightDestinationCard({ name, country, slug }: { name: string; country?: string | null; slug?: string }) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-[#E0E0E0] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <span className="text-xl">📍</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#1A1A1A]">{name}</p>
        {country && <p className="text-xs text-[#888]">{country}</p>}
      </div>
    </div>
  )

  if (slug) {
    return <Link href={`/destinations/${slug}`}>{inner}</Link>
  }
  return inner
}

export async function DestinationsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinations = (sectionProps.destinations as any[]) ?? []
  if (destinations.length === 0) return null

  // Determine if items are full DestinationSummary objects (have slug + heroImageUrl)
  // or lightweight data (region destinations with {id, name, country}, deal strings, or
  // ship destinations with {name, slug, sailingCount}).
  const isFullDestination = destinations[0]?.slug && destinations[0]?.destinationType

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      {isFullDestination ? (
        <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
          {destinations.slice(0, 6).map((d: any) => (
            <div key={d.slug} className="w-64 shrink-0 sm:w-auto">
              <DestinationCard destination={d} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {destinations.slice(0, 8).map((d: any, i: number) => {
            // Handle both object destinations ({id, name, country, slug}) and plain strings
            const name = typeof d === 'string' ? d : d.name
            const country = typeof d === 'string' ? null : d.country ?? null
            const slug = typeof d === 'string' ? null : d.slug ?? null
            return (
              <LightweightDestinationCard
                key={slug || name || i}
                name={name}
                country={country}
                slug={slug}
              />
            )
          })}
        </div>
      )}
    </FeedSection>
  )
}
