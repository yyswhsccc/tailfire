/**
 * Trips Module
 *
 * Provides trip management functionality including:
 * - Trips
 * - Trip Travelers
 * - Itineraries
 * - Traveler Groups
 *
 * Note: ContactsModule is imported for ContactAccessService (access control).
 * Communication with ContactsService for booking events still uses domain events
 * (TripBookedEvent) to avoid circular dependencies.
 */

import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { ActivityLogsModule } from '../activity-logs/activity-logs.module'
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module'
import { UnsplashModule } from '../unsplash/unsplash.module'
import { FinancialsModule } from '../financials/financials.module'
import { ContactsModule } from '../contacts/contacts.module'
import { AutomationModule } from '../automation/automation.module'
import { EmailModule } from '../email/email.module'

// Services
import { TripsService } from './trips.service'
import { TripAccessService } from './trip-access.service'
import { TripTravelersService } from './trip-travelers.service'
import { ItinerariesService } from './itineraries.service'
import { ItineraryVersionsService } from './itinerary-versions.service'
import { TravelerGroupsService } from './traveler-groups.service'
import { ItineraryDaysService } from './itinerary-days.service'
import { ActivitiesService } from './activities.service'
import { BaseComponentService } from './base-component.service'
import { FlightDetailsService } from './flight-details.service'
import { FlightSegmentsService } from './flight-segments.service'
import { LodgingDetailsService } from './lodging-details.service'
import { TransportationDetailsService } from './transportation-details.service'
import { DiningDetailsService } from './dining-details.service'
import { PortInfoDetailsService } from './port-info-details.service'
import { OptionsDetailsService } from './options-details.service'
import { CustomCruiseDetailsService } from './custom-cruise-details.service'
import { CustomTourDetailsService } from './custom-tour-details.service'
import { TourDayDetailsService } from './tour-day-details.service'
import { ComponentOrchestrationService } from './component-orchestration.service'
import { PaymentSchedulesService } from './payment-schedules.service'
import { PaymentAuditService } from './payment-audit.service'
import { PaymentTemplatesService } from './payment-templates.service'
import { ActivityTotalsService } from './activity-totals.service'
import { ActivityTravelersService } from './activity-travelers.service'
import { ActivityBookingsService } from './activity-bookings.service'
import { InsuranceService } from './insurance.service'
import { StorageService } from './storage.service'
import { ActivityDocumentsService } from './activity-documents.service'
import { ActivityMediaService } from './activity-media.service'
import { TripMediaService } from './trip-media.service'
import { GeocodingService } from './geocoding.service'
import { GeolocationCascadeService } from './geolocation-cascade.service'
import { StorageProviderFactory } from '../storage/providers'

// Controllers
import { TripsController } from './trips.controller'
import { TripTravelersController } from './trip-travelers.controller'
import { ItinerariesController } from './itineraries.controller'
import { TravelerGroupsController } from './traveler-groups.controller'
import { ItineraryDaysController } from './itinerary-days.controller'
import { ActivitiesController, ActivitiesGlobalController, TypedActivitiesController } from './activities.controller'
import { PaymentSchedulesController } from './payment-schedules.controller'
import { PaymentTemplatesController } from './payment-templates.controller'
import { InsuranceController } from './insurance.controller'
import {
  ActivityDocumentsController,
  ComponentDocumentsController,
} from './activity-documents.controller'
import {
  ActivityMediaController,
  ComponentMediaController,
} from './activity-media.controller'
import { TripMediaController } from './trip-media.controller'
import { ActivityBookingsController } from './activity-bookings.controller'
import { TripSharesController } from './trip-shares.controller'
import { TripSharesService } from './trip-shares.service'

@Module({
  imports: [
    DatabaseModule,
    ActivityLogsModule,
    ApiCredentialsModule,
    UnsplashModule,
    FinancialsModule,
    EmailModule, // For booking confirmation emails
    forwardRef(() => ContactsModule), // For ContactAccessService (access control)
    forwardRef(() => AutomationModule), // For trip status auto-transitions
  ],
  controllers: [
    TripsController,
    TripTravelersController,
    TripSharesController,
    ItinerariesController,
    TravelerGroupsController,
    ItineraryDaysController,
    ActivitiesController,
    ActivitiesGlobalController,
    TypedActivitiesController,
    PaymentSchedulesController,
    PaymentTemplatesController,
    // BookingsController removed - archived to _deprecated/
    InsuranceController,
    ActivityDocumentsController,
    ComponentDocumentsController, // Legacy route for backwards compatibility
    ActivityMediaController,
    ComponentMediaController, // Legacy route for backwards compatibility
    TripMediaController,
    ActivityBookingsController, // Booking status management for activities
  ],
  providers: [
    StorageProviderFactory,
    GeocodingService,
    GeolocationCascadeService,
    TripsService,
    TripAccessService,
    TripTravelersService,
    TripSharesService,
    ItinerariesService,
    ItineraryVersionsService,
    TravelerGroupsService,
    ItineraryDaysService,
    ActivitiesService,
    BaseComponentService,
    FlightDetailsService,
    FlightSegmentsService,
    LodgingDetailsService,
    TransportationDetailsService,
    DiningDetailsService,
    PortInfoDetailsService,
    OptionsDetailsService,
    CustomCruiseDetailsService,
    CustomTourDetailsService,
    TourDayDetailsService,
    ComponentOrchestrationService,
    PaymentSchedulesService,
    PaymentAuditService,
    PaymentTemplatesService,
    ActivityTotalsService,
    ActivityTravelersService,
    ActivityBookingsService,
    InsuranceService,
    StorageService,
    ActivityDocumentsService,
    ActivityMediaService,
    TripMediaService,
  ],
  exports: [
    TripsService,
    TripAccessService,
    TripTravelersService,
    ItinerariesService,
    ItineraryVersionsService,
    TravelerGroupsService,
    ItineraryDaysService,
    ActivitiesService,
    ActivityMediaService,
    StorageService,
    StorageProviderFactory,
    // Additional exports for TemplatesModule
    ComponentOrchestrationService,
    BaseComponentService,
    ActivityTotalsService,
    ActivityTravelersService,
    PaymentSchedulesService,
  ],
})
export class TripsModule {}
