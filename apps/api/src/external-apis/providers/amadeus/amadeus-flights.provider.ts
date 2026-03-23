/**
 * Amadeus Flights Provider
 *
 * External API provider for flight schedule data via Amadeus Flight Schedule API.
 * Primary provider for segment search (Priority 1) — broadest flight coverage via OAG/SSIM data.
 *
 * Features:
 * - OAuth2 client credentials authentication with token caching
 * - Mutex to prevent concurrent token requests
 * - Transforms Amadeus response to NormalizedFlightStatus
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/on-demand-flight-status
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
  FlightStatusParams,
  NormalizedFlightStatus,
  NormalizedFlightEndpoint,
  NormalizedTime,
} from '../aerodatabox/aerodatabox.types'
import {
  AmadeusFlightResponse,
  AmadeusDatedFlight,
  AmadeusFlightPoint,
  AmadeusTimingEntry,
} from './amadeus.types'
import { AmadeusAuthService } from './amadeus-auth.service'

/**
 * Build provider configuration with env-driven rate limits
 *
 * Amadeus rate limits vary by tier:
 * - Free: 100 transactions/month, 1 request/second
 * - Pay-as-you-go: Higher limits based on usage
 */
function buildAmadeusConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_MINUTE || '60', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
      requestsPerDay: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_DAY || '500', 10),
    },
    authentication: {
      type: 'bearer', // We'll handle OAuth2 token in this provider
    },
  }
}

/**
 * Priority for fallback ordering (1 = primary provider)
 *
 * Amadeus Schedule API is primary because it has broader flight coverage
 * (OAG/SSIM data — all scheduled flights worldwide). AeroDataBox is fallback
 * but will be used for live status tracking/alerts in the future.
 */
const PROVIDER_PRIORITY = 1

/**
 * Buffer time before token expiry (60 seconds)
 */
