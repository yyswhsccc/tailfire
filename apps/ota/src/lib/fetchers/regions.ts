import { catalogFetch } from '@/lib/api'
import type { Region, RegionDetail } from '@/types/entities'

export async function fetchRegions(): Promise<Region[]> {
  return catalogFetch<Region[]>('/cruise-repository/regions', {
    next: { revalidate: 3600, tags: ['regions'] },
  })
}

export async function fetchRegionBySlug(slug: string): Promise<RegionDetail> {
  return catalogFetch<RegionDetail>(`/cruise-repository/regions/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['regions', `region-${slug}`] },
  })
}
