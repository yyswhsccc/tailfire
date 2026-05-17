/**
 * Activity Bookings Controller
 *
 * REST API endpoints for managing activity booking status.
 *
 * Key Distinction:
 * - Activity = Core entity (tour, flight, dining, transportation, custom-cruise, package, etc.)
 * - Package = An activity type that holds sub-activities
 * - Booking = A status applied to an activity (bookingStatus field + bookingDate)
 *
 * Routes:
 * - POST /bookings/activities/:activityId/mark - Mark activity as booked
 * - POST /bookings/activities/:activityId/unmark - Remove booking status
 * - GET /bookings/activities?tripId=...&bookingStatus=... - List activities with booking status
 *
 * Access control: All endpoints verify trip access via TripAccessService.
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger'
import { ActivityBookingsService } from './activity-bookings.service'
import { ActivitiesService } from './activities.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { MarkActivityBookedDto, ActivityBookingsFilterDto, CancelActivityBookingDto } from './dto'
import type {
  ActivityBookingResponseDto,
  ActivityBookingsListResponseDto,
  BookingValidationResult,
} from '@tailfire/shared-types'

@ApiTags('Activity Bookings')
@Controller('bookings/activities')
export class ActivityBookingsController {
  constructor(
    private readonly activityBookingsService: ActivityBookingsService,
    private readonly activitiesService: ActivitiesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Validate booking requirements without changing state (dry run)
   * GET /bookings/activities/:activityId/validate
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':activityId/validate')
  @ApiOperation({ summary: 'Validate booking requirements (dry run — does not change state)' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, description: 'Validation result with structured errors' })
  async validateBooking(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string
  ): Promise<BookingValidationResult> {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, false)
    return this.activityBookingsService.validateBooking(activityId)
  }

  /**
   * Mark an activity as booked
   * POST /bookings/activities/:activityId/mark
   *
   * Business rules:
   * - Activities with packageId cannot be booked individually (400 error)
   * - Activities with activityType 'package' CAN be booked
   * - bookingDate defaults to today if not provided
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':activityId/mark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an activity as booked' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, description: 'Activity marked as booked' })
  @ApiResponse({ status: 400, description: 'Activity is part of a package' })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  async markAsBooked(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: MarkActivityBookedDto
  ): Promise<ActivityBookingResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.activityBookingsService.markAsBooked(activityId, dto, auth.userId)
  }

  /**
   * Remove booking status from an activity
   * POST /bookings/activities/:activityId/unmark
   *
   * Business rules:
   * - Activities with packageId cannot be unmarked individually (400 error)
   * - Sets bookingStatus to 'unbooked' and bookingDate to null
   * - 409 BOOKING_HAS_PAYMENTS_USE_CANCEL if any payment or confirmation # exists.
   *   The caller must route the user to the cancel-with-policy dialog instead.
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':activityId/unmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove booking status from an activity (only when no payments)' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, description: 'Booking status removed' })
  @ApiResponse({ status: 400, description: 'Activity is part of a package' })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  @ApiResponse({ status: 409, description: 'Booking has payments / confirmation number — use /cancel instead' })
  async unmarkAsBooked(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string
  ): Promise<ActivityBookingResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.activityBookingsService.unmarkAsBooked(activityId, auth.userId)
  }

  /**
   * Cancel a booked activity (#452)
   * POST /bookings/activities/:activityId/cancel
   *
   * Required when the booking has payments or a confirmation number.
   * Records reason + refund decision + actor; payment_transactions are not
   * touched (refunds tracked separately so the ledger stays intact).
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':activityId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booked activity with reason + refund decision' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, description: 'Activity cancelled' })
  @ApiResponse({ status: 400, description: 'Activity is not booked, or refund payload incomplete' })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  async cancelBooking(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: CancelActivityBookingDto
  ): Promise<ActivityBookingResponseDto> {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    return this.activityBookingsService.cancelBooking(activityId, dto, auth.userId)
  }

  /**
   * List activities with booking status
   * GET /bookings/activities?tripId=...&itineraryId=...&bookingStatus=...
   *
   * Query parameters:
   * - tripId (required): Filter by trip
   * - itineraryId (optional): Filter by specific itinerary
   * - bookingStatus (optional, default: 'booked'): Filter by booking status
   *
   * Response includes:
   * - paymentScheduleMissing: Warning flag for missing payment schedule
   * - bookable: false if activity is part of a package
   * - blockedReason: 'part_of_package' if bookable is false
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  @ApiOperation({ summary: 'List activities with booking information' })
  @ApiQuery({ name: 'tripId', required: true, description: 'Trip ID (required for scoping)' })
  @ApiQuery({ name: 'itineraryId', required: false, description: 'Filter by itinerary' })
  @ApiQuery({ name: 'bookingStatus', required: false, description: 'Filter by booking status (default: booked)' })
  @ApiResponse({ status: 200, description: 'List of activities with booking information' })
  @ApiResponse({ status: 400, description: 'tripId is required' })
  async listBooked(
    @GetAuthContext() auth: AuthContext,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    filter: ActivityBookingsFilterDto
  ): Promise<ActivityBookingsListResponseDto> {
    await this.tripAccessService.verifyReadAccess(filter.tripId, auth)
    return this.activityBookingsService.listBooked(filter)
  }
}
