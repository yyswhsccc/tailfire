/**
 * Destinations Controller
 *
 * REST API endpoints for the universal destinations hub.
 * Two auth levels:
 * - Public (no auth) — OTA Server Components read destinations
 * - Admin (JWT) — bootstrap/seed operations
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { DestinationsService } from './destinations.service'
import { DestinationsBootstrapService } from './destinations-bootstrap.service'
import { DestinationEnrichmentService } from './destination-enrichment.service'

@ApiTags('Destinations')
@Controller('destinations')
export class DestinationsController {
  constructor(
    private readonly destinationsService: DestinationsService,
    private readonly bootstrapService: DestinationsBootstrapService,
    private readonly enrichmentService: DestinationEnrichmentService,
  ) {}

  // ============================================================================
  // PUBLIC ENDPOINTS (no auth — for OTA Server Components)
  // ============================================================================

  /**
   * List destinations with optional filters and pagination.
   * GET /destinations
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List destinations with filters and pagination' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by destination type (e.g., port_city, island, region)' })
  @ApiQuery({ name: 'countryCode', required: false, description: 'Filter by 2-letter country code' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name (case-insensitive)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({ status: 200, description: 'Paginated list of destinations' })
  async list(
    @Query('type') type?: string,
    @Query('countryCode') countryCode?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.destinationsService.findAll({
      type,
      countryCode,
      search,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    })
  }

  /**
   * Get a single destination by slug, with port mappings and aliases.
   * GET /destinations/by-slug/:slug
   *
   * Note: uses /by-slug/:slug to avoid collision with /destinations/:id (UUID param).
   */
  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get destination by slug with relations' })
  @ApiParam({ name: 'slug', description: 'Destination URL slug (e.g., miami-fl-us)' })
  @ApiResponse({ status: 200, description: 'Destination found' })
  @ApiResponse({ status: 404, description: 'Destination not found' })
  async getBySlug(@Param('slug') slug: string) {
    return this.destinationsService.findBySlug(slug)
  }

  /**
   * Get paginated cruise sailings at a destination.
   * GET /destinations/by-slug/:slug/cruises
   *
   * Resolves the destination's linked ports and returns active future sailings
   * that stop at any of those ports.
   */
  @Get('by-slug/:slug/cruises')
  @Public()
  @ApiOperation({ summary: 'Get paginated cruise sailings at a destination' })
  @ApiParam({ name: 'slug', description: 'Destination URL slug (e.g., miami-fl-us)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({ status: 200, description: 'Paginated sailings at this destination' })
  @ApiResponse({ status: 404, description: 'Destination not found' })
  async getCruisesAtDestination(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.destinationsService.findCruisesAtDestination(
      slug,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    )
  }

  /**
   * Get tours at a destination (placeholder — tour linkage coming later).
   * GET /destinations/by-slug/:slug/tours
   */
  @Get('by-slug/:slug/tours')
  @Public()
  @ApiOperation({ summary: 'Get tours at a destination (placeholder)' })
  @ApiParam({ name: 'slug', description: 'Destination URL slug' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({ status: 200, description: 'Tours at this destination (currently empty — linkage coming soon)' })
  @ApiResponse({ status: 404, description: 'Destination not found' })
  async getToursAtDestination(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.destinationsService.findToursAtDestination(
      slug,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    )
  }

  // ============================================================================
  // ADMIN ENDPOINTS (JWT auth — requires admin role)
  // ============================================================================

  /**
   * Seed destinations from the cruise ports catalog.
   * POST /destinations/bootstrap/cruise-ports
   *
   * Idempotent — uses ON CONFLICT DO NOTHING, safe to run multiple times.
   */
  @Post('bootstrap/cruise-ports')
  @AdminOnly()
  @ApiOperation({ summary: 'Seed destinations from cruise ports catalog (admin)' })
  @ApiResponse({ status: 200, description: 'Bootstrap results with counts' })
  async bootstrapFromCruisePorts() {
    return this.bootstrapService.seedFromCruisePorts()
  }

  /**
   * Seed destinations from tour catalog cities.
   * POST /destinations/bootstrap/tour-cities
   *
   * Collects distinct city names from tours.start_city, tours.end_city,
   * and tour_itinerary_days.overnight_city. Skips cities that already match
   * an existing destination (by normalized name). Idempotent.
   */
  @Post('bootstrap/tour-cities')
  @AdminOnly()
  @ApiOperation({ summary: 'Seed destinations from tour catalog cities (admin)' })
  @ApiResponse({ status: 200, description: 'Bootstrap results with counts: { created, matched, totalCities }' })
  async bootstrapFromTourCities() {
    return this.bootstrapService.seedFromTourCities()
  }

  /**
   * Refresh all stale destination enrichments.
   * POST /destinations/enrich-stale
   *
   * Finds cache entries past their refresh_after_at and re-enriches them.
   * Note: This route is defined BEFORE :id/enrich to avoid NestJS treating
   * "enrich-stale" as a UUID param.
   */
  @Post('enrich-stale')
  @AdminOnly()
  @ApiOperation({ summary: 'Refresh all stale destination enrichments (admin)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max destinations to refresh (default: 50)' })
  @ApiResponse({ status: 200, description: 'Refresh results with counts' })
  async refreshStale(@Query('limit') limit?: string) {
    return this.enrichmentService.refreshStaleDestinations(
      limit ? parseInt(limit, 10) : 50,
    )
  }

  /**
   * Backfill hero images from Unsplash for destinations without images.
   * POST /destinations/backfill-hero-images
   *
   * Lightweight fallback for destinations that don't have TripAdvisor enrichment.
   * Stores Unsplash attribution in destination metadata JSONB.
   */
  @Post('backfill-hero-images')
  @AdminOnly()
  @ApiOperation({ summary: 'Backfill hero images from Unsplash for destinations without images' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max destinations to process (default: 500)' })
  @ApiResponse({ status: 200, description: 'Backfill results with counts' })
  async backfillHeroImages(@Query('limit') limit?: string) {
    return this.enrichmentService.backfillHeroImages(limit ? parseInt(limit, 10) : 500)
  }

  /**
   * Trigger enrichment for a single destination.
   * POST /destinations/:id/enrich
   *
   * Fetches TripAdvisor data via SerpAPI and caches the results.
   * Idempotent — returns cache_hit if data is still fresh.
   */
  @Post(':id/enrich')
  @AdminOnly()
  @ApiOperation({ summary: 'Trigger enrichment for a single destination (admin)' })
  @ApiParam({ name: 'id', description: 'Destination UUID' })
  @ApiResponse({ status: 200, description: 'Enrichment result status' })
  async enrichDestination(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrichmentService.enrichDestination(id)
  }
}
