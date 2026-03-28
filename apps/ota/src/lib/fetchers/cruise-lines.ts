import { catalogFetch } from '@/lib/api'
import type { CruiseLine, CruiseLineDetail } from '@/types/entities'

export async function fetchCruiseLines(): Promise<CruiseLine[]> {
  return catalogFetch<CruiseLine[]>('/cruise-repository/lines', {
    next: { revalidate: 3600, tags: ['cruise-lines'] },
  })
}

export async function fetchCruiseLineBySlug(slug: string): Promise<CruiseLineDetail> {
  return catalogFetch<CruiseLineDetail>(`/cruise-repository/lines/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['cruise-lines', `cruise-line-${slug}`] },
  })
}
