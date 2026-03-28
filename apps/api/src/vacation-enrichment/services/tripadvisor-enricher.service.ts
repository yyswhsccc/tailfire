/**
 * TripAdvisor Enricher Service
 *
 * Enriches vacation package hotels with TripAdvisor data via SerpAPI Google Search.
 * Searches for "hotelName destination site:tripadvisor.com" and extracts
 * rating, review count, and TripAdvisor link from organic results.
 */

import { Injectable, Logger } from '@nestjs/common'
import { SerpApiClientService } from './serpapi-client.service'

// ============================================================================
// TYPES
// ============================================================================

export interface TripadvisorEnrichment {
  rating: number | null
  reviewCount: number | null
  link: string | null
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class TripadvisorEnricherService {
  private readonly logger = new Logger(TripadvisorEnricherService.name)

  constructor(private readonly serpApi: SerpApiClientService) {}

  /**
   * Enrich a hotel with TripAdvisor data.
   *
   * @param hotelName - hotel name (e.g. "Mahekal Beach Resort")
   * @param destination - destination label (e.g. "Riviera Maya, Mexico")
   * @returns enrichment data or null if no TripAdvisor match found
   */
  async enrich(hotelName: string, destination: string): Promise<TripadvisorEnrichment | null> {
    const query = `${hotelName} ${destination} site:tripadvisor.com`
    this.logger.debug(`TripAdvisor enrichment for "${hotelName} ${destination}"`)

    const response = await this.serpApi.searchGoogle(query)
    if (!response) {
      return null
    }

    // Find the first organic result with a TripAdvisor link
    const result = response.organic_results?.find((r) => r.link?.includes('tripadvisor'))
    if (!result) {
      this.logger.debug(`No TripAdvisor result for "${hotelName} ${destination}"`)
      return null
    }

    const rating = result.rich_snippet?.top?.detected_extensions?.rating ?? null
    const reviewCount = result.rich_snippet?.top?.detected_extensions?.reviews ?? null
    const link = result.link ?? null

    this.logger.debug(
      `TripAdvisor match: "${result.title}" — ${rating ?? 'N/A'} stars, ${reviewCount ?? 0} reviews`,
    )

    return { rating, reviewCount, link }
  }
}
