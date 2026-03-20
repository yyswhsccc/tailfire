/**
 * Amadeus Hotels Provider
 *
 * External API provider for hotel search and offers via Amadeus Hotel APIs.
 * Used as a fallback when Google Places is unavailable or for pricing data.
 *
 * Features:
 * - OAuth2 client credentials authentication with token caching (shared with flights)
 * - Hotel list by city/geocode
 * - Hotel offers with pricing
 * - Transforms to NormalizedHotelResult
 *
 * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-list
 * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-search
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import { BaseExternalApi } from '../../core/base/base-external-api'
import { RateLimiterService } from '../../core/services/rate-limiter.service'
import { MetricsService } from '../../core/services/metrics.service'
import { ExternalApiRegistryService } from '../../core/services/external-api-registry.service'
import {
  ExternalApiConfig,
  ExternalApiResponse,
  ConnectionTestResult,
  ApiCategory,
} from '../../core/interfaces'
import {
  HotelSearchParams,
  NormalizedHotelResult,
  HotelPriceOffer,
  HotelLocation,
} from '@tailfire/shared-types'
import {
  AmadeusHotelListResponse,
  AmadeusHotelBasic,
  AmadeusHotelOffersResponse,
  AmadeusHotelOffer,
  AmadeusOffer,
} from './amadeus-hotels.types'
import { AmadeusAuthService } from './amadeus-auth.service'

/**
 * Build provider configuration
 */
function buildAmadeusHotelsConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_hotels',
    category: ApiCategory.HOTELS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_MINUTE || '60', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: {
      type: 'bearer',
    },
  }
}

/**
 * Priority for fallback ordering (2 = fallback after Google Places)
 */
const PROVIDER_PRIORITY = 2

/**
 * Buffer time before token expiry (60 seconds)
 */
