// apps/ota/src/components/cards/tour-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface TourProductCardProps {
  id: string
  name: string
  operatorName: string
  operatorCode?: string
  durationDays: number
  imageUrl: string | null
  highlights?: string[]
  /** Price in cents — undefined means "still loading", null means "no price available" */
  priceCents?: number | null
  /** If true, show shimmer instead of price */
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

function buildTripComponent(props: TourProductCardProps): TripComponent {
  return {
    id: `tour-${props.id}`,
    type: 'tour',
    data: {
      tourId: props.id,
      operatorName: props.operatorName,
      operatorCode: props.operatorCode,
      durationDays: props.durationDays,
    },
    display: {
      heroImage: props.imageUrl ?? undefined,
      title: props.name,
      subtitle: `${props.operatorName} · ${props.durationDays}D`,
      price: props.priceCents != null ? formatPrice(props.priceCents) : undefined,
    },
  }
}

function TourFull(props: TourProductCardProps) {
  const priceLoading = props.priceLoading || props.priceCents === undefined
  const highlightsToShow = props.highlights?.slice(0, 2) ?? []

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href="/search/tours" className="block">
        <div className="relative h-48 overflow-hidden sm:h-52">
          <SafeImage
            src={props.imageUrl ?? ''}
            alt={props.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-2xl text-[#C59746]">
                🏞
              </div>
            }
          />
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
            🏞 {props.durationDays} Days
          </span>
          <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
            {props.operatorName}
          </span>
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <Link href="/search/tours">
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{props.name}</h3>
          <p className="mt-1 text-sm text-[#888]">{props.operatorName} · {props.durationDays} days</p>
        </Link>
        {highlightsToShow.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {highlightsToShow.map((h) => (
              <li key={h} className="text-xs text-[#aaa]">• {h}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div>
            {priceLoading ? (
              <PriceShimmer />
            ) : props.priceCents != null ? (
              <>
                <span className="text-xl font-bold text-[#C59746] sm:text-2xl">{formatPrice(props.priceCents)}</span>
                <span className="ml-1 text-xs text-[#888]">/person</span>
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

function TourCompact(props: TourProductCardProps) {
  const priceLoading = props.priceLoading || props.priceCents === undefined

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link href="/search/tours" className="relative w-24 shrink-0 sm:w-28">
        <SafeImage
          src={props.imageUrl ?? ''}
          alt={props.name}
          fill
          className="object-cover"
          sizes="112px"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-lg text-[#C59746]">
              🏞
            </div>
          }
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href="/search/tours">
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">{props.name}</p>
          <p className="mt-0.5 text-xs text-[#888]">{props.operatorName} · {props.durationDays}D</p>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          {priceLoading ? (
            <PriceShimmer className="h-5 w-16" />
          ) : props.priceCents != null ? (
            <span className="text-sm font-bold text-[#C59746]">{formatPrice(props.priceCents)}</span>
          ) : (
            <span className="text-xs text-[#888]">Check price</span>
          )}
          <AddToTripButton component={buildTripComponent(props)} size="sm" />
        </div>
      </div>
    </div>
  )
}

function TourMini(props: TourProductCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">🏞</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">{props.name} · {props.durationDays}D</p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}</p>
        )}
      </div>
    </div>
  )
}

export function TourProductCard({ variant = 'full', ...props }: TourProductCardProps) {
  switch (variant) {
    case 'compact': return <TourCompact {...props} />
    case 'mini': return <TourMini {...props} />
    default: return <TourFull {...props} />
  }
}
