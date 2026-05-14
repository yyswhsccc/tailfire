/**
 * AgencyTaxFilingController
 *
 * Admin-only endpoints for managing the agency's CRA payer identity used on T4A slips.
 *
 * Routes:
 *   GET  /ic-payouts/admin/tax-filing-config  — fetch current config (null if not yet created)
 *   PUT  /ic-payouts/admin/tax-filing-config  — upsert config (insert or update)
 */

import { Controller, Get, Put, Body, UsePipes } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { zodValidation } from '../../common/pipes'
import { AgencyTaxFilingService } from './agency-tax-filing.service'
import { upsertTaxFilingSchema, type UpsertTaxFilingDto } from './dto/upsert-tax-filing.dto'

@ApiTags('IC Payouts')
@Controller('ic-payouts/admin/tax-filing-config')
@AdminOnly()
export class AgencyTaxFilingController {
  constructor(private readonly service: AgencyTaxFilingService) {}

  /**
   * GET /ic-payouts/admin/tax-filing-config
   * Returns the agency's tax filing config, or null if not yet created.
   */
  @Get()
  async get(@GetAuthContext() auth: AuthContext) {
    return this.service.get(auth.agencyId)
  }

  /**
   * PUT /ic-payouts/admin/tax-filing-config
   * Creates or updates the agency's tax filing config.
   */
  @Put()
  @UsePipes(zodValidation(upsertTaxFilingSchema))
  async upsert(@GetAuthContext() auth: AuthContext, @Body() body: UpsertTaxFilingDto) {
    return this.service.upsert(auth.agencyId, auth.userId, {
      ...body,
      // Normalize empty strings to undefined so the service stores null in DB
      transmitterNumber: body.transmitterNumber || undefined,
      filingContactEmail: body.filingContactEmail || undefined,
    })
  }
}
