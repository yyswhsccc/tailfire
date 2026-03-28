/**
 * SerpAPI Client Service
 *
 * HTTP client for the SerpAPI search engine results API.
 * Provides Google Maps and Google Search endpoints for hotel enrichment.
 *
 * SerpAPI base: https://serpapi.com/search.json
 * API key env: SERPAPI_API_KEY
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface GoogleMapsPlace {
  place_id?: string
  title?: string
  rating?: number
  reviews?: number
  address?: string
  gps_coordinates?: { latitude: number; longitude: number }
  website?: string
  phone?: string
  type?: string
  images?: Array<{ image?: string; thumbnail?: string }>
  photos?: Array<{ image?: string; thumbnail?: string }>
}

export interface GoogleMapsApiResponse {
  local_results?: GoogleMapsPlace[]
  place_results?: GoogleMapsPlace
  search_metadata?: Record<string, unknown>
  search_parameters?: Record<string, unknown>
}

export interface GoogleSearchOrganicResult {
  title?: string
  link?: string
  snippet?: string
  rich_snippet?: {
    top?: {
      detected_extensions?: {
        rating?: number
        reviews?: number
      }
      extensions?: string[]
    }
  }
}

export interface GoogleSearchApiResponse {
  organic_results?: GoogleSearchOrganicResult[]
  search_metadata?: Record<string, unknown>
  search_parameters?: Record<string, unknown>
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class SerpApiClientService {
  private readonly logger = new Logger(SerpApiClientService.name)

  private readonly apiKey: string
  private readonly baseUrl = 'https://serpapi.com/search.json'

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('SERPAPI_API_KEY', '')
    if (!this.apiKey) {
      this.logger.warn('SERPAPI_API_KEY not configured — SerpAPI calls will fail')
    }
  }

  /**
   * Search Google Maps for a place.
   *
   * @param query - search query (e.g. "Mahekal Beach Resort Riviera Maya, Mexico")
   * @param ll - optional geo-bias in SerpAPI format (e.g. "@20.6296,-87.0739,12z")
   * @returns raw SerpAPI Google Maps response, or null on error
   */
  async searchGoogleMaps(query: string, ll?: string): Promise<GoogleMapsApiResponse | null> {
    try {
      const params: Record<string, string> = {
        engine: 'google_maps',
        q: query,
        type: 'search',
        api_key: this.apiKey,
      }

      if (ll) {
        params.ll = ll
      }

      const { data } = await firstValueFrom(
        this.httpService.get<GoogleMapsApiResponse>(this.baseUrl, { params }),
      )

      return data
    } catch (error: any) {
      this.logger.warn(
        `Google Maps search failed for "${query}": ${error.response?.status ?? error.message}`,
      )
      return null
    }
  }

  /**
   * Search Google web results.
   *
   * @param query - search query (e.g. "Mahekal Beach Resort site:tripadvisor.com")
   * @returns raw SerpAPI Google Search response, or null on error
   */
  async searchGoogle(query: string): Promise<GoogleSearchApiResponse | null> {
    try {
      const params: Record<string, string> = {
        engine: 'google',
        q: query,
        api_key: this.apiKey,
      }

      const { data } = await firstValueFrom(
        this.httpService.get<GoogleSearchApiResponse>(this.baseUrl, { params }),
      )

      return data
    } catch (error: any) {
      this.logger.warn(
        `Google search failed for "${query}": ${error.response?.status ?? error.message}`,
      )
      return null
    }
  }
}
