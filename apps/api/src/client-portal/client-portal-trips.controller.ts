/**
 * Client Portal Trips Controller
 *
 * Trip and itinerary read endpoints for client portal users.
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { ClientPortalAuthGuard } from './client-portal-auth.guard'
import { GetClientAuth } from './decorators/client-auth.decorator'
import { ClientPortalService } from './client-portal.service'
import type { ClientAuthContext } from './client-portal-auth.types'

@Public()
@UseGuards(ClientPortalAuthGuard)
@Controller('client-portal/trips')
export class ClientPortalTripsController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get()
  async listTrips(@GetClientAuth() auth: ClientAuthContext) {
    return this.clientPortalService.getClientTrips(auth)
  }

  @Get(':tripId')
  async getTrip(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
  ) {
    return this.clientPortalService.getClientTrip(tripId, auth)
  }

  @Get(':tripId/itineraries/:itineraryId')
  async getItinerary(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
  ) {
    return this.clientPortalService.getClientItinerary(tripId, itineraryId, auth)
  }

  @Get(':tripId/travelers')
  async getTravelers(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
  ) {
    return this.clientPortalService.getTripTravelers(tripId, auth)
  }
}
