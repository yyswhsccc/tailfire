/**
 * Aerodatabox Flights Provider
 *
 * External API provider for flight status data via Aerodatabox/RapidAPI.
 * Implements flight lookup by number, airport FIDS, and flight tracking.
 *
 * @see https://doc.aerodatabox.com/
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
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
  AerodataboxFlightStatusResponse,
  AerodataboxFlightResponse,
  AerodataboxDeparture,
  AerodataboxArrival,
  NormalizedFlightStatus,
  NormalizedFlightEndpoint,
  NormalizedTime,
  AerodataboxFlightStatus,
  AerodataboxAirportResponse,
  NormalizedAirportInfo,
} from './aerodatabox.types'

/**
 * Build provider configuration with env-driven rate limits
 *
 * Rate limit defaults are conservative for RapidAPI free tier (~100/month).
 * Adjust via environment variables based on subscription tier:
 * - Free: 2/min, 10/hour, 50/day
 * - Basic (500/month): 5/min, 30/hour, 100/day
 * - Pro (5000/month): 20/min, 200/hour, 500/day
 */
function buildAerodataboxConfig(): ExternalApiConfig {
  return {
    provider: 'aerodatabox',
    category: ApiCategory.FLIGHTS,
    baseUrl: process.env.AERODATABOX_API_URL || 'https://aerodatabox.p.rapidapi.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AERODATABOX_RATE_LIMIT_PER_MINUTE || '2', 10),
      requestsPerHour: parseInt(process.env.AERODATABOX_RATE_LIMIT_PER_HOUR || '10', 10),
      requestsPerDay: parseInt(process.env.AERODATABOX_RATE_LIMIT_PER_DAY || '50', 10),
    },
    authentication: {
      type: 'apiKey',
      headerName: 'x-rapidapi-key',
    },
  }
}

/**
 * Priority for fallback ordering (1 = highest priority)
 */
const PROVIDER_PRIORITY = 1

