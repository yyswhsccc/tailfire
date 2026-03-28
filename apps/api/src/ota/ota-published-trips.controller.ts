/**
 * OTA Published Trips Controller
 *
 * Two auth levels:
 * - Public (@Public) — OTA Server Components read published trips by slug
 * - Admin (JWT, global guard) — publish, update, refresh, delete
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { OtaPublishedTripsService } from './ota-published-trips.service'
import { PublishTripDto, UpdatePublishedTripDto } from './dto/publish-trip.dto'

@ApiTags('OTA Published Trips')
@Controller('ota/published-trips')
export class OtaPublishedTripsController {
  constructor(private readonly publishedTripsService: OtaPublishedTripsService) {}

  // ============================================================================
  // PUBLIC — Fetch by slug (OTA Server Components)
  // ============================================================================

  /**
   * Get a published trip by slug.
   * GET /ota/published-trips/by-slug/:slug
   *
   * Returns null → 404 when the row doesn't exist or isPublished=false.
   */
  @Get('by-slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Get a published trip by slug (public)' })
  @ApiParam({ name: 'slug', description: 'URL-friendly trip slug' })
  @ApiResponse({ status: 200, description: 'Published trip found' })
  @ApiResponse({ status: 404, description: 'Trip not found or not published' })
  async getBySlug(@Param('slug') slug: string) {
    const trip = await this.publishedTripsService.findBySlug(slug)
    if (!trip) {
      throw new NotFoundException(`Published trip with slug "${slug}" not found`)
    }
    return trip
  }

  // ============================================================================
  // ADMIN — Publish, update, refresh, delete (JWT — global guard)
  // ============================================================================

  /**
   * Publish a template as a new OTA trip listing.
   * POST /ota/published-trips
   */
  @Post()
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish an itinerary template as an OTA trip (admin)' })
  @ApiResponse({ status: 201, description: 'Published trip created' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async publish(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: PublishTripDto,
  ) {
    return this.publishedTripsService.publish(dto, auth.agencyId)
  }

  /**
   * Update published trip metadata.
   * PUT /ota/published-trips/:id
   */
  @Put(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update published trip metadata (admin)' })
  @ApiParam({ name: 'id', description: 'Published trip UUID' })
  @ApiResponse({ status: 200, description: 'Published trip updated' })
  @ApiResponse({ status: 404, description: 'Published trip not found' })
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePublishedTripDto,
  ) {
    return this.publishedTripsService.update(id, dto, auth.agencyId)
  }

  /**
   * Re-snapshot from the current template data.
   * POST /ota/published-trips/:id/refresh
   */
  @Post(':id/refresh')
  @AdminOnly()
  @ApiOperation({ summary: 'Re-snapshot published trip from current template data (admin)' })
  @ApiParam({ name: 'id', description: 'Published trip UUID' })
  @ApiResponse({ status: 200, description: 'Published trip refreshed' })
  @ApiResponse({ status: 404, description: 'Published trip or source template not found' })
  async refresh(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publishedTripsService.refresh(id, auth.agencyId)
  }

  /**
   * Hard delete a published trip.
   * DELETE /ota/published-trips/:id
   */
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a published trip (admin)' })
  @ApiParam({ name: 'id', description: 'Published trip UUID' })
  @ApiResponse({ status: 204, description: 'Published trip deleted' })
  @ApiResponse({ status: 404, description: 'Published trip not found' })
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publishedTripsService.delete(id, auth.agencyId)
  }
}
