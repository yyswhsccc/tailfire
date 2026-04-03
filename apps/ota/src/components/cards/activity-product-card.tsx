// apps/ota/src/components/cards/activity-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
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

function ActivityFull(props: ActivityProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)
  const priceStr = props.priceCents != null ? formatPrice(props.priceCents) : null
  const ratingStr = props.rating ? `⭐ ${props.rating.toFixed(1)}` : ''

  return (
    <ImageCardFrame
      imageUrl={props.imageUrl}
      fallbackGradient="from-rose-500 to-pink-400"
      typeBadge={`🏄 ${props.category || 'Activity'}`}
      price={priceStr}
      priceLoading={priceLoading}
      priceLabel="/pp"
      href="/search/tours"
      tripComponent={buildTripComponent(props)}
      height={260}
    >
      <p className="text-base font-bold leading-tight text-white">{props.name}</p>
      {props.duration && <p className="mt-0.5 text-sm text-white/80">{props.duration}{ratingStr ? ` · ${ratingStr}` : ''}</p>}
      {props.provider && <p className="mt-0.5 text-xs text-white/60">{props.provider}</p>}
    </ImageCardFrame>
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
