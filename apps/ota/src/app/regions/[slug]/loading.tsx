export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="h-64 bg-[#1A1A1A] sm:h-80" />
      {/* Pills skeleton */}
      <div className="flex gap-2 border-b border-[#E0E0E0] px-4 py-3 sm:px-10">
        <div className="h-8 w-24 rounded-full bg-muted" />
        <div className="h-8 w-20 rounded-full bg-muted" />
        <div className="h-8 w-28 rounded-full bg-muted" />
      </div>
      {/* Section skeleton */}
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-10 lg:px-[60px]">
        <div className="mb-4 h-6 w-64 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-72 rounded-2xl bg-muted" />
          <div className="h-72 rounded-2xl bg-muted" />
          <div className="h-72 rounded-2xl bg-muted" />
          <div className="h-72 rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  )
}
