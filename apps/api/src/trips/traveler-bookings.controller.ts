/**
 * Traveler Bookings Controller
 *
 * REST API endpoints for managing per-traveler booking records on activities.
 *
 * Routes:
 * - GET /activities/:activityId/traveler-bookings — list bookings for activity
 * - POST /activities/:activityId/traveler-bookings — create booking
 * - PATCH /traveler-bookings/:id — update booking
 * - DELETE /traveler-bookings/:id — delete booking
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger'
import { TravelerBookingsService } from './traveler-bookings.service'
import { ActivitiesService } from './activities.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  TravelerBookingDto,
  CreateTravelerBookingDto,
  UpdateTravelerBookingDto,
} from '@tailfire/shared-types'

@ApiTags('Traveler Bookings')
@Controller()
export class TravelerBookingsController {
  constructor(
    private readonly travelerBookingsService: TravelerBookingsService,
    private readonly activitiesService: ActivitiesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * List all traveler bookings for a trip (batch fetch)
   */
  @Get('trips/:tripId/traveler-bookings')
  @ApiOperation({ summary: 'List all traveler bookings for a trip' })
  @ApiParam({ name: 'tripId', description: 'Trip UUID' })
  @ApiResponse({ status: 200, description: 'List of all traveler bookings in the trip' })
  async listByTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ): Promise<TravelerBookingDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.travelerBookingsService.findByTripId(tripId)
  }

  /**
   * List traveler bookings for an activity
   */
  @Get('activities/:activityId/traveler-bookings')
  @ApiOperation({ summary: 'List traveler bookings for an activity' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, description: 'List of traveler bookings' })
  async list(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string,
  ): Promise<TravelerBookingDto[]> {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth)
    return this.travelerBookingsService.findByActivityId(activityId)
  }

  /**
   * Create a traveler booking for an activity
   */
  @Post('activities/:activityId/traveler-bookings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a traveler booking' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 201, description: 'Traveler booking created' })
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: CreateTravelerBookingDto,
  ): Promise<TravelerBookingDto> {
    const tripId = await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.travelerBookingsService.create(activityId, auth.agencyId, dto, tripId)
  }

  /**
   * Update a traveler booking
   */
  @Patch('traveler-bookings/:id')
  @ApiOperation({ summary: 'Update a traveler booking' })
  @ApiParam({ name: 'id', description: 'Traveler booking UUID' })
  @ApiResponse({ status: 200, description: 'Traveler booking updated' })
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTravelerBookingDto,
  ): Promise<TravelerBookingDto> {
    const activityId = await this.travelerBookingsService.getActivityIdForBooking(id)
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.travelerBookingsService.update(id, dto)
  }

  /**
   * Delete a traveler booking
   */
  @Delete('traveler-bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a traveler booking' })
  @ApiParam({ name: 'id', description: 'Traveler booking UUID' })
  @ApiResponse({ status: 204, description: 'Traveler booking deleted' })
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const activityId = await this.travelerBookingsService.getActivityIdForBooking(id)
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.travelerBookingsService.delete(id)
  }
}
