/**
 * Vacation Enrichment Controller
 *
 * Endpoints for dispatching hotel enrichment jobs and viewing enrichment stats.
 * Protected by internal API key (same pattern as vacation-import).
 */

import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiHeader } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { InternalApiKeyGuard } from '../cruise-import/guards/internal-api-key.guard'
import { DatabaseService } from '../db/database.service'
import { EnrichmentDispatcherService } from './services'
import { vacationHotels, vacationHotelEnrichment } from '@tailfire/database'
import { eq, and, count, lt } from 'drizzle-orm'

// ============================================================================
// CONTROLLER
// ============================================================================

@ApiTags('Vacation Enrichment')
@Controller('vacation-enrichment')
@Public() // Bypass JWT auth
@UseGuards(InternalApiKeyGuard) // Require internal API key instead
@ApiHeader({
  name: 'x-internal-api-key',
  description: 'Internal API key for vacation hotel enrichment operations',
  required: true,
})
export class VacationEnrichmentController {
  constructor(
    private readonly enrichmentDispatcher: EnrichmentDispatcherService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * POST /vacation-enrichment/enrich/:hotelId
   *
   * Dispatch an enrichment job for a specific hotel.
   */
  @Post('enrich/:hotelId')
  async enrichHotel(
    @Param('hotelId') hotelId: string,
    @Body() body: { hotelName: string; destination: string },
  ) {
    const jobId = await this.enrichmentDispatcher.dispatchEnrichment(
      hotelId,
      body.hotelName,
      body.destination,
    )

    if (jobId) {
      return { dispatched: true, jobId }
    }

    return { dispatched: false, reason: 'already_queued' }
  }

  /**
   * GET /vacation-enrichment/stats
   *
   * Returns enrichment statistics: total active hotels, enriched, stale, unenriched.
   */
  @Get('stats')
  async getStats() {
    // Total active hotels
    const totalResult = await this.db.client
      .select({ total: count(vacationHotels.id) })
      .from(vacationHotels)
      .where(eq(vacationHotels.isActive, true))
    const total = Number(totalResult[0]?.total ?? 0)

    // Enriched count (only for active hotels)
    const enrichedResult = await this.db.client
      .select({ enriched: count(vacationHotelEnrichment.id) })
      .from(vacationHotelEnrichment)
      .innerJoin(vacationHotels, eq(vacationHotelEnrichment.hotelId, vacationHotels.id))
      .where(eq(vacationHotels.isActive, true))
    const enriched = Number(enrichedResult[0]?.enriched ?? 0)

    // Stale count (expiresAt < now, active hotels only)
    const staleResult = await this.db.client
      .select({ stale: count(vacationHotelEnrichment.id) })
      .from(vacationHotelEnrichment)
      .innerJoin(vacationHotels, eq(vacationHotelEnrichment.hotelId, vacationHotels.id))
      .where(and(eq(vacationHotels.isActive, true), lt(vacationHotelEnrichment.expiresAt, new Date())))
    const stale = Number(staleResult[0]?.stale ?? 0)

    return {
      total,
      enriched,
      stale,
      unenriched: total - enriched,
    }
  }
}
