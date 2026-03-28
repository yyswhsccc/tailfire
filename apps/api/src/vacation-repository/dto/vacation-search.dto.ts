export class VacationHotelSearchDto {
  q?: string
  page?: number // default 1
  pageSize?: number // max 50
  gatewayCode?: string
  destinationId?: string
  minStars?: number
  maxStars?: number
  amenities?: string[] // e.g., ['beach', 'spa']
  sortBy?: 'name' | 'starRating' | 'monarcRating'
  sortDir?: 'asc' | 'desc'
}

export interface VacationHotelSearchResponseDto {
  items: VacationHotelSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface VacationHotelSummary {
  id: string
  name: string
  destination: string
  starRating: number | null
  imageUrl: string | null
  amenities: Record<string, boolean> | null
  monarcRating: string | null
  monarcReviewCount: number | null
}

export interface VacationHotelDetail extends VacationHotelSummary {
  hotelChain: string | null
  enrichment: VacationEnrichmentData | null
}

export interface VacationEnrichmentData {
  googleRating: string | null
  googleReviewCount: number | null
  tripadvisorRating: string | null
  tripadvisorReviewCount: number | null
  tripadvisorLink: string | null
  latitude: string | null
  longitude: string | null
  address: string | null
  website: string | null
  phone: string | null
  photos: string[]
  enrichedAt: string | null
  isStale: boolean
}
