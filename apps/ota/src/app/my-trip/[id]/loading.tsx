import { Skeleton } from "@/components/ui/skeleton";

export default function MyTripLoading() {
  return (
    <main className="min-h-screen bg-[#fafaf8]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="columns-2 gap-4 md:columns-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mb-4 break-inside-avoid rounded-xl"
              style={{ height: 180 + (i % 3) * 60 }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
