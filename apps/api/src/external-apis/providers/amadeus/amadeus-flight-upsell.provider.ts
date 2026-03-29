/**
 * Amadeus Flight Upsell Provider
 *
 * External API provider for retrieving premium cabin alternatives (Business,
 * Premium Economy) for a given economy flight offer via Amadeus Upselling API.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search/api-reference
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
import { AmadeusAuthService } from './amadeus-auth.service'

// ============================================================================
// TYPES
// ============================================================================

export interface FlightUpsellParams {
  /** Raw Amadeus flight offer objects from search results */
  flightOffers: object[]
}

export interface NormalizedFlightUpsell {
  /** Cabin class (e.g., BUSINESS, PREMIUM_ECONOMY) */
  cabinClass: string
  /** Total price for this alternative */
  price: number
  /** Currency code */
  currency: string
  /** Included services/amenities */
  includedServices: string[]
  /** Raw Amadeus offer object for downstream use */
  rawOffer: object
}

interface AmadeusFlightUpsellResponse {
  data: Array<{
    type: string
    id: string
    source: string
    instantTicketingRequired: boolean
    nonHomogeneous: boolean
    oneWay: boolean
    lastTicketingDate?: string
    numberOfBookableSeats?: number
    itineraries: Array<{
      duration: string
      segments: Array<{
        departure: { iataCode: string; terminal?: string; at: string }
        arrival: { iataCode: string; terminal?: string; at: string }
        carrierCode: string
        number: string
        aircraft: { code: string }
        operating?: { carrierCode: string }
        duration: string
        id: string
        numberOfStops: number
        blacklistedInEU: boolean
      }>
    }>
    price: {
      currency: string
      total: string
      base: string
      fees?: Array<{ amount: string; type: string }>
      grandTotal: string
    }
    pricingOptions?: { fareType?: string[]; includedCheckedBagsOnly?: boolean }
    validatingAirlineCodes?: string[]
    travelerPricings: Array<{
      travelerId: string
      fareOption: string
      travelerType: string
      price: { currency: string; total: string; base: string }
      fareDetailsBySegment: Array<{
        segmentId: string
        cabin: string
        fareBasis: string
        class: string
        includedCheckedBags?: { weight?: number; weightUnit?: string; quantity?: number }
        amenities?: Array<{
          description: string
          isChargeable: boolean
          amenityType: string
        }>
      }>
    }>
  }>
  dictionaries?: object
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_flight_upsell',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_FLIGHT_UPSELL_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusFlightUpsellProvider
  extends BaseExternalApi<FlightUpsellParams, NormalizedFlightUpsell>
  implements OnModuleInit
{
  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService,
    private readonly authService: AmadeusAuthService
  ) {
    super(buildConfig(), httpService, rateLimiter, metrics)
  }

