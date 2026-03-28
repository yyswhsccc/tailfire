// === Cruise Lines ===
export interface CruiseLine {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  websiteUrl: string | null
  shipCount: number
  sailingCount: number
}

export interface CruiseLineDetail extends CruiseLine {
  ships: Array<{
    id: string
    name: string
    slug: string
    imageUrl: string | null
    shipClass: string | null
  }>
  upcomingSailingCount: number
}

// === Ships ===
export interface ShipSummary {
  id: string
  name: string
  slug: string
  imageUrl: string | null
  shipClass: string | null
  cruiseLine: { id: string; name: string; slug: string }
  sailingCount: number
}

export interface ShipDetail extends ShipSummary {
  metadata: {
    yearBuilt?: number
    tonnage?: number
    passengerCapacity?: number
    crewCount?: number
    amenities?: string[]
  }
  cruiseLine: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
  }
  upcomingSailingCount: number
}

export interface ShipImage {
  id: string
  imageUrl: string
  caption: string | null
  imageType: string | null
}

// === Sailings ===
export interface SailingDetail {
  id: string
  name: string
  sailDate: string
  endDate: string
  nights: number
  voyageCode: string | null
  ship: { id: string; name: string; slug: string; imageUrl: string | null; shipClass: string | null }
  cruiseLine: { id: string; name: string; slug: string; logoUrl: string | null }
  embarkPort: { id: string | null; name: string }
  disembarkPort: { id: string | null; name: string }
  prices: {
    inside: number | null
    oceanview: number | null
    balcony: number | null
    suite: number | null
  }
  itinerary: Array<{
    dayNumber: number
    portName: string
    isSeaDay: boolean
    arrivalTime: string | null
    departureTime: string | null
    destinationSlug: string | null
  }>
}

// === Destinations ===
export interface DestinationSummary {
  id: string
  slug: string
  name: string
  destinationType: string
  countryCode: string | null
  heroImageUrl: string | null
  summary: string | null
  latitude: string | null
  longitude: string | null
}

export interface DestinationDetail extends DestinationSummary {
  ports: Array<{ portId: string; portName: string; isPrimary: boolean }>
  aliases: string[]
  enrichment: {
    summary: string | null
    photos: Array<{ url: string; caption?: string }>
    topAttractions: Array<{ title: string; rating: number; description: string }>
    averageRating: number | null
    totalReviewCount: number | null
    lastEnrichedAt: string | null
  } | null
  stats: { cruiseCount: number; tourCount: number }
}

export interface DestinationCruisesResponse {
  destination: { id: string; name: string; slug: string }
  sailings: Array<{
    id: string
    name: string
    sailDate: string
    endDate: string
    nights: number
    shipName: string
    shipImageUrl: string | null
    cruiseLineName: string
    cruiseLineSlug: string
    cheapestInsideCents: number | null
    cheapestBalconyCents: number | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// === Regions ===
export interface Region {
  id: string
  name: string
  slug: string
  sailingCount: number
}

export interface RegionDetail extends Region {
  description: string | null
  upcomingSailingCount: number
  destinations: Array<{
    portId: string
    portName: string
    country: string | null
  }>
}
