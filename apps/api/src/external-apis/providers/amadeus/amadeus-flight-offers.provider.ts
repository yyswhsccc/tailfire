/**
 * Amadeus Flight Offers Provider
 *
 * External API provider for flight price shopping via Amadeus Flight Offers Search API.
 * Returns flight offers with pricing, segments, baggage, and fare rules.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search
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
  FlightOfferSearchParams,
  NormalizedFlightOffer,
  FlightOfferSegment,
} from '@tailfire/shared-types'
import {
  AmadeusFlightOffersResponse,
  AmadeusFlightOfferRaw,
  AmadeusFlightOfferSegment,
} from './amadeus.types'
import { AmadeusAuthService } from './amadeus-auth.service'

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_offers',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_OFFERS_API_URL || process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_OFFERS_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusFlightOffersProvider
  extends BaseExternalApi<FlightOfferSearchParams, NormalizedFlightOffer>
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
      throw new Error('No credentials configured for Amadeus Flight Offers')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_offers_${Date.now()}`
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
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          timeout: this.resilience.timeoutMs,
        })
      )

      this.logger.log('Amadeus Flight Offers response', { requestId, latencyMs: Date.now() - startTime })

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
        return this.makeAuthenticatedRequest<T>(endpoint, method, true)
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

      this.logger.error('Amadeus Flight Offers API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_offers', operation: 'authenticated-request' },
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
    params: FlightOfferSearchParams
  ): Promise<ExternalApiResponse<NormalizedFlightOffer[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departureDate,
      adults: String(params.adults),
    })

    if (params.returnDate) queryParams.set('returnDate', params.returnDate)
    if (params.travelClass) queryParams.set('travelClass', params.travelClass)
    if (params.nonStop) queryParams.set('nonStop', 'true')
    if (params.maxPrice) queryParams.set('maxPrice', String(params.maxPrice))
    if (params.currencyCode) queryParams.set('currencyCode', params.currencyCode)

    const endpoint = `${this.config.baseUrl}/v2/shopping/flight-offers?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusFlightOffersResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No offers returned', metadata: response.metadata }
    }

    const offers = response.data.data || []
    if (offers.length === 0) {
      return { success: false, error: 'No flight offers found', metadata: response.metadata }
    }

    const dictionaries = response.data.dictionaries
    const normalized = offers.map(offer => this.transformOffer(offer, dictionaries))

    return { success: true, data: normalized, metadata: response.metadata }
  }

  async getDetails(
    _offerId: string
  ): Promise<ExternalApiResponse<NormalizedFlightOffer>> {
    return {
      success: false,
      error: 'Flight offer details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: FlightOfferSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.origin || !/^[A-Z]{3}$/i.test(params.origin)) errors.push('Origin must be a 3-letter IATA code')
    if (!params.destination || !/^[A-Z]{3}$/i.test(params.destination)) errors.push('Destination must be a 3-letter IATA code')

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!params.departureDate || !dateRegex.test(params.departureDate)) {
      errors.push('Departure date required (YYYY-MM-DD)')
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const departure = new Date(params.departureDate)
      if (departure < today) errors.push('Departure date must not be in the past')

      if (params.returnDate) {
        if (!dateRegex.test(params.returnDate)) {
          errors.push('Return date must be YYYY-MM-DD')
        } else {
          const returnDate = new Date(params.returnDate)
          if (returnDate < departure) errors.push('Return date must be on or after the departure date')
        }
      }
    }

    if (!params.adults || params.adults < 1) errors.push('At least 1 adult required')

    const validTravelClasses = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']
    if (params.travelClass && !validTravelClasses.includes(params.travelClass)) {
      errors.push(`Travel class must be one of: ${validTravelClasses.join(', ')}`)
    }

    if (params.maxPrice !== undefined && params.maxPrice !== null && params.maxPrice <= 0) {
      errors.push('Max price must be a positive number')
    }

    if (params.currencyCode && !/^[A-Z]{3}$/.test(params.currencyCode)) {
      errors.push('Currency code must be 3 uppercase letters (e.g. USD, CAD, EUR)')
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: AmadeusFlightOfferRaw): NormalizedFlightOffer {
    return this.transformOffer(apiData)
  }

  private transformOffer(
    offer: AmadeusFlightOfferRaw,
    dictionaries?: AmadeusFlightOffersResponse['dictionaries']
  ): NormalizedFlightOffer {
    const segments: FlightOfferSegment[] = []
    for (const itinerary of offer.itineraries) {
      for (const seg of itinerary.segments) {
        segments.push(this.transformSegment(seg, dictionaries))
      }
    }

    // Get fare details from first traveler pricing
    const travelerPricing = offer.travelerPricings?.[0]
    const fareDetail = travelerPricing?.fareDetailsBySegment?.[0]

    return {
      id: offer.id,
      source: offer.source,
      segments,
      price: {
        currency: offer.price.currency,
        total: offer.price.grandTotal || offer.price.total,
        perTraveler: travelerPricing?.price?.total || offer.price.total,
        base: offer.price.base,
        fees: offer.price.fees,
      },
      validatingAirline: offer.validatingAirlineCodes?.[0] || segments[0]?.carrier || '',
      fareClass: fareDetail?.fareBasis,
      fareFamily: fareDetail?.brandedFare,
      cabin: fareDetail?.cabin,
      fareRules: undefined, // Not available in search response
      baggageAllowance: fareDetail?.includedCheckedBags
        ? {
            checked: {
              quantity: fareDetail.includedCheckedBags.quantity ?? 0,
              weight: fareDetail.includedCheckedBags.weight
                ? `${fareDetail.includedCheckedBags.weight}${fareDetail.includedCheckedBags.weightUnit || 'KG'}`
                : undefined,
            },
          }
        : undefined,
      bookingClass: fareDetail?.class,
    }
  }

  private transformSegment(
    seg: AmadeusFlightOfferSegment,
    dictionaries?: AmadeusFlightOffersResponse['dictionaries']
  ): FlightOfferSegment {
    return {
      departure: seg.departure,
      arrival: seg.arrival,
      carrier: seg.carrierCode,
      carrierName: dictionaries?.carriers?.[seg.carrierCode],
      flightNumber: `${seg.carrierCode}${seg.number}`,
      aircraft: seg.aircraft?.code,
      aircraftName: seg.aircraft?.code ? dictionaries?.aircraft?.[seg.aircraft.code] : undefined,
      duration: seg.duration,
      stops: seg.numberOfStops,
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
