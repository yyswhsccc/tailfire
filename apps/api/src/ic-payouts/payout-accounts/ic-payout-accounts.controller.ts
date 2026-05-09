/**
 * IcPayoutAccountsController
 *
 * REST API endpoints for IC agent payout accounts.
 *
 * All routes are scoped to the authenticated user's agency.
 * Encrypted fields (detailsEncrypted) are NEVER returned — only the mask.
 *
 * Routes:
 *   GET    /ic-payouts/me/accounts      — list current user's accounts
 *   POST   /ic-payouts/me/accounts      — create account
 *   DELETE /ic-payouts/me/accounts/:id  — archive account (soft delete)
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { zodValidation } from '../../common/pipes'
import { IcPayoutAccountsService } from './ic-payout-accounts.service'
import { createPayoutAccountSchema, type CreatePayoutAccountDto } from './dto/create-payout-account.dto'

@ApiTags('IC Payouts')
@Controller('ic-payouts')
export class IcPayoutAccountsController {
  constructor(private readonly service: IcPayoutAccountsService) {}

  /**
   * GET /ic-payouts/me/accounts
   * Returns the current user's payout accounts (mask only — no raw banking details).
   */
  @Get('me/accounts')
  async listMine(@GetAuthContext() auth: AuthContext) {
    const accounts = await this.service.listForUser(auth.agencyId, auth.userId)
    return accounts.map((a) => this.stripEncryptedFields(a))
  }

  /**
   * POST /ic-payouts/me/accounts
   * Creates a payout account for the current user.
   * Requires an active RCTI authorization (enforced by service layer).
   */
  @Post('me/accounts')
  @UsePipes(zodValidation(createPayoutAccountSchema))
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() body: CreatePayoutAccountDto,
  ) {
    const account = await this.service.create(auth.agencyId, auth.userId, body)
    return this.stripEncryptedFields(account)
  }

  /**
   * DELETE /ic-payouts/me/accounts/:id
   * Archives a payout account (soft delete). Returns 204 No Content.
   */
  @Delete('me/accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.service.archive(auth.agencyId, auth.userId, id)
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Strips encrypted fields before returning to the client.
   * NEVER expose detailsEncrypted or encryptionKeyVersion over the API.
   */
  private stripEncryptedFields(account: Record<string, unknown>) {
    const { detailsEncrypted: _detailsEncrypted, encryptionKeyVersion: _encryptionKeyVersion, ...safe } = account as {
      detailsEncrypted?: unknown
      encryptionKeyVersion?: unknown
      [key: string]: unknown
    }
    return safe
  }
}