@Injectable()
export class AmadeusHotelsProvider
  extends BaseExternalApi<HotelSearchParams, NormalizedHotelResult>
  implements OnModuleInit
{
  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService,
    private readonly authService: AmadeusAuthService
  ) {
    super(buildAmadeusHotelsConfig(), httpService, rateLimiter, metrics)
  }

  /**
   * Register with the API registry on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.registry.registerProvider(this, PROVIDER_PRIORITY)
  }

  // ============================================================================
  // OAUTH2 TOKEN MANAGEMENT (delegated to shared AmadeusAuthService)
  // ============================================================================

  /**
   * Get a valid OAuth2 access token via shared auth service
   */
  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('No credentials configured for Amadeus Hotels')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  /**
   * Make an authenticated request to Amadeus API
   */
  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET'
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_hotels_${Date.now()}`
    const startTime = Date.now()

    this.logger.log(`Amadeus Hotels API request: ${endpoint}`, { requestId })

    if (!this.canMakeRequest()) {
      const error = this.getCircuitBreakerState() === 'open'
        ? 'Service temporarily unavailable (circuit open)'
        : 'Rate limit exceeded'

      return {
        success: false,
        error,
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
          requestId,
        },
      }
    }

    try {
      const accessToken = await this.getAccessToken()

      const response = await firstValueFrom(
        this.httpService.request<T>({
          url: endpoint,
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          timeout: this.resilience.timeoutMs,
        })
      )

      const latencyMs = Date.now() - startTime
      this.logger.log(`Amadeus Hotels response`, {
        requestId,
        latencyMs,
      })

      return {
        success: true,
        data: response.data,
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
          requestId,
        },
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime

      this.logger.error('Amadeus Hotels API error', {
        requestId,
        latencyMs,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_hotels', operation: 'authenticated-request' },
        extra: { endpoint, requestId, latencyMs, status: error.response?.status },
      })

      const errorDetail = error.response?.data?.errors?.[0]
      const errorMessage = errorDetail
        ? `${errorDetail.title}: ${errorDetail.detail || ''}`
        : error.message

      return {
        success: false,
        error: errorMessage,
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
          requestId,
        },
      }
    }
  }

  // ============================================================================
  // IExternalApiProvider IMPLEMENTATION
  // ============================================================================

  /**
   * Search for hotels by city code or geocode
   */
  async search(
    params: HotelSearchParams
  ): Promise<ExternalApiResponse<NormalizedHotelResult[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
        },
      }
    }

    // Step 1: Get hotel list by city code or geocode
    let hotelListEndpoint: string

    if (params.cityCode) {
      hotelListEndpoint = `${this.config.baseUrl}/v1/reference-data/locations/hotels/by-city?cityCode=${params.cityCode}`
    } else if (params.latitude !== undefined && params.longitude !== undefined) {
      const radius = params.radius ? Math.min(params.radius / 1000, 300) : 5 // Convert to km, max 300km
      hotelListEndpoint = `${this.config.baseUrl}/v1/reference-data/locations/hotels/by-geocode?latitude=${params.latitude}&longitude=${params.longitude}&radius=${radius}&radiusUnit=KM`
    } else {
      return {
        success: false,
        error: 'Either cityCode or coordinates are required for Amadeus hotel search',
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
        },
      }
    }

    // Add hotel name filter if provided
    if (params.hotelName) {
      hotelListEndpoint += `&keyword=${encodeURIComponent(params.hotelName)}`
    }

    const hotelListResponse = await this.makeAuthenticatedRequest<AmadeusHotelListResponse>(
      hotelListEndpoint
    )

    if (!hotelListResponse.success || !hotelListResponse.data) {
      return {
        success: false,
        error: hotelListResponse.error || 'No hotels found',
        metadata: hotelListResponse.metadata,
      }
    }

    const hotels = hotelListResponse.data.data || []
    if (hotels.length === 0) {
      return {
        success: true,
        data: [],
        metadata: hotelListResponse.metadata,
      }
    }

    // If check-in/out dates provided, get offers
    if (params.checkIn && params.checkOut) {
      return this.searchWithOffers(hotels.slice(0, 10), params)
    }

    // Otherwise just return basic hotel list
    const normalizedResults = hotels.slice(0, 20).map(hotel =>
      this.transformBasicHotel(hotel)
    )

    return {
      success: true,
      data: normalizedResults,
      metadata: hotelListResponse.metadata,
    }
  }

  /**
   * Search hotels with offers (pricing)
   */
  private async searchWithOffers(
    hotels: AmadeusHotelBasic[],
    params: HotelSearchParams
  ): Promise<ExternalApiResponse<NormalizedHotelResult[]>> {
    const hotelIds = hotels.map(h => h.hotelId).join(',')

    // Build offers endpoint
    let offersEndpoint = `${this.config.baseUrl}/v3/shopping/hotel-offers?hotelIds=${hotelIds}&checkInDate=${params.checkIn}&checkOutDate=${params.checkOut}`

    if (params.adults) {
      offersEndpoint += `&adults=${params.adults}`
    }

    const offersResponse = await this.makeAuthenticatedRequest<AmadeusHotelOffersResponse>(
      offersEndpoint
    )

    if (!offersResponse.success || !offersResponse.data) {
      // Fall back to basic list if offers fail
      this.logger.warn('Amadeus offers failed, returning basic list', {
        error: offersResponse.error,
      })

      const normalizedResults = hotels.map(hotel => this.transformBasicHotel(hotel))
      return {
        success: true,
        data: normalizedResults,
        metadata: offersResponse.metadata,
      }
    }

    const hotelOffers = offersResponse.data.data || []
    const normalizedResults = hotelOffers.map(offer => this.transformHotelOffer(offer))

    return {
      success: true,
      data: normalizedResults,
      metadata: offersResponse.metadata,
    }
  }

  /**
   * Get details for a specific hotel
   */
  async getDetails(
    hotelId: string,
    additionalParams?: Record<string, any>
  ): Promise<ExternalApiResponse<NormalizedHotelResult>> {
    if (!hotelId) {
      return {
        success: false,
        error: 'Hotel ID is required',
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
        },
      }
    }

    // Get hotel offers for the specific hotel
    let endpoint = `${this.config.baseUrl}/v3/shopping/hotel-offers?hotelIds=${hotelId}`

    if (additionalParams?.checkIn && additionalParams?.checkOut) {
      endpoint += `&checkInDate=${additionalParams.checkIn}&checkOutDate=${additionalParams.checkOut}`
    }
    if (additionalParams?.adults) {
      endpoint += `&adults=${additionalParams.adults}`
    }

    const response = await this.makeAuthenticatedRequest<AmadeusHotelOffersResponse>(endpoint)

    if (!response.success || !response.data?.data?.length) {
      return {
        success: false,
        error: response.error || 'Hotel not found',
        metadata: response.metadata,
      }
    }

    const hotelOffer = response.data.data[0]!
    const normalized = this.transformHotelOffer(hotelOffer)

    return {
      success: true,
      data: normalized,
      metadata: response.metadata,
    }
  }

  /**
   * Validate search parameters
   */
  validateParams(params: HotelSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Amadeus requires cityCode or coordinates
    if (!params.cityCode && (params.latitude === undefined || params.longitude === undefined)) {
      errors.push('Either cityCode or coordinates are required for Amadeus')
    }

    // Validate date formats if provided
    if (params.checkIn) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.checkIn)) {
        errors.push('Check-in date must be in YYYY-MM-DD format')
      }
    }
    if (params.checkOut) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.checkOut)) {
        errors.push('Check-out date must be in YYYY-MM-DD format')
      }
    }

    // Must have both dates or neither
    if ((params.checkIn && !params.checkOut) || (!params.checkIn && params.checkOut)) {
      errors.push('Both check-in and check-out dates are required for pricing')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Transform basic hotel to NormalizedHotelResult
   */
  transformBasicHotel(hotel: AmadeusHotelBasic): NormalizedHotelResult {
    const location = this.parseLocation(hotel)

    return {
      id: hotel.hotelId,
      hotelId: hotel.hotelId,
      name: hotel.name,
      location,
      provider: 'amadeus',
      providers: ['amadeus'],
    }
  }

  /**
   * Transform hotel offer to NormalizedHotelResult
   */
  transformHotelOffer(hotelOffer: AmadeusHotelOffer): NormalizedHotelResult {
    const hotel = hotelOffer.hotel
    const offers = hotelOffer.offers || []

    const location: HotelLocation = {
      address: '',
      latitude: hotel.latitude,
      longitude: hotel.longitude,
    }
    if (hotel.cityCode) {
      location.city = hotel.cityCode
    }

    // Transform offers to HotelPriceOffer
    const priceOffers: HotelPriceOffer[] = offers.map(offer => this.transformOffer(offer))

    return {
      id: hotel.hotelId,
      hotelId: hotel.hotelId,
      cityCode: hotel.cityCode,
      name: hotel.name,
      location,
      offers: priceOffers.length > 0 ? priceOffers : undefined,
      provider: 'amadeus',
      providers: ['amadeus'],
    }
  }

  /**
   * Transform API response (required by base class)
   */
  transformResponse(apiData: AmadeusHotelBasic | AmadeusHotelOffer): NormalizedHotelResult {
    if ('offers' in apiData || 'hotel' in apiData) {
      return this.transformHotelOffer(apiData as AmadeusHotelOffer)
    }
    return this.transformBasicHotel(apiData as AmadeusHotelBasic)
  }

  /**
   * Transform offer to HotelPriceOffer
   */
  private transformOffer(offer: AmadeusOffer): HotelPriceOffer {
    return {
      checkIn: offer.checkInDate || '',
      checkOut: offer.checkOutDate || '',
      roomType: offer.room?.description?.text || offer.room?.typeEstimated?.category,
      price: {
        currency: offer.price.currency,
        total: offer.price.total,
        base: offer.price.base,
      },
      cancellationPolicy: offer.policies?.cancellation ? {
        deadline: offer.policies.cancellation.deadline,
        refundable: offer.policies.cancellation.type !== 'FULL_STAY',
        description: offer.policies.cancellation.description?.text,
      } : undefined,
      boardType: offer.boardType,
    }
  }

  /**
   * Parse location from basic hotel
   */
  private parseLocation(hotel: AmadeusHotelBasic): HotelLocation {
    const location: HotelLocation = {
      address: hotel.address?.lines?.join(', ') || '',
      city: hotel.address?.cityName,
      country: hotel.address?.countryCode,
      postalCode: hotel.address?.postalCode,
    }

    if (hotel.geoCode) {
      location.latitude = hotel.geoCode.latitude
      location.longitude = hotel.geoCode.longitude
    }

    return location
  }

  /**
   * Test connection to Amadeus Hotels API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }

    try {
      await this.getAccessToken()
      return {
        success: true,
        message: 'OAuth2 authentication successful',
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'OAuth2 authentication failed',
      }
    }
  }

  /**
   * Override canMakeRequest to add proper access check
   */
  protected canMakeRequest(): boolean {
    return super['canMakeRequest']?.() ?? true
  }
}
