/**
 * SerpAPI Service
 *
 * TripAdvisor integration via SerpAPI for destination enrichment.
 * Implements rate limiting (max 1 req/sec) and graceful degradation
 * when API key is not configured.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface TripAdvisorSearchResult {
  title: string
  link: string
  rating: number
  reviewsCount: number
  description: string
  thumbnailUrl?: string
  photos: Array<{ url: string; caption?: string }>
  categories: string[]
  priceLevel?: string
  address?: string
  latitude?: number
  longitude?: number
}

interface TripAdvisorSearchResponse {
  results: TripAdvisorSearchResult[]
  serpApiCreditsUsed: number
}

@Injectable()
export class SerpApiService {
  private readonly logger = new Logger(SerpApiService.name)
  private readonly apiKey: string | undefined
  private lastRequestAt = 0
  private readonly minRequestIntervalMs = 1100 // Rate limit: max 1 req/sec

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SERPAPI_API_KEY')
    if (!this.apiKey) {
      this.logger.warn('SERPAPI_API_KEY not configured — enrichment will be disabled')
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Search TripAdvisor for a destination via SerpAPI.
   * API: https://serpapi.com/tripadvisor-search-api
   */
  async searchTripAdvisor(
    query: string,
    options?: { limit?: number },
  ): Promise<TripAdvisorSearchResponse | null> {
    if (!this.apiKey) return null

    // Rate limiting
    const now = Date.now()
    const elapsed = now - this.lastRequestAt
    if (elapsed < this.minRequestIntervalMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minRequestIntervalMs - elapsed),
      )
    }
    this.lastRequestAt = Date.now()

    try {
      const params = new URLSearchParams({
        engine: 'tripadvisor',
        q: query,
        api_key: this.apiKey,
      })

      const response = await fetch(`https://serpapi.com/search.json?${params}`)

      if (!response.ok) {
        this.logger.error(
          `SerpAPI returned ${response.status}: ${response.statusText}`,
        )
        return null
      }

      const data = (await response.json()) as Record<string, any>

      // Parse TripAdvisor results — SerpAPI returns `places` array
      const places: any[] = data.places || data.results || data.data || []

      this.logger.log(`SerpAPI returned ${places.length} places for "${query}"`)

      const results: TripAdvisorSearchResult[] = places
        .slice(0, options?.limit ?? 10)
        .map((item: any) => ({
          title: item.title || item.name || '',
          link: item.link || '',
          rating: item.rating || 0,
          reviewsCount: item.reviews || item.reviews_count || 0,
          description: item.description || item.snippet || '',
          thumbnailUrl: item.thumbnail || item.image || undefined,
          photos: (item.images || []).map((img: any) => ({
            url:
              typeof img === 'string'
                ? img
                : img.url || img.original || '',
            caption: typeof img === 'string' ? undefined : img.caption,
          })),
          categories: item.categories || [],
          priceLevel: item.price_level || undefined,
          address: item.location || item.address || undefined,
          latitude: item.gps_coordinates?.latitude || undefined,
          longitude: item.gps_coordinates?.longitude || undefined,
        }))

      return { results, serpApiCreditsUsed: 1 }
    } catch (error) {
      this.logger.error(`SerpAPI request failed for "${query}": ${error}`)
      return null
    }
  }
}
