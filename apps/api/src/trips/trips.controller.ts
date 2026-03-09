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
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { Public } from '../auth/decorators/public.decorator'
import { ApiTags } from '@nestjs/swagger'
import { TripsService } from './trips.service'
import { TripAccessService } from './trip-access.service'
import { StorageService } from './storage.service'
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
  SendBookingConfirmationDto,
  CreateProposalCommentDto,
  CreateActivityResponseDto,
  SelectItineraryDto,
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
  CancelTripDto,
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
    private readonly storageService: StorageService,
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
    return this.tripsService.getFilterOptions(auth, this.tripAccessService)
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
   * GET /trips/share/:token?preview=draft
   * When preview=draft, serves live data instead of published snapshot.
   */
  @Public()
  @Get('share/:token')
  async getSharedTrip(
    @Param('token') token: string,
  ) {
    return this.tripsService.findByShareToken(token)
  }

  /**
   * Get comments for a shared proposal (public, no auth)
   * GET /trips/share/:token/comments?itineraryId=xxx
   */
  @Public()
  @Get('share/:token/comments')
  async getProposalComments(
    @Param('token') token: string,
    @Query('itineraryId') itineraryId?: string,
  ) {
    return this.tripsService.getProposalComments(token, itineraryId)
  }

  /**
   * Create a client comment on a shared proposal (public, no auth, rate-limited)
   * POST /trips/share/:token/comments
   */
  @Public()
  @Post('share/:token/comments')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createProposalComment(
    @Param('token') token: string,
    @Body() dto: CreateProposalCommentDto,
  ) {
    return this.tripsService.createProposalComment(token, dto)
  }

  /**
   * Approve a shared proposal (public, no auth, rate-limited)
   * POST /trips/share/:token/approve
   */
  @Public()
  @Post('share/:token/approve')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async approveProposal(@Param('token') token: string) {
    return this.tripsService.approveProposal(token)
  }

  /**
   * Create or update an activity response (public, no auth, rate-limited)
   * POST /trips/share/:token/responses
   */
  @Public()
  @Post('share/:token/responses')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async createActivityResponse(
    @Param('token') token: string,
    @Body() dto: CreateActivityResponseDto,
  ) {
    return this.tripsService.createActivityResponse(token, dto)
  }

  /**
   * Get activity responses for the published version (public, no auth)
   * GET /trips/share/:token/responses?itineraryId=xxx
   */
  @Public()
  @Get('share/:token/responses')
  async getActivityResponses(
    @Param('token') token: string,
    @Query('itineraryId') itineraryId?: string,
  ) {
    return this.tripsService.getActivityResponses(token, itineraryId)
  }

  /**
   * Decline a shared proposal (public, no auth, rate-limited)
   * POST /trips/share/:token/decline
   */
  @Public()
  @Post('share/:token/decline')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async declineProposal(
    @Param('token') token: string,
    @Body() body: { reason?: string },
  ) {
    return this.tripsService.declineProposal(token, body.reason)
  }

  /**
   * Client selects their preferred itinerary (public, no auth, rate-limited)
   * POST /trips/share/:token/select
   */
  @Public()
  @Post('share/:token/select')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async selectItinerary(
    @Param('token') token: string,
    @Body() body: SelectItineraryDto,
  ) {
    return this.tripsService.selectItinerary(token, body.itineraryId)
  }

  /**
   * List trip groups for the agency
   * GET /trips/groups
   */
  @Get('groups')
  async listTripGroups(
    @GetAuthContext() auth: AuthContext,
    @Query('type') type?: string,
  ) {
    return this.tripsService.listTripGroups(auth.agencyId, type)
  }

  /**
   * Create a trip group
   * POST /trips/groups
   */
  @Post('groups')
  async createTripGroup(
    @GetAuthContext() auth: AuthContext,
    @Body() body: {
      name: string
      type?: string
      groupNumber?: string
      primarySupplierId?: string
      destination?: string
      startDate?: string
      endDate?: string
      status?: string
      description?: string
    },
  ) {
    return this.tripsService.createTripGroup(body, auth.agencyId, auth.userId)
  }

  /**
   * Update a trip group
   * PATCH /trips/groups/:groupId
   */
  @Patch('groups/:groupId')
  async updateTripGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() body: {
      name?: string
      description?: string
      type?: string
      groupNumber?: string
      primarySupplierId?: string | null
      destination?: string
      startDate?: string | null
      endDate?: string | null
      status?: string
    },
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
   * Get financial summary for a trip group
   * GET /trips/groups/:groupId/summary
   */
  @Get('groups/:groupId/summary')
  async getGroupSummary(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ) {
    return this.tripsService.getGroupSummary(groupId, auth.agencyId)
  }

  /**
   * Update group status (with cascade for cancellation)
   * PATCH /trips/groups/:groupId/status
   */
  @Patch('groups/:groupId/status')
  async updateGroupStatus(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() body: { status: string; reason?: string },
  ) {
    if (body.status === 'cancelled') {
      return this.tripsService.cancelGroupTrips(
        groupId,
        body.reason || '',
        auth.agencyId,
        auth.userId,
      )
    }
    return this.tripsService.updateTripGroup(
      groupId,
      { status: body.status },
      auth.agencyId,
      auth.userId,
    )
  }

  /**
   * Add trip(s) to a group
   * POST /trips/groups/:groupId/trips
   */
  @Post('groups/:groupId/trips')
  async addTripsToGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() body: { tripIds: string[] },
  ) {
    return this.tripsService.addTripsToGroup(
      groupId,
      body.tripIds,
      auth.agencyId,
      auth.userId,
    )
  }

  /**
   * Remove a trip from a group
   * DELETE /trips/groups/:groupId/trips/:tripId
   */
  @Delete('groups/:groupId/trips/:tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTripFromGroup(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('tripId') tripId: string,
  ) {
    return this.tripsService.removeTripFromGroup(
      groupId,
      tripId,
      auth.agencyId,
      auth.userId,
    )
  }

  /**
   * List documents for a trip group
   * GET /trips/groups/:groupId/documents
   */
  @Get('groups/:groupId/documents')
  async listGroupDocuments(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ) {
    return this.tripsService.listGroupDocuments(groupId, auth.agencyId)
  }

  /**
   * Upload a document to a trip group
   * POST /trips/groups/:groupId/documents
   */
  @Post('groups/:groupId/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadGroupDocument(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentType?: string },
  ) {
    const storagePath = await this.storageService.uploadDocument(
      file.buffer,
      groupId,
      file.originalname,
      file.mimetype,
    )

    return this.tripsService.createGroupDocument(
      groupId,
      {
        fileUrl: storagePath,
        fileName: file.originalname,
        fileSize: file.size,
        documentType: body.documentType,
      },
      auth.agencyId,
      auth.userId,
    )
  }

  /**
   * Delete a document from a trip group
   * DELETE /trips/groups/:groupId/documents/:documentId
   */
  @Delete('groups/:groupId/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroupDocument(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('documentId') documentId: string,
  ) {
    const doc = await this.tripsService.deleteGroupDocument(
      groupId,
      documentId,
      auth.agencyId,
      auth.userId,
    )
    // Clean up storage
    if (doc.fileUrl) {
      await this.storageService.deleteDocument(doc.fileUrl).catch(() => {})
    }
  }

  /**
   * List media for a trip group
   * GET /trips/groups/:groupId/media
   */
  @Get('groups/:groupId/media')
  async listGroupMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
  ) {
    return this.tripsService.listGroupMedia(groupId, auth.agencyId)
  }

  /**
   * Upload media to a trip group
   * POST /trips/groups/:groupId/media
   */
  @Post('groups/:groupId/media')
  @UseInterceptors(FileInterceptor('file'))
  async uploadGroupMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { caption?: string },
  ) {
    const folder = `trip-groups/${groupId}/media`
    const result = await this.storageService.uploadMediaFile(
      file.buffer,
      folder,
      file.originalname,
      file.mimetype,
    )

    return this.tripsService.createGroupMedia(
      groupId,
      {
        fileUrl: result.url,
        fileName: file.originalname,
        fileSize: file.size,
        caption: body.caption,
      },
      auth.agencyId,
      auth.userId,
    )
  }

  /**
   * Delete media from a trip group
   * DELETE /trips/groups/:groupId/media/:mediaId
   */
  @Delete('groups/:groupId/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroupMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const media = await this.tripsService.deleteGroupMedia(
      groupId,
      mediaId,
      auth.agencyId,
      auth.userId,
    )
    // Clean up storage
    if (media?.fileUrl) {
      await this.storageService.deleteDocument(media.fileUrl).catch(() => {})
    }
  }

  /**
   * Publish a trip (generate share token)
   * PATCH /trips/:id/publish
   *
   * Access check: User must have write access.
   */
  /**
   * Preview proposal with live data (authenticated admin endpoint)
   * GET /trips/:id/preview-proposal
   *
   * Returns the same shape as the public proposal but uses live data.
   * Access check: User must have write access.
   */
  @Get(':id/preview-proposal')
  async previewProposal(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.previewProposal(id)
  }

  @Patch(':id/publish')
  async publishTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.publishTrip(id, auth.userId)
  }

  /**
   * Publish a trip snapshot (ensure published + create new version)
   * POST /trips/:id/publish-snapshot
   *
   * Creates a new itinerary version snapshot for the selected itinerary.
   * Also ensures the trip is published (has a share token).
   * Access check: User must have write access.
   */
  @Post(':id/publish-snapshot')
  async publishTripSnapshot(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.publishTripSnapshot(id, auth.userId)
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
   * Cancel a trip with reason tracking
   * POST /trips/:id/cancel
   *
   * Transitions trip to 'cancelled' status with optional reason.
   * Access check: User must have write access.
   */
  @Post(':id/cancel')
  async cancelTrip(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CancelTripDto,
  ): Promise<TripResponseDto> {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    return this.tripsService.cancelTrip(id, dto, auth.userId)
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
      activities: activities.map((a: any) => ({
        id: a.id,
        name: a.name,
        activityType: a.activityType,
        itineraryId: '',
        itineraryDayId: a.itineraryDayId || '',
        dayNumber: a._dayNumber ?? null,
        endDayNumber: a._endDayNumber ?? null,
        date: a._dayDate ?? null,
        sequenceOrder: a.sequenceOrder,
        totalPriceCents: a.pricing?.totalPriceCents ?? null,
        parentActivityId: a.parentActivityId,
        supplierName: a.supplierName ?? null,
        isBooked: a.isBooked ?? false,
        confirmationNumber: a.confirmationNumber ?? null,
        paymentStatus: a.paymentStatus ?? null,
        paidCents: a.paidCents ?? null,
        currency: a.currency ?? null,
        commissionTotalCents: a.pricing?.commissionTotalCents ?? null,
      })),
      total: activities.length,
    }
  }

  /**
   * Send booking confirmation email
   * POST /trips/:id/send-booking-confirmation
   *
   * Agent-triggered email sent to clients when a trip is booked.
   * Access check: User must have write access to the trip.
   */
  @Post(':id/send-booking-confirmation')
  @HttpCode(HttpStatus.OK)
  async sendBookingConfirmation(
    @GetAuthContext() auth: AuthContext,
    @Param('id') tripId: string,
    @Body() dto: SendBookingConfirmationDto,
  ): Promise<{
    success: boolean
    emailLogId?: string
    providerMessageId?: string
    recipients: string[]
    error?: string
  }> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripsService.sendBookingConfirmation(tripId, auth.agencyId, dto)
  }

  /**
   * Create an agent comment on a proposal (authenticated)
   * POST /trips/:tripId/itineraries/:itineraryId/comments
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':tripId/itineraries/:itineraryId/comments')
  async createAgentComment(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Body() dto: CreateProposalCommentDto,
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripsService.createAgentComment(tripId, itineraryId, dto, auth.userId)
  }

  /**
   * Get comments for an itinerary (authenticated, for admin Comments tab)
   * GET /trips/:tripId/itineraries/:itineraryId/comments?activityId=xxx
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':tripId/itineraries/:itineraryId/comments')
  async getAgentComments(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
    @Query('activityId') activityId?: string,
  ) {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripsService.getAgentComments(tripId, itineraryId, activityId)
  }

  /**
   * Get activity responses for an itinerary (authenticated, for admin feedback view)
   * GET /trips/:tripId/itineraries/:itineraryId/responses
   *
   * Returns client activity responses for the published version.
   * Access check: User must have read access to the trip.
   */
  @Get(':tripId/itineraries/:itineraryId/responses')
  async getAdminActivityResponses(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('itineraryId') itineraryId: string,
  ) {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripsService.getAdminActivityResponses(tripId, itineraryId)
  }
}
