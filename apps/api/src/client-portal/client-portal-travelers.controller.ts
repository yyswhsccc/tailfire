/**
 * Client Portal Travelers Controller
 *
 * Passenger info (profile) CRUD for client portal users.
 */

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { ClientPortalAuthGuard } from './client-portal-auth.guard'
import { GetClientAuth } from './decorators/client-auth.decorator'
import { ClientPortalService } from './client-portal.service'
import { UpdateClientProfileDto } from './dto/update-profile.dto'
import type { ClientAuthContext } from './client-portal-auth.types'

@Public()
@UseGuards(ClientPortalAuthGuard)
@Controller('client-portal/profile')
export class ClientPortalTravelersController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get()
  async getProfile(@GetClientAuth() auth: ClientAuthContext) {
    return this.clientPortalService.getClientProfile(auth)
  }

  @Patch()
  async updateProfile(
    @GetClientAuth() auth: ClientAuthContext,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.clientPortalService.updateClientProfile(auth, dto)
  }
}
