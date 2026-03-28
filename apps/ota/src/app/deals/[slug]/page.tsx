import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import { publicFetch } from '@/lib/api'
import type { Deal } from '@/types/deal'
import { formatPrice, calculateSavings } from '@/lib/format'
import { HubHero } from '@/components/hub/hub-hero'
import { HubHeroCta } from '@/components/hub/hub-hero-cta'
import { HubContext } from '@/components/hub/hub-context'
import { FeedSection } from '@/components/hub/feed-section'
import { FeedDivider } from '@/components/hub/feed-divider'
import { PageContextBridge } from '@/components/page-context-bridge'

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
    return { title: 'Deal Not Found | Phoenix Voyages' }
  }

  const title = deal.seoMeta?.title ?? `${deal.title} | Phoenix Voyages`
  const description =
    deal.seoMeta?.description ??
    deal.description ??
    `Explore this exclusive ${deal.productType} deal from Phoenix Voyages.`

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

  const daysUntilExpiry = deal.validUntil
    ? Math.ceil((new Date(deal.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const urgencyBadge =
    daysUntilExpiry != null && daysUntilExpiry <= 7 && daysUntilExpiry > 0
      ? `⏰ Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
      : daysUntilExpiry != null && daysUntilExpiry <= 0
        ? '⏰ Expires today'
        : undefined

  const contextPills = [
    deal.productType ? { emoji: '✈️', label: deal.productType } : null,
    deal.supplierName ? { emoji: '🏢', label: deal.supplierName } : null,
    validUntil ? { emoji: '📅', label: `Valid until ${validUntil}` } : null,
    savings > 0 ? { emoji: '💰', label: `Save ${savings}%` } : null,
  ].filter(Boolean) as Array<{ emoji: string; label: string }>

  return (
    <>
      <PageContextBridge type="deal" slug={slug} name={deal.title} />

      <HubHero
        title={deal.title}
        badge="Exclusive Deal"
        imageUrl={deal.heroImageUrl}
        urgencyBadge={urgencyBadge}
      >
        <HubHeroCta
          primaryLabel="Inquire About This Deal"
          primaryPrompt={`Tell me more about the deal: ${deal.title}`}
          entityType="deal"
          entitySlug={slug}
          entityName={deal.title}
        />
      </HubHero>

      <HubContext description={deal.description} pills={contextPills} />

      <FeedSection title="💰 Pricing">
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
            <p className="text-sm text-[#888]">Contact us for pricing on this deal.</p>
          )}
        </div>
      </FeedSection>

      {deal.destinations && deal.destinations.length > 0 && (
        <>
          <FeedDivider />
          <FeedSection title="📍 Destinations">
            <div className="flex flex-wrap gap-2">
              {deal.destinations.map((dest) => (
                <span
                  key={dest}
                  className="rounded-full border border-[#eee] bg-white px-3.5 py-1.5 text-sm font-medium text-[#1A1A1A]"
                >
                  {dest}
                </span>
              ))}
            </div>
          </FeedSection>
        </>
      )}

      <FeedDivider />

      <FeedSection title="📞 Book This Deal">
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
            Deal valid until {validUntil} &middot; Subject to availability
          </p>
        )}
      </FeedSection>
    </>
  )
}
