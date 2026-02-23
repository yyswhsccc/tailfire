/**
 * Client Portal Feedback Controller
 *
 * Itinerary approval and change request endpoints.
 * Only primary_contact or full_access travelers can approve/request changes.
 */

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { ClientPortalAuthGuard } from './client-portal-auth.guard'
import { GetClientAuth } from './decorators/client-auth.decorator'
import { ClientPortalService } from './client-portal.service'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import type { ClientAuthContext } from './client-portal-auth.types'

@Public()
@UseGuards(ClientPortalAuthGuard)
@Controller('client-portal/trips/:tripId/itineraries/:itineraryId')
export class ClientPortalFeedbackController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Post('approve')
  async approve(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.clientPortalService.approveItinerary(tripId, itineraryId, auth, dto)
  }

  @Post('request-changes')
  async requestChanges(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.clientPortalService.requestChanges(tripId, itineraryId, auth, dto)
  }

  @Get('feedback')
  async getFeedback(
    @GetClientAuth() auth: ClientAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
  ) {
    return this.clientPortalService.getFeedbackHistory(tripId, itineraryId, auth)
  }
}
