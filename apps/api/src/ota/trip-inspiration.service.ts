/**
 * Trip Inspiration Service
 *
 * Fetches inspiration images from Unsplash for dream board filler cards.
 * Results are cached for 24 hours via OtaSearchCacheService.
 */

import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { UnsplashService } from '../unsplash/unsplash.service'
import { OtaSearchCacheService } from './ota-search-cache.service'

export interface InspirationCard {
  id: string
  destination: string
  imageUrl: string
  caption: string
  source: 'unsplash'
  sourceId?: string
  attribution?: string
}

@Injectable()
export class TripInspirationService {
  private readonly logger = new Logger(TripInspirationService.name)

  constructor(
    private readonly unsplashService: UnsplashService,
    private readonly cacheService: OtaSearchCacheService,
  ) {}

  /**
   * Get inspiration cards for a destination.
   * Returns cached results when available, otherwise fetches from Unsplash.
   */
  async getInspirationCards(
    destination: string,
    count?: number,
  ): Promise<InspirationCard[]> {
    const cacheKey = 'inspiration:' + destination.toLowerCase()

    // Check cache first
    const cached = this.cacheService.get<InspirationCard[]>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for inspiration: "${destination}"`)
      return cached
    }

    try {
      const response = await this.unsplashService.searchPhotos(
        `${destination} travel landscape`,
        1,
        count || 4,
      )

      const cards: InspirationCard[] = response.results.map((photo) => ({
        id: `insp-${randomUUID().slice(0, 8)}`,
        destination,
        imageUrl: photo.urls.regular,
        caption: photo.alt_description || `${destination} travel photo`,
        source: 'unsplash' as const,
        sourceId: photo.id,
        attribution: `Photo by ${photo.user.name}`,
      }))

      // Cache for 24 hours
      this.cacheService.set(cacheKey, cards, 86400)

      this.logger.debug(
        `Fetched ${cards.length} inspiration cards for "${destination}"`,
      )
      return cards
    } catch (error) {
      this.logger.warn(
        `Failed to fetch inspiration cards for "${destination}": ${error}`,
      )
      return []
    }
  }
}
