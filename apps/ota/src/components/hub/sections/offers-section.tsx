// apps/ota/src/components/hub/sections/offers-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import { PromotionCard } from '@/components/cards/promotion-card'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function OffersSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const offers = (sectionProps.offers as any[]) ?? []
  if (offers.length === 0) return null

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      {offers.length === 1 ? (
        // Single offer: full-width card
        <PromotionCard
          id={offers[0].id}
          slug={offers[0].slug}
          title={offers[0].title}
          headline={offers[0].headline}
          supplierName={offers[0].supplierName}
          imageUrl={offers[0].imageUrl ?? null}
          savingsLabel={offers[0].savingsLabel}
          validUntil={offers[0].validUntil}
          fromPriceCents={offers[0].fromPriceCents ?? null}
          priceLoading={offers[0].priceLoading}
          variant="full"
        />
      ) : (
        // Multiple offers: 2-col grid
        <div className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer: any) => (
            <PromotionCard
              key={offer.id}
              id={offer.id}
              slug={offer.slug}
              title={offer.title}
              headline={offer.headline}
              supplierName={offer.supplierName}
              imageUrl={offer.imageUrl ?? null}
              savingsLabel={offer.savingsLabel}
              validUntil={offer.validUntil}
              fromPriceCents={offer.fromPriceCents ?? null}
              priceLoading={offer.priceLoading}
              variant="full"
            />
          ))}
        </div>
      )}
    </FeedSection>
  )
}
