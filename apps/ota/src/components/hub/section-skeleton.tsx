export function SectionSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
      <div className="mb-4 h-6 w-48 animate-pulse rounded bg-[#eee]" />
      <div className={`grid gap-4 ${cardCount <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-[#f0f0f0]">
            <div className="h-40 animate-pulse bg-[#f0f0f0]" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-[#eee]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#eee]" />
              <div className="h-5 w-20 animate-pulse rounded bg-[#eee]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
