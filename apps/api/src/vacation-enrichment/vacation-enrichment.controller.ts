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
import { eq, count, lt } from 'drizzle-orm'

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
    const [{ total }] = await this.db.client
      .select({ total: count(vacationHotels.id) })
      .from(vacationHotels)
      .where(eq(vacationHotels.isActive, true))

    // Enriched count
    const [{ enriched }] = await this.db.client
      .select({ enriched: count(vacationHotelEnrichment.id) })
      .from(vacationHotelEnrichment)

    // Stale count (expiresAt < now)
    const [{ stale }] = await this.db.client
      .select({ stale: count(vacationHotelEnrichment.id) })
      .from(vacationHotelEnrichment)
      .where(lt(vacationHotelEnrichment.expiresAt, new Date()))

    const unenriched = total - enriched

    return {
      total,
      enriched,
      stale,
      unenriched,
    }
  }
}
