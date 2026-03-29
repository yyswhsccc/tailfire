/**
 * Google Places Enricher Service
 *
 * Enriches vacation package hotels with Google Places data via SerpAPI Google Maps.
 * Extracts place ID, rating, reviews, address, coordinates, website, phone, and photos.
 */

import { Injectable, Logger } from '@nestjs/common'
import { SerpApiClientService } from './serpapi-client.service'

// ============================================================================
// TYPES
// ============================================================================

export interface GooglePlacesEnrichment {
  placeId: string
  rating: number | null
  reviewCount: number | null
  address: string | null
  latitude: number | null
  longitude: number | null
  website: string | null
  phone: string | null
  photoUrls: string[]
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class GooglePlacesEnricherService {
  private readonly logger = new Logger(GooglePlacesEnricherService.name)

  constructor(private readonly serpApi: SerpApiClientService) {}

  /**
   * Enrich a hotel with Google Places data.
   *
   * @param hotelName - hotel name (e.g. "Mahekal Beach Resort")
   * @param destination - destination label (e.g. "Riviera Maya, Mexico")
   * @returns enrichment data or null if no match found
   */
  async enrich(hotelName: string, destination: string): Promise<GooglePlacesEnrichment | null> {
    const query = `${hotelName} ${destination}`
    this.logger.debug(`Google Places enrichment for "${query}"`)

    const response = await this.serpApi.searchGoogleMaps(query)
    if (!response) {
      return null
    }

    const place = response.local_results?.[0] ?? response.place_results
    if (!place) {
      this.logger.debug(`No Google Places result for "${query}"`)
      return null
    }

    // Extract up to 5 photo URLs from images or photos array
    const rawPhotos = place.images ?? place.photos ?? []
    const photoUrls = rawPhotos
      .slice(0, 5)
      .map((p: any) => (p.image || p.thumbnail || '') as string)
      .filter((url: string) => url.length > 0)

    const enrichment: GooglePlacesEnrichment = {
      placeId: place.place_id ?? '',
      rating: place.rating ?? null,
      reviewCount: place.reviews ?? null,
      address: place.address ?? null,
      latitude: place.gps_coordinates?.latitude ?? null,
      longitude: place.gps_coordinates?.longitude ?? null,
      website: place.website ?? null,
      phone: place.phone ?? null,
      photoUrls,
    }

    this.logger.debug(
      `Google Places match: "${place.title}" — ${enrichment.rating ?? 'N/A'} stars, ${enrichment.reviewCount ?? 0} reviews, ${photoUrls.length} photos`,
    )

    return enrichment
  }
}
