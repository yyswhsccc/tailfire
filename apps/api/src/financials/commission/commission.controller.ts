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
 *
 * RBAC: admin sees all, agent sees only their own data.
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CommissionService } from './commission.service'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
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
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateCommissionCheckDto
  ): Promise<CommissionCheckResponseDto> {
    return this.commissionService.createCheck(auth.agencyId, dto, auth.userId)
  }

  @Get('commission/checks')
  async getChecks(
    @GetAuthContext() auth: AuthContext,
    @Query() filter: CommissionCheckFilterDto
  ): Promise<PaginatedCommissionChecksResponseDto> {
    // Non-admin users only see checks where they are the recipient
    if (auth.role !== 'admin') {
      filter.recipientUserId = auth.userId
    }
    return this.commissionService.getChecks(auth.agencyId, filter)
  }

  @Get('commission/checks/:id')
  async getCheckDetail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    return this.commissionService.getCheckDetail(auth.agencyId, id)
  }

  @Patch('commission/checks/:id')
  async updateCheck(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionCheckDto
  ): Promise<CommissionCheckResponseDto> {
    return this.commissionService.updateCheck(auth.agencyId, id, dto, auth.userId)
  }

  // ============================================================================
  // STATUS TRANSITIONS
  // ============================================================================

  @Post('commission/checks/:id/accept')
  async acceptCheck(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    return this.commissionService.acceptCheck(auth.agencyId, id, auth.userId)
  }

  @Post('commission/checks/:id/recall')
  async recallCheck(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<CommissionCheckResponseDto> {
    return this.commissionService.recallCheck(auth.agencyId, id, auth.userId)
  }

  // ============================================================================
  // CHECK ITEMS (RECONCILIATION)
  // ============================================================================

  @Post('commission/checks/:id/items')
  async addCheckItem(
    @GetAuthContext() auth: AuthContext,
    @Param('id') checkId: string,
    @Body() dto: AddCheckItemDto
  ): Promise<CommissionCheckItemResponseDto> {
    return this.commissionService.addCheckItem(auth.agencyId, checkId, dto)
  }

  @Delete('commission/checks/:id/items/:itemId')
  async removeCheckItem(
    @GetAuthContext() auth: AuthContext,
    @Param('id') checkId: string,
    @Param('itemId') itemId: string
  ): Promise<{ success: boolean }> {
    return this.commissionService.removeCheckItem(auth.agencyId, checkId, itemId)
  }

  // ============================================================================
  // PER-ACTIVITY COMMISSION
  // ============================================================================

  @Post('activities/:id/commission')
  async upsertActivityCommission(
    @GetAuthContext() auth: AuthContext,
    @Param('id') activityPricingId: string,
    @Body() dto: UpsertActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    return this.commissionService.upsertActivityCommission(auth.agencyId, activityPricingId, dto)
  }

  @Get('activities/:id/commission')
  async getActivityCommission(
    @GetAuthContext() auth: AuthContext,
    @Param('id') activityPricingId: string
  ): Promise<ActivityCommissionResponseDto> {
    return this.commissionService.getActivityCommission(auth.agencyId, activityPricingId)
  }

  @Patch('activities/:id/commission')
  async updateActivityCommission(
    @GetAuthContext() auth: AuthContext,
    @Param('id') activityPricingId: string,
    @Body() dto: UpdateActivityCommissionDto
  ): Promise<ActivityCommissionResponseDto> {
    return this.commissionService.updateActivityCommission(auth.agencyId, activityPricingId, dto)
  }

  // ============================================================================
  // AGENT PAYOUTS
  // ============================================================================

  @Get('commission/due')
  async getCommissionDue(@GetAuthContext() auth: AuthContext): Promise<AgentCommissionDueDto[]> {
    // Non-admin users only see their own commission due
    const scopeUserId = auth.role !== 'admin' ? auth.userId : undefined
    return this.commissionService.getCommissionDue(auth.agencyId, scopeUserId)
  }

  @Post('commission/due/pay')
  async payAgents(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: PayAgentDto
  ): Promise<CommissionCheckResponseDto[]> {
    return this.commissionService.payAgents(auth.agencyId, dto, auth.userId)
  }

  /**
   * Agent self-claim endpoint — agents can claim their own payable commission
   */
  @Post('commission/claims/me')
  async claimMyCommission(
    @GetAuthContext() auth: AuthContext,
  ): Promise<CommissionCheckResponseDto[]> {
    return this.commissionService.payAgents(auth.agencyId, {
      userIds: [auth.userId],
    }, auth.userId)
  }

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  @Get('commission/summary')
  async getCommissionSummary(@GetAuthContext() auth: AuthContext): Promise<CommissionSummaryResponseDto> {
    // Non-admin users get their own summary (scoped)
    const scopeUserId = auth.role !== 'admin' ? auth.userId : undefined
    return this.commissionService.getCommissionSummary(auth.agencyId, scopeUserId)
  }
}
