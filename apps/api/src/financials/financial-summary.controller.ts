/**
 * Financial Summary Controller
 *
 * REST API endpoint for trip financial summary.
 *
 * Endpoints:
 * - GET /trips/:tripId/financial-summary - Get comprehensive financial summary
 */

import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FinancialSummaryService } from './financial-summary.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type { TripFinancialSummaryResponseDto } from '@tailfire/shared-types'

@ApiTags('Financial Summary')
@Controller()
export class FinancialSummaryController {
  constructor(private readonly financialSummaryService: FinancialSummaryService) {}

  /**
   * Get comprehensive financial summary for a trip
   * GET /trips/:tripId/financial-summary
   */
  @Get('trips/:tripId/financial-summary')
  async getFinancialSummary(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripFinancialSummaryResponseDto> {
    return this.financialSummaryService.getTripFinancialSummary(tripId, auth)
  }
}
