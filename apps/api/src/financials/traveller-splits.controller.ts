/**
 * Traveller Splits Controller
 *
 * REST API endpoints for activity traveller splits.
 *
 * Endpoints:
 * - GET /activities/:activityId/splits - Get splits for an activity
 * - PUT /activities/:activityId/splits - Set splits for an activity (replaces all)
 * - DELETE /activities/:activityId/splits - Delete all splits for an activity
 * - GET /trips/:tripId/travellers/:travellerId/splits - Get all splits for a traveller
 */

import { Controller, Get, Put, Delete, Param, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TravellerSplitsService } from './traveller-splits.service'
import { TripAccessService } from '../trips/trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  SetActivitySplitsDto,
  ActivitySplitsSummaryResponseDto,
  ActivityTravellerSplitResponseDto,
} from '@tailfire/shared-types'

@ApiTags('Traveller Splits')
@Controller()
export class TravellerSplitsController {
  constructor(
    private readonly splitsService: TravellerSplitsService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get splits summary for an activity
   * GET /activities/:activityId/splits
   */
  @Get('activities/:activityId/splits')
  async getActivitySplits(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string
  ): Promise<ActivitySplitsSummaryResponseDto> {
    return this.splitsService.getActivitySplits(activityId, auth)
  }

  /**
   * Set splits for an activity (PUT semantics - replaces all existing splits)
   * PUT /activities/:activityId/splits
   *
   * If splitType is 'equal', auto-calculates equal amounts for all trip travellers
   * If splitType is 'custom', uses provided splits (must sum to activity total)
   */
  @Put('activities/:activityId/splits')
  async setActivitySplits(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Body() dto: SetActivitySplitsDto
  ): Promise<ActivitySplitsSummaryResponseDto> {
    return this.splitsService.setActivitySplits(activityId, dto, auth.userId, auth)
  }

  /**
   * Delete all splits for an activity
   * DELETE /activities/:activityId/splits
   */
  @Delete('activities/:activityId/splits')
  async deleteActivitySplits(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
  ): Promise<{ success: boolean }> {
    await this.splitsService.deleteActivitySplits(activityId, auth)
    return { success: true }
  }

  /**
   * Get all splits for a traveller across a trip
   * GET /trips/:tripId/travellers/:travellerId/splits
   */
  @Get('trips/:tripId/travellers/:travellerId/splits')
  async getTravellerSplits(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('travellerId') travellerId: string
  ): Promise<ActivityTravellerSplitResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.splitsService.getTravellerSplits(tripId, travellerId)
  }
}
