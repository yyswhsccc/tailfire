/**
 * Client Portal Module
 *
 * Provides all client portal functionality:
 * - Invitation management (admin)
 * - Account activation (public)
 * - Trip/itinerary read access (client auth)
 * - Itinerary feedback (client auth)
 * - Passenger info management (client auth)
 */

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EmailModule } from '../email/email.module'
import { ClientPortalService } from './client-portal.service'
import { ClientPortalAuthGuard } from './client-portal-auth.guard'
import { ClientPortalController } from './client-portal.controller'
import { ClientPortalTripsController } from './client-portal-trips.controller'
import { ClientPortalFeedbackController } from './client-portal-feedback.controller'
import { ClientPortalTravelersController } from './client-portal-travelers.controller'

@Module({
  imports: [ConfigModule, EmailModule],
  controllers: [
    ClientPortalController,
    ClientPortalTripsController,
    ClientPortalFeedbackController,
    ClientPortalTravelersController,
  ],
  providers: [ClientPortalService, ClientPortalAuthGuard],
  exports: [ClientPortalService],
})
export class ClientPortalModule {}
