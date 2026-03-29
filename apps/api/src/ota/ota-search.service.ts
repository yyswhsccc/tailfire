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
import { OtaSearchCacheService } from './ota-search-cache.service'
import { AmadeusFlightOffersProvider } from '../external-apis/providers/amadeus/amadeus-flight-offers.provider'
import { AmadeusHotelsProvider } from '../external-apis/providers/amadeus/amadeus-hotels.provider'
import { AmadeusFlightDatesProvider, type FlightDateSearchParams } from '../external-apis/providers/amadeus/amadeus-flight-dates.provider'
import { AmadeusPriceMetricsProvider, type PriceMetricsSearchParams } from '../external-apis/providers/amadeus/amadeus-price-metrics.provider'
import { AmadeusDirectDestinationsProvider, type DirectDestinationsSearchParams } from '../external-apis/providers/amadeus/amadeus-direct-destinations.provider'
import { AmadeusFlightDelayProvider, type FlightDelaySearchParams } from '../external-apis/providers/amadeus/amadeus-flight-delay.provider'
import { AmadeusFlightPricingProvider, type FlightPricingParams } from '../external-apis/providers/amadeus/amadeus-flight-pricing.provider'
import { AmadeusFlightUpsellProvider, type FlightUpsellParams } from '../external-apis/providers/amadeus/amadeus-flight-upsell.provider'
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
    private readonly flightDatesProvider: AmadeusFlightDatesProvider,
    private readonly priceMetricsProvider: AmadeusPriceMetricsProvider,
    private readonly directDestinationsProvider: AmadeusDirectDestinationsProvider,
    private readonly flightDelayProvider: AmadeusFlightDelayProvider,
    private readonly flightPricingProvider: AmadeusFlightPricingProvider,
    private readonly flightUpsellProvider: AmadeusFlightUpsellProvider,
    private readonly amadeusAuthService: AmadeusAuthService,
    private readonly credentialResolver: CredentialResolverService,
    private readonly bookingService: BookingService,
    private readonly httpService: HttpService,
    private readonly cache: OtaSearchCacheService,
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

      const url = `${baseUrl}/v1/reference-data/locations?keyword=${encodeURIComponent(keyword.trim())}&subType=CITY,AIRPORT&page%5Blimit%5D=10`
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
  // Flight Dates (Cheapest Dates)
  // ============================================================================

  /**
   * Search cheapest flight dates for a route via Amadeus Flight Dates API.
   */
  async searchFlightDates(
    params: FlightDateSearchParams,
  ): Promise<{ dates: Array<{ date: string; price: number; currency: string }> } | { error: string }> {
    const cacheKey = `flight-dates:${params.origin}:${params.destination}:${params.departureDate || ''}`
    const cached = this.cache.get<{ dates: Array<{ date: string; price: number; currency: string }> }>(cacheKey)
    if (cached) return cached

    try {
      await this.initEnrichmentCredentials(this.flightDatesProvider)
      const response = await this.flightDatesProvider.search(params)
      if (!response.success || !response.data) {
        return { dates: [] }
      }
      const result = { dates: response.data }
      this.cache.set(cacheKey, result, 3600) // 1 hour
      return result
    } catch (error: any) {
      this.logger.error(`Flight dates search failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-flight-dates' },
      })
      return { error: error.message }
    }
  }

  // ============================================================================
  // Flight Price Metrics
  // ============================================================================

  /**
   * Get historical price analysis (min/quartile/max) for a route+date
   * via Amadeus Itinerary Price Metrics API.
   */
  async searchPriceMetrics(
    params: PriceMetricsSearchParams,
  ): Promise<{ metrics: { min: number; firstQuartile: number; median: number; thirdQuartile: number; max: number; currencyCode: string } | null } | { error: string }> {
    const cacheKey = `price-metrics:${params.originIataCode}:${params.destinationIataCode}:${params.departureDate}:${params.currencyCode || 'CAD'}`
    const cached = this.cache.get<{ metrics: { min: number; firstQuartile: number; median: number; thirdQuartile: number; max: number; currencyCode: string } | null }>(cacheKey)
    if (cached) return cached

    try {
      await this.initEnrichmentCredentials(this.priceMetricsProvider)
      const response = await this.priceMetricsProvider.search(params)
      if (!response.success || !response.data || response.data.length === 0) {
        return { metrics: null }
      }
      const result = { metrics: response.data[0]! }
      this.cache.set(cacheKey, result, 21600) // 6 hours
      return result
    } catch (error: any) {
      this.logger.error(`Price metrics search failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-price-metrics' },
      })
      return { error: error.message }
    }
  }

  // ============================================================================
  // Direct Destinations
  // ============================================================================

  /**
   * Get airports reachable via direct flights from a given airport
   * via Amadeus Airport Routes API.
   */
  async searchDirectDestinations(
    params: DirectDestinationsSearchParams,
  ): Promise<{ destinations: Array<{ destination: string; airlines: string[] }> } | { error: string }> {
    const cacheKey = `direct-destinations:${params.departureAirportCode}`
    const cached = this.cache.get<{ destinations: Array<{ destination: string; airlines: string[] }> }>(cacheKey)
    if (cached) return cached

    try {
      await this.initEnrichmentCredentials(this.directDestinationsProvider)
      const response = await this.directDestinationsProvider.search(params)
      if (!response.success || !response.data) {
        return { destinations: [] }
      }
      const result = { destinations: response.data }
      this.cache.set(cacheKey, result, 86400) // 24 hours
      return result
    } catch (error: any) {
      this.logger.error(`Direct destinations search failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-direct-destinations' },
      })
      return { error: error.message }
    }
  }

  // ============================================================================
  // Flight Delay Prediction
  // ============================================================================

  /**
   * Get ML-based delay prediction for a specific flight
   * via Amadeus Flight Delay Prediction API.
   */
  async searchFlightDelay(
    params: FlightDelaySearchParams,
  ): Promise<{ prediction: { onTimePercentage: number; delayLevel: string } | null } | { error: string }> {
    try {
      await this.initEnrichmentCredentials(this.flightDelayProvider)
      const response = await this.flightDelayProvider.search(params)
      if (!response.success || !response.data || response.data.length === 0) {
        return { prediction: null }
      }
      return { prediction: response.data[0]! }
    } catch (error: any) {
      this.logger.error(`Flight delay prediction failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-flight-delay' },
      })
      return { error: error.message }
    }
  }

  // ============================================================================
  // Flight Pricing (Confirm Price)
  // ============================================================================

  /**
   * Confirm live price for selected flight offers before checkout
   * via Amadeus Flight Offers Price API (POST).
   */
  async confirmFlightPricing(
    params: FlightPricingParams,
  ): Promise<{ pricedOffers: object[] } | { error: string }> {
    try {
      await this.initEnrichmentCredentials(this.flightPricingProvider)
      const response = await this.flightPricingProvider.search(params)
      if (!response.success || !response.data || response.data.length === 0) {
        return { pricedOffers: [] }
      }
      return { pricedOffers: response.data[0]!.flightOffers }
    } catch (error: any) {
      this.logger.error(`Flight pricing confirmation failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-flight-pricing' },
      })
      return { error: error.message }
    }
  }

  // ============================================================================
  // Flight Upsell (Premium Alternatives)
  // ============================================================================

  /**
   * Get premium cabin alternatives (Business, Premium Economy) for a given offer
   * via Amadeus Upselling API (POST).
   */
  async searchFlightUpsell(
    params: FlightUpsellParams,
  ): Promise<{ alternatives: object[] } | { error: string }> {
    try {
      await this.initEnrichmentCredentials(this.flightUpsellProvider)
      const response = await this.flightUpsellProvider.search(params)
      if (!response.success || !response.data) {
        return { alternatives: [] }
      }
      return { alternatives: response.data }
    } catch (error: any) {
      this.logger.error(`Flight upsell search failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'amadeus', operation: 'ota-flight-upsell' },
      })
      return { error: error.message }
    }
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

  /**
   * Generic credential initializer for enrichment providers.
   * All enrichment providers (dates, metrics, destinations, delay, pricing, upsell)
   * use the same Amadeus OFFERS credentials.
   */
  private async initEnrichmentCredentials(provider: { setCredentials: (creds: any) => Promise<void> }): Promise<void> {
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_OFFERS)
      if (creds) {
        await provider.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus enrichment credentials not available', { error })
    }
  }
}
