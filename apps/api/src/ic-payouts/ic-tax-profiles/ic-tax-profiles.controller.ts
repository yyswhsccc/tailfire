/**
 * IcTaxProfilesController
 *
 * REST API endpoints for IC agent tax profiles.
 *
 * All routes are scoped to the authenticated user's agency.
 * Encrypted fields (sinOrBnEncrypted) are NEVER returned — only the mask.
 *
 * Routes:
 *   GET    /ic-payouts/me/tax-profile                      — current user's profile (mask only)
 *   POST   /ic-payouts/me/tax-profile                      — create profile
 *   PATCH  /ic-payouts/me/tax-profile                      — update profile (non-admin fields only)
 *   PATCH  /ic-payouts/admin/users/:userId/tax-profile/policy — admin: set autoDisburse / approvalCeilingCents
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UsePipes,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { zodValidation } from '../../common/pipes'
import { IcTaxProfilesService } from './ic-tax-profiles.service'
import { createIcTaxProfileSchema, type CreateIcTaxProfileDto } from './dto/create-ic-tax-profile.dto'
import { updateIcTaxProfileSchema, type UpdateIcTaxProfileDto } from './dto/update-ic-tax-profile.dto'
import { z } from 'zod'

// Admin policy update schema (separate from general update to make intent explicit)
const updatePolicySchema = z.object({
  autoDisburse: z.boolean().optional(),
  approvalCeilingCents: z.number().int().nonnegative().optional(),
})
type UpdatePolicyDto = z.infer<typeof updatePolicySchema>

@ApiTags('IC Payouts')
@Controller('ic-payouts')
export class IcTaxProfilesController {
  constructor(private readonly service: IcTaxProfilesService) {}

  /**
   * GET /ic-payouts/me/tax-profile
   * Returns the current user's tax profile with mask fields only (no raw SIN/BN).
   */
  @Get('me/tax-profile')
  async getMine(@GetAuthContext() auth: AuthContext) {
    const profile = await this.service.findByUser(auth.agencyId, auth.userId)
    if (!profile) return null
    return this.stripEncryptedFields(profile)
  }

  /**
   * POST /ic-payouts/me/tax-profile
   * Creates the tax profile for the current user.
   */
  @Post('me/tax-profile')
  @UsePipes(zodValidation(createIcTaxProfileSchema))
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() body: CreateIcTaxProfileDto,
  ) {
    const profile = await this.service.create(auth.agencyId, auth.userId, body)
    return this.stripEncryptedFields(profile)
  }

  /**
   * PATCH /ic-payouts/me/tax-profile
   * Updates allowed fields on the current user's profile.
   * Policy fields (autoDisburse, approvalCeilingCents) are rejected for non-admins
   * by the service layer.
   */
  @Patch('me/tax-profile')
  @UsePipes(zodValidation(updateIcTaxProfileSchema))
  async updateMine(
    @GetAuthContext() auth: AuthContext,
    @Body() body: UpdateIcTaxProfileDto,
  ) {
    const profile = await this.service.update(auth.agencyId, auth.userId, body, { isAdmin: false })
    return this.stripEncryptedFields(profile)
  }

  /**
   * PATCH /ic-payouts/admin/users/:userId/tax-profile/policy
   * Admin-only: update disbursement policy fields on another user's tax profile.
   */
  @Patch('admin/users/:userId/tax-profile/policy')
  @AdminOnly()
  @UsePipes(zodValidation(updatePolicySchema))
  async updatePolicyAdmin(
    @GetAuthContext() auth: AuthContext,
    @Param('userId') userId: string,
    @Body() body: UpdatePolicyDto,
  ) {
    const profile = await this.service.update(auth.agencyId, userId, body, { isAdmin: true })
    if (!profile) throw new NotFoundException('IC tax profile not found')
    return this.stripEncryptedFields(profile)
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Strips encrypted fields from the profile before returning to the client.
   * NEVER expose sinOrBnEncrypted or encryptionKeyVersion over the API.
   */
  private stripEncryptedFields(profile: Record<string, unknown>) {
    const { sinOrBnEncrypted: _sinOrBnEncrypted, encryptionKeyVersion: _encryptionKeyVersion, ...safe } = profile as {
      sinOrBnEncrypted?: unknown
      encryptionKeyVersion?: unknown
      [key: string]: unknown
    }
    return safe
  }
}
