import { Controller, Post, Param, Body } from '@nestjs/common'
import { EnrichmentService } from './enrichment.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
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
  @AdminOnly()
  async backfillTes(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { dryRun?: boolean; tripIds?: string[] },
  ) {
    return this.enrichmentService.backfillTes(auth, body?.dryRun, body?.tripIds)
  }
}
