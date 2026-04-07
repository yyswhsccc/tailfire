import { publicFetch } from '@/lib/api'
import { getCuratedImage } from '@/lib/curated-images'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import type { Deal } from '@/types/deal'

interface AdvisorFeaturedDealsProps {
  slug: string
  advisorName: string
}

async function fetchAdvisorDeals(slug: string): Promise<Deal[]> {
  try {
    return await publicFetch<Deal[]>(
      `/advisor-profiles/by-slug/${slug}/deals`,
      { next: { tags: [`advisor-${slug}-deals`] } },
    )
  } catch {
    return []
  }
}

function formatSavings(deal: Deal): string | null {
  const { fromPriceCents, originalPriceCents, priceNote } = deal.pricing

  if (priceNote) return priceNote

  if (
    fromPriceCents != null &&
    originalPriceCents != null &&
    originalPriceCents > fromPriceCents
  ) {
    const savedCents = originalPriceCents - fromPriceCents
    const savedDollars = Math.round(savedCents / 100)
    return `Save $${savedDollars.toLocaleString('en-CA')}`
  }

  if (fromPriceCents != null) {
    return `From ${new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: deal.pricing.currency ?? 'CAD',
      maximumFractionDigits: 0,
    }).format(fromPriceCents / 100)}`
  }

  return null
}

function getDealTypeBadge(productType: string): string {
  const map: Record<string, string> = {
    cruise: '🚢 Cruise',
    flight: '✈️ Flight',
    hotel: '🏨 Hotel',
    tour: '🗺️ Tour',
    package: '📦 Package',
    vacation: '🌴 Vacation',
  }
  return map[productType.toLowerCase()] ?? productType
}

const FALLBACK_GRADIENTS = [
  'from-[#2C5F7C] to-[#4A9BB5]',
  'from-[#C59746] to-[#E89E4A]',
  'from-[#3A6B52] to-[#5C9B7A]',
  'from-[#5A4B8A] to-[#8A7CB8]',
]

export async function AdvisorFeaturedDeals({ slug, advisorName }: AdvisorFeaturedDealsProps) {
  const deals = await fetchAdvisorDeals(slug)
  const displayDeals = deals.slice(0, 4)

  if (displayDeals.length === 0) return null

  const firstName = advisorName.split(' ')[0] ?? advisorName

  return (
    <section className="bg-[#faf6f0] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl">
              {firstName}&apos;s Featured Deals
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hand-picked offers selected by {firstName}
            </p>
          </div>
          {deals.length > 4 && (
            <a
              href={`/advisor/${slug}/deals`}
              className="text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
            >
              View all {deals.length} &rarr;
            </a>
          )}
        </div>

        {/* Cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {displayDeals.map((deal, index) => {
            const savings = formatSavings(deal)

            const fallbackGradient =
              FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length] ??
              FALLBACK_GRADIENTS[0]!

            // Use hero image if available, otherwise a curated destination image
            const destination =
              deal.destinations?.[0] ?? deal.title
            const imageUrl =
              deal.heroImageUrl ??
              getCuratedImage(destination, 'default', 'card')

            return (
              <ImageCardFrame
                key={deal.id}
                imageUrl={imageUrl}
                fallbackGradient={fallbackGradient}
                typeBadge={getDealTypeBadge(deal.productType)}
                price={savings}
                href={`/deals/${deal.slug}`}
                height={280}
                priority={index === 0}
              >
                <h3 className="text-sm font-bold leading-snug text-white drop-shadow-sm line-clamp-2">
                  {deal.title}
                </h3>
                {deal.supplierName && (
                  <p className="mt-0.5 text-xs leading-snug text-white/75">
                    {deal.supplierName}
                  </p>
                )}
              </ImageCardFrame>
            )
          })}
        </div>
      </div>
    </section>
  )
}
