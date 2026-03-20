/**
 * Stripe Connect Controller
 *
 * REST API endpoints for Stripe Connect operations.
 *
 * Endpoints:
 * - GET /agencies/:agencyId/settings - Get agency settings
 * - PATCH /agencies/:agencyId/settings - Update agency settings
 * - POST /agencies/:agencyId/stripe/onboard - Start Stripe onboarding
 * - GET /agencies/:agencyId/stripe/status - Refresh and get account status
 * - POST /agencies/:agencyId/stripe/dashboard - Get dashboard login link
 */

import { Controller, Get, Post, Patch, Param, Body, ForbiddenException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { StripeConnectService } from './stripe-connect.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  StripeOnboardingResponseDto,
  StripeAccountStatusResponseDto,
  AgencySettingsResponseDto,
  UpdateAgencySettingsDto,
} from '@tailfire/shared-types'

@ApiTags('Stripe Connect')
@Controller()
export class StripeConnectController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  /**
   * Get agency settings
   * GET /agencies/:agencyId/settings
   */
  @AdminOnly()
  @Get('agencies/:agencyId/settings')
  async getAgencySettings(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string
  ): Promise<AgencySettingsResponseDto> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.stripeConnectService.getAgencySettings(auth.agencyId)
  }

  /**
   * Update agency settings (compliance, branding, etc.)
   * PATCH /agencies/:agencyId/settings
   */
  @AdminOnly()
  @Patch('agencies/:agencyId/settings')
  async updateAgencySettings(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
    @Body() dto: UpdateAgencySettingsDto
  ): Promise<AgencySettingsResponseDto> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.stripeConnectService.updateAgencySettings(auth.agencyId, dto)
  }

  /**
   * Start Stripe Connect onboarding
   * POST /agencies/:agencyId/stripe/onboard
   */
  @AdminOnly()
  @Post('agencies/:agencyId/stripe/onboard')
  async startOnboarding(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
    @Body() dto: { returnUrl: string; refreshUrl: string }
  ): Promise<StripeOnboardingResponseDto> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.stripeConnectService.startOnboarding(auth.agencyId, dto.returnUrl, dto.refreshUrl)
  }

  /**
   * Refresh and get Stripe account status
   * GET /agencies/:agencyId/stripe/status
   */
  @AdminOnly()
  @Get('agencies/:agencyId/stripe/status')
  async getAccountStatus(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string
  ): Promise<StripeAccountStatusResponseDto> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.stripeConnectService.refreshAccountStatus(auth.agencyId)
  }

  /**
   * Get Stripe Express Dashboard login link
   * POST /agencies/:agencyId/stripe/dashboard
   */
  @AdminOnly()
  @Post('agencies/:agencyId/stripe/dashboard')
  async getDashboardLink(
    @GetAuthContext() auth: AuthContext,
    @Param('agencyId') agencyId: string,
  ): Promise<{ url: string }> {
    if (agencyId !== auth.agencyId) {
      throw new ForbiddenException('Agency mismatch')
    }
    return this.stripeConnectService.createDashboardLink(auth.agencyId)
  }
}
