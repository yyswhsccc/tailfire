import { tool } from 'ai'
import { z } from 'zod'
import { serviceFetch, catalogFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types for API responses (minimal, we only pick what we need)
// ---------------------------------------------------------------------------

interface FlightResult {
  airline: string
  flightNumber: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  duration: string
  stops: number
  priceCents: number
  currency: string
  cabin: string
}

interface HotelResult {
  name: string
  starRating: number
  address: string
  pricePerNightCents: number
  currency: string
  boardBasis: string
  thumbnail: string
}

interface CruiseResult {
  cruiseLine: string
  ship: string
  departurePort: string
  itinerary: string[]
  departureDate: string
  nights: number
  pricePerPersonCents: number
  currency: string
}

interface TourResult {
  name: string
  operator: string
  durationDays: number
  description: string
  pricePerPersonCents: number
  currency: string
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
          travelClass,
        })
        const data = await serviceFetch<{ results: FlightResult[] }>(`/ota/search/flights${qs}`)
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          flights: top5.map((f) => ({
            airline: f.airline,
            flightNumber: f.flightNumber,
            route: `${f.origin} -> ${f.destination}`,
            departure: f.departureTime,
            arrival: f.arrivalTime,
            duration: f.duration,
            stops: f.stops,
            price: formatCents(f.priceCents, f.currency),
            cabin: f.cabin,
          })),
          resultCount: top5.length,
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
        const data = await serviceFetch<{ results: HotelResult[] }>(`/ota/search/hotels${qs}`)
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          hotels: top5.map((h) => ({
            name: h.name,
            rating: `${h.starRating} star`,
            pricePerNight: formatCents(h.pricePerNightCents, h.currency),
            boardBasis: h.boardBasis,
          })),
          resultCount: top5.length,
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
        const qs = buildQuery({
          destination,
          departureFrom: departureDate,
          departureTo: returnDate,
          cruiseLine,
          passengers,
        })
        const data = await catalogFetch<{ results: CruiseResult[] }>(
          `/cruise-repository/sailings${qs}`,
        )
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          cruises: top5.map((c) => ({
            cruiseLine: c.cruiseLine,
            ship: c.ship,
            departurePort: c.departurePort,
            itinerary: c.itinerary?.join(' -> ') ?? '',
            departureDate: c.departureDate,
            nights: c.nights,
            pricePerPerson: formatCents(c.pricePerPersonCents, c.currency),
          })),
          resultCount: top5.length,
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
        const qs = buildQuery({ q: query, minDays: duration, operator })
        const data = await catalogFetch<{ results: TourResult[] }>(
          `/tour-repository/tours${qs}`,
        )
        const top5 = (data.results ?? []).slice(0, 5)
        return {
          tours: top5.map((t) => ({
            name: t.name,
            operator: t.operator,
            duration: `${t.durationDays} days`,
            description: t.description,
            pricePerPerson: formatCents(t.pricePerPersonCents, t.currency),
          })),
          resultCount: top5.length,
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
          serviceFetch<{ results: FlightResult[] }>(
            `/ota/search/flights${buildQuery({ origin, destination, departureDate, returnDate, adults })}`,
          ).catch(() => ({ results: [] as FlightResult[] })),
          serviceFetch<{ results: HotelResult[] }>(
            `/ota/search/hotels${buildQuery({ destination, checkIn: departureDate, checkOut: returnDate, adults })}`,
          ).catch(() => ({ results: [] as HotelResult[] })),
        ])

        const flights = flightData.results ?? []
        const hotels = hotelData.results ?? []

        if (flights.length === 0 && hotels.length === 0) {
          return { error: 'No flights or hotels found for this route and dates. Try different dates or destinations.' }
        }

        const cheapestFlight = flights[0]
        const cheapestHotel = hotels[0]

        // Calculate nights from dates
        const dep = new Date(departureDate)
        const ret = new Date(returnDate)
        const nights = Math.max(1, Math.round((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24)))

        const flightTotalCents = cheapestFlight ? cheapestFlight.priceCents * adults : 0
        const hotelTotalCents = cheapestHotel ? cheapestHotel.pricePerNightCents * nights : 0
        const grandTotalCents = flightTotalCents + hotelTotalCents
        const currency = cheapestFlight?.currency ?? cheapestHotel?.currency ?? 'CAD'

        return {
          package: {
            flight: cheapestFlight
              ? {
                  airline: cheapestFlight.airline,
                  route: `${cheapestFlight.origin} -> ${cheapestFlight.destination}`,
                  pricePerPerson: formatCents(cheapestFlight.priceCents, currency),
                  totalForAllTravelers: formatCents(flightTotalCents, currency),
                }
              : null,
            hotel: cheapestHotel
              ? {
                  name: cheapestHotel.name,
                  rating: `${cheapestHotel.starRating} star`,
                  pricePerNight: formatCents(cheapestHotel.pricePerNightCents, currency),
                  nights,
                  totalHotelCost: formatCents(hotelTotalCents, currency),
                }
              : null,
            estimatedTotal: formatCents(grandTotalCents, currency),
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
      'Connect the consumer with a human Travel Advisor. Use when they ask to speak to someone, want personalized help, or when the request is too complex for self-service.',
    inputSchema: z.object({
      reason: z.string().describe('What the consumer needs help with'),
      preferredAdvisor: z.string().optional().describe('Preferred advisor slug, if any'),
    }),
    execute: async ({ reason, preferredAdvisor }) => {
      try {
        await serviceFetch('/ota/leads', {
          method: 'POST',
          body: JSON.stringify({
            email: 'pending',
            source: 'advisor_request',
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
