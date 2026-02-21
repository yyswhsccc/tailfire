/**
 * Portal Controller
 *
 * Dedicated controller for client portal endpoints.
 * All routes bypass global JwtAuthGuard via @Public() and use PortalAuthGuard instead.
 */

import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'
import { PortalService } from './portal.service'

@ApiTags('Portal')
@Controller('portal')
@Public() // Bypass global JwtAuthGuard + RolesGuard + UserStatusGuard + ActiveUserGuard
@UseGuards(PortalAuthGuard) // Enforce portal-specific auth on all routes
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  /**
   * Activate portal account on first login
   * POST /portal/activate
   */
  @Post('activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@GetPortalAuth() auth: PortalAuthContext): Promise<void> {
    await this.portalService.activatePortalAccount(auth.userId)
  }

  /**
   * Get portal user profile
   * GET /portal/me
   */
  @Get('me')
  async getProfile(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getPortalProfile(auth.userId)
  }

  /**
   * Get trips for portal user
   * GET /portal/my-trips
   */
  @Get('my-trips')
  async getTrips(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getTripsForPortalUser(auth.userId)
  }

  /**
   * Get documents for portal user
   * GET /portal/my-documents
   */
  @Get('my-documents')
  async getDocuments(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getDocumentsForPortalUser(auth.userId)
  }
}
