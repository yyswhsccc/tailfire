import { Skeleton } from "@/components/ui/skeleton";

export default function DealsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page header */}
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-10 h-5 w-72" />

      {/* Featured deal — large card */}
      <Skeleton className="mb-8 h-72 w-full rounded-2xl" />

      {/* Section label */}
      <Skeleton className="mb-6 h-6 w-32" />

      {/* 2-column grid of smaller deal cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-white"
          >
            {/* Card image area */}
            <Skeleton className="h-40 w-full rounded-none" />
            {/* Card body */}
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
