// Request DTOs
export interface ImportPreviewRequest {
  cruiseLineId?: string
  lineid?: number
  bookingReference: string
  currency?: string
}

export interface ImportConfirmRequest extends ImportPreviewRequest {
  tripName?: string
  existingTripId?: string
}

// Preview response (matches formatPreviewResponse output)
export interface ImportPreviewResponse {
  bookingReference: string
  lineid: number
  bookingDate?: string
  commission: number
  cruise: {
    name: string
    voyageCode: string
    status: string
    startDate: string
    endDate: string
    nights: number
    ship?: { name?: string; code?: string; imageurl?: string }
    cabin?: {
      cabintype?: string
      farecode?: string
      number?: string
      name?: string
      deck?: string
      location?: string
    }
    supplier?: string
    itinerary?: ImportItineraryPort[]
    pricing?: {
      grossPrice?: number | null
      netPrice?: number | null
      currency?: string
    }
    dining: Record<string, unknown> | null
    selectedExtras: Record<string, unknown>[] | null
    selectedPromotions: Record<string, unknown> | null
    traveltekBookingId: number | null
    traveltekPortfolioId: number | null
    paymentInfo: Record<string, unknown>
    onboardCredit: number
    obcCurrency: string
  }
  passengers: ImportPassenger[]
  catalog: {
    cruiseLineId: string | null
    cruiseShipId: string | null
    cruiseRegionId: string | null
    departurePortId: string | null
    arrivalPortId: string | null
    region: string | null
    shipClass: string | null
    shipImageUrl: string | null
  }
}

export interface ImportItineraryPort {
  day: number
  itineraryname: string
  arrivedate: string
  arrivetime?: string
  departdate?: string
  departtime?: string
  extrainfo: string
}

export interface ImportPassenger {
  paxno: number
  title: string
  firstname: string
  lastname: string
  middlename?: string
  gender: string
  dob: string
  age: number
  nationality: string
  paxtype: string
}

export interface ImportConfirmResponse {
  tripId: string
  cruiseActivityId?: string
  alreadyImported: boolean
}
