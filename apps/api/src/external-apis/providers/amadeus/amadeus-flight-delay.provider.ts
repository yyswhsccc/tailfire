/**
 * Amadeus Flight Delay Prediction Provider
 *
 * External API provider for ML-based flight delay probability predictions
 * via Amadeus Flight Delay Prediction API.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-delay-prediction
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

export interface FlightDelaySearchParams {
  /** Origin airport IATA code (e.g., "YYZ") */
  originLocationCode: string
  /** Destination airport IATA code (e.g., "CDG") */
  destinationLocationCode: string
  /** Departure date (YYYY-MM-DD) */
  departureDate: string
  /** Departure time (HH:MM:SS) */
  departureTime: string
  /** Arrival date (YYYY-MM-DD) */
  arrivalDate: string
  /** Arrival time (HH:MM:SS) */
  arrivalTime: string
  /** IATA aircraft code (e.g., "321") */
  aircraftCode: string
  /** Airline IATA code (e.g., "AC") */
  carrierCode: string
  /** Flight number without carrier prefix (e.g., "848") */
  flightNumber: string
  /** Flight duration in ISO 8601 (e.g., "PT7H50M") */
  duration: string
}

export interface NormalizedFlightDelay {
  /** Probability of on-time arrival as a percentage (0-100) */
  onTimePercentage: number
  /** Overall delay risk level */
  delayLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface AmadeusFlightDelayResponse {
  meta?: { count?: number }
  data: Array<{
    type: string
    id: string
    subType?: string
    result: Array<{
      id: string
      probability: string
      delay: string
    }>
  }>
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_flight_delay',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_FLIGHT_DELAY_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusFlightDelayProvider
  extends BaseExternalApi<FlightDelaySearchParams, NormalizedFlightDelay>
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
      throw new Error('No credentials configured for Amadeus Flight Delay')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_flight_delay_${Date.now()}`
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

      this.logger.log('Amadeus Flight Delay response', { requestId, latencyMs: Date.now() - startTime })

      return {
        success: true,
        data: response.data,
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime
      const status = error.response?.status

      if (status === 401 && !isRetry) {
        this.logger.warn('Amadeus 401 — invalidating token cache and retrying', { requestId, endpoint })
        this.authService.invalidateToken()
        return this.makeAuthenticatedRequest<T>(endpoint, method, true)
      }

      if (status === 401 && isRetry) {
        this.logger.error('Amadeus 401 on retry — credentials may be invalid', { requestId, endpoint })
        return {
          success: false,
          error: 'Authentication failed: unable to obtain a valid Amadeus token. Please check your API credentials.',
          metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
        }
      }

      this.logger.error('Amadeus Flight Delay API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_flight_delay', operation: 'authenticated-request' },
        extra: { endpoint, requestId, latencyMs, status },
      })

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
    params: FlightDelaySearchParams
  ): Promise<ExternalApiResponse<NormalizedFlightDelay[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      originLocationCode: params.originLocationCode.toUpperCase(),
      destinationLocationCode: params.destinationLocationCode.toUpperCase(),
      departureDate: params.departureDate,
      departureTime: params.departureTime,
      arrivalDate: params.arrivalDate,
      arrivalTime: params.arrivalTime,
      aircraftCode: params.aircraftCode,
      carrierCode: params.carrierCode.toUpperCase(),
      flightNumber: params.flightNumber,
      duration: params.duration,
    })

    const endpoint = `${this.config.baseUrl}/v1/travel/predictions/flight-delay?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusFlightDelayResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No delay prediction returned', metadata: response.metadata }
    }

    const items = response.data.data || []
    if (items.length === 0) {
      return { success: false, error: 'No delay prediction available for this flight', metadata: response.metadata }
    }

    const result = items[0]!.result || []
    const normalized = this.normalizeDelayPrediction(result)

    return { success: true, data: [normalized], metadata: response.metadata }
  }

  async getDetails(
    _id: string
  ): Promise<ExternalApiResponse<NormalizedFlightDelay>> {
    return {
      success: false,
      error: 'Flight delay details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: FlightDelaySearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.originLocationCode || !/^[A-Z]{3}$/i.test(params.originLocationCode)) {
      errors.push('Origin must be a 3-letter IATA code')
    }
    if (!params.destinationLocationCode || !/^[A-Z]{3}$/i.test(params.destinationLocationCode)) {
      errors.push('Destination must be a 3-letter IATA code')
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!params.departureDate || !dateRegex.test(params.departureDate)) {
      errors.push('Departure date required (YYYY-MM-DD)')
    }
    if (!params.arrivalDate || !dateRegex.test(params.arrivalDate)) {
      errors.push('Arrival date required (YYYY-MM-DD)')
    }

    const timeRegex = /^\d{2}:\d{2}:\d{2}$/
    if (!params.departureTime || !timeRegex.test(params.departureTime)) {
      errors.push('Departure time required (HH:MM:SS)')
    }
    if (!params.arrivalTime || !timeRegex.test(params.arrivalTime)) {
      errors.push('Arrival time required (HH:MM:SS)')
    }

    if (!params.aircraftCode) errors.push('Aircraft code is required')
    if (!params.carrierCode || !/^[A-Z0-9]{2}$/i.test(params.carrierCode)) {
      errors.push('Carrier code must be a 2-character airline code')
    }
    if (!params.flightNumber) errors.push('Flight number is required')
    if (!params.duration) errors.push('Duration is required (ISO 8601, e.g. PT7H50M)')

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedFlightDelay {
    return this.normalizeDelayPrediction(apiData.result || [])
  }

  /**
   * Normalize delay prediction results into a simple on-time percentage and risk level.
   *
   * Amadeus returns probability buckets like:
   *   { id: "LESS_THAN_30_MINUTES", probability: "0.54" }
   *   { id: "BETWEEN_30_AND_60_MINUTES", probability: "0.20" }
   *   { id: "BETWEEN_60_AND_120_MINUTES", probability: "0.15" }
   *   { id: "OVER_120_MINUTES_OR_CANCELLED", probability: "0.11" }
   */
  private normalizeDelayPrediction(
    results: Array<{ id: string; probability: string; delay?: string }>
  ): NormalizedFlightDelay {
    // Find on-time bucket (less than 30 min delay is considered on-time)
    const onTimeBucket = results.find(r =>
      r.id === 'LESS_THAN_30_MINUTES' || r.id === 'ON_TIME'
    )

    const onTimePercentage = onTimeBucket
      ? Math.round(parseFloat(onTimeBucket.probability) * 100)
      : 0

    // Determine delay level based on on-time probability
    let delayLevel: 'LOW' | 'MEDIUM' | 'HIGH'
    if (onTimePercentage >= 70) {
      delayLevel = 'LOW'
    } else if (onTimePercentage >= 40) {
      delayLevel = 'MEDIUM'
    } else {
      delayLevel = 'HIGH'
    }

    return { onTimePercentage, delayLevel }
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
