/**
 * API Health Controller
 *
 * Admin-only endpoints for the API Health Dashboard.
 * Provides status overview, provider history, and manual check triggers.
 */

import { Controller, Get, Post, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { ApiHealthService } from './api-health.service'
import type { HealthProviderKey } from './api-health.types'

@ApiTags('API Health')
@Controller('admin/api-health')
export class ApiHealthController {
  constructor(private readonly healthService: ApiHealthService) {}

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'Get latest health status for all providers' })
  async getLatestStatus() {
    return this.healthService.getLatestStatus()
  }

  @Get(':provider/history')
  @AdminOnly()
  @ApiOperation({ summary: 'Get health check history for a provider (last 24h)' })
  async getProviderHistory(
    @Param('provider') provider: string,
    @Query('hours') hours?: string,
  ) {
    const h = hours ? parseInt(hours, 10) : 24
    return this.healthService.getProviderHistory(provider as HealthProviderKey, h)
  }

  @Post(':provider/check')
  @AdminOnly()
  @ApiOperation({ summary: 'Trigger an immediate health check for a provider' })
  async triggerCheck(@Param('provider') provider: string) {
    const result = await this.healthService.checkProvider(provider as HealthProviderKey)
    await this.healthService.checkAndNotify(provider, result)
    return result
  }
}
