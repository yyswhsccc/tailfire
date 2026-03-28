import { publicFetch } from '@/lib/api'
import type { DestinationSummary, DestinationDetail, DestinationCruisesResponse } from '@/types/entities'

export async function fetchDestinations(params?: {
  search?: string
  type?: string
  page?: number
  pageSize?: number
}): Promise<{ destinations: DestinationSummary[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.type) searchParams.set('type', params.type)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
  const qs = searchParams.toString()
  return publicFetch(`/destinations${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 3600, tags: ['destinations'] },
  })
}

export async function fetchDestinationBySlug(slug: string): Promise<DestinationDetail> {
  return publicFetch<DestinationDetail>(`/destinations/by-slug/${slug}`, {
    next: { revalidate: 3600, tags: ['destinations', `destination-${slug}`] },
  })
}

export async function fetchDestinationCruises(
  slug: string,
  page = 1,
  pageSize = 12,
): Promise<DestinationCruisesResponse> {
  return publicFetch<DestinationCruisesResponse>(
    `/destinations/by-slug/${slug}/cruises?page=${page}&pageSize=${pageSize}`,
    { next: { revalidate: 1800, tags: ['destinations', `destination-${slug}-cruises`] } },
  )
}