  async onModuleInit(): Promise<void> {
    await this.registry.registerProvider(this, PROVIDER_PRIORITY)
  }

  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('No credentials configured for Amadeus Flight Upsell')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: object,
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_flight_upsell_${Date.now()}`
    const startTime = Date.now()

    if (!this.canMakeRequest()) {
      return {
        success: false,
        error: this.getCircuitBreakerState() === 'open'
          ? 'Service temporarily unavailable (circuit open)'
          : 'Rate limit exceeded',
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
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
            'Content-Type': 'application/json',
          },
          data: body,
          timeout: this.resilience.timeoutMs,
        })
      )

      this.logger.log('Amadeus Flight Upsell response', { requestId, latencyMs: Date.now() - startTime })

      return {
        success: true,
        data: response.data,
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime
      const status = error.response?.status

      // On 401, clear the stale token and retry once with a fresh one
      if (status === 401 && !isRetry) {
        this.logger.warn('Amadeus 401 — invalidating token cache and retrying', { requestId, endpoint })
        this.authService.invalidateToken()
        return this.makeAuthenticatedRequest<T>(endpoint, method, body, true)
      }

      // After a retry also 401s, give a clear error
      if (status === 401 && isRetry) {
        this.logger.error('Amadeus 401 on retry — credentials may be invalid', { requestId, endpoint })
        return {
          success: false,
          error: 'Authentication failed: unable to obtain a valid Amadeus token. Please check your API credentials.',
          metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
        }
      }

      this.logger.error('Amadeus Flight Upsell API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_flight_upsell', operation: 'authenticated-request' },
        extra: { endpoint, requestId, latencyMs, status },
      })

      // Surface the Amadeus error detail for 400s so the frontend gets useful feedback
      const amadeusErrors: Array<{ title?: string; detail?: string; code?: number }> =
        error.response?.data?.errors ?? []
      let errorMessage: string
      if (amadeusErrors.length > 0) {
        errorMessage = amadeusErrors
          .map(e => [e.title, e.detail].filter(Boolean).join(': '))
          .join('; ')
      } else {
        errorMessage = error.message
      }

      return {
        success: false,
        error: errorMessage,
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    }
  }

  async search(
    params: FlightUpsellParams
  ): Promise<ExternalApiResponse<NormalizedFlightUpsell[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const endpoint = `${this.config.baseUrl}/v1/shopping/flight-offers/upselling`
    const body = {
      data: {
        type: 'flight-offers-upselling',
        flightOffers: params.flightOffers,
      },
    }

    const response = await this.makeAuthenticatedRequest<AmadeusFlightUpsellResponse>(
      endpoint, 'POST', body
    )

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No upsell data returned', metadata: response.metadata }
    }

    const offers = response.data.data || []
    if (offers.length === 0) {
      return { success: false, error: 'No premium alternatives found', metadata: response.metadata }
    }

    const normalized: NormalizedFlightUpsell[] = offers.map(offer => {
      // Extract cabin class from the first segment of the first traveler pricing
      const firstTraveler = offer.travelerPricings?.[0]
      const firstSegmentFare = firstTraveler?.fareDetailsBySegment?.[0]
      const cabinClass = firstSegmentFare?.cabin || 'UNKNOWN'

      // Extract included services from amenities
      const includedServices: string[] = []
      for (const traveler of offer.travelerPricings || []) {
        for (const segment of traveler.fareDetailsBySegment || []) {
          if (segment.includedCheckedBags) {
            const bags = segment.includedCheckedBags
            if (bags.quantity) {
              includedServices.push(`${bags.quantity} checked bag(s)`)
            } else if (bags.weight && bags.weightUnit) {
              includedServices.push(`${bags.weight}${bags.weightUnit} checked baggage`)
            }
          }
          for (const amenity of segment.amenities || []) {
            if (!amenity.isChargeable && amenity.description) {
              includedServices.push(amenity.description)
            }
          }
        }
      }

      // Deduplicate services
      const uniqueServices = [...new Set(includedServices)]

      return {
        cabinClass,
        price: parseFloat(offer.price?.grandTotal || offer.price?.total || '0'),
        currency: offer.price?.currency || 'CAD',
        includedServices: uniqueServices,
        rawOffer: offer,
      }
    })

    return { success: true, data: normalized, metadata: response.metadata }
  }

  async getDetails(
    _id: string
  ): Promise<ExternalApiResponse<NormalizedFlightUpsell>> {
    return {
      success: false,
      error: 'Flight upsell details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: FlightUpsellParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.flightOffers || !Array.isArray(params.flightOffers) || params.flightOffers.length === 0) {
      errors.push('flightOffers must be a non-empty array of Amadeus flight offer objects')
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedFlightUpsell {
    return {
      cabinClass: apiData.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || 'UNKNOWN',
      price: parseFloat(apiData.price?.grandTotal || '0'),
      currency: apiData.price?.currency || 'CAD',
      includedServices: [],
      rawOffer: apiData,
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }
    try {
      await this.getAccessToken()
      return { success: true, message: 'OAuth2 authentication successful' }
    } catch (error: any) {
      return { success: false, message: error.message || 'OAuth2 authentication failed' }
    }
  }

  protected canMakeRequest(): boolean {
    return super['canMakeRequest']?.() ?? true
  }
}
