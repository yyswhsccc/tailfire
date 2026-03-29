/**
 * Amadeus Direct Destinations Provider
 *
 * External API provider for discovering airports with direct flights from a given airport
 * via Amadeus Airport Routes API.
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airport-routes
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

export interface DirectDestinationsSearchParams {
  /** Departure airport IATA code (e.g., "YYZ") */
  departureAirportCode: string
}

export interface NormalizedDirectDestination {
  /** Destination airport IATA code */
  destination: string
  /** Airlines operating direct flights to this destination */
  airlines: string[]
}

interface AmadeusDirectDestinationsResponse {
  meta?: { count?: number }
  data: Array<{
    type: string
    id: string
    subType?: string
    name?: string
    iataCode: string
  }>
}

// ============================================================================
// PROVIDER
// ============================================================================

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_direct_destinations',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_DIRECT_DESTINATIONS_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusDirectDestinationsProvider
  extends BaseExternalApi<DirectDestinationsSearchParams, NormalizedDirectDestination>
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
      throw new Error('No credentials configured for Amadeus Direct Destinations')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    isRetry = false
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_direct_destinations_${Date.now()}`
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

      this.logger.log('Amadeus Direct Destinations response', { requestId, latencyMs: Date.now() - startTime })

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

      this.logger.error('Amadeus Direct Destinations API error', {
        requestId,
        latencyMs,
        error: error.message,
        status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_direct_destinations', operation: 'authenticated-request' },
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
    params: DirectDestinationsSearchParams
  ): Promise<ExternalApiResponse<NormalizedDirectDestination[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      departureAirportCode: params.departureAirportCode.toUpperCase(),
    })

    const endpoint = `${this.config.baseUrl}/v1/airport/direct-destinations?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusDirectDestinationsResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No direct destinations returned', metadata: response.metadata }
    }

    const items = response.data.data || []
    if (items.length === 0) {
      return { success: false, error: 'No direct destinations found from this airport', metadata: response.metadata }
    }

    // Group by destination IATA code — each entry may represent a separate airline route
    const destinationMap = new Map<string, Set<string>>()
    for (const item of items) {
      const dest = item.iataCode
      if (!destinationMap.has(dest)) {
        destinationMap.set(dest, new Set())
      }
      // The API returns location entries; airline info may be in subType or name
      // If no airline detail is available, we still list the destination
      if (item.subType) {
        destinationMap.get(dest)!.add(item.subType)
      }
    }

    const normalized: NormalizedDirectDestination[] = Array.from(destinationMap.entries()).map(
      ([destination, airlines]) => ({
        destination,
        airlines: Array.from(airlines),
      })
    )

    return { success: true, data: normalized, metadata: response.metadata }
  }

  async getDetails(
    _id: string
  ): Promise<ExternalApiResponse<NormalizedDirectDestination>> {
    return {
      success: false,
      error: 'Direct destination details not supported — use search instead',
      metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
    }
  }

  validateParams(params: DirectDestinationsSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.departureAirportCode || !/^[A-Z]{3}$/i.test(params.departureAirportCode)) {
      errors.push('Departure airport code must be a 3-letter IATA code')
    }

    return { valid: errors.length === 0, errors }
  }

  transformResponse(apiData: any): NormalizedDirectDestination {
    return {
      destination: apiData.iataCode || '',
      airlines: [],
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
