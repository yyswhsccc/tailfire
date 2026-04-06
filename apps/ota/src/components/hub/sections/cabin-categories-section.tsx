// apps/ota/src/components/hub/sections/cabin-categories-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { fetchShipCabinSummary } from '@/lib/fetchers/ships'
import { formatPrice } from '@/lib/format'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

const CATEGORY_COLORS: Record<string, string> = {
  interior: '#64748b',
  inside: '#64748b',
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

// Sailing prices passed via sectionProps from the sailing adapter
interface SailingPrices {
  inside: number | null
  oceanview: number | null
  balcony: number | null
  suite: number | null
}

const CABIN_TIERS: Array<{ key: keyof SailingPrices; label: string; colorClass: string }> = [
  { key: 'inside', label: 'Inside', colorClass: 'bg-slate-100 text-slate-700' },
  { key: 'oceanview', label: 'Ocean View', colorClass: 'bg-sky-50 text-sky-700' },
  { key: 'balcony', label: 'Balcony', colorClass: 'bg-amber-50 text-amber-700' },
  { key: 'suite', label: 'Suite', colorClass: 'bg-violet-50 text-violet-700' },
]

function SailingPricingGrid({ prices }: { prices: SailingPrices }) {
  const available = CABIN_TIERS.filter((t) => prices[t.key] != null)
  if (available.length === 0) {
    return <p className="text-sm text-[#888]">Contact for pricing</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {available.map((tier) => (
        <div
          key={tier.key}
          className={`flex flex-col items-center justify-center rounded-xl border border-[#E0E0E0] p-4 ${tier.colorClass}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{tier.label}</p>
          <p className="mt-1 text-lg font-bold">{formatPrice(prices[tier.key]!)}</p>
          <p className="text-[10px] opacity-60">per person</p>
        </div>
      ))}
    </div>
  )
}

export async function CabinCategoriesSection({
  entityType,
  entitySlug,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  // --- Sailing: render pricing grid from sectionProps ---
  const sailingPrices = sectionProps.sailingPrices as SailingPrices | undefined
  if (entityType === 'sailing' && sailingPrices) {
    return (
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        <SailingPricingGrid prices={sailingPrices} />
      </FeedSection>
    )
  }

  // --- Ship: fetch cabin summary from API ---
  if (entityType !== 'ship') return null

  // Ship adapter passes shipId (UUID) in sectionProps; fall back to entitySlug for compat
  const shipId = (sectionProps.shipId as string) || entitySlug

  let cabins: Array<{
    category: string
    count: number
    imageUrl: string | null
  }> = []

  try {
    cabins = await fetchShipCabinSummary(shipId)
  } catch (err) {
    console.warn('[CabinCategoriesSection] Fetch failed:', (err as Error)?.message || 'unknown error')
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
