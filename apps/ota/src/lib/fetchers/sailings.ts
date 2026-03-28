import { catalogFetch } from '@/lib/api'
import type { SailingDetail } from '@/types/entities'

export async function fetchSailingById(id: string): Promise<SailingDetail> {
  return catalogFetch<SailingDetail>(`/cruise-repository/sailings/${id}`, {
    next: { revalidate: 1800, tags: ['sailings', `sailing-${id}`] },
  })
}
