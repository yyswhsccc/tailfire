// apps/ota/src/components/hub/section-skeleton.tsx

import type { SkeletonVariant } from '@/lib/entity-hubs/types'

interface SectionSkeletonProps {
  variant?: SkeletonVariant
  /** @deprecated Use variant instead. Kept for backward compat during migration. */
  cardCount?: number
}

function ShimmerBox({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />
}

export function SectionSkeleton({ variant, cardCount }: SectionSkeletonProps) {
  // Backward compat: if cardCount is passed without variant, infer variant
  const resolved = variant ?? (cardCount === 2 ? 'grid-2' : 'grid-3')

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-10 lg:px-[60px]">
      {/* Header shimmer */}
      <ShimmerBox className="mb-4 h-5 w-48" />

      {/* Grid layouts */}
      {resolved === 'grid-2' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-64" />
          ))}
        </div>
      )}
      {resolved === 'grid-3' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ShimmerBox key={i} className="h-48" />
          ))}
        </div>
      )}
      {resolved === 'grid-4' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-40" />
          ))}
        </div>
      )}
      {resolved === 'banner' && <ShimmerBox className="h-32" />}
      {resolved === 'mosaic' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ShimmerBox className="col-span-2 row-span-2 h-64 sm:col-span-1" />
          <ShimmerBox className="h-32" />
          <ShimmerBox className="h-32" />
        </div>
      )}
      {resolved === 'scroll' && (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerBox key={i} className="h-48 w-64 shrink-0" />
          ))}
        </div>
      )}
      {resolved === 'timeline' && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ShimmerBox key={i} className="h-12" />
          ))}
        </div>
      )}
      {resolved === 'single' && <ShimmerBox className="h-96" />}
    </div>
  )
}
