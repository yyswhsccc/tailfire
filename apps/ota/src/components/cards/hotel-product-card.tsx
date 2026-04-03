// apps/ota/src/components/cards/hotel-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
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
  const topAmenities = props.amenities?.slice(0, 3) ?? []

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href="/search/hotels" className="block">
        <div className="relative h-48 overflow-hidden sm:h-52">
          <SafeImage
            src={props.imageUrl ?? ''}
            alt={props.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-2xl text-[#C59746]">🏨</div>}
          />
          {/* Star rating overlay — top-left */}
          {props.starRating != null && props.starRating > 0 && (
            <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-yellow-400 backdrop-blur">
              {renderStars(props.starRating)}
            </span>
          )}
          {/* Board type badge — top-right */}
          {props.boardType && (
            <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
              {props.boardType}
            </span>
          )}
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <Link href="/search/hotels">
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{props.name}</h3>
          {props.location && (
            <p className="mt-1 text-sm text-[#888]">{props.location}</p>
          )}
          {/* Star display + user rating */}
          <div className="mt-1 flex items-center gap-2">
            {props.starRating != null && props.starRating > 0 && (
              <span className="text-xs font-semibold text-yellow-500">{renderStars(props.starRating)}</span>
            )}
            {props.userRating != null && (
              <span className="text-xs text-[#888]">
                {props.userRating.toFixed(1)}
                {props.reviewCount != null && (
                  <span className="ml-1">({props.reviewCount.toLocaleString()} reviews)</span>
                )}
              </span>
            )}
          </div>
        </Link>
        {/* Amenity pills */}
        {topAmenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topAmenities.map((amenity) => (
              <span
                key={amenity}
                className="rounded-full bg-[#f5f0e8] px-2 py-0.5 text-[10px] font-medium text-[#8B6A1F]"
              >
                {amenity}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div>
            {priceLoading ? (
              <PriceShimmer />
            ) : props.priceCents != null ? (
              <>
                <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(props.priceCents)}</span>
                <span className="ml-1 text-xs text-[#888]">/night</span>
              </>
            ) : (
              <span className="text-sm text-[#888]">Check price →</span>
            )}
          </div>
          <AddToTripButton component={buildTripComponent(props)} />
        </div>
      </div>
    </div>
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
