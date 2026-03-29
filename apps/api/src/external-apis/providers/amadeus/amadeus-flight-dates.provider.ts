/**
 * Amadeus Flight Dates Provider
 *
 * External API provider for cheapest flight dates via Amadeus Flight Dates API.
 * Returns the cheapest fare for each departure date in a range for a given route.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-cheapest-date-search
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

export interface FlightDateSearchParams {
  /** Origin airport IATA code (e.g., "YYZ") */
  origin: string
  /** Destination airport IATA code (e.g., "CDG") */
  destination: string
  /** Start of departure date range (YYYY-MM-DD, optional) */
  departureDate?: string
  /** One-way search only (default: true) */
  oneWay?: boolean
}

export interface NormalizedFlightDate {
  /** Departure date (YYYY-MM-DD) */
  date: string
  /** Cheapest price for this date */
  price: number
  /** Currency code (e.g., "CAD") */
  currency: string
}

interface AmadeusFlightDatesResponse {
  meta?: { count?: number; currency?: string }
  data: Array<{
    type: string
    origin: string
    destination: string
    departureDate: string
    returnDate?: string
    price: { total: string }
  }>
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_flight_dates',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_FLIGHT_DATES_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusFlightDatesProvider
  extends BaseExternalApi<FlightDateSearchParams, NormalizedFlightDate>
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
      throw new Error('No credentials configured for Amadeus Flight Dates')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_flight_dates_${Date.now()}`
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

      this.logger.log('Amadeus Flight Dates response', { requestId, latencyMs: Date.now() - startTime })

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

      this.logger.error('Amadeus Flight Dates API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_flight_dates', operation: 'authenticated-request' },
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
    params: FlightDateSearchParams
  ): Promise<ExternalApiResponse<NormalizedFlightDate[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      origin: params.origin.toUpperCase(),
      destination: params.destination.toUpperCase(),
      oneWay: String(params.oneWay ?? true),
    })

    if (params.departureDate) queryParams.set('departureDate', params.departureDate)

    const endpoint = `${this.config.baseUrl}/v1/shopping/flight-dates?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusFlightDatesResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No flight dates returned', metadata: response.metadata }
    }

    const items = response.data.data || []
    if (items.length === 0) {
      return { success: false, error: 'No cheapest flight dates found', metadata: response.metadata }
    }

    const currency = response.data.meta?.currency || 'EUR'
    const normalized: NormalizedFlightDate[] = items.map(item => ({
      date: item.departureDate,
      price: parseFloat(item.price.total),
      currency,
    }))

    return { success: true, data: normalized, metadata: response.metadata }
  }

  async getDetails(
    _dateId: string
  ): Promise<ExternalApiResponse<NormalizedFlightDate>> {
    return {
      success: false,
      error: 'Flight date details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: FlightDateSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.origin || !/^[A-Z]{3}$/i.test(params.origin)) errors.push('Origin must be a 3-letter IATA code')
    if (!params.destination || !/^[A-Z]{3}$/i.test(params.destination)) errors.push('Destination must be a 3-letter IATA code')

    if (params.departureDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.departureDate)) {
        errors.push('Departure date must be YYYY-MM-DD')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedFlightDate {
    return {
      date: apiData.departureDate,
      price: parseFloat(apiData.price?.total || '0'),
      currency: apiData.price?.currency || 'EUR',
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
