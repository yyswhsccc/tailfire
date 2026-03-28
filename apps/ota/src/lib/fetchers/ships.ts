import { catalogFetch } from '@/lib/api'
import type { ShipSummary, ShipDetail, ShipImage } from '@/types/entities'

export async function fetchShips(lineId?: string): Promise<ShipSummary[]> {
  const params = lineId ? `?lineId=${lineId}` : ''
  return catalogFetch<ShipSummary[]>(`/cruise-repository/ships${params}`, {
    next: { revalidate: 3600, tags: ['ships'] },
  })
}

export async function fetchShipBySlug(slug: string): Promise<ShipDetail> {
  return catalogFetch<ShipDetail>(`/cruise-repository/ships/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['ships', `ship-${slug}`] },
  })
}

export async function fetchShipImages(
  shipId: string,
  page = 1,
  pageSize = 12,
): Promise<{ images: ShipImage[]; total: number; page: number; totalPages: number }> {
  const raw = await catalogFetch<{
    images: Array<{ id: string; url: string; thumbnailUrl: string | null; altText: string | null; imageType: string | null; isHero: boolean }>
    pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasMore: boolean }
  }>(`/cruise-repository/ships/${shipId}/images?page=${page}&pageSize=${pageSize}`, {
    next: { revalidate: 86400, tags: ['ship-images', `ship-images-${shipId}`] },
  })

  return {
    images: raw.images.map((img) => ({
      id: img.id,
      imageUrl: img.url,
      caption: img.altText,
      imageType: img.imageType,
    })),
    total: raw.pagination.totalItems,
    page: raw.pagination.page,
    totalPages: raw.pagination.totalPages,
  }
}

export async function fetchShipCabinSummary(shipId: string): Promise<Array<{
  category: string
  count: number
  imageUrl: string | null
}>> {
  return catalogFetch(`/cruise-repository/ships/${shipId}/cabins/summary`, {
    next: { revalidate: 86400, tags: ['ship-cabins', `ship-cabins-${shipId}`] },
  })
}

export async function fetchShipDestinations(shipId: string): Promise<Array<{
  portName: string
  sailingCount: number
}>> {
  return catalogFetch(`/cruise-repository/ships/${shipId}/destinations`, {
    next: { revalidate: 3600, tags: ['ship-destinations', `ship-destinations-${shipId}`] },
  })
}

export async function fetchShipSailings(shipId: string, pageSize = 4): Promise<{
  sailings: Array<{
    id: string; name: string; sailDate: string; nights: number;
    shipName: string; shipImageUrl: string | null;
    cruiseLineName: string; cheapestInsideCents: number | null;
  }>
  total: number
}> {
  try {
    const data = await catalogFetch<any>(`/cruise-repository/sailings?shipId=${shipId}&pageSize=${pageSize}&sortBy=sailDate&sortDir=asc`, {
      next: { revalidate: 1800, tags: ['ship-sailings', `ship-sailings-${shipId}`] },
    })
    return {
      sailings: (data.sailings || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        sailDate: s.sailDate,
        nights: s.nights,
        shipName: s.ship?.name || '',
        shipImageUrl: s.ship?.imageUrl || null,
        cruiseLineName: s.cruiseLine?.name || '',
        cheapestInsideCents: s.prices?.inside ?? s.priceSummary?.cheapestInside ?? null,
      })),
      total: data.total || 0,
    }
  } catch {
    return { sailings: [], total: 0 }
  }
}
