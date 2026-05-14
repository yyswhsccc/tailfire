/**
 * Commission Adjustments Controller
 *
 * REST API endpoints for commission adjustment management.
 * Tax-aware fields (taxType, taxRate) eliminate the manual adjustment
 * workaround used in TraveleSolutions.
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
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

  @Post('commission/adjustments')
  async createAdjustment(
    @Req() req: any,
    @Body() dto: CreateCommissionAdjustmentDto
  ): Promise<CommissionAdjustmentResponseDto> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.adjustmentsService.createAdjustment(agencyId, dto, userId)
  }

  @Get('commission/adjustments')
  async getAdjustments(
    @Req() req: any,
    @Query() filter: CommissionAdjustmentFilterDto
  ): Promise<PaginatedCommissionAdjustmentsResponseDto> {
    const agencyId = req.user?.agencyId
    return this.adjustmentsService.getAdjustments(agencyId, filter)
  }

  @Patch('commission/adjustments/:id')
  async updateAdjustment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionAdjustmentDto
  ): Promise<CommissionAdjustmentResponseDto> {
    const agencyId = req.user?.agencyId
    return this.adjustmentsService.updateAdjustment(agencyId, id, dto)
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
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<void> {
    const agencyId = req.user?.agencyId
    await this.adjustmentsService.deleteAdjustment(agencyId, id)
  }
}
