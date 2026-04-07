import { publicFetch } from '@/lib/api'
import { getCuratedImage } from '@/lib/curated-images'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import type { PublishedTrip } from '@/types/published-trip'

interface AdvisorCuratedTripsProps {
  slug: string
  advisorName: string
}

async function fetchAdvisorTrips(slug: string): Promise<PublishedTrip[]> {
  try {
    return await publicFetch<PublishedTrip[]>(
      `/advisor-profiles/by-slug/${slug}/trips`,
      { next: { tags: [`advisor-${slug}-trips`] } },
    )
  } catch {
    return []
  }
}

function extractTripTitle(snapshot: Record<string, unknown>): string {
  if (typeof snapshot.name === 'string' && snapshot.name) return snapshot.name
  if (typeof snapshot.title === 'string' && snapshot.title) return snapshot.title
  if (typeof snapshot.tripName === 'string' && snapshot.tripName) return snapshot.tripName
  return 'Curated Trip'
}

function extractTripSubtitle(snapshot: Record<string, unknown>): string | null {
  if (typeof snapshot.subtitle === 'string' && snapshot.subtitle) return snapshot.subtitle
  if (typeof snapshot.tagline === 'string' && snapshot.tagline) return snapshot.tagline
  if (typeof snapshot.description === 'string' && snapshot.description) {
    return snapshot.description.slice(0, 80) + (snapshot.description.length > 80 ? '…' : '')
  }
  return null
}

function extractStartingPrice(snapshot: Record<string, unknown>): number | null {
  if (snapshot.pricing && typeof snapshot.pricing === 'object' && snapshot.pricing !== null) {
    const pricing = snapshot.pricing as Record<string, unknown>
    if (typeof pricing.fromPriceCents === 'number') return pricing.fromPriceCents
    if (typeof pricing.priceCents === 'number') return pricing.priceCents
  }
  if (typeof snapshot.fromPriceCents === 'number') return snapshot.fromPriceCents
  if (typeof snapshot.priceCents === 'number') return snapshot.priceCents
  if (typeof snapshot.startingPriceCents === 'number') return snapshot.startingPriceCents
  return null
}

function extractSpotsLeft(snapshot: Record<string, unknown>): number | null {
  if (typeof snapshot.spotsLeft === 'number') return snapshot.spotsLeft
  if (typeof snapshot.availableSpots === 'number') return snapshot.availableSpots
  if (
    snapshot.availability &&
    typeof snapshot.availability === 'object' &&
    snapshot.availability !== null
  ) {
    const avail = snapshot.availability as Record<string, unknown>
    if (typeof avail.spotsLeft === 'number') return avail.spotsLeft
    if (typeof avail.available === 'number') return avail.available
  }
  return null
}

function getTypeBadge(publishType: PublishedTrip['publishType'], firstName: string): string {
  switch (publishType) {
    case 'hosted':
      return `Hosted by ${firstName}`
    case 'featured':
      return `${firstName}'s Pick`
    case 'recommended':
      return 'Recommended'
    case 'custom':
      return 'Featured Trip'
  }
}

const FALLBACK_GRADIENTS = [
  'from-[#C59746] to-[#E89E4A]',
  'from-[#2C5F7C] to-[#4A9BB5]',
  'from-[#3A6B52] to-[#5C9B7A]',
  'from-[#8B5E3C] to-[#C49063]',
]

export async function AdvisorCuratedTrips({ slug, advisorName }: AdvisorCuratedTripsProps) {
  const trips = await fetchAdvisorTrips(slug)
  const displayTrips = trips.slice(0, 4)

  if (displayTrips.length === 0) return null

  const firstName = advisorName.split(' ')[0] ?? advisorName

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl">
              {firstName}&apos;s Curated Trips
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Itineraries personally crafted by {firstName}
            </p>
          </div>
          {trips.length > 4 && (
            <a
              href={`/advisor/${slug}/trips`}
              className="text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
            >
              View all {trips.length} &rarr;
            </a>
          )}
        </div>

        {/* Cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {displayTrips.map((trip, index) => {
            const snapshot = trip.renderedSnapshot
            const title = extractTripTitle(snapshot)
            const subtitle = extractTripSubtitle(snapshot)
            const priceCents = extractStartingPrice(snapshot)
            const spotsLeft = extractSpotsLeft(snapshot)

            const price =
              priceCents != null
                ? new Intl.NumberFormat('en-CA', {
                    style: 'currency',
                    currency: 'CAD',
                    maximumFractionDigits: 0,
                  }).format(priceCents / 100)
                : null

            const fallbackGradient =
              FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length] ??
              FALLBACK_GRADIENTS[0]!

            // Use hero image if available, otherwise a curated destination image
            const imageUrl =
              trip.heroImageUrl ??
              getCuratedImage(title, 'default', 'card')

            return (
              <ImageCardFrame
                key={trip.id}
                imageUrl={imageUrl}
                fallbackGradient={fallbackGradient}
                typeBadge={getTypeBadge(trip.publishType, firstName)}
                price={price}
                priceLabel={price ? ' CAD' : undefined}
                href={`/advisor/${slug}/trips/${trip.slug}`}
                height={280}
                priority={index === 0}
              >
                <h3 className="text-sm font-bold leading-snug text-white drop-shadow-sm line-clamp-2">
                  {title}
                </h3>
                {subtitle && (
                  <p className="mt-0.5 text-xs leading-snug text-white/75 line-clamp-1">
                    {subtitle}
                  </p>
                )}
                {spotsLeft != null && spotsLeft <= 6 && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#E85C50]/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                    🔥 Only {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left
                  </span>
                )}
              </ImageCardFrame>
            )
          })}
        </div>
      </div>
    </section>
  )
}
