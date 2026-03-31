/**
 * OTA Module
 *
 * OTA-specific endpoints for the consumer portal:
 * - Lead capture with attribution priority chain
 * - Referral session logging
 * - Published trip listings
 * - Search facades (flights, airports, hotels, cruises)
 *
 * Auth: @Public + OtaServiceKeyGuard (x-ota-service-key header).
 * Bypasses JWT but requires a valid service key.
 */

import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { OtaLeadsController } from './ota-leads.controller'
import { OtaLeadsService } from './ota-leads.service'
import { OtaReferralsController } from './ota-referrals.controller'
import { OtaReferralsService } from './ota-referrals.service'
import { OtaPublishedTripsController } from './ota-published-trips.controller'
import { OtaPublishedTripsService } from './ota-published-trips.service'
import { OtaSearchController } from './ota-search.controller'
import { OtaSearchService } from './ota-search.service'
import { OtaSearchCacheService } from './ota-search-cache.service'
import { SerpFlightPricesService } from './serp-flight-prices.service'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { CruiseBookingModule } from '../cruise-booking/cruise-booking.module'
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module'

/**
 * Note: ExternalApisModule is @Global() so AmadeusFlightOffersProvider,
 * AmadeusHotelsProvider, AmadeusAuthService, and HttpService are available
 * without explicit import. CruiseBookingModule is NOT global and must be
 * imported for BookingService access.
 */
@Module({
  imports: [
    HttpModule.register({ timeout: 10000 }),
    CruiseBookingModule,
    ApiCredentialsModule,
  ],
  controllers: [
    OtaLeadsController,
    OtaReferralsController,
    OtaPublishedTripsController,
    OtaSearchController,
  ],
  providers: [
    OtaLeadsService,
    OtaReferralsService,
    OtaPublishedTripsService,
    OtaSearchService,
    OtaSearchCacheService,
    SerpFlightPricesService,
    OtaServiceKeyGuard,
  ],
  exports: [OtaLeadsService, OtaReferralsService, OtaPublishedTripsService, OtaSearchService],
})
export class OtaModule {}
