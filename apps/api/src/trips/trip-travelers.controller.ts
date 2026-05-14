/**
 * Trip Travelers Controller
 *
 * REST API endpoints for trip traveler management.
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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TripTravelersService } from './trip-travelers.service'
import { TripAccessService } from './trip-access.service'
import {
  CreateTripTravelerDto,
  UpdateTripTravelerDto,
  TripTravelerFilterDto,
} from './dto'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripTravelerResponseDto,
  CreateTripTravelerDto as CreateTripTravelerDtoInterface,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Trip Travelers')
@Controller('trips/:tripId/travelers')
export class TripTravelersController {
  constructor(
    private readonly tripTravelersService: TripTravelersService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Add a traveler to a trip
   * POST /trips/:tripId/travelers
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() createTripTravelerDto: CreateTripTravelerDto,
    @Query('addToAllActivities') addToAllActivities?: string,
  ): Promise<TripTravelerResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    // Cast to interface type - runtime validation ensures discriminated union is correct
    return this.tripTravelersService.create(
      tripId,
      createTripTravelerDto as CreateTripTravelerDtoInterface,
      auth,
      { addToAllActivities: addToAllActivities === 'true' },
    )
  }

  /**
   * Get all travelers (optionally filtered)
   * GET /trips/:tripId/travelers
   * GET /travelers?tripId=xxx&contactId=yyy
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Query() filters: TripTravelerFilterDto,
  ): Promise<TripTravelerResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    // Merge tripId from route param with query filters
    return this.tripTravelersService.findAll({ ...filters, tripId }, auth)
  }

  /**
   * Get traveler snapshot (contact data as it was when added to trip)
   * GET /trips/:tripId/travelers/:id/snapshot
   * Returns the contactSnapshot stored when the traveler was added
   * NOTE: This must be defined BEFORE the generic :id route
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id/snapshot')
  async getSnapshot(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<any> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripTravelersService.getSnapshot(id, tripId, auth)
  }

  /**
   * Reset traveler snapshot (update snapshot to current contact data)
   * POST /trips/:tripId/travelers/:id/snapshot/reset
   * Updates the snapshot to match the current contact information
   * NOTE: This must be defined BEFORE the generic :id route
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':id/snapshot/reset')
  async resetSnapshot(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<TripTravelerResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripTravelersService.resetSnapshot(id, tripId, auth)
  }

  /**
   * Get a single traveler by ID
   * GET /trips/:tripId/travelers/:id
   * Validates the traveler belongs to the specified trip
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
  ): Promise<TripTravelerResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripTravelersService.findOne(id, tripId, auth)
  }

  /**
   * Update a traveler
   * PATCH /trips/:tripId/travelers/:id
   * Validates the traveler belongs to the specified trip
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() updateTripTravelerDto: UpdateTripTravelerDto,
  ): Promise<TripTravelerResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripTravelersService.update(id, updateTripTravelerDto, tripId, auth)
  }

  /**
   * Remove a traveler from a trip
   * DELETE /trips/:tripId/travelers/:id
   * Validates the traveler belongs to the specified trip
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
    return this.tripTravelersService.remove(id, tripId)
  }
}
