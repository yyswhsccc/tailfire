import { tool } from 'ai'
import { z } from 'zod'
import { publicFetch } from '@/lib/api'
import type { DestinationDetail, DestinationSummary } from '@/types/entities'

export const lookupDestination = tool({
  description:
    "Look up detailed information about a travel destination from our curated database. Use this BEFORE answering any question about a place — it returns highlights, best months, travel tips, budget info, and more. Always call this when a user mentions a destination you haven't looked up yet in this conversation.",
  inputSchema: z.object({
    query: z
      .string()
      .describe('Destination name or slug (e.g. "Jamaica", "santorini-greece", "Bali")'),
  }),
  execute: async ({ query }) => {
    const slugified = query
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    let detail: DestinationDetail | null = null

    // Step 1: Try exact slug match
    try {
      detail = await publicFetch<DestinationDetail>(`/destinations/by-slug/${slugified}`)
    } catch {
      // Step 2: Fall back to name search
      try {
        const searchResult = await publicFetch<{ destinations: DestinationSummary[]; total: number }>(
          `/destinations?search=${encodeURIComponent(query)}&pageSize=3`,
        )
        const best = searchResult.destinations?.[0]
        if (best) {
          detail = await publicFetch<DestinationDetail>(`/destinations/by-slug/${best.slug}`)
        }
      } catch {
        // Could not find destination
      }
    }

    if (!detail) {
      return {
        found: false as const,
        query,
        suggestion: `I don't have detailed info on "${query}" in our system yet. I can share what I know from general travel knowledge, or connect you with an advisor who might have insider tips.`,
      }
    }

    const meta = detail.metadata ?? {}

    return {
      found: true as const,
      name: detail.name,
      slug: detail.slug,
      type: detail.destinationType,
      countryCode: detail.countryCode,
      oneLiner: (meta.oneLiner as string | undefined) ?? null,
      highlights: (meta.highlights as string[] | undefined) ?? [],
      bestMonths: (meta.bestMonths as string[] | undefined) ?? [],
      budgetTier: (meta.budgetTier as string | undefined) ?? null,
      typicalStay: (meta.typicalStay as string | undefined) ?? null,
      travelTips: (meta.travelTips as string[] | undefined) ?? [],
      tags: (meta.tags as string[] | undefined) ?? [],
      vibeWords: (meta.vibeWords as string[] | undefined) ?? [],
      currency: (meta.currency as string | undefined) ?? null,
      languages: (meta.languages as string[] | undefined) ?? [],
      airportIata: (meta.airportIata as string | undefined) ?? null,
      travelDescription: (meta.travelDescription as string | undefined) ?? detail.summary ?? null,
      rating: detail.enrichment?.averageRating ?? null,
      reviewCount: detail.enrichment?.totalReviewCount ?? null,
      cruiseCount: detail.stats?.cruiseCount ?? 0,
      tourCount: detail.stats?.tourCount ?? 0,
    }
  },
})
