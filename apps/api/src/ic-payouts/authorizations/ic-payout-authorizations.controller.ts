/**
 * IcPayoutAuthorizationsController
 *
 * REST API endpoints for IC agent RCTI (Recipient-Created Tax Invoice) authorizations.
 *
 * Routes:
 *   POST /ic-payouts/me/authorization        — accept RCTI (multipart: signature PNG + JSON body)
 *   GET  /ic-payouts/me/authorization/active — return current active authorization or null
 */

import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiConsumes } from '@nestjs/swagger'
import { eq } from 'drizzle-orm'
import type { Request } from 'express'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { IcPayoutAuthorizationsService } from './ic-payout-authorizations.service'
import { IcTaxProfilesService } from '../ic-tax-profiles/ic-tax-profiles.service'

@ApiTags('IC Payouts')
@Controller('ic-payouts')
export class IcPayoutAuthorizationsController {
  constructor(
    private readonly service: IcPayoutAuthorizationsService,
    private readonly taxProfilesService: IcTaxProfilesService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * POST /ic-payouts/me/authorization
   * Accept the RCTI agreement.
   *
   * Expects multipart/form-data with:
   *   - `signature` (file, PNG image)
   *   - `payerTaxRegistrationAttested` (string "true"/"false")
   *   - `recipientTaxRegistrationAttested` (string "true"/"false")
   *
   * Requires the user to have an existing tax profile.
   */
  @Post('me/authorization')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('signature'))
  async accept(
    @GetAuthContext() auth: AuthContext,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      payerTaxRegistrationAttested?: string
      recipientTaxRegistrationAttested?: string
    },
  ) {
    if (!file) {
      throw new BadRequestException('Signature PNG file is required')
    }

    const [agencyLegalName, taxProfile] = await Promise.all([
      this.getAgencyLegalName(auth.agencyId),
      this.taxProfilesService.findByUser(auth.agencyId, auth.userId),
    ])

    if (!taxProfile) {
      throw new BadRequestException('Tax profile must be created before accepting RCTI authorization')
    }

    const acceptedIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.ip
      ?? 'unknown'

    return this.service.accept({
      agencyId: auth.agencyId,
      userId: auth.userId,
      agencyLegalName,
      icLegalName: taxProfile.legalName,
      acceptedIp,
      signaturePngBytes: file.buffer,
      payerTaxRegistrationAttested: body.payerTaxRegistrationAttested === 'true',
      recipientTaxRegistrationAttested: body.recipientTaxRegistrationAttested === 'true',
    })
  }

  /**
   * GET /ic-payouts/me/authorization/active
   * Returns the current active RCTI authorization or null if none exists.
   */
  @Get('me/authorization/active')
  async getActive(@GetAuthContext() auth: AuthContext) {
    return this.service.getActive(auth.agencyId, auth.userId)
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves the agency's legal name for the RCTI agreement text.
   * Tries agency_tax_filing_config first (canonical legal name),
   * falls back to agencies.name if no config exists.
   */
  private async getAgencyLegalName(agencyId: string): Promise<string> {
    const [config] = await this.db.client
      .select({ legalName: schema.agencyTaxFilingConfig.legalName })
      .from(schema.agencyTaxFilingConfig)
      .where(eq(schema.agencyTaxFilingConfig.agencyId, agencyId))
      .limit(1)

    if (config?.legalName) {
      return config.legalName
    }

    // Fallback: use the agency's display name
    const [agency] = await this.db.client
      .select({ name: schema.agencies.name })
      .from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId))
      .limit(1)

    return agency?.name ?? agencyId
  }
}
