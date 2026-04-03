// apps/ota/src/components/hub/sections/tours-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { TourProductCard } from '@/components/cards/tour-product-card'
import { catalogFetch } from '@/lib/api'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

interface TourSearchResponse {
  tours: {
    id: string
    name: string
    operatorCode: string
    days?: number
    imageUrl?: string
    lowestPriceCents?: number
  }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function ToursSection({
  entityType,
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  let tours: any[] = []

  try {
    if (entityType === 'destination') {
      const destinationName = sectionProps.destinationName as string
      const data = await catalogFetch<TourSearchResponse>(
        `/tour-repository/tours?q=${encodeURIComponent(destinationName)}&pageSize=4`,
        { next: { revalidate: 3600 } },
      )
      tours = data.tours
    } else {
      tours = (sectionProps.tours as any[] | undefined) ?? []
    }
  } catch {
    return null
  }

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
