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
