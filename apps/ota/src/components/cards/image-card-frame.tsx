'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PriceShimmer } from '@/components/cards/price-shimmer'
import { AddToTripButton } from '@/components/trip-builder/add-to-trip-button'
import type { TripComponent } from '@/components/trip-builder/trip-basket-store'

interface ImageCardFrameProps {
  imageUrl: string | null
  fallbackGradient: string
  typeBadge: string
  price?: string | null
  priceLoading?: boolean
  priceLabel?: string
  href?: string
  tripComponent?: TripComponent
  height?: number
  priority?: boolean
  children: React.ReactNode
}

export function ImageCardFrame({
  imageUrl,
  fallbackGradient,
  typeBadge,
  price,
  priceLoading,
  priceLabel,
  href,
  tripComponent,
  height = 280,
  priority = false,
  children,
}: ImageCardFrameProps) {
  const [imgError, setImgError] = useState(false)
  const hasImage = imageUrl && !imgError

  return (
    <div
      className="group relative overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl"
      style={{ height: `${height}px` }}
    >
      {/* Background: image or gradient */}
      {hasImage ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient}`} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Type badge — frosted glass top-left */}
      <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
        {typeBadge}
      </span>

      {/* Price badge — white pill top-right */}
      <div className="absolute right-3 top-3 z-10">
        {priceLoading ? (
          <PriceShimmer className="h-6 w-16 rounded-full" />
        ) : price ? (
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#1A1A1A] shadow-sm">
            {price}{priceLabel && <span className="font-normal text-[#888]">{priceLabel}</span>}
          </span>
        ) : null}
      </div>

      {/* Clickable overlay for navigation (covers image + text area, NOT AddToTrip) */}
      {href && (
        <Link href={href} className="absolute inset-0 z-0" aria-label="View details" />
      )}

      {/* Content at bottom */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-4">
        {children}

        {tripComponent && (
          <div className="mt-2">
            <AddToTripButton
              component={tripComponent}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}
