// apps/ota/src/components/cards/promotion-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import { ImageCardFrame } from '@/components/cards/image-card-frame'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface PromotionCardProps {
  id: string
  slug: string
  title: string
  headline?: string
  supplierName: string
  imageUrl: string | null
  savingsLabel?: string
  validUntil?: string
  fromPriceCents?: number | null
  priceLoading?: boolean
  variant?: CardVariant
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function buildTripComponent(props: PromotionCardProps): TripComponent {
  return {
    id: `deal-${props.id}`,
    type: 'custom',
    data: {
      dealId: props.id,
      dealSlug: props.slug,
      supplierName: props.supplierName,
      savingsLabel: props.savingsLabel,
    },
    display: {
      heroImage: props.imageUrl ?? undefined,
      title: props.title,
      subtitle: props.supplierName,
      price:
        props.fromPriceCents != null ? formatPrice(props.fromPriceCents) : undefined,
    },
  }
}

function PromotionFull(props: PromotionCardProps) {
  const priceLoading = props.priceLoading || (props.fromPriceCents === undefined)
  const priceStr = props.fromPriceCents != null ? formatPrice(props.fromPriceCents) : null

  return (
    <ImageCardFrame
      imageUrl={props.imageUrl}
      fallbackGradient="from-violet-500 to-purple-400"
      typeBadge="⭐ Offer"
      price={priceStr ? `from ${priceStr}` : null}
      priceLoading={priceLoading}
      href={`/deals/${props.slug}`}
      tripComponent={buildTripComponent(props)}
      height={280}
    >
      <p className="text-base font-bold leading-tight text-white">{props.title}</p>
      {props.supplierName && <p className="mt-0.5 text-sm text-white/80">{props.supplierName}</p>}
      {props.savingsLabel && (
        <span className="mt-1 inline-block rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
          {props.savingsLabel}
        </span>
      )}
      {props.validUntil && <p className="mt-0.5 text-xs text-white/60">Valid until {props.validUntil}</p>}
    </ImageCardFrame>
  )
}

function PromotionCompact(props: PromotionCardProps) {
  const priceLoading = props.priceLoading || props.fromPriceCents === undefined

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link
        href={`/deals/${props.slug}`}
        className="relative w-24 shrink-0 sm:w-28"
      >
        <SafeImage
          src={props.imageUrl ?? ''}
          alt={props.title}
          fill
          className="object-cover"
          sizes="112px"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-600 to-orange-500 text-lg text-white">
              🎁
            </div>
          }
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href={`/deals/${props.slug}`}>
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">
            {props.title}
          </p>
          <p className="mt-0.5 text-xs text-[#888]">{props.supplierName}</p>
          {props.savingsLabel && (
            <p className="mt-0.5 text-xs font-semibold text-red-600">
              {props.savingsLabel}
            </p>
          )}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.fromPriceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">
              {formatPrice(props.fromPriceCents)}
            </span>
          ) : (
            <span className="text-xs text-[#888]">See offer</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

function PromotionMini(props: PromotionCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">⭐</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">
          {props.title}
        </p>
        {props.savingsLabel && (
          <p className="text-xs font-semibold text-red-600">{props.savingsLabel}</p>
        )}
      </div>
    </div>
  )
}

export function PromotionCard({ variant = 'full', ...props }: PromotionCardProps) {
  switch (variant) {
    case 'compact':
      return <PromotionCompact {...props} />
    case 'mini':
      return <PromotionMini {...props} />
    default:
      return <PromotionFull {...props} />
  }
}
