/**
 * Base Promoter Interface & Helpers
 *
 * Defines the contract for component promoters that convert JSONB trip request
 * component data into full Tailfire activities via ComponentOrchestrationService.
 */

// ============================================================================
// Promotion Context
// ============================================================================

/**
 * Context passed to each promoter during trip promotion.
 * Contains the target trip/itinerary IDs and a pre-built date-to-day map.
 */
export interface PromotionContext {
  /** The promoted trip ID */
  tripId: string
  /** The primary itinerary ID within the trip */
  itineraryId: string
  /** The agency that owns the trip */
  agencyId: string
  /** Maps date strings (YYYY-MM-DD) to itinerary day IDs */
  itineraryDayMap: Map<string, string>
}

// ============================================================================
// Component Promoter Interface
// ============================================================================

/**
 * Each promoter converts a single JSONB component (from ota_trip_requests.components[])
 * into a real Tailfire activity. Returns the created activity ID.
 */
export interface ComponentPromoter {
  /** The component type this promoter handles (flight, hotel, cruise, tour) */
  readonly type: string
  /** Promote a JSONB component into a real activity. Returns the activity ID. */
  promote(component: any, context: PromotionContext): Promise<string>
}

// ============================================================================
// Date Extraction Helper
// ============================================================================

/**
 * Extracts all relevant dates from a JSONB component for itinerary day generation.
 * The promotion service uses this to ensure itinerary days exist before promoting.
 *
 * @param type - The component type (flight, hotel, cruise, tour)
 * @param data - The component's `data` object from the JSONB
 * @returns Array of date strings (YYYY-MM-DD)
 */
export function extractDates(type: string, data: any): string[] {
  const dates: string[] = []
  if (!data) return dates

  switch (type) {
    case 'flight': {
      // Collect departure/arrival dates from all segments
      const segments = data.segments ?? []
      for (const seg of segments) {
        // Support both date-only (departureDate) and ISO datetime (departureAt) formats
        const depDate = seg.departureDate || seg.departureAt?.split('T')[0]
        const arrDate = seg.arrivalDate || seg.arrivalAt?.split('T')[0]
        if (depDate) dates.push(depDate)
        if (arrDate) dates.push(arrDate)
      }
      // Fallback: top-level departure/arrival dates
      if (data.departureDate) dates.push(data.departureDate)
      if (data.arrivalDate) dates.push(data.arrivalDate)
      break
    }
    case 'hotel': {
      const checkIn = data.checkInDate || data.checkIn
      const checkOut = data.checkOutDate || data.checkOut
      if (checkIn) dates.push(checkIn)
      if (checkOut) dates.push(checkOut)
      // Include all intermediate dates for multi-night stays
      if (checkIn && checkOut) {
        const start = new Date(checkIn)
        const end = new Date(checkOut)
        const current = new Date(start)
        current.setDate(current.getDate() + 1) // skip check-in (already added)
        while (current < end) {
          dates.push(current.toISOString().split('T')[0]!)
          current.setDate(current.getDate() + 1)
        }
      }
      break
    }
    case 'cruise': {
      if (data.departureDate) dates.push(data.departureDate)
      if (data.arrivalDate) dates.push(data.arrivalDate)
      break
    }
    case 'tour': {
      if (data.startDate) dates.push(data.startDate)
      if (data.endDate) dates.push(data.endDate)
      break
    }
  }

  // Deduplicate
  return [...new Set(dates.filter(Boolean))]
}
