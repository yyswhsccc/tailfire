// apps/ota/src/components/hub/sections/tours-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { TourProductCard } from '@/components/cards/tour-product-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export function ToursSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const tours = (sectionProps.tours as any[] | undefined) ?? []

  if (tours.length === 0) return null

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {tours.slice(0, 4).map((t: any) => (
          <TourProductCard
            key={t.id}
            id={t.id}
            name={t.name}
            operatorName={t.operatorName ?? t.operatorCode ?? 'Tour Operator'}
            operatorCode={t.operatorCode}
            durationDays={t.durationDays ?? t.days ?? 0}
            imageUrl={t.imageUrl ?? null}
            highlights={t.highlights}
            priceCents={t.priceCents ?? t.lowestPriceCents}
          />
        ))}
      </div>
    </FeedSection>
  )
}
