import type { Metadata } from 'next'
import { fetchShips } from '@/lib/fetchers/ships'
import { ShipCard } from '@/components/ships/ship-card'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Ships | Phoenix Voyages',
  description: 'Browse our full fleet of cruise ships — compare classes, amenities, and find upcoming sailings.',
}

export default async function ShipsPage() {
  let ships: Awaited<ReturnType<typeof fetchShips>> = []
  try { ships = await fetchShips() } catch { /* API unavailable at build time */ }

  const withSailings = ships.filter((s) => s.sailingCount > 0).sort((a, b) => b.sailingCount - a.sailingCount)
  const noSailings = ships.filter((s) => s.sailingCount === 0).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          SHIPS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {withSailings.length > 0
            ? `Explore ${withSailings.length} ships with upcoming sailings`
            : 'Browse our full cruise fleet'}
        </p>
      </div>

      {withSailings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {withSailings.map((ship) => (
            <ShipCard key={ship.id} ship={ship} sailingCount={ship.sailingCount} />
          ))}
        </div>
      )}

      {noSailings.length > 0 && (
        <>
          <h2 className="mb-4 mt-12 text-lg font-semibold text-muted-foreground">
            Other Ships
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {noSailings.map((ship) => (
              <ShipCard key={ship.id} ship={ship} />
            ))}
          </div>
        </>
      )}

      {ships.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          No ships available at this time. Check back soon.
        </p>
      )}
    </div>
  )
}
