/**
 * Aerodatabox Controller
 *
 * REST endpoints for flight status lookup via Aerodatabox API.
 * Protected by authentication - credentials managed via Admin UI.
 */

import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  HttpException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional, IsIn, MinLength, MaxLength, Matches } from 'class-validator'
import { Transform } from 'class-transformer'
import { AdminOnly } from '../../../auth/decorators/admin-only.decorator'
import { AerodataboxFlightsProvider } from './aerodatabox-flights.provider'
import { AmadeusAuthService } from '../amadeus/amadeus-auth.service'
import { ExternalApiRegistryService } from '../../core/services/external-api-registry.service'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import { ApiCategory } from '../../core/interfaces'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import type { FlightStatusParams, NormalizedAirportInfo } from './aerodatabox.types'
import type { FlightSearchResponse, NormalizedFlightStatus } from '@tailfire/shared-types'

/**
 * DTO for flight search query parameters
 */
class FlightSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  @Transform(({ value }) => value?.trim().toUpperCase())
  flightNumber!: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateLocal must be in YYYY-MM-DD format' })
  dateLocal?: string

  @IsOptional()
  @IsIn(['number', 'callsign', 'reg', 'icao24'])
  @Transform(({ value }) => value ?? 'number')
  searchBy?: 'number' | 'callsign' | 'reg' | 'icao24'

  @IsOptional()
  @IsIn(['aerodatabox', 'amadeus'])
  @Transform(({ value }) => value?.toLowerCase())
  provider?: 'aerodatabox' | 'amadeus'
}

@ApiTags('External APIs - Flights')
@ApiBearerAuth()
@AdminOnly()
@Controller('external-apis/flights')
export class AerodataboxController {
  private readonly logger = new Logger(AerodataboxController.name)

