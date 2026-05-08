/**
 * Flight Offers Controller
 *
 * API endpoints for flight price shopping (separate from flight status).
 * Uses Amadeus Flight Offers Search API.
 */

import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { AmadeusFlightOffersProvider } from '../amadeus/amadeus-flight-offers.provider'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import { ApiProvider, FlightOfferSearchResponse } from '@tailfire/shared-types'

@Controller('external-apis/flights/offers')
export class FlightsOffersController {
  private readonly logger = new Logger(FlightsOffersController.name)

  constructor(
    private readonly amadeusOffers: AmadeusFlightOffersProvider,
    private readonly credentialResolver: CredentialResolverService
  ) {}

  /**
   * Search flight offers (price shopping)
   *
   * GET /external-apis/flights/offers/search
   */
  @Get('search')
  async searchFlightOffers(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('departureDate') departureDate?: string,
    @Query('returnDate') returnDate?: string,
    @Query('adults') adults?: string,
    @Query('travelClass') travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST',
    @Query('nonStop') nonStop?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('currencyCode') currencyCode?: string
  ): Promise<FlightOfferSearchResponse> {
    if (!origin || !destination || !departureDate) {
      throw new BadRequestException('origin, destination, and departureDate are required')
    }

    // Amadeus Self-Service caps the search horizon at ~361 days. Anything beyond
    // returns 'SELECTED DATE IS TOO FAR IN THE FUTURE' — short-circuit with an
    // empty result + warning instead of hitting the API and surfacing a Sentry error.
    // Applied to both departureDate and returnDate (round-trips fail if either is too far).
    const maxHorizonDays = 360
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const horizonDays = (date: string): number | null => {
      // Strict YYYY-MM-DD validation: round-trip parse to reject invalid calendar dates.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
      if (!m) return null
      const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      const parsed = new Date(ts)
      if (parsed.getUTCFullYear() !== Number(m[1])) return null
      return (ts - today.getTime()) / 86400000
    }

    const depHorizon = horizonDays(departureDate)
    const retHorizon = returnDate ? horizonDays(returnDate) : null
    const beyondHorizon =
      (depHorizon != null && depHorizon > maxHorizonDays) ||
      (retHorizon != null && retHorizon > maxHorizonDays)
    if (beyondHorizon) {
      this.logger.log('Flight offers search skipped — beyond Amadeus horizon', {
        origin, destination, departureDate, returnDate, depHorizon, retHorizon,
      })
      return {
        results: [],
        warning: 'Flight pricing is not yet available for dates beyond ~12 months. Please check closer to departure.',
      }
    }

    this.logger.log('Flight offers search request', { origin, destination, departureDate })

    // Initialize credentials
    await this.initializeCredentials()

    const response = await this.amadeusOffers.search({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departureDate,
      returnDate,
      adults: adults ? parseInt(adults, 10) : 1,
      travelClass,
      nonStop: nonStop === 'true',
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      currencyCode: currencyCode || 'CAD',
    })

    if (!response.success) {
      Sentry.captureMessage(`Flight offers search failed: ${response.error}`, {
        level: 'warning',
        tags: { service: 'amadeus', operation: 'flight-offers-search' },
        extra: { origin, destination, departureDate, error: response.error },
      })
      return {
        results: [],
        warning: response.error,
      }
    }

    return {
      results: response.data || [],
    }
  }

  private async initializeCredentials(): Promise<void> {
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_OFFERS)
      if (creds) {
        await this.amadeusOffers.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus credentials not available', { error })
    }
  }
}
