/**
 * External APIs Module
 *
 * Core module for external API integration infrastructure.
 * Provides rate limiting, metrics, and provider registry services.
 *
 * Usage:
 * 1. Import this module in AppModule
 * 2. Provider modules (e.g., AerodataboxModule) should import this module
 * 3. Providers register themselves with ExternalApiRegistryService on init
 */

import { Module, Global } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { RateLimiterService } from './core/services/rate-limiter.service'
import { MetricsService } from './core/services/metrics.service'
import { ExternalApiRegistryService } from './core/services/external-api-registry.service'
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module'
import { AerodataboxModule } from './providers/aerodatabox'
import { AmadeusModule } from './providers/amadeus'
import { GooglePlacesModule } from './providers/google-places'
import { BookingComModule } from './providers/booking-com'
import { HotelsModule } from './providers/hotels'
import { FlightsOffersModule } from './providers/flights'
import { TransfersModule } from './providers/transfers'
import { ActivitiesModule } from './providers/activities'
import { OpenAiModule } from './providers/openai'

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 15000, // Default timeout (can be overridden per provider)
      maxRedirects: 3,
    }),
    ApiCredentialsModule,
    AerodataboxModule,
    AmadeusModule,
    GooglePlacesModule,
    BookingComModule,
    HotelsModule,
    FlightsOffersModule,
    TransfersModule,
    ActivitiesModule,
    OpenAiModule,
  ],
  providers: [
    RateLimiterService,
    MetricsService,
    ExternalApiRegistryService,
  ],
  exports: [
    HttpModule,
    RateLimiterService,
    MetricsService,
    ExternalApiRegistryService,
    AerodataboxModule,
    AmadeusModule,
    GooglePlacesModule,
    BookingComModule,
    HotelsModule,
    FlightsOffersModule,
    TransfersModule,
    ActivitiesModule,
    OpenAiModule,
  ],
})
export class ExternalApisModule {}
