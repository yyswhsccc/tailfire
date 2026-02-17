/**
 * FusionAPI Type Definitions
 *
 * Types for Traveltek FusionAPI responses.
 * These mirror the API response structure and should be used for API interactions.
 */

// ============================================================================
// Common Types
// ============================================================================

export interface FusionApiMeta {
  sessionkey?: string
  totalresults?: number
  resultsreturned?: number
  page?: number
  pagesize?: number
  // Used by cabins endpoint
  decks?: DeckPlan[]
  // Used by basket endpoint
  totalprice?: number
  currency?: string
}

export interface FusionApiResponse<T> {
  meta?: FusionApiMeta
  results?: T[]
  error?: {
    code: string
    message: string
  }
}

// ============================================================================
// Step 1: Cruise Search (cruiseresults.pl)
// ============================================================================

export interface CruiseSearchParams {
  sessionkey?: string
  adults?: number
  children?: number
  infants?: number
  startdate?: string // YYYY-MM-DD
  enddate?: string   // YYYY-MM-DD
  departuremonth?: string // MMYYYY
  portid?: number
  regionid?: number
  cruiselineid?: number
  shipid?: number
  nights_min?: number
  nights_max?: number
  page?: number
  pagesize?: number
}

export interface CruiseSearchResult {
  codetocruiseid: string
  resultno: number
  cruiselinename: string
  cruiselineid: number
  shipname: string
  shipid: number
  itineraryname: string
  departuredate: string
  nights: number
  departureport: string
  arrivalport: string
  regionname: string
  regionid: number
  insideprice?: number
  oceanviewprice?: number
  balconyprice?: number
  suiteprice?: number
  shipimageurl?: string
}

// ============================================================================
// Step 2: Rate Codes (cruiseratecodes.pl)
// ============================================================================

export interface RateCodeParams {
  sessionkey: string
  codetocruiseid: string
  resultno: number
}

export interface RateCode {
  code: string
  name: string
  description?: string
  nonrefundabledeposit: boolean
}

// ============================================================================
// Step 3: Cabin Grades (cruisecabingrades.pl)
// ============================================================================

export interface CabinGradeParams {
  sessionkey: string
  codetocruiseid: string
  resultno: number
  farecode?: string
}

export interface CabinGrade {
  gradeno: number
  gradename: string
  gradedescription?: string
  category: string // suite, balcony, oceanview, inside
  pricepp?: number
  pricetotal?: number
  available: boolean
}

// ============================================================================
// Step 4: Cabins (cruisecabins.pl)
// ============================================================================

export interface CabinParams {
  sessionkey: string
  codetocruiseid: string
  resultno: number
  gradeno: number
  farecode?: string
}

export interface DeckPlan {
  id: number
  name: string
  imageurl: string
}

export interface Cabin {
  cabinno: string
  deckname: string
  deckcode: string
  x1: number // Cabin position on deck plan
  x2: number
  y1: number
  y2: number
  resultno: string // Use as cabinresult in basket add
  bedcode: string
  beddescription: string
  maxguests: number
  farecode: string
  gradeno: number
  available: boolean
}

export interface CabinsResponse {
  meta: FusionApiMeta & {
    decks?: DeckPlan[]
  }
  results: Cabin[]
}

// ============================================================================
// Step 5: Basket Add (basketadd.pl)
// ============================================================================

export interface BasketAddParams {
  sessionkey: string
  codetocruiseid: string
  resultno: number
  gradeno: number
  farecode: string
  cabinresult?: string // Specific cabin's resultno from cruisecabins.pl
  cabinno?: string     // Specific cabin number (optional)
}

export interface BasketAddResult {
  itemkey: string
  sessionkey: string
  holdcabin?: {
    holdtime: string    // ISO timestamp - when hold started
    releasetime: string // ISO timestamp - when hold expires
  }
}

// ============================================================================
// Step 6: Basket (basket.pl)
// ============================================================================

export interface BasketItem {
  itemkey: string
  producttype: string
  cruiselinename: string
  shipname: string
  itineraryname: string
  departuredate: string
  nights: number
  cabinno?: string
  cabingrade: string
  farecode: string
  pricepp: number
  pricetotal: number
  passengers?: {
    required: boolean
    count: number
    fields: string[]
  }
  holdcabin?: {
    holdtime: string
    releasetime: string
  }
}

export interface BasketResult {
  meta: FusionApiMeta
  items: BasketItem[]
  totalprice: number
  currency: string
}

// ============================================================================
// Step 7: Booking (book.pl)
// ============================================================================

