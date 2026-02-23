/**
 * Itineraries Controller
 *
 * REST API endpoints for trip itinerary management.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ItinerariesService } from './itineraries.service'
import { ItineraryVersionsService } from './itinerary-versions.service'
import { ItineraryCloneService } from '../templates/itinerary-clone.service'
import { TripAccessService } from './trip-access.service'
import {
  CreateItineraryDto,
  UpdateItineraryDto,
  ItineraryFilterDto,
  PublishItineraryBodyDto,
} from './dto'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  ItineraryResponseDto,
  ItineraryVersionSummaryDto,
  SharedItineraryDto,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Itineraries')
@Controller('trips/:tripId/itineraries')
export class ItinerariesController {
  constructor(
    private readonly itinerariesService: ItinerariesService,
    private readonly itineraryVersionsService: ItineraryVersionsService,
    private readonly itineraryCloneService: ItineraryCloneService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Create a new itinerary for a trip
   * POST /trips/:tripId/itineraries
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() createItineraryDto: CreateItineraryDto,
  ): Promise<ItineraryResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itinerariesService.create(tripId, createItineraryDto)
  }

  /**
   * Get all itineraries (optionally filtered)
   * GET /trips/:tripId/itineraries
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Query() filters: ItineraryFilterDto,
  ): Promise<ItineraryResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    // Merge tripId from route param with query filters
    return this.itinerariesService.findAll({ ...filters, tripId })
  }

  /**
   * Get a single itinerary by ID
   * GET /trips/:tripId/itineraries/:id
   * Validates the itinerary belongs to the specified trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<ItineraryResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.itinerariesService.findOne(id, tripId)
  }

  /**
   * Select an itinerary as the active option for a trip
   * PATCH /trips/:tripId/itineraries/:id/select
   * Sets isSelected=true for this itinerary and false for all others in the trip
   * NOTE: Must come before generic :id route to prevent route matching conflicts
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':id/select')
  async selectItinerary(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<ItineraryResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itinerariesService.selectItinerary(id, tripId)
  }

  /**
   * Duplicate an itinerary within the same trip
   * POST /trips/:tripId/itineraries/:id/duplicate
   *
   * Creates a copy of the itinerary with all days and activities.
   * Access check: User must have write access to the trip.
   */
  @Post(':id/duplicate')
  async duplicateItinerary(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<ItineraryResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itineraryCloneService.duplicateItinerary(tripId, id, auth.userId)
  }

  /**
   * Publish a new version of an itinerary
   * POST /trips/:tripId/itineraries/:id/publish
   * Creates a JSONB snapshot of the itinerary content for the shared proposal page.
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':id/publish')
  async publishVersion(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() body: PublishItineraryBodyDto,
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itineraryVersionsService.publishVersion(tripId, id, auth.userId, body.changeSummary)
  }

  /**
   * Get version history for an itinerary
   * GET /trips/:tripId/itineraries/:id/versions
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id/versions')
  async getVersions(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<ItineraryVersionSummaryDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.itineraryVersionsService.getVersions(tripId, id)
  }

  /**
   * Get a specific version snapshot
   * GET /trips/:tripId/itineraries/:id/versions/:version
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id/versions/:version')
  async getVersionSnapshot(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<SharedItineraryDto | null> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.itineraryVersionsService.getVersionSnapshot(tripId, id, version)
  }

  /**
   * Update an itinerary
   * PATCH /trips/:tripId/itineraries/:id
   * Validates the itinerary belongs to the specified trip
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() updateItineraryDto: UpdateItineraryDto,
  ): Promise<ItineraryResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itinerariesService.update(id, updateItineraryDto, tripId)
  }

  /**
   * Delete an itinerary
   * DELETE /trips/:tripId/itineraries/:id
   * Validates the itinerary belongs to the specified trip
   *
   * Access check: User must have write access to the trip.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.itinerariesService.remove(id, tripId)
  }
}
