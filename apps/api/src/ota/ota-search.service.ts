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
import { SerpFlightPricesService, type FlightPriceInsights } from './serp-flight-prices.service'
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
    private readonly serpFlightPrices: SerpFlightPricesService,
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

      const kw = keyword.trim().toUpperCase()
      const url = `${baseUrl}/v1/reference-data/locations?keyword=${encodeURIComponent(kw)}&subType=CITY,AIRPORT&page%5Blimit%5D=10`
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        }),
      )

      const locations = response.data?.data || []
      const mapped = locations
        .map((loc: any) => ({
          code: loc.iataCode,
          name: loc.name,
          city: loc.address?.cityName || '',
          country: loc.address?.countryCode || '',
          subType: loc.subType || '',
        }))
        .filter((a: any) => a.code)

      // Deduplicate: prefer AIRPORT over CITY when same IATA code
      const seen = new Map<string, any>()
      for (const a of mapped) {
        const existing = seen.get(a.code)
        if (!existing || (a.subType === 'AIRPORT' && existing.subType !== 'AIRPORT')) {
          seen.set(a.code, a)
        }
      }
      return Array.from(seen.values())
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
  // Nearby Date Prices (7-day strip)
  // ============================================================================

  /**
   * Get cheapest prices for 7 dates centered on the searched date.
   * Uses the same Flight Offers Search API that works in production.
   * Each date is cached individually for 1 hour.
   */
  async searchNearbyPrices(params: {
    origin: string
    destination: string
    departureDate: string
    adults?: number
    travelClass?: string
  }): Promise<{ prices: Array<{ date: string; price: number; currency: string }> }> {
    const { origin, destination, departureDate, adults = 1, travelClass } = params

    // Generate 7 dates: departureDate-3 through departureDate+3
    const centerDate = new Date(departureDate + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dates: string[] = []
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date(centerDate)
      d.setDate(d.getDate() + offset)
      // Skip dates in the past
      if (d < today) continue
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dates.push(ymd)
    }

    // Check cache for each date, collect uncached dates
    const results: Array<{ date: string; price: number; currency: string }> = []
    const uncachedDates: string[] = []

    for (const date of dates) {
      const cacheKey = `nearby-price:${origin}:${destination}:${date}`
      const cached = this.cache.get<{ date: string; price: number; currency: string }>(cacheKey)
      if (cached) {
        results.push(cached)
      } else {
        uncachedDates.push(date)
      }
    }

    // Fetch uncached dates in parallel
    if (uncachedDates.length > 0) {
      const fetchPromises = uncachedDates.map(async (date) => {
        try {
          await this.initFlightCredentials()
          const response = await this.flightOffersProvider.search({
            origin,
            destination,
            departureDate: date,
            adults,
            travelClass: travelClass as any,
            currencyCode: 'CAD',
          })

          if (response.success && response.data && response.data.length > 0) {
            const cheapest = response.data[0]!
            const priceEntry = {
              date,
              price: parseFloat(cheapest.price.total),
              currency: cheapest.price.currency,
            }
            // Cache individually for 1 hour
            const cacheKey = `nearby-price:${origin}:${destination}:${date}`
            this.cache.set(cacheKey, priceEntry, 3600)
            return priceEntry
          }
          return null
        } catch (error: any) {
          this.logger.warn(`Nearby price fetch failed for ${date}: ${error.message}`)
          return null
        }
      })

      const settled = await Promise.allSettled(fetchPromises)
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value)
        }
      }
    }

    // Sort by date
    results.sort((a, b) => a.date.localeCompare(b.date))

    return { prices: results }
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
  // Flight Price Insights (SerpAPI Google Flights)
  // ============================================================================

  /**
   * Get price insights (lowest price, price level, typical range) for a route+date
   * via SerpAPI Google Flights. Replaces deprecated Amadeus Price Metrics.
   */
  async getFlightPriceInsights(params: {
    origin: string
    destination: string
    departureDate: string
    returnDate?: string
  }): Promise<FlightPriceInsights | null> {
    return this.serpFlightPrices.getPriceInsights({
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
    })
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
  ): Promise<{ destinations: Array<{ iataCode: string; name: string; type: string }> } | { error: string }> {
    const cacheKey = `direct-destinations:${params.departureAirportCode}`
    const cached = this.cache.get<{ destinations: Array<{ iataCode: string; name: string; type: string }> }>(cacheKey)
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