  constructor(
    private readonly flightsProvider: AerodataboxFlightsProvider,
    private readonly registry: ExternalApiRegistryService,
    private readonly amadeusAuthService: AmadeusAuthService,
    private readonly credentialResolver: CredentialResolverService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Search for flight status by flight number
   *
   * @example GET /external-apis/flights/search?flightNumber=AA123
   * @example GET /external-apis/flights/search?flightNumber=AA123&dateLocal=2025-01-15
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search flight status',
    description:
      'Look up flight status by flight number, callsign, registration, or ICAO24. Returns real-time flight data including departure/arrival times, gates, and status.',
  })
  @ApiQuery({
    name: 'flightNumber',
    required: true,
    description: 'Flight number (e.g., AA123), callsign, registration, or ICAO24 address',
    example: 'AA123',
  })
  @ApiQuery({
    name: 'dateLocal',
    required: false,
    description: 'Date in local time (YYYY-MM-DD). If not provided, searches nearest date.',
    example: '2025-01-15',
  })
  @ApiQuery({
    name: 'searchBy',
    required: false,
    description: 'Search type',
    enum: ['number', 'callsign', 'reg', 'icao24'],
    example: 'number',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Specific provider to use (bypasses fallback chain)',
    enum: ['aerodatabox', 'amadeus'],
    example: 'aerodatabox',
  })
  @ApiResponse({
    status: 200,
    description: 'Flight data found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid parameters',
  })
  @ApiResponse({
    status: 503,
    description: 'External API unavailable or no credentials configured',
  })
  async searchFlights(@Query() query: FlightSearchQueryDto): Promise<FlightSearchResponse> {
    const params: FlightStatusParams = {
      flightNumber: query.flightNumber,
      dateLocal: query.dateLocal,
      searchBy: query.searchBy,
    }

    // Get the appropriate provider (specific or default)
    const provider = await this.registry.getProvider<typeof this.flightsProvider>(
      ApiCategory.FLIGHTS,
      query.provider // undefined means use default fallback chain
    )

    if (!provider) {
      throw new ServiceUnavailableException(
        query.provider
          ? `Provider '${query.provider}' is not available or has no credentials configured`
          : 'No flight providers available'
      )
    }

    // Validate parameters
    const validation = provider.validateParams(params)
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '))
    }

    this.logger.log(`Flight search: ${params.flightNumber} via ${provider.config.provider}`)

    const result = await provider.search(params)

    if (!result.success) {
      // Check if rate limited - throw 429 with retryAfter in body
      if (result.metadata?.retryAfter) {
        throw new HttpException(
          {
            success: false,
            error: result.error,
            metadata: result.metadata, // includes retryAfter from BaseExternalApi
          },
          HttpStatus.TOO_MANY_REQUESTS
        )
      }

      // Check if it's a credential/availability issue vs a "not found" issue
      if (result.error?.includes('credentials') || result.error?.includes('circuit')) {
        throw new ServiceUnavailableException(result.error)
      }
      // Return as a successful response with empty data if flight not found
      return {
        success: false,
        error: result.error,
        metadata: result.metadata,
      }
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata,
    }
  }

  /**
   * Search airports by keyword (city name, airport name)
   * Uses Amadeus reference-data/locations API.
   * Declared BEFORE airports/:code to avoid route collision.
   *
   * @example GET /external-apis/flights/airports/search?keyword=cozumel
   */
  @Get('airports/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search airports by keyword' })
  @ApiQuery({ name: 'keyword', required: true, description: 'City or airport name (min 3 chars)' })
  async searchAirports(
    @Query('keyword') keyword: string,
  ): Promise<{ iata: string; name: string; city: string; countryCode: string }[]> {
    if (!keyword || keyword.trim().length < 3) {
      throw new BadRequestException('Keyword must be at least 3 characters')
    }

    try {
      const creds = await this.credentialResolver.resolve('amadeus' as any)
      if (!creds) {
        this.logger.warn('Amadeus credentials not configured for airport search')
        return []
      }

      const baseUrl = process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com'
      const { clientId, clientSecret } = creds as { clientId: string; clientSecret: string }
      const token = await this.amadeusAuthService.getAccessToken(baseUrl, { clientId, clientSecret })

      const url = `${baseUrl}/v1/reference-data/locations?keyword=${encodeURIComponent(keyword.trim())}&subType=AIRPORT&page%5Blimit%5D=10`
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        }),
      )

      const locations = response.data?.data || []
      return locations.map((loc: any) => ({
        iata: loc.iataCode,
        name: loc.name,
        city: loc.address?.cityName || '',
        countryCode: loc.address?.countryCode || '',
      })).filter((a: any) => a.iata)
    } catch (error: any) {
      this.logger.error(`Airport keyword search failed: ${error.message}`)
      Sentry.captureException(error, { tags: { service: 'amadeus', operation: 'airport-search' } })
      return []
    }
  }

  /**
   * Look up airport by IATA code
   *
   * Used by airport autocomplete to fetch details for airports not in the static database.
   * Returns normalized airport info including name, city, country, and coordinates.
   *
   * @example GET /external-apis/flights/airports/VRA
   * @example GET /external-apis/flights/airports/MUVR (ICAO)
   */
  @Get('airports/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up airport by code',
    description: 'Look up airport details by IATA (3 chars) or ICAO (4 chars) code. Returns airport name, city, country, coordinates, and timezone.',
  })
  @ApiParam({
    name: 'code',
    description: 'Airport IATA code (e.g., VRA) or ICAO code (e.g., MUVR)',
    example: 'VRA',
  })
  @ApiResponse({
    status: 200,
    description: 'Airport found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid airport code',
  })
  @ApiResponse({
    status: 404,
    description: 'Airport not found',
  })
  async getAirportByCode(
    @Param('code') code: string
  ): Promise<{ success: boolean; data?: NormalizedAirportInfo; error?: string }> {
    // Validate airport code
    if (!code || code.length < 3 || code.length > 4) {
      throw new BadRequestException('Airport code must be 3 (IATA) or 4 (ICAO) characters')
    }

    // Check if provider is available
    if (!this.flightsProvider) {
      throw new ServiceUnavailableException('Flight API provider not available')
    }

    this.logger.log(`Airport lookup: ${code.toUpperCase()}`)

    const result = await this.flightsProvider.getAirportByCode(code)

    if (!result.success) {
      if (result.error?.includes('credentials') || result.error?.includes('circuit')) {
        throw new ServiceUnavailableException(result.error)
      }
      return {
        success: false,
        error: result.error || 'Airport not found',
      }
    }

    return {
      success: true,
      data: result.data,
    }
  }

  /**
   * Get flight details by flight number
   *
   * @example GET /external-apis/flights/AA123
   * @example GET /external-apis/flights/AA123?dateLocal=2025-01-15
   */
  @Get(':flightNumber')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get flight details',
    description: 'Get detailed status for a specific flight number.',
  })
  @ApiParam({
    name: 'flightNumber',
    description: 'Flight number (e.g., AA123)',
    example: 'AA123',
  })
  @ApiQuery({
    name: 'dateLocal',
    required: false,
    description: 'Date in local time (YYYY-MM-DD)',
    example: '2025-01-15',
  })
  @ApiResponse({
    status: 200,
    description: 'Flight details found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid flight number',
  })
  @ApiResponse({
    status: 404,
    description: 'Flight not found',
  })
  async getFlightDetails(
    @Param('flightNumber') flightNumber: string,
    @Query('dateLocal') dateLocal?: string
  ): Promise<{ success: boolean; data?: NormalizedFlightStatus; error?: string }> {
    // Validate flight number
    if (!flightNumber || flightNumber.length < 2 || flightNumber.length > 10) {
      throw new BadRequestException('Flight number must be between 2 and 10 characters')
    }

    this.logger.log(`Flight details: ${flightNumber}`)

    const result = await this.flightsProvider.getDetails(flightNumber, { dateLocal })

    if (!result.success) {
      if (result.error?.includes('credentials') || result.error?.includes('circuit')) {
        throw new ServiceUnavailableException(result.error)
      }
      return {
        success: false,
        error: result.error || 'Flight not found',
      }
    }

    return {
      success: true,
      data: result.data,
    }
  }

  /**
   * Test connection to Aerodatabox API
   *
   * @example GET /external-apis/flights/health
   */
  @Get('health/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check',
    description: 'Test connection to Aerodatabox API. Returns credential status and API availability.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health check result',
  })
  async healthCheck(): Promise<{ success: boolean; message: string }> {
    const result = await this.flightsProvider.testConnection()
    return {
      success: result.success,
      message: result.message,
    }
  }
}
