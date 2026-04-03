// apps/ota/src/components/hub/sections/nearby-section.tsx

import Link from 'next/link'
import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

/**
 * Lightweight card for nearby destinations.
 * Works with objects that have at minimum { name } — slug and country are optional.
 */
function NearbyDestinationCard({
  name,
  country,
  slug,
}: {
  name: string
  country?: string | null
  slug?: string | null
}) {
  // Simple gradient backgrounds cycling by hash of name
  const gradients = [
    'from-blue-500 to-cyan-400',
    'from-emerald-500 to-teal-400',
    'from-amber-500 to-orange-400',
    'from-violet-500 to-purple-400',
    'from-rose-500 to-pink-400',
    'from-sky-500 to-indigo-400',
  ]
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const gradient = gradients[hash % gradients.length]!

  const inner = (
    <div className="group w-64 shrink-0 overflow-hidden rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Gradient hero area */}
      <div className={`relative h-32 bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 bg-black/10" />
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

export async function NearbySection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinations = (sectionProps.destinations as any[]) ?? []
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
          {destinations.map((d: any, i: number) => {
            const name = typeof d === 'string' ? d : d.name
            const country = typeof d === 'string' ? null : (d.country ?? null)
            const slug = typeof d === 'string' ? null : (d.slug ?? null)
            return (
              <NearbyDestinationCard
                key={slug || name || i}
                name={name}
                country={country}
                slug={slug}
              />
            )
          })}
        </div>
      </FeedSection>
    </div>
  )
}
