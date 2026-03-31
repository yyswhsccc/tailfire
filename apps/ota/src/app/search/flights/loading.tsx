import { Skeleton } from "@/components/ui/skeleton";

export default function FlightsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading skeleton */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-5 w-72" />
      </div>

      {/* Search form skeleton */}
      <Skeleton className="mb-6 h-28 w-full rounded-2xl" />

      {/* Price calendar skeleton (desktop only) */}
      <Skeleton className="mb-6 hidden h-64 w-full rounded-2xl md:block" />

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Filter sidebar skeleton (desktop only) */}
        <div className="hidden w-60 shrink-0 space-y-4 lg:block">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>

        {/* Results area */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Sort pill skeletons */}
          <div className="mb-4 flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>

          {/* Flight card skeletons */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border bg-white p-5"
            >
              {/* Airline icon */}
              <Skeleton className="size-10 shrink-0 rounded-full" />

              {/* Route info */}
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>

              {/* Duration / stops */}
              <div className="hidden space-y-1 text-center sm:block">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>

              {/* Price + CTA */}
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
