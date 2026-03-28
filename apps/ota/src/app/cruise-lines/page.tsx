import type { Metadata } from 'next'
import { fetchCruiseLines } from '@/lib/fetchers/cruise-lines'
import { CruiseLineCard } from '@/components/cruise-lines/cruise-line-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Cruise Lines',
  description: 'Browse all cruise lines — compare fleets, find sailings, and discover your perfect cruise.',
}

export default async function CruiseLinesPage() {
  const lines = await fetchCruiseLines()
  const sorted = [...lines].sort((a, b) => b.sailingCount - a.sailingCount)
  const featured = sorted.filter((l) => l.sailingCount > 0)
  const other = sorted.filter((l) => l.sailingCount === 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          CRUISE LINES
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {featured.length} cruise lines with upcoming sailings
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((line) => (
          <CruiseLineCard key={line.id} line={line} />
        ))}
      </div>

      {other.length > 0 && (
        <>
          <h2 className="mb-4 mt-12 text-lg font-semibold text-muted-foreground">
            Other Cruise Lines
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {other.map((line) => (
              <CruiseLineCard key={line.id} line={line} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
