import { tool } from 'ai'
import { z } from 'zod'
import { catalogFetch } from '@/lib/api'
import type { CruiseLine, CruiseLineDetail, ShipSummary, ShipDetail } from '@/types/entities'

export const lookupCruiseLineOrShip = tool({
  description:
    'Look up information about a cruise line or ship from our catalog. Returns fleet details, ship specs, sailing counts, and more. Use this BEFORE answering questions about cruise lines or specific ships.',
  inputSchema: z.object({
    query: z.string().describe('Name or partial match of the cruise line or ship'),
    type: z.enum(['line', 'ship']).optional().describe('Optional hint: "line" for cruise lines, "ship" for individual ships'),
  }),
  execute: async ({ query, type }) => {
    const q = query.toLowerCase()

    // Try cruise line lookup unless type is explicitly 'ship'
    if (type !== 'ship') {
      try {
        const lines = await catalogFetch<CruiseLine[]>('/cruise-repository/lines')
        const match = (Array.isArray(lines) ? lines : []).find(
          (l) =>
            l.name?.toLowerCase().includes(q) ||
            q.includes(l.name?.toLowerCase() ?? '')
        )
        if (match) {
          try {
            const detail = await catalogFetch<CruiseLineDetail>(
              `/cruise-repository/lines/by-slug/${match.slug}`
            )
            return {
              found: true as const,
              type: 'cruise_line' as const,
              name: detail.name,
              slug: detail.slug,
              logoUrl: detail.logoUrl,
              shipCount: detail.shipCount,
              ships: (detail.ships ?? []).map((s) => ({
                name: s.name,
                slug: s.slug,
                shipClass: s.shipClass,
              })),
              sailingCount: detail.sailingCount,
              upcomingSailingCount: detail.upcomingSailingCount,
            }
          } catch {
            // detail fetch failed — fall through
          }
        }
      } catch {
        // lines fetch failed — fall through
      }

      // If type === 'line' and we didn't find it, return not found
      if (type === 'line') {
        return {
          found: false as const,
          query,
          suggestion: `I couldn't find "${query}" in our cruise catalog. Please try a different name or check your spelling.`,
        }
      }
    }

    // Try ship lookup (type is 'ship' or undefined at this point — 'line' returned above)
    try {
      const ships = await catalogFetch<ShipSummary[]>('/cruise-repository/ships')
      const match = (Array.isArray(ships) ? ships : []).find(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          q.includes(s.name?.toLowerCase() ?? '')
      )
      if (match) {
        try {
          const detail = await catalogFetch<ShipDetail>(
            `/cruise-repository/ships/by-slug/${match.slug}`
          )
          return {
            found: true as const,
            type: 'ship' as const,
            name: detail.name,
            slug: detail.slug,
            cruiseLine: detail.cruiseLine?.name,
            cruiseLineSlug: detail.cruiseLine?.slug,
            imageUrl: detail.imageUrl,
            shipClass: detail.shipClass,
            yearBuilt: detail.yearBuilt,
            passengerCapacity: detail.passengerCapacity,
            tonnage: detail.tonnage,
            crewCount: detail.crewCount,
            amenities: detail.amenities ?? [],
            upcomingSailings: detail.upcomingSailingCount,
          }
        } catch {
          // detail fetch failed — fall through
        }
      }
    } catch {
      // ships fetch failed — fall through
    }

    return {
      found: false as const,
      query,
      suggestion: `I couldn't find "${query}" in our cruise catalog. Try searching by the full cruise line name (e.g. "Royal Caribbean") or ship name (e.g. "Wonder of the Seas").`,
    }
  },
})
