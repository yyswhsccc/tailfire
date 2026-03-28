import { catalogFetch } from '@/lib/api'
import type { SailingDetail } from '@/types/entities'

interface RawSailingResponse {
  id: string
  name: string
  sailDate: string
  endDate: string
  nights: number
  metadata?: { cruise_code?: string }
  ship?: { id: string; name: string; slug: string; imageUrl: string | null; shipClass: string | null }
  cruiseLine?: { id: string; name: string; slug: string; logoUrl: string | null }
  embarkPort?: { id: string; name: string }
  embarkPortName?: string
  disembarkPort?: { id: string; name: string }
  disembarkPortName?: string
  priceSummary?: {
    cheapestInside: number | null
    cheapestOceanview: number | null
    cheapestBalcony: number | null
    cheapestSuite: number | null
  }
  itinerary?: Array<{
    dayNumber: number
    portName: string
    isSeaDay: boolean
    arrivalTime: string | null
    departureTime: string | null
    destinationSlug?: string | null
  }>
}

export async function fetchSailingById(id: string): Promise<SailingDetail> {
  const raw = await catalogFetch<RawSailingResponse>(`/cruise-repository/sailings/${id}`, {
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
    itinerary: (raw.itinerary || []).map((stop) => ({
      dayNumber: stop.dayNumber,
      portName: stop.portName,
      isSeaDay: stop.isSeaDay,
      arrivalTime: stop.arrivalTime || null,
      departureTime: stop.departureTime || null,
      destinationSlug: stop.destinationSlug || null,
    })),
  }
}
