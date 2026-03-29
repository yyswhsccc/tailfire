/**
 * Amadeus Flight Pricing Provider
 *
 * External API provider for confirming live prices for selected flight offers
 * via Amadeus Flight Offers Price API.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-price
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

export interface FlightPricingParams {
  /** Raw Amadeus flight offer objects from search results */
  flightOffers: object[]
}

export interface NormalizedFlightPricing {
  /** Confirmed flight offers with live pricing */
  flightOffers: object[]
  /** Payment info if available */
  payment?: object
}

interface AmadeusFlightPricingResponse {
  data: {
    type: string
    flightOffers: object[]
    bookingRequirements?: object
  }
  dictionaries?: object
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_flight_pricing',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_FLIGHT_PRICING_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusFlightPricingProvider
  extends BaseExternalApi<FlightPricingParams, NormalizedFlightPricing>
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
      throw new Error('No credentials configured for Amadeus Flight Pricing')
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
    const requestId = `amadeus_flight_pricing_${Date.now()}`
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

      this.logger.log('Amadeus Flight Pricing response', { requestId, latencyMs: Date.now() - startTime })

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

      this.logger.error('Amadeus Flight Pricing API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_flight_pricing', operation: 'authenticated-request' },
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
    params: FlightPricingParams
  ): Promise<ExternalApiResponse<NormalizedFlightPricing[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const endpoint = `${this.config.baseUrl}/v1/shopping/flight-offers/pricing`
    const body = {
      data: {
        type: 'flight-offers-pricing',
        flightOffers: params.flightOffers,
      },
    }

    const response = await this.makeAuthenticatedRequest<AmadeusFlightPricingResponse>(
      endpoint, 'POST', body
    )

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No pricing data returned', metadata: response.metadata }
    }

    const pricedOffers = response.data.data?.flightOffers || []
    if (pricedOffers.length === 0) {
      return { success: false, error: 'No priced offers returned', metadata: response.metadata }
    }

    const normalized: NormalizedFlightPricing = {
      flightOffers: pricedOffers,
      payment: response.data.data?.bookingRequirements,
    }

    return { success: true, data: [normalized], metadata: response.metadata }
  }

  async getDetails(
    _id: string
  ): Promise<ExternalApiResponse<NormalizedFlightPricing>> {
    return {
      success: false,
      error: 'Flight pricing details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: FlightPricingParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.flightOffers || !Array.isArray(params.flightOffers) || params.flightOffers.length === 0) {
      errors.push('flightOffers must be a non-empty array of Amadeus flight offer objects')
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedFlightPricing {
    return {
      flightOffers: apiData.data?.flightOffers || [],
      payment: apiData.data?.bookingRequirements,
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
