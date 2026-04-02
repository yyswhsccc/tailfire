// apps/ota/src/components/cards/cruise-product-card.tsx
'use client'

import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'
import type { CardVariant } from '@/lib/entity-hubs/types'

export interface CruiseProductCardProps {
  id: string
  name: string
  shipName: string
  shipImageUrl: string | null
  cruiseLineName: string
  sailDate: string
  nights: number
  route?: string
  /** Price in cents — undefined means "still loading", null means "no price available" */
  priceCents?: number | null
  /** If true, show shimmer instead of price */
  priceLoading?: boolean
  savingsLabel?: string
  originalPriceCents?: number | null
  variant?: CardVariant
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100)
}

function buildTripComponent(props: CruiseProductCardProps): TripComponent {
  return {
    id: `cruise-${props.id}`,
    type: 'cruise',
    data: { sailingId: props.id, shipName: props.shipName, cruiseLine: props.cruiseLineName, nights: props.nights, sailDate: props.sailDate },
    display: {
      heroImage: props.shipImageUrl ?? undefined,
      title: props.name,
      subtitle: `${props.cruiseLineName} · ${props.shipName} · ${props.nights}N`,
      price: props.priceCents != null ? formatPrice(props.priceCents) : undefined,
    },
  }
}

function CruiseFull(props: CruiseProductCardProps) {
  const dateStr = new Date(props.sailDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/cruises/${props.id}`} className="block">
        <div className="relative h-48 overflow-hidden sm:h-52">
          <SafeImage
            src={props.shipImageUrl ?? ''}
            alt={props.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-2xl text-[#C59746]">🚢</div>}
          />
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#C59746] backdrop-blur">
            🚢 {props.nights} Nights
          </span>
          <span className="absolute bottom-2 left-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
            {props.cruiseLineName}
          </span>
          {props.savingsLabel && (
            <span className="absolute left-2.5 top-2.5 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
              {props.savingsLabel}
            </span>
          )}
        </div>
      </Link>
      <div className="p-4 sm:p-5">
        <Link href={`/cruises/${props.id}`}>
          <h3 className="text-base font-semibold text-[#1A1A1A] sm:text-[17px]">{props.name}</h3>
          <p className="mt-1 text-sm text-[#888]">{props.shipName} · {dateStr}</p>
          {props.route && <p className="mt-1 text-xs text-[#aaa]">{props.route}</p>}
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div>
            {priceLoading ? (
              <PriceShimmer />
            ) : props.priceCents != null ? (
              <>
                {props.originalPriceCents != null && (
                  <span className="mr-2 text-sm text-[#aaa] line-through">{formatPrice(props.originalPriceCents)}</span>
                )}
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

function CruiseCompact(props: CruiseProductCardProps) {
  const priceLoading = props.priceLoading || (props.priceCents === undefined)

  return (
    <div className="group flex overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-sm transition-all hover:shadow-md">
      <Link href={`/cruises/${props.id}`} className="relative w-24 shrink-0 sm:w-28">
        <SafeImage
          src={props.shipImageUrl ?? ''}
          alt={props.name}
          fill
          className="object-cover"
          sizes="112px"
          fallback={<div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-lg text-[#C59746]">🚢</div>}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
        <Link href={`/cruises/${props.id}`}>
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">{props.name}</p>
          <p className="mt-0.5 text-xs text-[#888]">{props.cruiseLineName} · {props.nights}N</p>
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

function CruiseMini(props: CruiseProductCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f0f0f0] bg-white px-3 py-2">
      <span className="text-sm">🚢</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#1A1A1A]">{props.name} · {props.nights}N</p>
        {props.priceCents != null && (
          <p className="text-xs font-semibold text-[#C59746]">{formatPrice(props.priceCents)}</p>
        )}
      </div>
    </div>
  )
}

export function CruiseProductCard({ variant = 'full', ...props }: CruiseProductCardProps) {
  switch (variant) {
    case 'compact': return <CruiseCompact {...props} />
    case 'mini': return <CruiseMini {...props} />
    default: return <CruiseFull {...props} />
  }
}
