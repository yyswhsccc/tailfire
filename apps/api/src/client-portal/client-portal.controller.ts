import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { ClientPortalService } from './client-portal.service'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import { UpdateClientProfileDto } from './dto/update-client-profile.dto'

@ApiTags('Client Portal')
@Controller('client-portal')
@Public()
@UseGuards(PortalAuthGuard)
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get('my-boards')
  async getMyBoards(@GetPortalAuth() auth: PortalAuthContext) {
    return this.clientPortalService.getMyBoards(auth.contactId)
  }

  @Get('trips')
  async getTrips(@GetPortalAuth() auth: PortalAuthContext) {
    return this.clientPortalService.getTrips(auth.contactId, auth.agencyId)
  }

  @Get('trips/:tripId')
  async getTripDetail(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('tripId') tripId: string,
  ) {
    return this.clientPortalService.getTripDetail(auth.contactId, auth.agencyId, tripId)
  }

  @Get('trips/:tripId/itineraries/:itineraryId')
  async getItineraryDetail(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
  ) {
    return this.clientPortalService.getItineraryDetail(auth.contactId, auth.agencyId, tripId, itineraryId)
  }

  @Post('trips/:tripId/itineraries/:itineraryId/approve')
  async submitApproval(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.clientPortalService.submitApproval(auth.contactId, auth.agencyId, tripId, itineraryId, dto)
  }

  @Post('trips/:tripId/itineraries/:itineraryId/request-changes')
  async submitChangeRequest(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.clientPortalService.submitChangeRequest(auth.contactId, auth.agencyId, tripId, itineraryId, dto)
  }

  @Get('trips/:tripId/itineraries/:itineraryId/feedback')
  async getFeedbackHistory(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
  ) {
    return this.clientPortalService.getFeedbackHistory(auth.contactId, auth.agencyId, tripId, itineraryId)
  }

  @Get('profile')
  async getProfile(@GetPortalAuth() auth: PortalAuthContext) {
    return this.clientPortalService.getProfile(auth.contactId, auth.agencyId)
  }

  @Patch('profile')
  async updateProfile(
    @GetPortalAuth() auth: PortalAuthContext,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.clientPortalService.updateProfile(auth.contactId, auth.agencyId, dto)
  }
}
