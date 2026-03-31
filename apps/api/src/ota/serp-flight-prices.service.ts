/**
 * SerpAPI Flight Price Insights Service
 *
 * Fetches Google Flights price insights from SerpAPI for a given route + date.
 * Replaces deprecated Amadeus Price Metrics and Cheapest Date APIs.
 *
 * Returns: lowestPrice, priceLevel ("low"/"typical"/"high"),
 *          typicalRange [min, max], and currency.
 *
 * Caches results per route+date for 2 hours via OtaSearchCacheService.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import { OtaSearchCacheService } from './ota-search-cache.service'

export interface FlightPriceInsights {
  lowestPrice: number
  priceLevel: string // "low" | "typical" | "high"
  typicalRange: [number, number]
  currency: string
}

interface SerpFlightPriceParams {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  currency?: string
}

@Injectable()
export class SerpFlightPricesService {
  private readonly logger = new Logger(SerpFlightPricesService.name)
  private readonly apiKey: string | undefined
  private static readonly CACHE_TTL_SECONDS = 7200 // 2 hours

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly cache: OtaSearchCacheService,
  ) {
    this.apiKey = this.config.get<string>('SERPAPI_API_KEY')
    if (!this.apiKey) {
      this.logger.warn('SERPAPI_API_KEY not configured — flight price insights will be disabled')
    }
  }

  /**
   * Fetch price insights for a route + date from SerpAPI Google Flights.
   * Returns null on any failure (graceful degradation).
   */
  async getPriceInsights(params: SerpFlightPriceParams): Promise<FlightPriceInsights | null> {
    if (!this.apiKey) {
      return null
    }

    const currency = params.currency || 'CAD'
    const cacheKey = this.buildCacheKey(params, currency)

    // Check cache first
    const cached = this.cache.get<FlightPriceInsights>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for flight price insights: ${cacheKey}`)
      return cached
    }

    try {
      const type = params.returnDate ? 1 : 2 // 1=round-trip, 2=one-way
      const queryParams = new URLSearchParams({
        engine: 'google_flights',
        departure_id: params.origin.toUpperCase(),
        arrival_id: params.destination.toUpperCase(),
        outbound_date: params.departureDate,
        currency,
        type: String(type),
        api_key: this.apiKey,
      })

      if (params.returnDate) {
        queryParams.set('return_date', params.returnDate)
      }

      const url = `https://serpapi.com/search.json?${queryParams.toString()}`

      this.logger.log(`Fetching SerpAPI flight price insights: ${params.origin}->${params.destination} on ${params.departureDate}`)

      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 15000 }),
      )

      const data = response.data
      const insights = this.extractInsights(data, currency)

      if (insights) {
        this.cache.set(cacheKey, insights, SerpFlightPricesService.CACHE_TTL_SECONDS)
        this.logger.log(`Flight price insights cached: ${params.origin}->${params.destination} = ${insights.priceLevel} ($${insights.lowestPrice})`)
      }

      return insights
    } catch (error: any) {
      this.logger.error(`SerpAPI flight price insights failed: ${error.message}`)
      Sentry.captureException(error, {
        tags: { service: 'serpapi', operation: 'flight-price-insights' },
        extra: {
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
        },
      })
      return null
    }
  }

  /**
   * Extract price insights from SerpAPI response.
   * Falls back to best_flights[0].price if price_insights is missing.
   */
  private extractInsights(data: any, currency: string): FlightPriceInsights | null {
    const priceInsights = data?.price_insights
    const bestFlights = data?.best_flights

    if (priceInsights) {
      const lowestPrice = priceInsights.lowest_price
      const priceLevel = priceInsights.price_level || 'typical'
      const typicalRange = priceInsights.typical_price_range

      if (lowestPrice != null && typicalRange && typicalRange.length === 2) {
        return {
          lowestPrice: Number(lowestPrice),
          priceLevel: String(priceLevel).toLowerCase(),
          typicalRange: [Number(typicalRange[0]), Number(typicalRange[1])],
          currency,
        }
      }

      // Partial data: have lowest price but no typical range
      if (lowestPrice != null) {
        return {
          lowestPrice: Number(lowestPrice),
          priceLevel: String(priceLevel).toLowerCase(),
          typicalRange: [Number(lowestPrice), Number(lowestPrice)],
          currency,
        }
      }
    }

    // Fallback: derive from best_flights if price_insights is absent
    if (bestFlights && bestFlights.length > 0 && bestFlights[0].price != null) {
      const price = Number(bestFlights[0].price)
      return {
        lowestPrice: price,
        priceLevel: 'typical',
        typicalRange: [price, price],
        currency,
      }
    }

    return null
  }

  private buildCacheKey(params: SerpFlightPriceParams, currency: string): string {
    return `serp-flight-insights:${params.origin}:${params.destination}:${params.departureDate}:${params.returnDate || ''}:${currency}`
  }
}
