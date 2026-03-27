import { tool } from 'ai'
import { z } from 'zod'
import { serviceFetch, catalogFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types for API responses — aligned with actual backend contracts
// ---------------------------------------------------------------------------

/** NormalizedFlightOffer from packages/shared-types/src/api/flights.types.ts */
interface FlightOfferSegment {
  departure: { iataCode: string; terminal?: string; at: string }
  arrival: { iataCode: string; terminal?: string; at: string }
  carrier: string
  carrierName?: string
  flightNumber: string
  duration: string
  stops: number
  cabin?: string
}

interface NormalizedFlightOffer {
  id: string
  source: string
  segments: FlightOfferSegment[]
  price: {
    currency: string
    total: string
    perTraveler: string
    base?: string
  }
  validatingAirline: string
  cabin?: string
}

/** NormalizedHotelResult from packages/shared-types/src/api/hotels.types.ts */
interface NormalizedHotelResult {
  id: string
  name: string
  location: { address: string; city?: string; country?: string }
  rating?: number
  starRating?: number
  offers?: {
    checkIn: string
    checkOut: string
    roomType?: string
    price: { currency: string; total: string; base?: string; taxes?: string }
    boardType?: string
  }[]
}

/** CruiseSearchResult from apps/api/src/cruise-booking/types/fusion-api.types.ts */
interface CruiseSearchResult {
  cruiselinename: string
  shipname: string
  departureport: string
  arrivalport: string
  itineraryname: string
  departuredate: string
  nights: number
  insideprice?: number
  oceanviewprice?: number
  balconyprice?: number
  suiteprice?: number
  regionname: string
}

/** TourSummaryDto from apps/api/src/tour-repository/dto/tour-search.dto.ts */
interface TourSummary {
  id: string
  operatorCode: string
  name: string
  days?: number
  nights?: number
  description?: string
  imageUrl?: string
  lowestPriceCents?: number
  departureCount?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

/** Format a string dollar amount (e.g. "1234.56") into "$1,234.56 CAD" */
function formatCurrency(amountStr: string, currency = 'CAD'): string {
  const val = parseFloat(amountStr)
  if (isNaN(val)) return amountStr
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(val)
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value))
    }
  }
  return qs.toString() ? `?${qs.toString()}` : ''
}

// ---------------------------------------------------------------------------
// Tool factory — accepts context so tools can reference the advisor slug
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** Advisor slug from ota_ref cookie, used for lead attribution */
  advisorSlug?: string
}

