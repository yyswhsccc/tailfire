/**
 * OTA Search Service
 *
 * Thin wrapper that exposes existing search providers (Amadeus, FusionAPI)
 * to the OTA consumer portal. No business logic transformation -- just
 * credential initialization and delegation to existing providers.
 *
 * Auth: Called exclusively from OtaSearchController (OTA service key guard).
 */

import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import { AmadeusFlightOffersProvider } from '../external-apis/providers/amadeus/amadeus-flight-offers.provider'
import { AmadeusHotelsProvider } from '../external-apis/providers/amadeus/amadeus-hotels.provider'
import { AmadeusAuthService } from '../external-apis/providers/amadeus/amadeus-auth.service'
import { CredentialResolverService } from '../api-credentials/credential-resolver.service'
import { BookingService, SearchResult } from '../cruise-booking/services/booking.service'
import { ApiProvider } from '@tailfire/shared-types'
import type { FlightOfferSearchParams, NormalizedFlightOffer } from '@tailfire/shared-types'
import type { ExternalApiResponse } from '../external-apis/core/interfaces'
import type { HotelSearchParams, NormalizedHotelResult } from '@tailfire/shared-types'

@Injectable()
export class OtaSearchService {
  private readonly logger = new Logger(OtaSearchService.name)

  constructor(
    private readonly flightOffersProvider: AmadeusFlightOffersProvider,
    private readonly hotelsProvider: AmadeusHotelsProvider,
    private readonly amadeusAuthService: AmadeusAuthService,
    private readonly credentialResolver: CredentialResolverService,
    private readonly bookingService: BookingService,
    private readonly httpService: HttpService,
  ) {}

  // ============================================================================
  // Flight Search
  // ============================================================================

  /**
   * Search flight offers via Amadeus Flight Offers API.
   * Wraps AmadeusFlightOffersProvider.search() with credential initialization.
   */
  async searchFlights(
    params: FlightOfferSearchParams,
  ): Promise<ExternalApiResponse<NormalizedFlightOffer[]>> {
    await this.initFlightCredentials()
    return this.flightOffersProvider.search(params)
  }

  // ============================================================================
  // Airport Lookup
  // ============================================================================

  /**
   * Search airports by keyword via Amadeus reference-data/locations API.
   * Mirrors the logic in AerodataboxController.searchAirports but without
   * requiring JWT auth context.
   */
  async searchAirports(
    keyword: string,
  ): Promise<{ code: string; name: string; city: string; country: string }[]> {
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
      return locations
        .map((loc: any) => ({
          code: loc.iataCode,
          name: loc.name,
          city: loc.address?.cityName || '',
          country: loc.address?.countryCode || '',
        }))
        .filter((a: any) => a.code)
    } catch (error: any) {
      this.logger.error(`Airport keyword search failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-airport-search' },
      })
      return []
    }
  }

  // ============================================================================
  // Hotel Search
  // ============================================================================

  /**
   * Search hotels via Amadeus Hotel APIs.
   * Wraps AmadeusHotelsProvider.search() with credential initialization.
   */
  async searchHotels(
    params: HotelSearchParams,
  ): Promise<ExternalApiResponse<NormalizedHotelResult[]>> {
    await this.initHotelCredentials()
    return this.hotelsProvider.search(params)
  }

  // ============================================================================
  // Cruise Search
  // ============================================================================

  /**
   * Search cruises via FusionAPI (Traveltek).
   * Wraps BookingService.searchCruises() which handles session management.
   */
  async searchCruises(params: {
    destination?: string
    departureDate?: string
    returnDate?: string
    passengers?: number
    cruiseLine?: string
    regionid?: number
    cruiselineid?: number
    portid?: number
    page?: number
    pagesize?: number
  }): Promise<SearchResult> {
    return this.bookingService.searchCruises(
      {
        adults: params.passengers || 2,
        startdate: params.departureDate,
        enddate: params.returnDate,
        regionid: params.regionid,
        cruiselineid: params.cruiselineid,
        portid: params.portid,
        page: params.page,
        pagesize: params.pagesize,
      },
      undefined, // No existing session -- creates a new one
    )
  }

  // ============================================================================
  // Credential Helpers
  // ============================================================================

  private async initFlightCredentials(): Promise<void> {
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_OFFERS)
      if (creds) {
        await this.flightOffersProvider.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus flight offers credentials not available', { error })
    }
  }

  private async initHotelCredentials(): Promise<void> {
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_HOTELS)
      if (creds) {
        await this.hotelsProvider.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus hotel credentials not available', { error })
    }
  }
}
