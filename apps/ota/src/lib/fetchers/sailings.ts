import { catalogFetch } from '@/lib/api'
import type { SailingDetail } from '@/types/entities'

export async function fetchSailingById(id: string): Promise<SailingDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await catalogFetch<any>(`/cruise-repository/sailings/${id}`, {
    next: { revalidate: 1800, tags: ['sailings', `sailing-${id}`] },
  })

  return {
    id: raw.id,
    name: raw.name,
    sailDate: raw.sailDate,
    endDate: raw.endDate,
    nights: raw.nights,
    voyageCode: raw.metadata?.cruise_code || null,
    ship: {
      id: raw.ship?.id || '',
      name: raw.ship?.name || 'Unknown',
      slug: raw.ship?.slug || '',
      imageUrl: raw.ship?.imageUrl || null,
      shipClass: raw.ship?.shipClass || null,
    },
    cruiseLine: {
      id: raw.cruiseLine?.id || '',
      name: raw.cruiseLine?.name || 'Unknown',
      slug: raw.cruiseLine?.slug || '',
      logoUrl: raw.cruiseLine?.logoUrl || null,
    },
    embarkPort: {
      id: raw.embarkPort?.id || null,
      name: raw.embarkPort?.name || raw.embarkPortName || 'Unknown',
    },
    disembarkPort: {
      id: raw.disembarkPort?.id || null,
      name: raw.disembarkPort?.name || raw.disembarkPortName || 'Unknown',
    },
    prices: {
      inside: raw.priceSummary?.cheapestInside ?? null,
      oceanview: raw.priceSummary?.cheapestOceanview ?? null,
      balcony: raw.priceSummary?.cheapestBalcony ?? null,
      suite: raw.priceSummary?.cheapestSuite ?? null,
    },
    itinerary: (raw.itinerary || []).map((stop: any) => ({
      dayNumber: stop.dayNumber,
      portName: stop.portName,
      isSeaDay: stop.isSeaDay,
      arrivalTime: stop.arrivalTime || null,
      departureTime: stop.departureTime || null,
      destinationSlug: null, // Not yet available from API
    })),
  }
}
