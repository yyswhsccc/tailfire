import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchCruiseLineBySlug } from '@/lib/fetchers/cruise-lines'
import { EntityHero } from '@/components/entity/entity-hero'
import { StatCard } from '@/components/entity/stat-card'
import { ShipCard } from '@/components/ships/ship-card'
import { PageContextBridge } from '@/components/page-context-bridge'
import { Ship, Calendar } from 'lucide-react'

export const revalidate = 3600

interface CruiseLinePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CruiseLinePageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const line = await fetchCruiseLineBySlug(slug)
    return {
      title: line.name,
      description: `Explore ${line.name} — ${line.shipCount} ships, ${line.sailingCount.toLocaleString()} upcoming sailings.`,
    }
  } catch {
    return { title: 'Cruise Line Not Found' }
  }
}

export default async function CruiseLineDetailPage({ params }: CruiseLinePageProps) {
  const { slug } = await params
  let line
  try {
    line = await fetchCruiseLineBySlug(slug)
  } catch {
    notFound()
  }

  return (
    <>
      <PageContextBridge type="cruise_line" slug={slug} name={line.name} />

      <EntityHero
        title={line.name}
        badge="Cruise Line"
        imageUrl={line.ships[0]?.imageUrl}
      >
        <div className="flex flex-wrap gap-3">
          <StatCard label="ships" value={line.shipCount} icon={<Ship className="size-3.5" />} />
          <StatCard label="sailings" value={line.sailingCount.toLocaleString()} icon={<Calendar className="size-3.5" />} />
        </div>
      </EntityHero>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-bold text-[#1A1A1A]">Fleet</h2>
        {line.ships.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {line.ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            No ships listed for {line.name} yet.
          </p>
        )}
      </div>
    </>
  )
}
