export type SearchResultType = 'trip' | 'contact'

export interface SearchResultItem {
  id: string
  type: SearchResultType
  title: string
  subtitle?: string
  status?: string
  url: string
}

export interface TripSearchResult extends SearchResultItem {
  type: 'trip'
  referenceNumber?: string
  startDate?: string
  endDate?: string
}

export interface ContactSearchResult extends SearchResultItem {
  type: 'contact'
  email?: string
  phone?: string
}

export interface SearchResultGroup<T extends SearchResultItem = SearchResultItem> {
  items: T[]
  hasMore: boolean
}

export interface SearchResponseDto {
  trips: SearchResultGroup<TripSearchResult>
  contacts: SearchResultGroup<ContactSearchResult>
}
