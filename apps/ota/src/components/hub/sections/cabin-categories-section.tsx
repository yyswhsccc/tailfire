// apps/ota/src/components/hub/sections/cabin-categories-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { fetchShipCabinSummary } from '@/lib/fetchers/ships'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

const CATEGORY_COLORS: Record<string, string> = {
  interior: '#64748b',
  'ocean view': '#0ea5e9',
  oceanview: '#0ea5e9',
  balcony: '#22c55e',
  suite: '#C59746',
}

function getCategoryColor(category: string): string {
  const key = category.toLowerCase()
  for (const [pattern, color] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(pattern)) return color
  }
  return '#64748b'
}

export async function CabinCategoriesSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps: _sectionProps,
}: SectionComponentProps) {
  if (entityType !== 'ship') return null

  let cabins: Array<{
    category: string
    count: number
    imageUrl: string | null
  }> = []

  try {
    cabins = await fetchShipCabinSummary(entitySlug)
  } catch {
    return null
  }

  if (!cabins || cabins.length === 0) return null

  const totalCabins = cabins.reduce((sum, c) => sum + c.count, 0)
  const resolvedSubtitle = subtitle ?? `${cabins.length} cabin categories · ${totalCabins} total cabins`
  const resolvedViewAll = viewAllLabel

  return (
    <FeedSection
      title={title}
      subtitle={resolvedSubtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={resolvedViewAll}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cabins.map((cabin) => {
          const color = getCategoryColor(cabin.category)
          return (
            <div
              key={cabin.category}
              className="overflow-hidden rounded-xl border border-[#E0E0E0] bg-white shadow-sm"
              style={{ borderTopColor: color, borderTopWidth: 3 }}
            >
              <div className="p-4">
                <p className="text-sm font-bold text-[#1A1A1A]">{cabin.category}</p>
                <p className="mt-1 text-xs text-[#888]">
                  {cabin.count} cabin{cabin.count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </FeedSection>
  )
}
