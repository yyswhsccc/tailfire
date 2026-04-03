// apps/ota/src/components/hub/sections/hotels-section.tsx

import Link from 'next/link'
import { cookies } from 'next/headers'
import { FeedSection } from '@/components/hub/feed-section'
import { HotelProductCard } from '@/components/cards/hotel-product-card'
import { parseTravelSessionCookie, TRAVEL_SESSION_COOKIE } from '@/lib/travel-session'
import { API_URL, OTA_SERVICE_KEY } from '@/lib/config'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'
import type { HotelProductCardProps } from '@/components/cards/hotel-product-card'

// ---------------------------------------------------------------------------
// HotelsSection (async Server Component)
//
// When travel dates exist in the cookie, fetches real hotel data from the
// OTA hotels search endpoint and renders up to 4 full hotel cards.
// Falls back to a CTA card when dates are missing or the fetch fails.
// ---------------------------------------------------------------------------

// -- API response shape (matches HotelOffer in search/hotels/page) ----------

interface HotelPriceOffer {
  checkIn: string
  checkOut: string
  roomType?: string
  price: { currency: string; total: string; base?: string; taxes?: string }
  cancellationPolicy?: { deadline?: string; refundable?: boolean; description?: string }
  boardType?: string
}

interface HotelOffer {
  id: string
  placeId?: string
  hotelId?: string
  name: string
  description?: string
  location: {
    address: string
    city?: string
    country?: string
    postalCode?: string
    latitude?: number
    longitude?: number
  }
  phone?: string
  website?: string
  rating?: number
  reviewCount?: number
  starRating?: number
  photos?: { url: string; thumbnailUrl?: string }[]
  amenities?: string[]
  offers?: HotelPriceOffer[]
  provider: string
}

interface HotelSearchResponse {
  results: HotelOffer[]
  warning?: string
}

// -- Mapping helpers --------------------------------------------------------

const BOARD_BASIS_LABELS: Record<string, string> = {
  ROOM_ONLY: 'Room Only',
  BREAKFAST: 'Breakfast Included',
  HALF_BOARD: 'Half Board',
  FULL_BOARD: 'Full Board',
  ALL_INCLUSIVE: 'All Inclusive',
}

function hotelOfferToCardProps(hotel: HotelOffer): HotelProductCardProps {
  const bestOffer = hotel.offers?.[0]
  const locationParts = [hotel.location.city, hotel.location.country].filter(Boolean)
  const priceCents = bestOffer
    ? Math.round(parseFloat(bestOffer.price.total) * 100) || null
    : null
  const boardType = bestOffer?.boardType
    ? (BOARD_BASIS_LABELS[bestOffer.boardType] ?? bestOffer.boardType)
    : undefined

  return {
    id: hotel.id,
    name: hotel.name,
    imageUrl: hotel.photos?.[0]?.url ?? null,
    starRating: hotel.starRating,
    userRating: hotel.rating,
    reviewCount: hotel.reviewCount,
    amenities: hotel.amenities,
    location: locationParts.join(', ') || undefined,
    boardType,
    priceCents,
    checkInDate: bestOffer?.checkIn,
  }
}

// -- Component --------------------------------------------------------------

export async function HotelsSection({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  sectionProps,
}: SectionComponentProps) {
  const destinationName = (sectionProps.destinationName as string | undefined) ?? 'this destination'

  // ---- Try to fetch real hotel data from the travel session ----
  let hotels: HotelProductCardProps[] = []

  try {
    const cookieStore = await cookies()
    const session = parseTravelSessionCookie(cookieStore.get(TRAVEL_SESSION_COOKIE)?.value)

    if (session.departureDate && session.returnDate) {
      const qs = new URLSearchParams({
        destination: destinationName,
        checkIn: session.departureDate,
        checkOut: session.returnDate,
        adults: String(session.adults),
      })

      // Use raw fetch (not serviceFetch) to pass Next.js ISR `next` option
      const res = await fetch(`${API_URL}/ota/search/hotels?${qs}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-ota-service-key': OTA_SERVICE_KEY,
        },
        next: { revalidate: 1800 },
      } as RequestInit)

      if (res.ok) {
        const data: HotelSearchResponse = await res.json()
        if (data.results?.length) {
          hotels = data.results.slice(0, 4).map(hotelOfferToCardProps)
        }
      }
    }
  } catch {
    // Graceful degradation — fall through to CTA card
  }

  // Mode A: real hotel data available — render full cards
  if (hotels.length > 0) {
    return (
      <FeedSection
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        viewAllLabel={viewAllLabel}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.map((hotel) => (
            <HotelProductCard key={hotel.id} variant="full" {...hotel} />
          ))}
        </div>
      </FeedSection>
    )
  }

  // Mode B: no data — render CTA card
  const searchHref = `/search/hotels?destination=${encodeURIComponent(destinationName)}`

  return (
    <FeedSection
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      viewAllLabel={viewAllLabel}
    >
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm border-l-4 border-l-[#C59746]">
        <div className="flex items-center gap-5 p-5 sm:p-6">
          {/* Hotel icon area */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A] text-2xl">
            🏨
          </div>

          {/* Text + CTA */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#1A1A1A] sm:text-lg">
              Find hotels in {destinationName}
            </p>
            <p className="mt-0.5 text-sm text-[#666]">
              Compare rates and availability for your travel dates.
            </p>
            <Link
              href={searchHref}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#C59746] hover:underline"
            >
              Compare rates and availability →
            </Link>
          </div>
        </div>
      </div>
    </FeedSection>
  )
}
