import type { Metadata } from 'next'
import { fetchRegions } from '@/lib/fetchers/regions'
import { RegionCard } from '@/components/regions/region-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Cruise Regions',
  description: 'Explore cruise regions worldwide — Caribbean, Mediterranean, Alaska, and more.',
}

export default async function RegionsPage() {
  let regions: Awaited<ReturnType<typeof fetchRegions>> = []
  try { regions = await fetchRegions() } catch { /* API unavailable at build time — ISR fills on first request */ }
  const sorted = [...regions].sort((a, b) => b.sailingCount - a.sailingCount)

  return (
    <div>
      {/* Hero banner — matches destination page pattern */}
      <div className="relative h-64 overflow-hidden bg-[#1A1A1A]">
        <img
          src="/images/destinations/cruise.jpg"
          alt="Cruise regions"
          className="h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-transparent to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
            CRUISE REGIONS
          </h1>
          <p className="mt-3 text-lg text-white/80">
            Explore {regions.length} cruise regions around the world
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {sorted.length > 0 ? (
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sorted.map((region) => (
              <RegionCard key={region.id} region={region} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
            <p className="text-lg font-medium text-[#1A1A1A]">No regions available</p>
            <p className="mt-2 text-sm text-muted-foreground">Cruise regions will appear here once data is loaded.</p>
          </div>
        )}
      </div>
    </div>
  )
}