@Injectable()
export class AerodataboxFlightsProvider
  extends BaseExternalApi<FlightStatusParams, NormalizedFlightStatus>
  implements OnModuleInit
{
  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService
  ) {
    super(buildAerodataboxConfig(), httpService, rateLimiter, metrics)
  }

  /**
   * Register with the API registry on module initialization
   *
   * IMPORTANT: Must await registerProvider to ensure credentials
   * are loaded and provider enters the active chain.
   */
  async onModuleInit(): Promise<void> {
    await this.registry.registerProvider(this, PROVIDER_PRIORITY)
  }

  // ============================================================================
  // IExternalApiProvider IMPLEMENTATION
  // ============================================================================

  /**
   * Search for flights by flight number
   *
   * @param params - Flight search parameters
   * @returns Array of matching flights (usually 1, but can be multiple for codeshares)
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

    const searchBy = params.searchBy || 'number'
    const endpoint = params.dateLocal
      ? `${this.config.baseUrl}/flights/${searchBy}/${encodeURIComponent(params.flightNumber)}/${params.dateLocal}`
      : `${this.config.baseUrl}/flights/${searchBy}/${encodeURIComponent(params.flightNumber)}`

    const response = await this.makeRequest<AerodataboxFlightStatusResponse>(endpoint)

    // Debug: Log raw response to diagnose empty results issue
    this.logger.debug(`Aerodatabox raw response for ${endpoint}:`, {
      success: response.success,
      hasData: !!response.data,
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
      rawData: JSON.stringify(response.data)?.slice(0, 500),
    })

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || 'No flight data returned',
        metadata: response.metadata,
      }
    }

    // Transform raw API response to normalized format
    // Handle empty array response (API returns [] when no flights found)
    const flights = Array.isArray(response.data) ? response.data : [response.data]
    if (flights.length === 0) {
      return {
        success: false,
        error: 'No flights found for this date. The airline may not have published schedules this far in advance.',
        metadata: response.metadata,
      }
    }

    const normalizedFlights = flights.map(flight => this.transformResponse(flight))

    return {
      success: true,
      data: normalizedFlights,
      metadata: response.metadata,
    }
  }

  /**
   * Get details for a specific flight by flight number
   *
   * @param referenceId - Flight number (e.g., "AA123")
   * @param additionalParams - Optional date and search type
   * @returns Single flight status or first matching flight
   */
  async getDetails(
    referenceId: string,
    additionalParams?: { dateLocal?: string; searchBy?: 'number' | 'callsign' | 'reg' | 'icao24' }
  ): Promise<ExternalApiResponse<NormalizedFlightStatus>> {
    const searchResult = await this.search({
      flightNumber: referenceId,
      dateLocal: additionalParams?.dateLocal,
      searchBy: additionalParams?.searchBy,
    })

    if (!searchResult.success || !searchResult.data?.length) {
      return {
        success: false,
        error: searchResult.error || 'Flight not found',
        metadata: searchResult.metadata,
      }
    }

    // Return the first (usually operating) flight
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
    } else if (params.flightNumber.length < 2 || params.flightNumber.length > 10) {
      errors.push('Flight number must be between 2 and 10 characters')
    }

    // Validate date format if provided
    if (params.dateLocal) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.dateLocal)) {
        errors.push('Date must be in YYYY-MM-DD format')
      }
    }

    // Validate searchBy if provided
    if (params.searchBy) {
      const validSearchBy = ['number', 'callsign', 'reg', 'icao24']
      if (!validSearchBy.includes(params.searchBy)) {
        errors.push(`searchBy must be one of: ${validSearchBy.join(', ')}`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Transform raw Aerodatabox response to normalized format
   *
   * Handles timezone conversion for all time fields.
   * Aerodatabox returns times in local airport timezone.
   */
  transformResponse(apiData: AerodataboxFlightResponse): NormalizedFlightStatus {
    return {
      flightNumber: apiData.number,
      callSign: apiData.callSign,
      airline: {
        name: apiData.airline?.name || 'Unknown',
        iataCode: apiData.airline?.iata,
        icaoCode: apiData.airline?.icao,
      },
      departure: this.transformEndpoint(apiData.departure, 'departure'),
      arrival: this.transformEndpoint(apiData.arrival, 'arrival'),
      status: apiData.status,
      statusCategory: this.categorizeStatus(apiData.status),
      aircraft: apiData.aircraft
        ? {
            registration: apiData.aircraft.reg,
            model: apiData.aircraft.model,
            modeS: apiData.aircraft.modeS,
            imageUrl: apiData.aircraft.image?.url,
            imageAuthor: apiData.aircraft.image?.author,
          }
        : undefined,
      lastUpdated: apiData.lastUpdatedUtc,
      distanceKm: apiData.greatCircleDistance?.km,
    }
  }

  /**
   * Transform departure or arrival endpoint with timezone info
   */
  private transformEndpoint(
    segment: AerodataboxDeparture | AerodataboxArrival,
    type: 'departure' | 'arrival'
  ): NormalizedFlightEndpoint {
    const timezone = segment.airport.timezone

    const base: NormalizedFlightEndpoint = {
      airportIata: segment.airport.iata || '',
      airportIcao: segment.airport.icao,
      airportName: segment.airport.name,
      timezone,
      terminal: segment.terminal,
      gate: segment.gate,
      scheduledTime: this.normalizeAerodataboxTime(segment.scheduledTime),
      estimatedTime: this.normalizeAerodataboxTime(segment.revisedTime),
      actualTime: this.extractActualTime(segment, timezone),
    }

    // Add baggage belt for arrivals
    if (type === 'arrival' && 'baggageBelt' in segment) {
      base.baggageBelt = (segment as AerodataboxArrival).baggageBelt
    }

    return base
  }

  /**
   * Test connection to Aerodatabox API
   *
   * Makes a lightweight health check request to verify credentials.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }

    try {
      // Use the health endpoint (free tier, no cost)
      const response = await this.makeRequest<any>(
        `${this.config.baseUrl}/health/services/feeds/Schedules`
      )

      if (response.success) {
        return { success: true, message: 'Connection successful' }
      }

      return {
        success: false,
        message: response.error || 'Connection failed',
      }
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { service: 'aerodatabox', operation: 'test-connection' },
        level: 'warning',
      })
      return {
        success: false,
        message: error.message || 'Connection test failed',
      }
    }
  }

  // ============================================================================
  // AIRPORT LOOKUP
  // ============================================================================

  /**
   * Look up airport by IATA or ICAO code
   *
   * Uses Aerodatabox /airports/{codeType}/{code} endpoint [TIER 1]
   *
   * @param code - IATA (3 chars) or ICAO (4 chars) airport code
   * @returns Normalized airport info or error
   */
  async getAirportByCode(code: string): Promise<ExternalApiResponse<NormalizedAirportInfo>> {
    if (!code || code.length < 3 || code.length > 4) {
      return {
        success: false,
        error: 'Airport code must be 3 (IATA) or 4 (ICAO) characters',
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
        },
      }
    }

    const upperCode = code.toUpperCase().trim()
    // IATA = 3 chars, ICAO = 4 chars
    const codeType = upperCode.length === 3 ? 'iata' : 'icao'
    const endpoint = `${this.config.baseUrl}/airports/${codeType}/${upperCode}`

    this.logger.log(`Airport lookup: ${codeType.toUpperCase()} ${upperCode}`)

    const response = await this.makeRequest<AerodataboxAirportResponse>(endpoint)

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || 'Airport not found',
        metadata: response.metadata,
      }
    }

    // Transform to normalized format
    const airport = response.data
    const normalized: NormalizedAirportInfo = {
      iata: airport.iata || upperCode,
      icao: airport.icao,
      name: airport.name,
      city: airport.municipalityName || 'Unknown',
      countryCode: airport.countryCode || 'XX',
      lat: airport.location?.lat,
      lon: airport.location?.lon,
      timezone: airport.timezone,
    }

    return {
      success: true,
      data: normalized,
      metadata: response.metadata,
    }
  }

  // ============================================================================
  // PRIVATE HELPERS - Timezone Handling
  // ============================================================================

  /**
   * Normalize Aerodatabox time format to NormalizedTime
   *
   * Aerodatabox returns times as:
   * { "utc": "2026-01-05 23:35Z", "local": "2026-01-05 18:35-05:00" }
   *
   * We convert to ISO 8601 format with 'T' separator.
   */
  private normalizeAerodataboxTime(
    times?: { utc?: string; local?: string }
  ): NormalizedTime | undefined {
    if (!times) return undefined
    if (!times.utc && !times.local) return undefined

    // Convert Aerodatabox format "2026-01-05 23:35Z" to ISO "2026-01-05T23:35:00Z"
    const normalizeFormat = (timeStr?: string): string | undefined => {
      if (!timeStr) return undefined
      // Replace space with 'T' for ISO 8601 compliance
      let normalized = timeStr.replace(' ', 'T')
      // Add seconds if missing (e.g., "23:35" -> "23:35:00")
      if (/T\d{2}:\d{2}[-+Z]/.test(normalized) || /T\d{2}:\d{2}$/.test(normalized)) {
        normalized = normalized.replace(/T(\d{2}:\d{2})/, 'T$1:00')
      }
      return normalized
    }

    return {
      local: normalizeFormat(times.local),
      utc: normalizeFormat(times.utc),
    }
  }

  /**
   * Extract actual time from departure/arrival
   *
   * For flights that have departed/arrived, the actual time is in runwayTime.
   * For future flights, runwayTime won't exist.
   */
  private extractActualTime(
    segment: { scheduledTime?: any; revisedTime?: any; runwayTime?: any },
    _timezone?: string
  ): NormalizedTime | undefined {
    // Actual time comes from runwayTime (actual departure/arrival time)
    // This uses the same utc/local format as scheduledTime
    return this.normalizeAerodataboxTime(segment.runwayTime)
  }

  /**
   * Categorize flight status into simplified categories for UI
   */
  private categorizeStatus(
    status: AerodataboxFlightStatus
  ): 'scheduled' | 'active' | 'completed' | 'disrupted' {
    switch (status) {
      case 'Unknown':
      case 'Expected':
        return 'scheduled'

      case 'CheckIn':
      case 'Boarding':
      case 'GateClosed':
      case 'Departed':
      case 'EnRoute':
      case 'Approaching':
        return 'active'

      case 'Arrived':
        return 'completed'

      case 'Delayed':
      case 'Canceled':
      case 'Diverted':
      case 'CanceledUncertain':
        return 'disrupted'

      default:
        return 'scheduled'
    }
  }
}
