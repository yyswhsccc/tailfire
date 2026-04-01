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

import { Module, forwardRef } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { OtaLeadsController } from './ota-leads.controller'
import { OtaTripRequestsController } from './ota-trip-requests.controller'
import { OtaLeadsService } from './ota-leads.service'
import { OtaReferralsController } from './ota-referrals.controller'
import { OtaReferralsService } from './ota-referrals.service'
import { OtaPublishedTripsController } from './ota-published-trips.controller'
import { OtaPublishedTripsService } from './ota-published-trips.service'
import { OtaSearchController } from './ota-search.controller'
import { OtaSearchService } from './ota-search.service'
import { OtaSearchCacheService } from './ota-search-cache.service'
import { SerpFlightPricesService } from './serp-flight-prices.service'
import { OtaTripRequestsService } from './ota-trip-requests.service'
import { OwnerResolutionService } from './owner-resolution.service'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { CruiseBookingModule } from '../cruise-booking/cruise-booking.module'
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module'
import { TripsModule } from '../trips/trips.module'
import { TripPromotionService } from './trip-promotion.service'
import { FlightPromoter } from './component-promoters/flight.promoter'
import { LodgingPromoter } from './component-promoters/lodging.promoter'
import { CruisePromoter } from './component-promoters/cruise.promoter'
import { TourPromoter } from './component-promoters/tour.promoter'
import { NotificationModule } from '../notifications/notification.module'

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
    forwardRef(() => TripsModule),
    NotificationModule,
  ],
  controllers: [
    OtaLeadsController,
    OtaTripRequestsController,
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
    OtaTripRequestsService,
    OwnerResolutionService,
    OtaServiceKeyGuard,
    TripPromotionService,
    FlightPromoter,
    LodgingPromoter,
    CruisePromoter,
    TourPromoter,
  ],
  exports: [OtaLeadsService, OtaReferralsService, OtaPublishedTripsService, OtaSearchService, OtaTripRequestsService, OwnerResolutionService, TripPromotionService, FlightPromoter, LodgingPromoter, CruisePromoter, TourPromoter],
})
export class OtaModule {}
