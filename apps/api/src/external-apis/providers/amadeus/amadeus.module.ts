/**
 * Amadeus Module
 *
 * NestJS module for Amadeus API providers:
 * - Flights: On Demand Flight Status API (fallback for Aerodatabox)
 * - Hotels: Hotel Search and Offers APIs (fallback for Google Places)
 *
 * Note: HttpModule is provided globally by ExternalApisModule with
 * configured timeout (15s) and maxRedirects (3). Do not import HttpModule
 * here to avoid bypassing the global config.
 */

import { Module } from '@nestjs/common'
import { AmadeusAuthService } from './amadeus-auth.service'
import { AmadeusFlightsProvider } from './amadeus-flights.provider'
import { AmadeusHotelsProvider } from './amadeus-hotels.provider'
import { AmadeusFlightOffersProvider } from './amadeus-flight-offers.provider'
import { AmadeusTransfersProvider } from './amadeus-transfers.provider'
import { AmadeusActivitiesProvider } from './amadeus-activities.provider'
import { AmadeusFlightDatesProvider } from './amadeus-flight-dates.provider'
import { AmadeusPriceMetricsProvider } from './amadeus-price-metrics.provider'
import { AmadeusDirectDestinationsProvider } from './amadeus-direct-destinations.provider'
import { AmadeusFlightDelayProvider } from './amadeus-flight-delay.provider'
import { AmadeusFlightPricingProvider } from './amadeus-flight-pricing.provider'
import { AmadeusFlightUpsellProvider } from './amadeus-flight-upsell.provider'

@Module({
  providers: [
    AmadeusAuthService,
    AmadeusFlightsProvider,
    AmadeusHotelsProvider,
    AmadeusFlightOffersProvider,
    AmadeusTransfersProvider,
    AmadeusActivitiesProvider,
    AmadeusFlightDatesProvider,
    AmadeusPriceMetricsProvider,
    AmadeusDirectDestinationsProvider,
    AmadeusFlightDelayProvider,
    AmadeusFlightPricingProvider,
    AmadeusFlightUpsellProvider,
  ],
  exports: [
    AmadeusAuthService,
    AmadeusFlightsProvider,
    AmadeusHotelsProvider,
    AmadeusFlightOffersProvider,
    AmadeusTransfersProvider,
    AmadeusActivitiesProvider,
    AmadeusFlightDatesProvider,
    AmadeusPriceMetricsProvider,
    AmadeusDirectDestinationsProvider,
    AmadeusFlightDelayProvider,
    AmadeusFlightPricingProvider,
    AmadeusFlightUpsellProvider,
  ],
})
export class AmadeusModule {}
