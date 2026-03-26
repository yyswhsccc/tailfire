/**
 * Dashboard Controller
 *
 * API endpoints for dashboard statistics
 */

import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { DashboardService, DashboardStats } from './dashboard.service'
import type { DashboardOverview } from './dto/dashboard-overview.dto'
import { DashboardOverviewQueryDto } from './dto/dashboard-overview.dto'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/stats
   * Returns aggregated statistics for the dashboard (legacy)
   */
  @Get('stats')
  async getStats(@GetAuthContext() auth: AuthContext): Promise<DashboardStats> {
    return this.dashboardService.getStats(auth)
  }

  /**
   * GET /dashboard/overview
   * Returns comprehensive dashboard data for the current user
   */
  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview with KPIs, charts, and widgets' })
  @ApiQuery({ name: 'period', enum: ['mtd', 'ytd', 'lifetime'], required: false })
  @ApiQuery({ name: 'chartYear', type: Number, required: false })
  @ApiQuery({ name: 'includeYoy', type: Boolean, required: false })
  @ApiQuery({ name: 'view', enum: ['personal', 'agency', 'all'], required: false })
  async getOverview(
    @GetAuthContext() auth: AuthContext,
    @Query() query: DashboardOverviewQueryDto,
  ): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(auth, query)
  }
}
