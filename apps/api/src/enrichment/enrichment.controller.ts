import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common'
import { EnrichmentService } from './enrichment.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import type { AuthContext } from '../auth/auth.types'

@Controller('enrichment')
export class EnrichmentController {
  constructor(private readonly enrichmentService: EnrichmentService) {}

  @Post('activities/:activityId')
  async enrichActivity(
    @Param('activityId') activityId: string,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.enrichmentService.enrichActivity(activityId, auth)
  }

  @Post('trips/:tripId')
  async enrichTrip(
    @Param('tripId') tripId: string,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.enrichmentService.enrichTrip(tripId, auth)
  }

  @Post('trips/:tripId/publish')
  async publishTrip(
    @Param('tripId') tripId: string,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.enrichmentService.publishTrip(tripId, auth)
  }

  @Post('backfill/tes')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async backfillTes(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { dryRun?: boolean; tripIds?: string[] },
  ) {
    return this.enrichmentService.backfillTes(auth, body?.dryRun, body?.tripIds)
  }
}
