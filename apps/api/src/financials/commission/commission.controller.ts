/**
 * Commission Controller
 *
 * REST API endpoints for commission check management:
 * - CRUD for commission checks (received from suppliers, paid to agents)
 * - Reconciliation (add/remove bookings to checks)
 * - Status transitions (accept, recall)
 * - Per-activity commission tracking
 * - Agent payout calculation
 * - Dashboard summary
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CommissionService } from './commission.service'
import type {
  CommissionCheckResponseDto,
  CommissionCheckFilterDto,
  PaginatedCommissionChecksResponseDto,
  CreateCommissionCheckDto,
  UpdateCommissionCheckDto,
  AddCheckItemDto,
  CommissionCheckItemResponseDto,
  UpsertActivityCommissionDto,
  UpdateActivityCommissionDto,
  ActivityCommissionResponseDto,
  AgentCommissionDueDto,
  PayAgentDto,
  CommissionSummaryResponseDto,
} from './commission.types'

@ApiTags('Commission')
@Controller()
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  // ============================================================================
  // CHECK MANAGEMENT
  // ============================================================================

  @Post('commission/checks')
  async createCheck(
    @Req() req: any,
    @Body() dto: CreateCommissionCheckDto
  ): Promise<CommissionCheckResponseDto> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.commissionService.createCheck(agencyId, dto, userId)
  }

  @Get('commission/checks')
  async getChecks(
    @Req() req: any,
    @Query() filter: CommissionCheckFilterDto
  ): Promise<PaginatedCommissionChecksResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.getChecks(agencyId, filter)
  }

  @Get('commission/checks/:id')
  async getCheckDetail(
    @Req() req: any,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.getCheckDetail(agencyId, id)
  }

  @Patch('commission/checks/:id')
  async updateCheck(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionCheckDto
  ): Promise<CommissionCheckResponseDto> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.commissionService.updateCheck(agencyId, id, dto, userId)
  }

  // ============================================================================
  // STATUS TRANSITIONS
  // ============================================================================

  @Post('commission/checks/:id/accept')
  async acceptCheck(
    @Req() req: any,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.commissionService.acceptCheck(agencyId, id, userId)
  }

  @Post('commission/checks/:id/recall')
  async recallCheck(
    @Req() req: any,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.commissionService.recallCheck(agencyId, id, userId)
  }

  // ============================================================================
  // CHECK ITEMS (RECONCILIATION)
  // ============================================================================

  @Post('commission/checks/:id/items')
  async addCheckItem(
    @Req() req: any,
    @Param('id') checkId: string,
    @Body() dto: AddCheckItemDto
  ): Promise<CommissionCheckItemResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.addCheckItem(agencyId, checkId, dto)
  }

  @Delete('commission/checks/:id/items/:itemId')
  async removeCheckItem(
    @Req() req: any,
    @Param('id') checkId: string,
    @Param('itemId') itemId: string
  ): Promise<{ success: boolean }> {
    const agencyId = req.user?.agencyId
    return this.commissionService.removeCheckItem(agencyId, checkId, itemId)
  }

  // ============================================================================
  // PER-ACTIVITY COMMISSION
  // ============================================================================

  @Post('activities/:id/commission')
  async upsertActivityCommission(
    @Req() req: any,
    @Param('id') activityPricingId: string,
    @Body() dto: UpsertActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.upsertActivityCommission(agencyId, activityPricingId, dto)
  }

  @Get('activities/:id/commission')
  async getActivityCommission(
    @Req() req: any,
    @Param('id') activityPricingId: string
  ): Promise<ActivityCommissionResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.getActivityCommission(agencyId, activityPricingId)
  }

  @Patch('activities/:id/commission')
  async updateActivityCommission(
    @Req() req: any,
    @Param('id') activityPricingId: string,
    @Body() dto: UpdateActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.updateActivityCommission(agencyId, activityPricingId, dto)
  }

  // ============================================================================
  // AGENT PAYOUTS
  // ============================================================================

  @Get('commission/due')
  async getCommissionDue(@Req() req: any): Promise<AgentCommissionDueDto[]> {
    const agencyId = req.user?.agencyId
    return this.commissionService.getCommissionDue(agencyId)
  }

  @Post('commission/due/pay')
  async payAgents(
    @Req() req: any,
    @Body() dto: PayAgentDto
  ): Promise<CommissionCheckResponseDto[]> {
    const agencyId = req.user?.agencyId
    const userId = req.user?.userId
    return this.commissionService.payAgents(agencyId, dto, userId)
  }

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  @Get('commission/summary')
  async getCommissionSummary(@Req() req: any): Promise<CommissionSummaryResponseDto> {
    const agencyId = req.user?.agencyId
    return this.commissionService.getCommissionSummary(agencyId)
  }
}
