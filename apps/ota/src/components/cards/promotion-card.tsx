// apps/ota/src/components/cards/promotion-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
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

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
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
  const priceLoading = props.priceLoading || props.fromPriceCents === undefined

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/deals/${props.slug}`} className="block">
        <div className="relative h-52 overflow-hidden sm:h-60">
          <SafeImage
            src={props.imageUrl ?? ''}
            alt={props.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-600 to-orange-500 text-3xl text-white">
                🎁
              </div>
            }
          />
          {/* OFFER badge */}
          <span className="absolute left-2.5 top-2.5 rounded-lg bg-[#C59746] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            Offer
          </span>
          {/* Savings badge */}
          {props.savingsLabel && (
            <span className="absolute right-2.5 top-2.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow">
              {props.savingsLabel}
            </span>
          )}
          {/* Supplier badge */}
          <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
            {props.supplierName}
          </span>
        </div>
      </Link>

      <div className="p-4 sm:p-5">
        <Link href={`/deals/${props.slug}`}>
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">
            {props.title}
          </h3>
          {props.headline && (
            <p className="mt-1 text-sm text-[#555]">{props.headline}</p>
          )}
          {props.validUntil && (
            <p className="mt-1 text-xs text-[#aaa]">
              Valid until {formatDate(props.validUntil)}
            </p>
          )}
        </Link>

        <div className="mt-3 flex items-center justify-between">
          <div>
            {priceLoading ? (
              <PriceShimmer />
            ) : props.fromPriceCents != null ? (
              <>
                <span className="text-xs text-[#888]">From </span>
                <span className="text-xl font-bold text-[#C59746] sm:text-2xl">
                  {formatPrice(props.fromPriceCents)}
                </span>
                <span className="ml-1 text-xs text-[#888]">/person</span>
              </>
            ) : (
              <span className="text-sm text-[#888]">See offer →</span>
            )}
          </div>
          <AddToTripButton component={buildTripComponent(props)} />
        </div>
      </div>
    </div>
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
