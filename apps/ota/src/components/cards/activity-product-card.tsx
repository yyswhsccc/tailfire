// apps/ota/src/components/cards/activity-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface ActivityProductCardProps {
  id: string
  name: string
  imageUrl: string | null
  category?: string
  duration?: string
  rating?: number
  reviewCount?: number
  inclusions?: string[]
  provider?: string
  /** Price in cents per person — undefined means "still loading", null means "no price available" */
  priceCents?: number | null
  /** If true, show shimmer instead of price */
  priceLoading?: boolean
  variant?: CardVariant
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100)
}

function buildTripComponent(props: ActivityProductCardProps): TripComponent {
  return {
    id: `activity-${props.id}`,
    type: 'custom',
    data: {
      activityId: props.id,
      category: props.category,
      duration: props.duration,
      provider: props.provider,
    },
    display: {
      heroImage: props.imageUrl ?? undefined,
      title: props.name,
      subtitle: [props.category, props.duration].filter(Boolean).join(' · ') || undefined,
      price: props.priceCents != null ? `${formatPrice(props.priceCents)}/pp` : undefined,
    },
  }
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.5
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-[10px] ${i < full ? 'text-[#C59746]' : i === full && hasHalf ? 'text-[#C59746] opacity-60' : 'text-[#ccc]'}`}>★</span>
      ))}
    </span>
  )
}

function ActivityFull(props: ActivityProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)
  const visibleInclusions = props.inclusions?.slice(0, 2) ?? []

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/search/tours`} className="block">
        <div className="relative h-48 overflow-hidden sm:h-52">
          <SafeImage
            src={props.imageUrl ?? ''}
            alt={props.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-2xl text-[#C59746]">🏄</div>}
          />
          {/* Category badge — top-left, gold bg */}
          {props.category && (
            <span className="absolute left-2.5 top-2.5 rounded-lg bg-[#C59746] px-2.5 py-1 text-[10px] font-semibold text-white">
              {props.category}
            </span>
          )}
          {/* Duration badge — top-right */}
          {props.duration && (
            <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#1A1A1A] backdrop-blur">
              {props.duration}
            </span>
          )}
          {/* Rating — bottom-right on image */}
          {props.rating != null && (
            <span className="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-lg bg-black/60 px-2.5 py-1 backdrop-blur">
              <StarRating rating={props.rating} />
              <span className="text-[10px] font-semibold text-white">{props.rating.toFixed(1)}</span>
              {props.reviewCount != null && (
                <span className="text-[9px] text-white/70">({props.reviewCount})</span>
              )}
            </span>
          )}
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <Link href={`/search/tours`}>
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{props.name}</h3>
          {props.provider && (
            <p className="mt-1 text-sm text-[#888]">{props.provider}</p>
          )}
        </Link>
        {visibleInclusions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleInclusions.map((inc) => (
              <span key={inc} className="rounded-full border border-[#e8e8e8] px-2.5 py-0.5 text-[11px] text-[#666]">
                {inc}
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
                <span className="ml-1 text-xs text-[#888]">/pp</span>
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

function ActivityCompact(props: ActivityProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link href={`/search/tours`} className="relative w-24 shrink-0 sm:w-28">
        <SafeImage
          src={props.imageUrl ?? ''}
          alt={props.name}
          fill
          className="object-cover"
          sizes="112px"
          fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-lg text-[#C59746]">🏄</div>}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href={`/search/tours`}>
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">{props.name}</p>
          <p className="mt-0.5 text-xs text-[#888]">
            {[props.category, props.duration].filter(Boolean).join(' · ')}
          </p>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.priceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">{formatPrice(props.priceCents)}<span className="ml-0.5 text-xs font-normal text-[#888]">/pp</span></span>
          ) : (
            <span className="text-xs text-[#888]">Check price</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

function ActivityMini(props: ActivityProductCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">🏄</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">
          {props.name}{props.duration ? ` · ${props.duration}` : ''}
        </p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}/pp</p>
        )}
      </div>
    </div>
  )
}

export function ActivityProductCard({ variant = 'full', ...props }: ActivityProductCardProps) {
  switch (variant) {
    case 'compact': return <ActivityCompact {...props} />
    case 'mini': return <ActivityMini {...props} />
    default: return <ActivityFull {...props} />
  }
}
