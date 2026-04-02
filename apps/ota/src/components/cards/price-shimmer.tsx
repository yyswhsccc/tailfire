// apps/ota/src/components/cards/price-shimmer.tsx
'use client'

interface PriceShimmerProps {
  className?: string
}

/**
 * Fixed-width shimmer placeholder for card price area.
 * Prevents CLS when price data streams in.
 */
export function PriceShimmer({ className }: PriceShimmerProps) {
  return (
    <span className={`inline-block h-6 w-20 animate-pulse rounded-md bg-muted ${className ?? ''}`} />
  )
}
