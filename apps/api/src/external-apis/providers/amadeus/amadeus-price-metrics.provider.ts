/**
 * Amadeus Price Metrics Provider
 *
 * External API provider for historical price analysis via Amadeus Itinerary Price Metrics API.
 * Returns statistical price distribution (min, quartiles, max) for a route on a given date.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-price-analysis
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

export interface PriceMetricsSearchParams {
  /** Origin airport IATA code (e.g., "YYZ") */
  originIataCode: string
  /** Destination airport IATA code (e.g., "CDG") */
  destinationIataCode: string
  /** Departure date (YYYY-MM-DD) */
  departureDate: string
  /** Currency code (default: "CAD") */
  currencyCode?: string
}

export interface NormalizedPriceMetrics {
  /** Minimum observed price */
  min: number
  /** First quartile (25th percentile) price */
  firstQuartile: number
  /** Median (50th percentile) price */
  median: number
  /** Third quartile (75th percentile) price */
  thirdQuartile: number
  /** Maximum observed price */
  max: number
  /** Currency code */
  currencyCode: string
}

interface AmadeusPriceMetricsResponse {
  meta?: { count?: number }
  data: Array<{
    type: string
    origin: { iataCode: string }
    destination: { iataCode: string }
    departureDate: string
    oneWay: boolean
    currencyCode: string
    priceMetrics: Array<{
      quartileRanking: 'MINIMUM' | 'FIRST' | 'MEDIUM' | 'THIRD' | 'MAXIMUM'
      amount: string
    }>
  }>
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_price_metrics',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_PRICE_METRICS_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusPriceMetricsProvider
  extends BaseExternalApi<PriceMetricsSearchParams, NormalizedPriceMetrics>
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
      throw new Error('No credentials configured for Amadeus Price Metrics')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_price_metrics_${Date.now()}`
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

      this.logger.log('Amadeus Price Metrics response', { requestId, latencyMs: Date.now() - startTime })

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

      this.logger.error('Amadeus Price Metrics API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_price_metrics', operation: 'authenticated-request' },
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
    params: PriceMetricsSearchParams
  ): Promise<ExternalApiResponse<NormalizedPriceMetrics[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      originIataCode: params.originIataCode.toUpperCase(),
      destinationIataCode: params.destinationIataCode.toUpperCase(),
      departureDate: params.departureDate,
      currencyCode: params.currencyCode || 'CAD',
    })

    const endpoint = `${this.config.baseUrl}/v1/analytics/itinerary-price-metrics?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusPriceMetricsResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No price metrics returned', metadata: response.metadata }
    }

    const items = response.data.data || []
    if (items.length === 0) {
      return { success: false, error: 'No price metrics found for this route', metadata: response.metadata }
    }

    const first = items[0]!
    const normalized = this.normalizePriceMetrics(first.priceMetrics, first.currencyCode)

    return { success: true, data: [normalized], metadata: response.metadata }
  }

  async getDetails(
    _id: string
  ): Promise<ExternalApiResponse<NormalizedPriceMetrics>> {
    return {
      success: false,
      error: 'Price metrics details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: PriceMetricsSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.originIataCode || !/^[A-Z]{3}$/i.test(params.originIataCode)) {
      errors.push('Origin must be a 3-letter IATA code')
    }
    if (!params.destinationIataCode || !/^[A-Z]{3}$/i.test(params.destinationIataCode)) {
      errors.push('Destination must be a 3-letter IATA code')
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!params.departureDate || !dateRegex.test(params.departureDate)) {
      errors.push('Departure date required (YYYY-MM-DD)')
    }

    if (params.currencyCode && !/^[A-Z]{3}$/.test(params.currencyCode)) {
      errors.push('Currency code must be 3 uppercase letters (e.g. USD, CAD, EUR)')
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedPriceMetrics {
    return this.normalizePriceMetrics(apiData.priceMetrics || [], apiData.currencyCode || 'CAD')
  }

  private normalizePriceMetrics(
    priceMetrics: Array<{ quartileRanking: string; amount: string }>,
    currencyCode: string
  ): NormalizedPriceMetrics {
    const getAmount = (ranking: string): number => {
      const metric = priceMetrics.find(m => m.quartileRanking === ranking)
      return metric ? parseFloat(metric.amount) : 0
    }

    return {
      min: getAmount('MINIMUM'),
      firstQuartile: getAmount('FIRST'),
      median: getAmount('MEDIUM'),
      thirdQuartile: getAmount('THIRD'),
      max: getAmount('MAXIMUM'),
      currencyCode,
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