export interface Passenger {
  title: string        // Mr, Mrs, Ms, Dr
  firstname: string
  lastname: string
  dateofbirth: string  // YYYY-MM-DD
  nationality: string  // Country code
  passportnumber?: string
  passportexpiry?: string // YYYY-MM-DD
  pastpaxid?: string   // Cruise line loyalty number
}

export interface BookingContact {
  email: string
  phone: string
  address?: {
    street: string
    city: string
    state: string
    zip: string
    country: string
  }
}

export interface BookingAllocation {
  dining?: {
    seating: 'early' | 'late' | 'open' | 'anytime'
    tablesize?: number
    smoking?: boolean
  }
  bedconfig?: string // twin, queen, king
}

export interface BookingRequest {
  sessionkey: string
  passengers: Passenger[]
  contact: BookingContact
  allocation?: BookingAllocation
  payment?: {
    type: 'deposit' | 'full'
    amount?: number
  }
}

export interface BookingResult {
  success: boolean
  bookingreference?: string
  confirmationdate?: string
  totalprice?: number
  currency?: string
  depositdue?: number
  balancedue?: number
  balanceduedate?: string
  error?: {
    code: string
    message: string
  }
}

// ============================================================================
// Past Passenger Data (cruisegetpaxdata.pl)
// ============================================================================

export interface PastPaxParams {
  sessionkey: string
  cruiselineid: number
  pastpaxid: string
}

export interface PastPaxResult {
  found: boolean
  title?: string
  firstname?: string
  lastname?: string
  dateofbirth?: string
  nationality?: string
  loyaltytier?: string
  sailinghistory?: number
}

// ============================================================================
// Import Booking (cruiseimportbooking.pl)
// ============================================================================

export interface ImportBookingParams {
  lineid: number
  bookingreference: string
  viewonly?: 0 | 1
  currency?: string
  language?: string
}

export interface ImportBookingResult {
  bookingdate: string
  commission: number
  cruiseitem: ImportBookingCruiseItem
  passengers: ImportBookingPassenger[]
  bookingid?: number
  portfolioid?: number
}

export interface ImportBookingCruiseItem {
  name: string
  voyagecode: string
  codetocruiseid: number
  reservation: string
  status: string
  startdate: string
  enddate: string
  nights: number
  sailnights: number
  grossprice: string | number
  nettprice: string | number
  price: number
  sprice: string | number
  scurrency: string
  cabin: { number: string; name: string; cabintype: string; farecode: string; deck?: string; location?: string }
  ship: { code: string; id: number; name: string; imageurl: string }
  suppliername: string
  itinerary: ImportBookingItineraryPort[]
  breakdown: ImportBookingBreakdownItem[]
  perperson: ImportBookingPerPerson[]
  dining: {
    seatings: { description: string; seating: string; tablesize: string }[]
    smoking: string
  }
  paymentinfo: {
    receivedtotal: string | number
    nonrefundable: number
    nonrefundabledeposit: number
    paymentschedule: { amount: number | string; duedate: string }[]
  }
  selectedpromotions: Record<string, string>
  selectedextras?: Array<Record<string, unknown>>
  onboardcredit: number
  obccurrency: string
}

export interface ImportBookingItineraryPort {
  day: number
  itineraryname: string
  arrivedate: string
  arrivetime?: string
  departdate?: string
  departtime?: string
  extrainfo: string
  latitude?: string
  longitude?: string
  uniqueportid?: number
}

export interface ImportBookingPassenger {
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

export interface ImportBookingBreakdownItem {
  category: string
  description: string
  itemprice: number
  currency: string
  commissionable: number
  quantity: number
}

export interface ImportBookingPerPerson {
  category: string
  description: string
  prices: {
    currency: string
    guestno: number
    price: string | number
    sprice?: string | number
  }[]
}

// ============================================================================
// Error Types
// ============================================================================

export type FusionApiErrorCode =
  | 'INVALID_SESSION'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_CREDENTIALS'
  | 'CRUISE_NOT_AVAILABLE'
  | 'CABIN_NOT_AVAILABLE'
  | 'VALIDATION_ERROR'
  | 'BOOKING_FAILED'
  | 'UNKNOWN_ERROR'

export class FusionApiError extends Error {
  constructor(
    public readonly code: FusionApiErrorCode,
    message: string,
    public readonly isRetryable: boolean = false,
    public readonly rawResponse?: unknown,
  ) {
    super(message)
    this.name = 'FusionApiError'
  }
}
