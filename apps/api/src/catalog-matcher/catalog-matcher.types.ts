import type { CruisePortCall } from '@tailfire/shared-types'

export interface SailingMatchResult {
  sailingId: string
  strategy: string
  score: number
  candidateCount: number
  sailDate: string
  endDate: string
  providerIdentifier: string
  cruiseLineId: string
  shipId: string
  embarkPortId: string | null
  disembarkPortId: string | null
}

export interface CruiseCatalogEnrichment {
  portCallsJson: CruisePortCall[]
  cruiseLineId: string
  cruiseShipId: string
  cruiseRegionId: string | null
  region: string | null
  shipImageUrl: string | null
  shipClass: string | null
  shipGalleryImages: Array<{ url: string; caption?: string; isHero?: boolean }>
  deckPlanImages: Array<{ url: string; caption: string }>
  cruiseLineLogo: string | null
  departurePortId: string | null
  arrivalPortId: string | null
  departureTimezone: string | null
  arrivalTimezone: string | null
  departurePort: string | null
  arrivalPort: string | null
  canonicalSailDate: string
  canonicalEndDate: string
}
