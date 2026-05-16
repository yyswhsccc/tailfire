/**
 * Commission Adjustments Controller
 *
 * REST API endpoints for commission adjustment management.
 * Tax-aware fields (taxType, taxRate) eliminate the manual adjustment
 * workaround used in TraveleSolutions.
 */

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { ApiTags } from '@nestjs/swagger'
import { CommissionAdjustmentsService } from './commission-adjustments.service'
import type {
  CreateCommissionAdjustmentDto,
  UpdateCommissionAdjustmentDto,
  CommissionAdjustmentResponseDto,
  CommissionAdjustmentFilterDto,
  PaginatedCommissionAdjustmentsResponseDto,
} from './commission.types'

@ApiTags('Commission Adjustments')
@Controller()
export class CommissionAdjustmentsController {
  constructor(private readonly adjustmentsService: CommissionAdjustmentsService) {}

  /**
   * POST /commission/adjustments
   * PR-1: admin-only. Creating an adjustment writes to the agent payout
   * ledger; ICs cannot self-issue adjustments to their own commission.
   */
  @Post('commission/adjustments')
  @AdminOnly()
  async createAdjustment(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateCommissionAdjustmentDto
  ): Promise<CommissionAdjustmentResponseDto> {
    return this.adjustmentsService.createAdjustment(auth.agencyId, dto, auth.userId)
  }

  /**
   * GET /commission/adjustments
   * Non-admins see only their own adjustments (server-side enforced via
   * agentUserId filter; the client cannot widen scope).
   */
  @Get('commission/adjustments')
  async getAdjustments(
    @GetAuthContext() auth: AuthContext,
    @Query() filter: CommissionAdjustmentFilterDto
  ): Promise<PaginatedCommissionAdjustmentsResponseDto> {
    if (auth.role !== 'admin') {
      filter.agentUserId = auth.userId
    }
    return this.adjustmentsService.getAdjustments(auth.agencyId, filter)
  }

  /**
   * PATCH /commission/adjustments/:id
   * PR-1: admin-only. Editing tax, amount, or status reaches the financial
   * ledger.
   */
  @Patch('commission/adjustments/:id')
  @AdminOnly()
  async updateAdjustment(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionAdjustmentDto
  ): Promise<CommissionAdjustmentResponseDto> {
    return this.adjustmentsService.updateAdjustment(auth.agencyId, id, dto)
  }

  /**
   * POST /commission/adjustments/:id/reconcile
   * PR-1: admin-only. Flip a pending adjustment to reconciled explicitly
   * (mirrors the implicit auto-reconcile that happens during claim
   * submission). Used when an admin wants to clear an outstanding
   * adjustment without waiting for the IC to claim it.
   */
  @Post('commission/adjustments/:id/reconcile')
  @AdminOnly()
  async reconcileAdjustment(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
  ): Promise<CommissionAdjustmentResponseDto> {
    return this.adjustmentsService.setStatus(auth.agencyId, id, 'reconciled', {
      actorUserId: auth.userId,
      reason: body.reason ?? null,
    })
  }

  /**
   * POST /commission/adjustments/:id/unreconcile
   * PR-1: admin-only signed transition — reason REQUIRED. Reopens a
   * previously-reconciled adjustment.
   */
  @Post('commission/adjustments/:id/unreconcile')
  @AdminOnly()
  async unreconcileAdjustment(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
  ): Promise<CommissionAdjustmentResponseDto> {
    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('unreconcile requires a reason')
    }
    return this.adjustmentsService.setStatus(auth.agencyId, id, 'pending', {
      actorUserId: auth.userId,
      reason: body.reason,
    })
  }

  /**
   * DELETE /commission/adjustments/:id
   * Admin-only. Deletes a PENDING adjustment outright. Reconciled
   * adjustments are protected and must be unwound by cancelling the
   * parent check / invoice first.
   */
  @Delete('commission/adjustments/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAdjustment(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.adjustmentsService.deleteAdjustment(auth.agencyId, id)
  }
}