@Injectable()
export class AmadeusFlightsProvider
  extends BaseExternalApi<FlightStatusParams, NormalizedFlightStatus>
  implements OnModuleInit
{
  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService,
    private readonly authService: AmadeusAuthService
  ) {
    super(buildAmadeusConfig(), httpService, rateLimiter, metrics)
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
      throw new Error('No credentials configured for Amadeus')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  /**
   * Make an authenticated request to Amadeus API
   *
   * Overrides base class to handle OAuth2 Bearer token
   */
  protected async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET'
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_${Date.now()}`
    const startTime = Date.now()

    this.logger.log(`Amadeus API request: ${endpoint}`, { requestId })

    // Check rate limit and circuit breaker from base class
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
      // Get OAuth2 token (cached or fresh)
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

      // Log rate limit headers
      this.logger.debug('Amadeus response headers', {
        requestId,
        latencyMs: Date.now() - startTime,
        rateLimitRemaining: response.headers['x-ratelimit-remaining'],
        rateLimitReset: response.headers['x-ratelimit-reset'],
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

      this.logger.error('Amadeus API error', {
        requestId,
        latencyMs,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'authenticated-request' },
        extra: { endpoint, requestId, latencyMs, status: error.response?.status },
      })

      // Handle specific Amadeus errors
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
   * Search for flights by flight number
   *
   * @param params - Flight search parameters
   * @returns Array of matching flights
   */
  async search(
    params: FlightStatusParams
  ): Promise<ExternalApiResponse<NormalizedFlightStatus[]>> {
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

    // Parse flight number into carrier code and number
    const { carrierCode, flightNumber } = this.parseFlightNumber(params.flightNumber)

    // Use current date if not provided
    const dateLocal = params.dateLocal || new Date().toISOString().split('T')[0]

    // Build Amadeus endpoint
    const endpoint = `${this.config.baseUrl}/v2/schedule/flights?carrierCode=${encodeURIComponent(carrierCode)}&flightNumber=${encodeURIComponent(flightNumber)}&scheduledDepartureDate=${encodeURIComponent(dateLocal!)}`

    const response = await this.makeAuthenticatedRequest<AmadeusFlightResponse>(endpoint)

    // Debug log
    this.logger.debug(`Amadeus raw response for ${params.flightNumber}:`, {
      success: response.success,
      hasData: !!response.data,
      dataLength: response.data?.data?.length,
    })

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || 'No flight data returned',
        metadata: response.metadata,
      }
    }

    // Transform flights
    const flights = response.data.data || []
    if (flights.length === 0) {
      return {
        success: false,
        error: 'No flights found for this date and flight number',
        metadata: response.metadata,
      }
    }

    const normalizedFlights = flights.map(flight =>
      this.transformResponse(flight, response.data!.dictionaries)
    )

    return {
      success: true,
      data: normalizedFlights,
      metadata: response.metadata,
    }
  }

  /**
   * Get details for a specific flight
   */
  async getDetails(
    referenceId: string,
    additionalParams?: { dateLocal?: string }
  ): Promise<ExternalApiResponse<NormalizedFlightStatus>> {
    const searchResult = await this.search({
      flightNumber: referenceId,
      dateLocal: additionalParams?.dateLocal,
    })

    if (!searchResult.success || !searchResult.data?.length) {
      return {
        success: false,
        error: searchResult.error || 'Flight not found',
        metadata: searchResult.metadata,
      }
    }

    return {
      success: true,
      data: searchResult.data[0]!,
      metadata: searchResult.metadata,
    }
  }

  /**
   * Validate flight search parameters
   */
  validateParams(params: FlightStatusParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!params.flightNumber) {
      errors.push('Flight number is required')
    } else if (params.flightNumber.length < 3 || params.flightNumber.length > 10) {
      errors.push('Flight number must be between 3 and 10 characters (e.g., AC123)')
    } else {
      // Validate format: 2-letter carrier code + 1-4 digit flight number
      const match = params.flightNumber.match(/^([A-Z]{2})(\d{1,4})$/i)
      if (!match) {
        errors.push('Flight number must be in format: AA123 (2-letter airline code + number)')
      }
    }

    // Validate date format if provided
    if (params.dateLocal) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.dateLocal)) {
        errors.push('Date must be in YYYY-MM-DD format')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Transform Amadeus DatedFlight response to NormalizedFlightStatus
   */
  transformResponse(
    apiData: AmadeusDatedFlight,
    dictionaries?: { carriers?: Record<string, string>; aircraft?: Record<string, string> }
  ): NormalizedFlightStatus {
    const carrierCode = apiData.flightDesignator.carrierCode
    const flightNum = apiData.flightDesignator.flightNumber

    // Get departure and arrival points
    const departurePoint = apiData.flightPoints.find(p => p.departure)
    const arrivalPoint = apiData.flightPoints.find(p => p.arrival)

    // Get airline name from dictionaries
    const airlineName = dictionaries?.carriers?.[carrierCode] || carrierCode

    // Get aircraft info from legs
    const leg = apiData.legs?.[0]
    const aircraftType = leg?.aircraftEquipment?.aircraftType
    const aircraftName = aircraftType && dictionaries?.aircraft?.[aircraftType]

    return {
      flightNumber: `${carrierCode}${flightNum}`,
      airline: {
        name: airlineName,
        iataCode: carrierCode,
      },
      departure: this.transformFlightPoint(departurePoint!, 'departure'),
      arrival: this.transformFlightPoint(arrivalPoint!, 'arrival'),
      status: 'Expected', // Amadeus schedule API doesn't provide live status
      statusCategory: 'scheduled',
      aircraft: aircraftType
        ? {
            model: aircraftName || aircraftType,
          }
        : undefined,
      lastUpdated: new Date().toISOString(),
    }
  }

  /**
   * Transform a flight point to NormalizedFlightEndpoint
   */
  private transformFlightPoint(
    point: AmadeusFlightPoint,
    type: 'departure' | 'arrival'
  ): NormalizedFlightEndpoint {
    const timingInfo = type === 'departure' ? point.departure : point.arrival

    return {
      airportIata: point.iataCode,
      airportIcao: '', // Amadeus doesn't provide ICAO in schedule endpoint
      airportName: point.iataCode, // We'd need to look this up separately
      terminal: timingInfo?.terminal?.code,
      gate: timingInfo?.gate?.mainGate,
      scheduledTime: this.extractTiming(timingInfo?.timings, 'STD', 'STA', type),
      estimatedTime: this.extractTiming(timingInfo?.timings, 'ETD', 'ETA', type),
      actualTime: this.extractTiming(timingInfo?.timings, 'ATD', 'ATA', type),
    }
  }

  /**
   * Extract timing from Amadeus timings array
   */
  private extractTiming(
    timings: AmadeusTimingEntry[] | undefined,
    departureQualifier: string,
    arrivalQualifier: string,
    type: 'departure' | 'arrival'
  ): NormalizedTime | undefined {
    if (!timings) return undefined

    const qualifier = type === 'departure' ? departureQualifier : arrivalQualifier
    const timing = timings.find(t => t.qualifier === qualifier)

    if (!timing) return undefined

    // Amadeus returns ISO format: "2026-02-07T10:50"
    // Add seconds and timezone marker for consistency
    let value = timing.value
    if (!/:\d{2}$/.test(value)) {
      value += ':00'
    }

    return {
      local: value,
      utc: undefined, // Amadeus doesn't provide UTC in schedule response
    }
  }

  /**
   * Parse flight number into carrier code and number
   *
   * @param flightNumber - Full flight number (e.g., "AC123", "WS2648")
   * @returns Parsed components
   */
  private parseFlightNumber(flightNumber: string): { carrierCode: string; flightNumber: string } {
    const match = flightNumber.match(/^([A-Z]{2})(\d+)$/i)
    if (!match) {
      throw new Error(`Invalid flight number format: ${flightNumber}`)
    }
    return {
      carrierCode: match[1]!.toUpperCase(),
      flightNumber: match[2]!,
    }
  }

  /**
   * Test connection to Amadeus API
   *
   * Verifies OAuth2 token acquisition works correctly.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }

    try {
      // Try to acquire a token - this validates the credentials
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
    // Check parent implementation (rate limit + circuit breaker)
    return super['canMakeRequest']?.() ?? true
  }
}
