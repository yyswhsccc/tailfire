import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import { publicFetch } from '@/lib/api'
import type { Deal } from '@/types/deal'
import { formatPrice, calculateSavings } from '@/lib/format'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { dealAdapter } from '@/lib/entity-hubs/adapters/deal.adapter'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'

export const revalidate = 3600

interface DealPageProps {
  params: Promise<{ slug: string }>
}

async function fetchDeal(slug: string): Promise<Deal | null> {
  try {
    return await publicFetch<Deal>(`/deals/by-slug/${slug}`, {
      next: { tags: ['deals', `deal-${slug}`] },
    })
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: DealPageProps): Promise<Metadata> {
  const { slug } = await params
  const deal = await fetchDeal(slug)

  if (!deal) {
    return { title: 'Offer Not Found | Phoenix Voyages' }
  }

  const title = deal.seoMeta?.title ?? `${deal.title} | Phoenix Voyages`
  const description =
    deal.seoMeta?.description ??
    deal.description ??
    `Explore this exclusive ${deal.productType} offer from Phoenix Voyages.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/deals/${deal.slug}`,
    },
  }
}

export default async function DealPage({ params }: DealPageProps) {
  const { slug } = await params
  const deal = await fetchDeal(slug)

  if (!deal) {
    notFound()
  }

  // Derived pricing values used in the inline children content
  const hasPrice = deal.pricing.fromPriceCents != null
  const hasOriginalPrice =
    deal.pricing.originalPriceCents != null && deal.pricing.fromPriceCents != null
  const savings = hasOriginalPrice
    ? calculateSavings(deal.pricing.originalPriceCents!, deal.pricing.fromPriceCents!)
    : 0
  const savingsAmount = hasOriginalPrice
    ? deal.pricing.originalPriceCents! - deal.pricing.fromPriceCents!
    : 0

  const validUntil = deal.validUntil
    ? new Date(deal.validUntil).toLocaleDateString('en-CA', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <HubScaffold
      hero={dealAdapter.heroData(deal)}
      contextPills={dealAdapter.contextPills(deal)}
      sections={dealAdapter.sections(deal)}
      aiContext={dealAdapter.aiContext(deal)}
      entityType="deal"
      entitySlug={slug}
    >
      {/* Pricing */}
      <FeedSection title="\uD83D\uDCB0 Pricing">
        <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5 shadow-sm sm:max-w-sm">
          {hasPrice ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#888]">Starting from</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[#1A1A1A]">
                  {formatPrice(deal.pricing.fromPriceCents!)}
                </span>
                <span className="text-sm text-[#888]">/person</span>
              </div>
              {hasOriginalPrice && savings > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-sm text-[#888] line-through">
                    {formatPrice(deal.pricing.originalPriceCents!)}
                  </span>
                  <span className="rounded-md bg-red-50 px-2 py-0.5 text-sm font-semibold text-[#B33939]">
                    Save {savings}% ({formatPrice(savingsAmount)} off)
                  </span>
                </div>
              )}
              {deal.pricing.priceNote && (
                <p className="mt-1.5 text-xs text-[#888]">{deal.pricing.priceNote}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#888]">Contact us for pricing on this offer.</p>
          )}
        </div>
      </FeedSection>

      <FeedDivider />

      {/* Booking CTA */}
      <FeedSection title="\uD83D\uDCDE Book This Offer">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-[10px] bg-[#C59746] px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Inquire Now
          </Link>
          <Link
            href="/search/cruises"
            className="inline-flex items-center justify-center rounded-[10px] border border-[#e0e0e0] bg-white px-7 py-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#f9f9f9]"
          >
            Browse All Cruises
          </Link>
        </div>
        {validUntil && (
          <p className="mt-4 text-xs text-[#aaa]">
            Offer valid until {validUntil} &middot; Subject to availability
          </p>
        )}
      </FeedSection>
    </HubScaffold>
  )
}
