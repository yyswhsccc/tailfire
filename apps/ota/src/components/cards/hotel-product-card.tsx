// apps/ota/src/components/cards/hotel-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface HotelProductCardProps {
  id: string
  name: string
  imageUrl: string | null
  starRating?: number          // 1-5 stars
  userRating?: number          // e.g., 4.7
  reviewCount?: number
  amenities?: string[]         // "Pool", "Spa", "Beachfront"
  location?: string            // "Cancun, Mexico"
  boardType?: string           // "All-Inclusive", "Room Only", "B&B"
  /** Price in cents per night — undefined means "still loading", null means "no price available" */
  priceCents?: number | null
  /** If true, show shimmer instead of price */
  priceLoading?: boolean
  checkInDate?: string
  nights?: number
  variant?: CardVariant
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100)
}

function renderStars(count: number): string {
  return '★'.repeat(Math.min(Math.max(Math.round(count), 0), 5))
}

function buildTripComponent(props: HotelProductCardProps): TripComponent {
  return {
    id: `hotel-${props.id}`,
    type: 'hotel',
    data: {
      hotelId: props.id,
      propertyName: props.name,
      location: props.location,
      boardType: props.boardType,
      checkInDate: props.checkInDate,
      nights: props.nights,
      starRating: props.starRating,
    },
    display: {
      heroImage: props.imageUrl ?? undefined,
      title: props.name,
      subtitle: [props.location, props.boardType].filter(Boolean).join(' · ') || undefined,
      price: props.priceCents != null ? formatPrice(props.priceCents) + '/night' : undefined,
    },
  }
}

function HotelFull(props: HotelProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)
  const priceStr = props.priceCents != null ? formatPrice(props.priceCents) : null
  const stars = props.starRating ? '★'.repeat(Math.min(props.starRating, 5)) : ''

  return (
    <ImageCardFrame
      imageUrl={props.imageUrl}
      fallbackGradient="from-amber-500 to-amber-700"
      typeBadge={`🏨 ${stars || 'Hotel'}`}
      price={priceStr}
      priceLoading={priceLoading}
      priceLabel="/night"
      href="/search/hotels"
      tripComponent={buildTripComponent(props)}
      height={280}
    >
      <p className="text-base font-bold leading-tight text-white">{props.name}</p>
      {props.location && <p className="mt-0.5 text-sm text-white/80">{props.location}</p>}
      {props.boardType && <p className="mt-0.5 text-xs text-white/60">{props.boardType}</p>}
      {props.amenities && props.amenities.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {props.amenities.slice(0, 3).map((a, i) => (
            <span key={i} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">{a}</span>
          ))}
        </div>
      )}
    </ImageCardFrame>
  )
}

function HotelCompact(props: HotelProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link href="/search/hotels" className="relative w-24 shrink-0 sm:w-28">
        <SafeImage
          src={props.imageUrl ?? ''}
          alt={props.name}
          fill
          className="object-cover"
          sizes="112px"
          fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-lg text-[#C59746]">🏨</div>}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href="/search/hotels">
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">{props.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {props.starRating != null && props.starRating > 0 && (
              <span className="text-[10px] font-semibold text-yellow-500">{renderStars(props.starRating)}</span>
            )}
            {props.userRating != null && (
              <span className="text-xs text-[#888]">{props.userRating.toFixed(1)}</span>
            )}
          </div>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.priceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">{formatPrice(props.priceCents)}<span className="ml-0.5 text-[10px] font-normal text-[#888]">/night</span></span>
          ) : (
            <span className="text-xs text-[#888]">Check price</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

function HotelMini(props: HotelProductCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">🏨</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">
          {props.name}
          {props.nights != null && ` · ${props.nights}N`}
        </p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}/night</p>
        )}
      </div>
    </div>
  )
}

export function HotelProductCard({ variant = 'full', ...props }: HotelProductCardProps) {
  switch (variant) {
    case 'compact': return <HotelCompact {...props} />
    case 'mini': return <HotelMini {...props} />
    default: return <HotelFull {...props} />
  }
}
