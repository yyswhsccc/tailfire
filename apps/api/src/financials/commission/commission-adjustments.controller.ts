/**
 * Commission Adjustments Controller
 *
 * REST API endpoints for commission adjustment management.
 * Tax-aware fields (taxType, taxRate) eliminate the manual adjustment
 * workaround used in TraveleSolutions.
 */

import { Controller, Get, Post, Patch, Param, Body, Query, Req } from '@nestjs/common'
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
}
