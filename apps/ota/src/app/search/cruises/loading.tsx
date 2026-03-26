import { Skeleton } from "@/components/ui/skeleton";

export default function CruisesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg sm:w-72" />
      </div>

      {/* Result cards */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border bg-white"
          >
            <div className="flex flex-col sm:flex-row">
              {/* Image slab */}
              <Skeleton className="h-48 w-full shrink-0 rounded-none sm:h-auto sm:w-56" />
              {/* Content */}
              <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                <div className="space-y-2">
                  {/* Ship / line badge */}
                  <Skeleton className="h-4 w-28" />
                  {/* Title */}
                  <Skeleton className="h-6 w-3/4" />
                  {/* Meta row */}
                  <div className="flex gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                {/* Price + CTA row */}
                <div className="flex items-end justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-7 w-28" />
                  </div>
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
