import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchShipBySlug, fetchShipImages, fetchShipDestinations } from '@/lib/fetchers/ships'
import { HubScaffold } from '@/components/hub/hub-scaffold'
import { shipAdapter, shipSections } from '@/lib/entity-hubs/adapters/ship.adapter'
import type { ShipImage } from '@/types/entities'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const ship = await fetchShipBySlug(slug)
    return {
      title: `${ship.name} — ${ship.cruiseLine.name}`,
      description: `Explore ${ship.name}. ${ship.upcomingSailingCount} upcoming sailings.`,
    }
  } catch {
    return { title: 'Ship Not Found' }
  }
}

export default async function ShipHubPage({ params }: Props) {
  const { slug } = await params

  let ship
  try {
    ship = await fetchShipBySlug(slug)
  } catch {
    notFound()
  }

  // Fetch supplemental data in parallel for section props (photos + destinations)
  const [imagesResult, destinations] = await Promise.all([
    fetchShipImages(ship.id, 1, 12).catch(() => ({ images: [] as ShipImage[] })),
    fetchShipDestinations(ship.id).catch(() => [] as Array<{ portName: string; sailingCount: number }>),
  ])

  const sections = shipSections(ship, {
    images: imagesResult.images,
    destinations,
  })

  const metadata: Record<string, unknown> = {
    cruiseLine: ship.cruiseLine.name,
    shipClass: ship.shipClass,
    yearBuilt: ship.yearBuilt,
    passengerCapacity: ship.passengerCapacity,
    tonnage: ship.tonnage,
    crewCount: ship.crewCount,
    amenities: ship.amenities,
    upcomingSailings: ship.upcomingSailingCount,
  }

  return (
    <HubScaffold
      hero={shipAdapter.heroData(ship)}
      contextPills={shipAdapter.contextPills(ship)}
      sections={sections}
      aiContext={shipAdapter.aiContext(ship)}
      entityType="ship"
      entitySlug={slug}
      metadata={metadata}
    />
  )
}
