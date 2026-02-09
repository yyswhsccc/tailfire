/**
 * Trips Controller
 *
 * REST API endpoints for trip management.
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
  ForbiddenException,
} from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { ApiTags } from '@nestjs/swagger'
import { TripsService } from './trips.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ActivitiesService } from './activities.service'
import { ActivityLogsService } from '../activity-logs/activity-logs.service'
import { PaymentSchedulesService } from './payment-schedules.service'
import {
  CreateTripDto,
  UpdateTripDto,
  TripFilterDto,
  BulkDeleteTripsDto,
  BulkArchiveTripsDto,
  BulkChangeStatusDto,
  type BulkTripOperationResult,
  type TripFilterOptionsResponseDto,
} from './dto'
import type {
  TripResponseDto,
  PaginatedTripsResponseDto,
  TripBookingStatusResponseDto,
  PackageResponseDto,
  TripPackageTotalsDto,
  UnlinkedActivitiesResponseDto,
  TripExpectedPaymentDto,
  TripPaymentTransactionDto,
  UpdateTripOwnerDto,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly tripAccessService: TripAccessService,
    private readonly activitiesService: ActivitiesService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly paymentSchedulesService: PaymentSchedulesService,
  ) {}

  /**
   * Create a new trip
   * POST /trips
   */
  @Post()
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() createTripDto: CreateTripDto,
  ): Promise<TripResponseDto> {
    return this.tripsService.create(createTripDto, auth.userId)
  }

  /**
   * Get all trips with filters
   * GET /trips?page=1&limit=20&status=draft&search=honeymoon
   *
   * Only returns trips the user has access to:
   * - Admin: all trips in agency
   * - User: owned trips, shared trips, and inbound trips
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: TripFilterDto,
  ): Promise<PaginatedTripsResponseDto> {
    return this.tripsService.findAll(filters, auth, this.tripAccessService)
  }

  // ============================================================================
  // BULK OPERATIONS
  // Must come before :id routes to avoid route conflicts
  // ============================================================================

  /**
   * Get filter options for trips
   * GET /trips/filter-options
   *
   * Returns available options for filter dropdowns (statuses, trip types, tags).
   */
  @Get('filter-options')
  async getFilterOptions(@GetAuthContext() auth: AuthContext): Promise<TripFilterOptionsResponseDto> {
    return this.tripsService.getFilterOptions(auth.userId, auth.agencyId)
  }

  /**
   * Bulk delete trips
   * POST /trips/bulk-delete
   *
   * Deletes multiple trips with per-item validation.
   * Only trips in 'draft' or 'quoted' status can be deleted.
   * User must have write access to each trip.
   *
   * @returns Per-item success/failure with reasons
   */
  @Post('bulk-delete')
  async bulkDelete(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkDeleteTripsDto,
  ): Promise<BulkTripOperationResult> {
    return this.tripsService.bulkDelete(dto.tripIds, auth.userId, auth, this.tripAccessService)
  }

  /**
   * Bulk archive/unarchive trips
   * POST /trips/bulk-archive
   *
   * Archives or unarchives multiple trips.
   * No status restriction - any trip can be archived.
   * User must have write access to each trip.
   *
   * @returns Per-item success/failure with reasons
   */
  @Post('bulk-archive')
  async bulkArchive(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkArchiveTripsDto,
  ): Promise<BulkTripOperationResult> {
    return this.tripsService.bulkArchive(dto.tripIds, dto.archive, auth.userId, auth, this.tripAccessService)
  }

  /**
   * Bulk change status of trips
   * POST /trips/bulk-status
   *
   * Changes status of multiple trips with transition validation.
   * Each trip's current status must allow the target transition.
   * User must have write access to each trip.
   *
   * @returns Per-item success/failure with reasons
   */
  @Post('bulk-status')
  async bulkChangeStatus(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkChangeStatusDto,
  ): Promise<BulkTripOperationResult> {
    return this.tripsService.bulkChangeStatus(dto.tripIds, dto.status, auth.userId, auth, this.tripAccessService)
  }

  // ============================================================================
  // SHARE / GROUP / DUPLICATE - Must come before :id catch-all
  // ============================================================================

  /**
   * Get shared trip by token (public, no auth)
   * GET /trips/share/:token
   */
  @Public()
  @Get('share/:token')
  async getSharedTrip(@Param('token') token: string) {
    return this.tripsService.findByShareToken(token)
  }

  /**
   * List trip groups for the agency
   * GET /trips/groups
   */
  @Get('groups')
  async listTripGroups(@GetAuthContext() auth: AuthContext) {
    return this.tripsService.listTripGroups(auth.agencyId)
  }

  /**
   * Create a trip group
   * POST /trips/groups
   */
  @Post('groups')
  async createTripGroup(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { name: string },
  ) {
    return this.tripsService.createTripGroup(body.name, auth.agencyId, auth.userId)
  }

  /**
   * Update a trip group
   * PATCH /trips/groups/:groupId
   */
  @Patch('groups/:groupId')
  async updateTripGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.tripsService.updateTripGroup(groupId, body, auth.agencyId, auth.userId)
  }

  /**
   * Delete a trip group
   * DELETE /trips/groups/:groupId
   */
  @Delete('groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTripGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ) {
    return this.tripsService.deleteTripGroup(groupId, auth.agencyId, auth.userId)
  }

  /**
   * List trips in a group
   * GET /trips/groups/:groupId/trips
   */
  @Get('groups/:groupId/trips')
  async getTripsByGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ) {
    return this.tripsService.getTripsByGroup(groupId, auth.agencyId)
  }

  /**
   * Publish a trip (generate share token)
   * PATCH /trips/:id/publish
   *
   * Access check: User must have write access.
   */
  @Patch(':id/publish')
  async publishTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.publishTrip(id, auth.userId)
  }

  /**
   * Unpublish a trip (clear share token)
   * PATCH /trips/:id/unpublish
   *
   * Access check: User must have write access.
   */
  @Patch(':id/unpublish')
  async unpublishTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.unpublishTrip(id, auth.userId)
  }

  /**
   * Duplicate a trip
   * POST /trips/:id/duplicate
   *
   * Access check: User must have read access to duplicate.
   */
  @Post(':id/duplicate')
  async duplicateTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyReadAccess(id, auth)
    return this.tripsService.duplicateTrip(id, auth.userId)
  }

  /**
   * Get booking status for all activities in a trip
   * GET /trips/:id/booking-status
   * IMPORTANT: Must come before @Get(':id') to avoid route conflicts
   *
   * Returns aggregated payment and commission status for the Bookings tab.
   * Access check: User must have read access.
   */
  @Get(':id/booking-status')
  async getBookingStatus(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TripBookingStatusResponseDto> {
    await this.tripAccessService.verifyReadAccess(id, auth)
    return this.tripsService.getBookingStatus(id)
  }

  /**
   * Get expected payment items for a trip (with activity context)
   * GET /trips/:id/expected-payments
   *
   * Access check: User must have read access.
   */
  @Get(':id/expected-payments')
  async getExpectedPayments(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TripExpectedPaymentDto[]> {
    await this.tripAccessService.verifyReadAccess(id, auth)
    return this.paymentSchedulesService.getExpectedPaymentsByTripId(id, auth.agencyId)
  }

  /**
   * Get payment transactions for a trip (with activity context)
   * GET /trips/:id/payment-transactions
   *
   * Access check: User must have read access.
   */
  @Get(':id/payment-transactions')
  async getPaymentTransactions(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TripPaymentTransactionDto[]> {
    await this.tripAccessService.verifyReadAccess(id, auth)
    return this.paymentSchedulesService.getTransactionsByTripId(id, auth.agencyId)
  }

  /**
   * Get activity log for a trip
   * GET /trips/:id/activity?limit=50&offset=0
   * IMPORTANT: Must come before @Get(':id') to avoid route conflicts
   *
   * Access check: User must have read access.
   */
  @Get(':id/activity')
  async getActivity(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    await this.tripAccessService.verifyReadAccess(id, auth)
    const parsedLimit = limit ? Number(limit) : 50
    const parsedOffset = offset ? Number(offset) : 0
    return this.activityLogsService.getActivityForTrip(id, parsedLimit, parsedOffset)
  }

  /**
   * Get a single trip by ID
   * GET /trips/:id
   *
   * Access check: User must have read access (owner, admin, or shared).
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TripResponseDto> {
    await this.tripAccessService.verifyReadAccess(id, auth)
    return this.tripsService.findOne(id)
  }

  /**
   * Update a trip
   * PATCH /trips/:id
   *
   * Access check: User must have write access (owner, admin, or write share).
   */
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() updateTripDto: UpdateTripDto,
  ): Promise<TripResponseDto> {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.update(id, updateTripDto)
  }

  /**
   * Delete a trip
   * DELETE /trips/:id
   *
   * Access check: User must have write access (owner, admin, or write share).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.remove(id)
  }

  /**
   * Re-assign trip ownership (Admin only)
   * PATCH /trips/:id/owner
   *
   * Only admins can change trip ownership.
   * Can set to any user in the agency or null (only if status is 'inbound').
   */
  @Patch(':id/owner')
  async updateOwner(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTripOwnerDto,
  ): Promise<TripResponseDto> {
    if (auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can re-assign trip ownership')
    }
    return this.tripsService.updateOwner(id, dto.ownerId)
  }

  // ============================================================================
  // Trip-Scoped Package Endpoints
  // ============================================================================

  /**
   * Get all packages for a trip
   * GET /trips/:id/packages
   * Returns enriched package data including activityCount for expandable rows
   *
   * Access check: User must have read access.
   */
  @Get(':id/packages')
  async getPackages(
    @GetAuthContext() auth: AuthContext,
    @Param('id') tripId: string,
  ): Promise<PackageResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.activitiesService.findPackagesByTrip(tripId)
  }

  /**
   * Get package totals for a trip
   * GET /trips/:id/packages/totals
   *
   * IMPORTANT: Must come after @Get(':id/packages') to avoid route conflicts
   * Access check: User must have read access.
   */
  @Get(':id/packages/totals')
  async getPackageTotals(
    @GetAuthContext() auth: AuthContext,
    @Param('id') tripId: string,
  ): Promise<TripPackageTotalsDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.activitiesService.getTripPackageTotals(tripId)
  }

  /**
   * Get all unlinked activities for a trip (activities not in any package)
   * GET /trips/:id/unlinked-activities
   * @param itineraryId - Optional filter to get activities for a specific itinerary
   *
   * Access check: User must have read access.
   */
  @Get(':id/unlinked-activities')
  async getUnlinkedActivities(
    @GetAuthContext() auth: AuthContext,
    @Param('id') tripId: string,
    @Query('itineraryId') itineraryId?: string
  ): Promise<UnlinkedActivitiesResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    const activities = await this.activitiesService.findUnlinkedByTrip(tripId, itineraryId)
    return {
      activities: activities.map((a) => ({
        id: a.id,
        name: a.name,
        activityType: a.activityType,
        itineraryId: '', // Not returned by findUnlinkedByTrip - frontend doesn't use this
        itineraryDayId: a.itineraryDayId || '',
        dayNumber: null, // Would require additional query - frontend doesn't use this
        date: null, // Would require additional query - frontend doesn't use this
        sequenceOrder: a.sequenceOrder,
        totalPriceCents: a.pricing?.totalPriceCents ?? null,
        parentActivityId: a.parentActivityId,
      })),
      total: activities.length,
    }
  }
}
