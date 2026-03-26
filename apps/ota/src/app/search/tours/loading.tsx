import { Skeleton } from "@/components/ui/skeleton";

export default function ToursLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-60" />
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
              {/* Image */}
              <Skeleton className="h-48 w-full shrink-0 rounded-none sm:h-auto sm:w-56" />
              {/* Content */}
              <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                <div className="space-y-2">
                  {/* Category badge */}
                  <Skeleton className="h-4 w-20" />
                  {/* Tour name */}
                  <Skeleton className="h-6 w-3/4" />
                  {/* Description snippet */}
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  {/* Duration + group size */}
                  <div className="flex gap-4 pt-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                {/* Price + CTA */}
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
