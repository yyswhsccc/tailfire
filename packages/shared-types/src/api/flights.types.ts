/**
 * Flight Search API Types
 *
 * Shared types for flight search functionality.
 * Used by both the API (NestJS) and client (React/Next.js).
 */

/**
 * Normalized flight time with local and UTC representations
 */
export interface NormalizedTime {
  local?: string  // ISO 8601 with timezone or naive local
  utc?: string    // ISO 8601 in UTC
}

/**
 * Flight endpoint (departure or arrival)
 */
export interface FlightEndpoint {
  airportIata: string
  airportIcao?: string
  airportName?: string
  timezone?: string
  terminal?: string
  gate?: string
  scheduledTime?: NormalizedTime
  estimatedTime?: NormalizedTime
  actualTime?: NormalizedTime
  baggageBelt?: string  // arrivals only
}

/**
 * Normalized flight status from external API
 */
export interface NormalizedFlightStatus {
  flightNumber: string
  callSign?: string
  airline: {
    name: string
    iataCode?: string
    icaoCode?: string
  }
  departure: FlightEndpoint
  arrival: FlightEndpoint
  status: string
  statusCategory: 'scheduled' | 'active' | 'completed' | 'disrupted'
  aircraft?: {
    registration?: string
    model?: string
    modeS?: string
    imageUrl?: string
    imageAuthor?: string
  }
  lastUpdated?: string
  distanceKm?: number
}

/**
 * Flight search API response
 */
export interface FlightSearchResponse {
  success: boolean
  data?: NormalizedFlightStatus[]
  error?: string
  metadata?: {
    provider: string
    timestamp: string
    rateLimitRemaining?: number
    retryAfter?: number  // seconds until rate limit resets
  }
}

/**
 * Flight search parameters
 */
export interface FlightSearchParams {
  flightNumber: string
  dateLocal?: string  // YYYY-MM-DD
  searchBy?: 'number' | 'callsign' | 'reg' | 'icao24'
}

// ============================================================================
// FLIGHT OFFER SEARCH TYPES (Price Shopping)
// ============================================================================

/**
 * Flight offer search parameters
 */
export interface FlightOfferSearchParams {
  origin: string               // IATA
  destination: string          // IATA
  departureDate: string        // YYYY-MM-DD
  returnDate?: string
  adults: number
  children?: number
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  nonStop?: boolean
  maxPrice?: number
  currencyCode?: string
}

/**
 * Flight offer segment (one leg of a journey)
 */
export interface FlightOfferSegment {
  departure: { iataCode: string; terminal?: string; at: string }
  arrival: { iataCode: string; terminal?: string; at: string }
  carrier: string
  carrierName?: string         // resolved from dictionaries
  flightNumber: string
  aircraft?: string
  aircraftName?: string        // resolved from dictionaries
  duration: string             // ISO 8601
  stops: number
  cabin?: string
}

/**
 * Normalized flight offer from external API
 */
export interface NormalizedFlightOffer {
  id: string
  source: string
  segments: FlightOfferSegment[]
  price: {
    currency: string
    total: string
    perTraveler: string
    base?: string
    fees?: { amount: string; type: string }[]
  }
  validatingAirline: string
  fareClass?: string
  fareFamily?: string            // e.g., "LIGHT", "STANDARD", "FLEX"
  cabin?: string                 // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  fareRules?: { exchangeable: boolean; refundable: boolean }
  baggageAllowance?: { checked?: { quantity: number; weight?: string }; cabin?: { quantity: number } }
  bookingClass?: string
}

/**
 * Flight offer search API response
 */
export interface FlightOfferSearchResponse {
  results: NormalizedFlightOffer[]
  dictionaries?: Record<string, any>
  warning?: string
}