export function createTools(ctx: ToolContext = {}) {
  // -------------------------------------------------------------------------
  // 1. searchFlights
  // -------------------------------------------------------------------------
  const searchFlights = tool({
    description:
      'Search for available flights between destinations. Returns up to 5 results sorted by price.',
    inputSchema: z.object({
      origin: z.string().describe('Origin airport IATA code (e.g. YYZ)'),
      destination: z.string().describe('Destination airport IATA code (e.g. CDG)'),
      departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
      returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format for round trips'),
      adults: z.number().default(1).describe('Number of adult passengers'),
      travelClass: z
        .enum(['economy', 'premium_economy', 'business', 'first'])
        .optional()
        .describe('Cabin class'),
    }),
    execute: async ({ origin, destination, departureDate, returnDate, adults, travelClass }) => {
      try {
        const qs = buildQuery({
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          travelClass: travelClass?.toUpperCase(),
        })
        const data = await serviceFetch<{ results: NormalizedFlightOffer[]; warning?: string }>(`/ota/search/flights${qs}`)
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          flights: top5.map((f) => {
            const firstSeg = f.segments[0]
            const lastSeg = f.segments[f.segments.length - 1]
            const totalStops = f.segments.reduce((sum, s) => sum + s.stops, 0) + (f.segments.length - 1)
            return {
              airline: firstSeg?.carrierName ?? f.validatingAirline,
              flightNumber: firstSeg ? `${firstSeg.carrier}${firstSeg.flightNumber}` : '',
              route: `${firstSeg?.departure.iataCode ?? origin} -> ${lastSeg?.arrival.iataCode ?? destination}`,
              departure: firstSeg?.departure.at ?? '',
              arrival: lastSeg?.arrival.at ?? '',
              duration: firstSeg?.duration ?? '',
              stops: totalStops,
              price: formatCurrency(f.price.total, f.price.currency),
              cabin: f.cabin ?? '',
            }
          }),
          resultCount: top5.length,
          ...(data.warning ? { warning: data.warning } : {}),
        }
      } catch {
        return { error: 'Unable to search flights right now. Please try again or ask me about something else.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 2. searchHotels
  // -------------------------------------------------------------------------
  const searchHotels = tool({
    description:
      'Search for available hotels at a destination. Returns up to 5 results sorted by price.',
    inputSchema: z.object({
      destination: z.string().describe('Destination city code or name'),
      checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
      checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
      adults: z.number().default(1).describe('Number of adult guests'),
      rooms: z.number().default(1).describe('Number of rooms'),
    }),
    execute: async ({ destination, checkIn, checkOut, adults, rooms }) => {
      try {
        const qs = buildQuery({ destination, checkIn, checkOut, adults, rooms })
        const data = await serviceFetch<{ results: NormalizedHotelResult[]; warning?: string }>(`/ota/search/hotels${qs}`)
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          hotels: top5.map((h) => {
            const bestOffer = h.offers?.[0]
            return {
              name: h.name,
              rating: h.starRating ? `${h.starRating} star` : h.rating ? `${h.rating}/5 rated` : 'unrated',
              location: [h.location.city, h.location.country].filter(Boolean).join(', '),
              pricePerNight: bestOffer ? formatCurrency(bestOffer.price.total, bestOffer.price.currency) : 'Contact for pricing',
              boardBasis: bestOffer?.boardType ?? '',
            }
          }),
          resultCount: top5.length,
          ...(data.warning ? { warning: data.warning } : {}),
        }
      } catch {
        return { error: 'Unable to search hotels right now. Please try again or ask me about something else.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 3. searchCruises
  // -------------------------------------------------------------------------
  const searchCruises = tool({
    description:
      'Search for cruise sailings by destination, date range, or cruise line. Returns up to 5 results.',
    inputSchema: z.object({
      destination: z.string().optional().describe('Cruise destination region (e.g. Caribbean, Mediterranean)'),
      departureDate: z.string().optional().describe('Earliest departure date in YYYY-MM-DD format'),
      returnDate: z.string().optional().describe('Latest return date in YYYY-MM-DD format'),
      cruiseLine: z.string().optional().describe('Cruise line name (e.g. Royal Caribbean, Celebrity)'),
      passengers: z.number().optional().describe('Number of passengers'),
    }),
    execute: async ({ destination, departureDate, returnDate, cruiseLine, passengers }) => {
      try {
        // OTA search controller uses /ota/search/cruises with FusionAPI-style params
        const qs = buildQuery({
          destination,
          departureDate,
          returnDate,
          cruiseLine,
          passengers,
          pagesize: 10,
        })
        const data = await serviceFetch<{
          sessionKey: string
          results: CruiseSearchResult[]
          meta: { totalResults: number; page: number; pageSize: number }
        }>(`/ota/search/cruises${qs}`)
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          cruises: top5.map((c) => ({
            cruiseLine: c.cruiselinename,
            ship: c.shipname,
            departurePort: c.departureport,
            itinerary: c.itineraryname,
            departureDate: c.departuredate,
            nights: c.nights,
            region: c.regionname,
            pricePerPerson: c.insideprice ? formatCents(c.insideprice * 100, 'CAD') : 'Contact for pricing',
          })),
          resultCount: top5.length,
          totalResults: data.meta?.totalResults ?? top5.length,
        }
      } catch {
        return { error: 'Unable to search cruises right now. Please try again or ask me about something else.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 4. browseTours
  // -------------------------------------------------------------------------
  const browseTours = tool({
    description:
      'Browse available guided tours and packages by keyword, duration, or operator. Returns up to 5 results.',
    inputSchema: z.object({
      query: z.string().describe('Search keyword (e.g. "Italy food tour", "safari")'),
      duration: z.number().optional().describe('Minimum duration in days'),
      operator: z.string().optional().describe('Tour operator name'),
    }),
    execute: async ({ query, duration, operator }) => {
      try {
        const qs = buildQuery({ q: query, minDays: duration, operator, pageSize: 10 })
        const data = await catalogFetch<{
          tours: TourSummary[]
          total: number
          page: number
          pageSize: number
          totalPages: number
        }>(`/tour-repository/tours${qs}`)
        const top5 = (data.tours ?? []).slice(0, 5)
        return {
          tours: top5.map((t) => ({
            name: t.name,
            operator: t.operatorCode,
            duration: t.days ? `${t.days} days` : 'varies',
            description: t.description ?? '',
            priceFrom: t.lowestPriceCents ? formatCents(t.lowestPriceCents, 'CAD') : 'Contact for pricing',
          })),
          resultCount: top5.length,
          totalAvailable: data.total ?? top5.length,
        }
      } catch {
        return { error: 'Unable to browse tours right now. Please try again or ask me about something else.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 5. assemblePackage
  // -------------------------------------------------------------------------
  const assemblePackage = tool({
    description:
      'Create an estimated flight + hotel package price for a destination. Combines the cheapest available flight and hotel into a total estimate.',
    inputSchema: z.object({
      origin: z.string().describe('Origin airport IATA code (e.g. YYZ)'),
      destination: z.string().describe('Destination airport IATA code (e.g. CDG)'),
      departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
      returnDate: z.string().describe('Return date in YYYY-MM-DD format'),
      adults: z.number().default(1).describe('Number of adult travelers'),
    }),
    execute: async ({ origin, destination, departureDate, returnDate, adults }) => {
      try {
        // Run flight and hotel searches in parallel
        const [flightData, hotelData] = await Promise.all([
          serviceFetch<{ results: NormalizedFlightOffer[] }>(
            `/ota/search/flights${buildQuery({ origin, destination, departureDate, returnDate, adults })}`,
          ).catch(() => ({ results: [] as NormalizedFlightOffer[] })),
          serviceFetch<{ results: NormalizedHotelResult[] }>(
            `/ota/search/hotels${buildQuery({ destination, checkIn: departureDate, checkOut: returnDate, adults })}`,
          ).catch(() => ({ results: [] as NormalizedHotelResult[] })),
        ])

        const flights = flightData.results ?? []
        const hotels = hotelData.results ?? []

        if (flights.length === 0 && hotels.length === 0) {
          return { error: 'No flights or hotels found for this route and dates. Try different dates or destinations.' }
        }

        const cheapestFlight = flights[0]
        const cheapestHotel = hotels[0]
        const bestHotelOffer = cheapestHotel?.offers?.[0]

        // Calculate nights from dates
        const dep = new Date(departureDate)
        const ret = new Date(returnDate)
        const nights = Math.max(1, Math.round((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24)))

        // Flight prices are strings (e.g. "1234.56"), hotel prices are strings too
        const flightPricePerPerson = cheapestFlight ? parseFloat(cheapestFlight.price.perTraveler) : 0
        const flightTotalDollars = flightPricePerPerson * adults
        const hotelTotalPerNight = bestHotelOffer ? parseFloat(bestHotelOffer.price.total) : 0
        const hotelTotalDollars = hotelTotalPerNight * nights
        const grandTotalDollars = flightTotalDollars + hotelTotalDollars
        const currency = cheapestFlight?.price.currency ?? bestHotelOffer?.price.currency ?? 'CAD'

        return {
          package: {
            flight: cheapestFlight
              ? {
                  airline: cheapestFlight.validatingAirline,
                  route: `${cheapestFlight.segments[0]?.departure.iataCode ?? origin} -> ${cheapestFlight.segments[cheapestFlight.segments.length - 1]?.arrival.iataCode ?? destination}`,
                  pricePerPerson: formatCurrency(cheapestFlight.price.perTraveler, currency),
                  totalForAllTravelers: formatCents(Math.round(flightTotalDollars * 100), currency),
                }
              : null,
            hotel: cheapestHotel && bestHotelOffer
              ? {
                  name: cheapestHotel.name,
                  rating: cheapestHotel.starRating ? `${cheapestHotel.starRating} star` : 'unrated',
                  pricePerNight: formatCurrency(bestHotelOffer.price.total, currency),
                  nights,
                  totalHotelCost: formatCents(Math.round(hotelTotalDollars * 100), currency),
                }
              : null,
            estimatedTotal: formatCents(Math.round(grandTotalDollars * 100), currency),
            travelers: adults,
          },
          note: 'Estimated pricing — connect with an advisor to finalize your booking and access exclusive deals.',
        }
      } catch {
        return { error: 'Unable to assemble a package estimate right now. Please try again or ask me about something else.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 6. captureContact
  // -------------------------------------------------------------------------
  const captureContact = tool({
    description:
      "Save a consumer's contact information for follow-up. Use when the consumer provides their email or asks to be contacted by an advisor.",
    inputSchema: z.object({
      email: z.string().describe("Consumer's email address"),
      name: z.string().optional().describe("Consumer's full name"),
      phone: z.string().optional().describe("Consumer's phone number"),
      source: z.string().default('ai_concierge').describe('Lead source identifier'),
    }),
    execute: async ({ email, name, phone, source }) => {
      try {
        await serviceFetch('/ota/leads', {
          method: 'POST',
          body: JSON.stringify({
            email,
            name,
            phone,
            source,
            advisorSlug: ctx.advisorSlug,
          }),
        })
        return {
          message:
            "Thanks! I've saved your contact information. A Phoenix Voyages advisor will be in touch soon.",
        }
      } catch {
        return { error: 'Unable to save your contact information right now. Please try again in a moment.' }
      }
    },
  })

  // -------------------------------------------------------------------------
  // 7. requestAdvisor
  // -------------------------------------------------------------------------
  const requestAdvisor = tool({
    description:
      'Connect the consumer with a human Travel Advisor. Use when they ask to speak to someone, want personalized help, or when the request is too complex for self-service. IMPORTANT: You must collect the consumer\'s email address before calling this tool. If you don\'t have their email yet, ask for it first.',
    inputSchema: z.object({
      email: z.string().email().describe("Consumer's email address (required — ask for it before calling this tool)"),
      reason: z.string().describe('What the consumer needs help with'),
      name: z.string().optional().describe("Consumer's name, if known"),
      preferredAdvisor: z.string().optional().describe('Preferred advisor slug, if any'),
    }),
    execute: async ({ email, reason, name, preferredAdvisor }) => {
      if (!email || email === 'pending') {
        return {
          needsEmail: true,
          message: "I need the consumer's email address to connect them with an advisor. Please ask for their email first, then call this tool again.",
        }
      }
      try {
        await serviceFetch('/ota/leads', {
          method: 'POST',
          body: JSON.stringify({
            email,
            name,
            source: 'advisor_inquiry',
            message: reason,
            advisorSlug: preferredAdvisor ?? ctx.advisorSlug,
          }),
        })
        return {
          message:
            "I've submitted your request. A Phoenix Voyages travel advisor will reach out to you shortly to help with your plans.",
        }
      } catch {
        return { error: 'Unable to submit your advisor request right now. Please try again in a moment.' }
      }
    },
  })

  return {
    searchFlights,
    searchHotels,
    searchCruises,
    browseTours,
    assemblePackage,
    captureContact,
    requestAdvisor,
  }
}
