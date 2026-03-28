import type { Metadata } from 'next'
import { fetchRegions } from '@/lib/fetchers/regions'
import { RegionCard } from '@/components/regions/region-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Cruise Regions',
  description: 'Explore cruise regions worldwide — Caribbean, Mediterranean, Alaska, and more.',
}

export default async function RegionsPage() {
  const regions = await fetchRegions()
  const sorted = [...regions].sort((a, b) => b.sailingCount - a.sailingCount)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          CRUISE REGIONS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Explore {regions.length} cruise regions around the world
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((region) => (
          <RegionCard key={region.id} region={region} />
        ))}
      </div>
    </div>
  )
}
