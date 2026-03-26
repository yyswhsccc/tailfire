import { Skeleton } from "@/components/ui/skeleton";

export default function AdvisorsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page header */}
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="mb-10 h-5 w-80" />

      {/* 3-column advisor card grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-2xl border border-border bg-white p-6 text-center"
          >
            {/* Avatar circle */}
            <Skeleton className="mb-4 h-20 w-20 rounded-full" />
            {/* Name */}
            <Skeleton className="mb-2 h-5 w-36" />
            {/* Specialization */}
            <Skeleton className="mb-1 h-4 w-28" />
            {/* Location / bio line */}
            <Skeleton className="mb-4 h-4 w-44" />
            {/* CTA button placeholder */}
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
