/**
 * Trips Service
 *
 * Business logic for managing trips.
 */

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as crypto from 'crypto'
import { eq, and, or, gte, lte, ilike, sql, desc, asc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripBookedEvent } from './events/trip-booked.event'
import {
  TripCreatedEvent,
  TripUpdatedEvent,
  TripDeletedEvent,
  AuditEvent,
} from '../activity-logs/events'
import type {
  CreateTripDto,
  UpdateTripDto,
  TripFilterDto,
  TripResponseDto,
  PaginatedTripsResponseDto,
  TripStatus,
  TripBookingStatusResponseDto,
  ActivityBookingStatusDto,
  ExpectedPaymentStatus,
  CommissionStatus,
} from '@tailfire/shared-types'
import {
  canTransitionTripStatus,
  getTransitionErrorMessage,
  canDeleteTrip,
  getDeleteErrorMessage,
} from '@tailfire/shared-types'
import type { AuthContext } from '../auth/auth.types'
import type { TripAccessService } from './trip-access.service'
import { UserValidationService } from '../common/user-validation.service'

@Injectable()
export class TripsService {

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userValidationService: UserValidationService,
  ) {}

  /**
   * Create a new trip
   * @param ownerId - Owner ID, can be null for inbound trips
   * @param agencyId - Required when ownerId is null (inbound trips)
   */
  async create(
    dto: CreateTripDto,
    ownerId: string | null,
    agencyId?: string,
  ): Promise<TripResponseDto> {
    const status = dto.status || 'draft'

    // Validate: trips must have an owner unless they are inbound leads
    if (!ownerId && status !== 'inbound') {
      throw new BadRequestException('Trips must have an owner unless status is "inbound"')
    }

    // Determine agency ID
    let resolvedAgencyId: string | null = agencyId || null
    if (ownerId) {
      const [ownerProfile] = await this.db.client
        .select({ agencyId: this.db.schema.userProfiles.agencyId })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, ownerId))
        .limit(1)

      if (!ownerProfile) {
        throw new NotFoundException('User profile not found for trip owner')
      }
      resolvedAgencyId = ownerProfile.agencyId
    }

    if (!resolvedAgencyId) {
      throw new BadRequestException('Agency ID is required for trips without an owner')
    }

    // Validate primaryContactId if provided
    if (dto.primaryContactId) {
      const contact = await this.db.client
        .select()
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, dto.primaryContactId))
        .limit(1)

      if (!contact.length) {
        throw new NotFoundException('Primary contact not found')
      }
    }

    const bookingDate = dto.bookingDate || (status === 'booked' ? new Date().toISOString().split('T')[0] : undefined)

    const [trip] = await this.db.client
      .insert(this.db.schema.trips)
      .values({
        agencyId: resolvedAgencyId,
        ownerId,
        name: dto.name,
        description: dto.description,
        tripType: dto.tripType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        bookingDate,
        status,
        primaryContactId: dto.primaryContactId,
        referenceNumber: dto.referenceNumber,
        externalReference: dto.externalReference,
        currency: dto.currency || 'CAD',
        estimatedTotalCost: dto.estimatedTotalCost?.toString(),
        tags: dto.tags,
        customFields: dto.customFields,
        timezone: dto.timezone,
      })
      .returning()

    if (!trip) {
      throw new Error('Failed to create trip')
    }

    // Emit trip created event
    this.eventEmitter.emit(
      'trip.created',
      new TripCreatedEvent(trip.id, trip.name, ownerId, {
        tripType: dto.tripType,
        status: trip.status,
        startDate: dto.startDate,
        endDate: dto.endDate,
      }),
    )

    // If trip is being created as 'booked' and has a primary contact, emit event
    if (status === 'booked' && dto.primaryContactId && bookingDate) {
      this.eventEmitter.emit(
        'trip.booked',
        new TripBookedEvent(trip.id, dto.primaryContactId, bookingDate),
      )
    }

    return this.mapToResponseDto(trip)
  }

  /**
   * Find all trips with filters and pagination
   * When auth is provided, only returns trips the user has access to
   */
  async findAll(
    filters: TripFilterDto,
    auth?: AuthContext,
    tripAccessService?: TripAccessService,
  ): Promise<PaginatedTripsResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    const conditions = []

    // Access control: filter by accessible trips when auth is provided
    if (auth && tripAccessService) {
      const accessibleTripIds = await tripAccessService.getAccessibleTripIds(auth)
      if (accessibleTripIds !== 'all') {
        // Non-admin users: only show accessible trips
        if (accessibleTripIds.length === 0) {
          // No accessible trips - return empty result
          return {
            data: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
          }
        }
        conditions.push(inArray(this.db.schema.trips.id, accessibleTripIds))
      }
      // Admin users with 'all' access: also filter by agency
      conditions.push(eq(this.db.schema.trips.agencyId, auth.agencyId))
    }

    // Search filter
    if (filters.search) {
      const searchCondition = or(
        ilike(this.db.schema.trips.name, `%${filters.search}%`),
        ilike(this.db.schema.trips.description, `%${filters.search}%`),
        ilike(this.db.schema.trips.referenceNumber, `%${filters.search}%`),
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    // Status filter
    if (filters.status) {
      conditions.push(eq(this.db.schema.trips.status, filters.status))
    }

    // Trip type filter
    if (filters.tripType) {
      conditions.push(eq(this.db.schema.trips.tripType, filters.tripType))
    }

    // Owner filter
    if (filters.ownerId) {
      conditions.push(eq(this.db.schema.trips.ownerId, filters.ownerId))
    }

    // Primary contact filter
    if (filters.primaryContactId) {
      conditions.push(eq(this.db.schema.trips.primaryContactId, filters.primaryContactId))
    }

    // Archive filter
    if (filters.isArchived !== undefined) {
      conditions.push(eq(this.db.schema.trips.isArchived, filters.isArchived))
    }

    // Published filter
    if (filters.isPublished !== undefined) {
      conditions.push(eq(this.db.schema.trips.isPublished, filters.isPublished))
    }

    // Date range filters
    if (filters.startDateFrom) {
      conditions.push(gte(this.db.schema.trips.startDate, filters.startDateFrom))
    }
    if (filters.startDateTo) {
      conditions.push(lte(this.db.schema.trips.startDate, filters.startDateTo))
    }
    if (filters.endDateFrom) {
      conditions.push(gte(this.db.schema.trips.endDate, filters.endDateFrom))
    }
    if (filters.endDateTo) {
      conditions.push(lte(this.db.schema.trips.endDate, filters.endDateTo))
    }

    // Tags filter (array overlap)
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(sql`${this.db.schema.trips.tags} && ${filters.tags}`)
    }

    // Trip group filter
    if (filters.tripGroupId) {
      conditions.push(eq(this.db.schema.trips.tripGroupId, filters.tripGroupId))
    }

    // Sorting
    const sortBy = filters.sortBy || 'createdAt'
    const sortOrder = filters.sortOrder || 'desc'
    const orderByColumn = this.db.schema.trips[sortBy]
    const orderBy = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn)

    // Execute query with pagination - include cover photo URL subquery
    // Use raw SQL reference for the correlated subquery to properly reference outer query's trips.id
    const coverPhotoSubquery = sql<string>`(
      SELECT file_url FROM trip_media
      WHERE trip_media.trip_id = trips.id
      AND trip_media.is_cover_photo = true
      LIMIT 1
    )`.as('coverPhotoUrl')

    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        agencyId: this.db.schema.trips.agencyId,
        branchId: this.db.schema.trips.branchId,
        ownerId: this.db.schema.trips.ownerId,
        name: this.db.schema.trips.name,
        description: this.db.schema.trips.description,
        tripType: this.db.schema.trips.tripType,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        bookingDate: this.db.schema.trips.bookingDate,
        status: this.db.schema.trips.status,
        primaryContactId: this.db.schema.trips.primaryContactId,
        referenceNumber: this.db.schema.trips.referenceNumber,
        externalReference: this.db.schema.trips.externalReference,
        currency: this.db.schema.trips.currency,
        estimatedTotalCost: this.db.schema.trips.estimatedTotalCost,
        tags: this.db.schema.trips.tags,
        customFields: this.db.schema.trips.customFields,
        isArchived: this.db.schema.trips.isArchived,
        isPublished: this.db.schema.trips.isPublished,
        timezone: this.db.schema.trips.timezone,
        pricingVisibility: this.db.schema.trips.pricingVisibility,
        allowPdfDownloads: this.db.schema.trips.allowPdfDownloads,
        itineraryStyle: this.db.schema.trips.itineraryStyle,
        createdAt: this.db.schema.trips.createdAt,
        updatedAt: this.db.schema.trips.updatedAt,
        coverPhotoUrl: coverPhotoSubquery,
      })
      .from(this.db.schema.trips)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)

    // Count total for pagination
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.trips)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    const count = countResult[0]?.count || 0

    const totalPages = Math.ceil(Number(count) / limit)

    return {
      data: trips.map((trip) => this.mapToResponseDto(trip)),
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages,
      },
    }
  }

  /**
   * Find one trip by ID
   */
  async findOne(id: string): Promise<TripResponseDto> {
    // Include cover photo URL subquery
    // Use raw SQL reference for the correlated subquery to properly reference outer query's trips.id
    const coverPhotoSubquery = sql<string>`(
      SELECT file_url FROM trip_media
      WHERE trip_media.trip_id = trips.id
      AND trip_media.is_cover_photo = true
      LIMIT 1
    )`.as('coverPhotoUrl')

    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        agencyId: this.db.schema.trips.agencyId,
        branchId: this.db.schema.trips.branchId,
        ownerId: this.db.schema.trips.ownerId,
        name: this.db.schema.trips.name,
        description: this.db.schema.trips.description,
        tripType: this.db.schema.trips.tripType,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        bookingDate: this.db.schema.trips.bookingDate,
        status: this.db.schema.trips.status,
        primaryContactId: this.db.schema.trips.primaryContactId,
        referenceNumber: this.db.schema.trips.referenceNumber,
        externalReference: this.db.schema.trips.externalReference,
        currency: this.db.schema.trips.currency,
        estimatedTotalCost: this.db.schema.trips.estimatedTotalCost,
        tags: this.db.schema.trips.tags,
        customFields: this.db.schema.trips.customFields,
        isArchived: this.db.schema.trips.isArchived,
        isPublished: this.db.schema.trips.isPublished,
        timezone: this.db.schema.trips.timezone,
        pricingVisibility: this.db.schema.trips.pricingVisibility,
        allowPdfDownloads: this.db.schema.trips.allowPdfDownloads,
        itineraryStyle: this.db.schema.trips.itineraryStyle,
        createdAt: this.db.schema.trips.createdAt,
        updatedAt: this.db.schema.trips.updatedAt,
        coverPhotoUrl: coverPhotoSubquery,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    return this.mapToResponseDto(trip)
  }

  /**
   * Update a trip
   */
  async update(
    id: string,
    dto: UpdateTripDto,
  ): Promise<TripResponseDto> {
    // Get existing trip to check for status transitions
    const [existingTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!existingTrip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Validate status transition if status is being changed
    if (dto.status && dto.status !== existingTrip.status) {
      const isValid = canTransitionTripStatus(
        existingTrip.status as TripStatus,
        dto.status as TripStatus
      )

      if (!isValid) {
        const errorMessage = getTransitionErrorMessage(
          existingTrip.status as TripStatus,
          dto.status as TripStatus
        )
        throw new BadRequestException(errorMessage)
      }

      // Validate: when transitioning FROM inbound, must have an owner
      if (existingTrip.status === 'inbound' && dto.status !== 'inbound') {
        const newOwnerId = dto.ownerId ?? existingTrip.ownerId
        if (!newOwnerId) {
          throw new BadRequestException('Cannot change status from "inbound" without assigning an owner')
        }
      }
    }

    // Validate ownerId changes
    if ('ownerId' in dto) {
      // Can only set ownerId to null if status is or will be 'inbound'
      if (dto.ownerId === null) {
        const finalStatus = dto.status ?? existingTrip.status
        if (finalStatus !== 'inbound') {
          throw new BadRequestException('Trips can only have no owner when status is "inbound"')
        }
      }
    }

    // Validate primaryContactId if provided
    if (dto.primaryContactId) {
      const contact = await this.db.client
        .select()
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, dto.primaryContactId))
        .limit(1)

      if (!contact.length) {
        throw new NotFoundException('Primary contact not found')
      }
    }

    // Auto-set booking date if transitioning to 'booked' status
    const isTransitioningToBooked = dto.status === 'booked' && existingTrip.status !== 'booked'
    const bookingDate = isTransitioningToBooked && !dto.bookingDate
      ? new Date().toISOString().split('T')[0]
      : dto.bookingDate

    const [trip] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        ...dto,
        bookingDate,
        estimatedTotalCost: dto.estimatedTotalCost?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Check if this is only a group change (no other fields updated)
    const isGroupChange = 'tripGroupId' in dto && dto.tripGroupId !== existingTrip.tripGroupId
    const dtoKeys = Object.keys(dto).filter((k) => k !== 'tripGroupId')
    const isOnlyGroupField = 'tripGroupId' in dto && dtoKeys.length === 0

    // Emit generic trip updated event (skip if tripGroupId is the only field — specific event below)
    if (!isOnlyGroupField) {
      this.eventEmitter.emit(
        'trip.updated',
        new TripUpdatedEvent(trip.id, trip.name, null, dto),
      )
    }

    // Emit audit events for group changes
    if (isGroupChange) {
      if (dto.tripGroupId) {
        // Trip moved to a group — resolve group name
        const [group] = await this.db.client
          .select({ name: this.db.schema.tripGroups.name })
          .from(this.db.schema.tripGroups)
          .where(eq(this.db.schema.tripGroups.id, dto.tripGroupId))
          .limit(1)
        const groupName = group?.name || 'Unknown group'
        this.eventEmitter.emit(
          'audit.moved_to_group',
          new AuditEvent('trip', trip.id, 'moved_to_group', trip.id, null, groupName, {
            groupId: dto.tripGroupId,
            groupName,
          }),
        )
      } else {
        // Trip removed from a group — resolve old group name
        let oldGroupName = 'Unknown group'
        if (existingTrip.tripGroupId) {
          const [oldGroup] = await this.db.client
            .select({ name: this.db.schema.tripGroups.name })
            .from(this.db.schema.tripGroups)
            .where(eq(this.db.schema.tripGroups.id, existingTrip.tripGroupId))
            .limit(1)
          oldGroupName = oldGroup?.name || 'Unknown group'
        }
        this.eventEmitter.emit(
          'audit.removed_from_group',
          new AuditEvent('trip', trip.id, 'removed_from_group', trip.id, null, oldGroupName, {
            previousGroupId: existingTrip.tripGroupId,
            previousGroupName: oldGroupName,
          }),
        )
      }
    }

    // If trip is being marked as 'booked' for the first time, emit event
    const primaryContactId = trip.primaryContactId || existingTrip.primaryContactId
    if (isTransitioningToBooked && primaryContactId && bookingDate) {
      this.eventEmitter.emit(
        'trip.booked',
        new TripBookedEvent(trip.id, primaryContactId, bookingDate),
      )
    }

    return this.mapToResponseDto(trip)
  }

  /**
   * Update trip ownership (Admin only)
   * Can set to any user in the agency or null (only if status is 'inbound')
   */
  async updateOwner(id: string, ownerId: string | null): Promise<TripResponseDto> {
    const [existingTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!existingTrip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Can only set ownerId to null if status is 'inbound'
    if (ownerId === null && existingTrip.status !== 'inbound') {
      throw new BadRequestException('Trips can only have no owner when status is "inbound"')
    }

    // Validate new owner exists and belongs to same agency
    if (ownerId !== null) {
      await this.userValidationService.validateUserInAgency(
        ownerId,
        existingTrip.agencyId,
        'New owner',
      )
    }

    const [trip] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        ownerId,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Emit trip updated event
    this.eventEmitter.emit(
      'trip.updated',
      new TripUpdatedEvent(trip.id, trip.name, null, { ownerId }),
    )

    return this.mapToResponseDto(trip)
  }

  /**
   * Delete a trip
   * Only trips with status 'draft' or 'quoted' can be deleted
   *
   * @param id - Trip ID to delete
   * @param ownerId - Owner ID for authorization (Phase 4: when auth is implemented)
   *
   * Phase 4 TODO: When authentication is implemented:
   * 1. Make ownerId required parameter
   * 2. Use ownerId in WHERE clause to scope deletion
   * 3. Add agencyId check for agency-level access control
   */
  async remove(id: string, ownerId?: string): Promise<void> {
    // 1. Resolve trip first to check status and ownership
    const conditions = [eq(this.db.schema.trips.id, id)]

    // Phase 4: Add ownership scope when auth is implemented
    if (ownerId) {
      conditions.push(eq(this.db.schema.trips.ownerId, ownerId))
    }

    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(and(...conditions))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // 2. Check status - only allow deletion for draft/quoted trips
    if (!canDeleteTrip(existing.status)) {
      throw new BadRequestException(getDeleteErrorMessage(existing.status as TripStatus))
    }

    // 3. Delete the trip (scoped by ID and optional ownerId)
    await this.db.client
      .delete(this.db.schema.trips)
      .where(and(...conditions))

    // Emit trip deleted event
    this.eventEmitter.emit(
      'trip.deleted',
      new TripDeletedEvent(existing.id, existing.name, ownerId || null),
    )
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk delete trips with per-item validation
   *
   * Rules:
   * 1. Trip must exist AND be owned by ownerId (else: "Trip not found or access denied")
   * 2. Trip status must be 'draft' or 'quoted' (else: "Cannot delete trip with status '{status}'")
   *
   * @param tripIds - Array of trip IDs to delete
   * @param ownerId - Owner ID for scoping (Phase 4: from JWT)
   */
  async bulkDelete(
    tripIds: string[],
    ownerId: string,
    auth?: AuthContext,
    tripAccessService?: TripAccessService,
  ): Promise<{ success: string[]; failed: Array<{ id: string; reason: string }> }> {
    const success: string[] = []
    const failed: Array<{ id: string; reason: string }> = []

    // Fetch all trips in one query for efficiency
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        ownerId: this.db.schema.trips.ownerId,
        name: this.db.schema.trips.name,
      })
      .from(this.db.schema.trips)
      .where(inArray(this.db.schema.trips.id, tripIds))

    // Create a map for quick lookup
    const tripMap = new Map(trips.map(t => [t.id, t]))

    // Validate each trip
    for (const tripId of tripIds) {
      const trip = tripMap.get(tripId)

      // Check existence
      if (!trip) {
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Check write access using TripAccessService if available
      if (auth && tripAccessService) {
        const canWrite = await tripAccessService.canWrite(tripId, auth)
        if (!canWrite) {
          failed.push({ id: tripId, reason: 'Trip not found or access denied' })
          continue
        }
      } else if (trip.ownerId !== ownerId) {
        // Fallback to legacy owner check
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Check status - only draft/quoted can be deleted
      if (!canDeleteTrip(trip.status)) {
        failed.push({
          id: tripId,
          reason: `Cannot delete trip with status '${trip.status}'`,
        })
        continue
      }

      // Delete the trip
      await this.db.client
        .delete(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))

      // Emit event
      this.eventEmitter.emit(
        'trip.deleted',
        new TripDeletedEvent(trip.id, trip.name, ownerId),
      )

      success.push(tripId)
    }

    return { success, failed }
  }

  /**
   * Bulk archive/unarchive trips
   *
   * Rules:
   * 1. Trip must exist AND be owned by ownerId (else: "Trip not found or access denied")
   * 2. No status restriction - any trip can be archived
   *
   * @param tripIds - Array of trip IDs
   * @param archive - true to archive, false to unarchive
   * @param ownerId - Owner ID for scoping (Phase 4: from JWT)
   */
  async bulkArchive(
    tripIds: string[],
    archive: boolean,
    ownerId: string,
    auth?: AuthContext,
    tripAccessService?: TripAccessService,
  ): Promise<{ success: string[]; failed: Array<{ id: string; reason: string }> }> {
    const success: string[] = []
    const failed: Array<{ id: string; reason: string }> = []

    // Fetch all trips in one query
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        ownerId: this.db.schema.trips.ownerId,
        name: this.db.schema.trips.name,
        isArchived: this.db.schema.trips.isArchived,
      })
      .from(this.db.schema.trips)
      .where(inArray(this.db.schema.trips.id, tripIds))

    // Create a map for quick lookup
    const tripMap = new Map(trips.map(t => [t.id, t]))

    // Process each trip
    for (const tripId of tripIds) {
      const trip = tripMap.get(tripId)

      // Check existence
      if (!trip) {
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Check write access using TripAccessService if available
      if (auth && tripAccessService) {
        const canWrite = await tripAccessService.canWrite(tripId, auth)
        if (!canWrite) {
          failed.push({ id: tripId, reason: 'Trip not found or access denied' })
          continue
        }
      } else if (trip.ownerId !== ownerId) {
        // Fallback to legacy owner check
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Skip if already in desired state
      if (trip.isArchived === archive) {
        success.push(tripId) // Count as success since it's already in the desired state
        continue
      }

      // Update the trip
      await this.db.client
        .update(this.db.schema.trips)
        .set({
          isArchived: archive,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.trips.id, tripId))

      // Emit event
      this.eventEmitter.emit(
        'trip.updated',
        new TripUpdatedEvent(trip.id, trip.name, ownerId, { isArchived: archive }),
      )

      success.push(tripId)
    }

    return { success, failed }
  }

  /**
   * Bulk change status of trips with transition validation
   *
   * Rules:
   * 1. Trip must exist AND be owned by ownerId (else: "Trip not found or access denied")
   * 2. Status transition must be valid per canTransitionTripStatus()
   *
   * @param tripIds - Array of trip IDs
   * @param newStatus - Target status
   * @param ownerId - Owner ID for scoping (Phase 4: from JWT)
   */
  async bulkChangeStatus(
    tripIds: string[],
    newStatus: TripStatus,
    ownerId: string,
    auth?: AuthContext,
    tripAccessService?: TripAccessService,
  ): Promise<{ success: string[]; failed: Array<{ id: string; reason: string }> }> {
    const success: string[] = []
    const failed: Array<{ id: string; reason: string }> = []

    // Fetch all trips in one query
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        ownerId: this.db.schema.trips.ownerId,
        name: this.db.schema.trips.name,
        primaryContactId: this.db.schema.trips.primaryContactId,
      })
      .from(this.db.schema.trips)
      .where(inArray(this.db.schema.trips.id, tripIds))

    // Create a map for quick lookup
    const tripMap = new Map(trips.map(t => [t.id, t]))

    // Process each trip
    for (const tripId of tripIds) {
      const trip = tripMap.get(tripId)

      // Check existence
      if (!trip) {
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Check write access using TripAccessService if available
      if (auth && tripAccessService) {
        const canWrite = await tripAccessService.canWrite(tripId, auth)
        if (!canWrite) {
          failed.push({ id: tripId, reason: 'Trip not found or access denied' })
          continue
        }
      } else if (trip.ownerId !== ownerId) {
        // Fallback to legacy owner check
        failed.push({ id: tripId, reason: 'Trip not found or access denied' })
        continue
      }

      // Check if already in target status
      if (trip.status === newStatus) {
        success.push(tripId) // Count as success since it's already in the desired state
        continue
      }

      // Validate status transition
      if (!canTransitionTripStatus(trip.status as TripStatus, newStatus)) {
        const errorMessage = getTransitionErrorMessage(
          trip.status as TripStatus,
          newStatus
        )
        failed.push({ id: tripId, reason: errorMessage })
        continue
      }

      // Auto-set booking date if transitioning to 'booked'
      const isTransitioningToBooked = newStatus === 'booked' && trip.status !== 'booked'
      const bookingDate = isTransitioningToBooked
        ? new Date().toISOString().split('T')[0]
        : undefined

      // Update the trip
      const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date(),
      }
      if (bookingDate) {
        updateData.bookingDate = bookingDate
      }

      await this.db.client
        .update(this.db.schema.trips)
        .set(updateData)
        .where(eq(this.db.schema.trips.id, tripId))

      // Emit events
      this.eventEmitter.emit(
        'trip.updated',
        new TripUpdatedEvent(trip.id, trip.name, ownerId, { status: newStatus }),
      )

      // If transitioning to 'booked', emit booking event
      if (isTransitioningToBooked && trip.primaryContactId && bookingDate) {
        this.eventEmitter.emit(
          'trip.booked',
          new TripBookedEvent(trip.id, trip.primaryContactId, bookingDate),
        )
      }

      success.push(tripId)
    }

    return { success, failed }
  }

  /**
   * Get filter options for trips
   *
   * Returns available options for filter dropdowns, scoped by ownership.
   *
   * @param ownerId - Owner ID for scoping
   */
  async getFilterOptions(ownerId: string, agencyId: string): Promise<{
    statuses: TripStatus[]
    tripTypes: string[]
    tags: string[]
    groups: { id: string; name: string }[]
  }> {
    // Get distinct tags from user's trips
    const tagsResult = await this.db.client
      .selectDistinct({ tag: sql<string>`unnest(${this.db.schema.trips.tags})` })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.ownerId, ownerId))

    const tags = tagsResult
      .map(r => r.tag)
      .filter((tag): tag is string => tag !== null)
      .sort()

    // Get trip groups for the agency
    const groupsResult = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        name: this.db.schema.tripGroups.name,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.agencyId, agencyId))

    // Return static options + dynamic tags + groups
    return {
      statuses: ['draft', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled', 'inbound'] as TripStatus[],
      tripTypes: ['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom'],
      tags,
      groups: groupsResult,
    }
  }

  /**
   * Get booking status for all activities in a trip
   *
   * Aggregates payment and commission status for the Bookings tab.
   *
   * @param tripId - Trip ID
   */
  async getBookingStatus(tripId: string): Promise<TripBookingStatusResponseDto> {
    // 1. Verify trip exists
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`)
    }

    // 2. Get all itinerary days for this trip
    const itineraries = await this.db.client
      .select({ id: this.db.schema.itineraries.id })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, tripId))

    if (itineraries.length === 0) {
      return {
        tripId,
        activities: {},
        summary: {
          totalActivities: 0,
          activitiesWithPaymentSchedule: 0,
          totalExpectedCents: 0,
          totalPaidCents: 0,
          totalRemainingCents: 0,
          overdueCount: 0,
          upcomingDueCount: 0,
        },
      }
    }

    const itineraryIds = itineraries.map(i => i.id)

    // 3. Get all days for these itineraries
    const days = await this.db.client
      .select({ id: this.db.schema.itineraryDays.id })
      .from(this.db.schema.itineraryDays)
      .where(inArray(this.db.schema.itineraryDays.itineraryId, itineraryIds))

    if (days.length === 0) {
      return {
        tripId,
        activities: {},
        summary: {
          totalActivities: 0,
          activitiesWithPaymentSchedule: 0,
          totalExpectedCents: 0,
          totalPaidCents: 0,
          totalRemainingCents: 0,
          overdueCount: 0,
          upcomingDueCount: 0,
        },
      }
    }

    const dayIds = days.map(d => d.id)

    // 4. Get all activities for these days
    const activities = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        name: this.db.schema.itineraryActivities.name,
      })
      .from(this.db.schema.itineraryActivities)
      .where(inArray(this.db.schema.itineraryActivities.itineraryDayId, dayIds))

    if (activities.length === 0) {
      return {
        tripId,
        activities: {},
        summary: {
          totalActivities: 0,
          activitiesWithPaymentSchedule: 0,
          totalExpectedCents: 0,
          totalPaidCents: 0,
          totalRemainingCents: 0,
          overdueCount: 0,
          upcomingDueCount: 0,
        },
      }
    }

    const activityIds = activities.map(a => a.id)

    // 5. Get activity_pricing for all activities
    const pricingRecords = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(inArray(this.db.schema.activityPricing.activityId, activityIds))

    // Create a map of activityId -> pricing
    const pricingMap = new Map(pricingRecords.map(p => [p.activityId, p]))

    // 6. Get payment_schedule_config for all activity_pricing records
    const pricingIds = pricingRecords.map(p => p.id)

    const scheduleConfigs = pricingIds.length > 0
      ? await this.db.client
          .select()
          .from(this.db.schema.paymentScheduleConfig)
          .where(inArray(this.db.schema.paymentScheduleConfig.activityPricingId, pricingIds))
      : []

    // Create a map of activityPricingId -> scheduleConfig
    const scheduleConfigMap = new Map(scheduleConfigs.map(s => [s.activityPricingId, s]))

    // 7. Get expected_payment_items for all schedule configs
    const scheduleConfigIds = scheduleConfigs.map(s => s.id)

    const expectedItems = scheduleConfigIds.length > 0
      ? await this.db.client
          .select()
          .from(this.db.schema.expectedPaymentItems)
          .where(inArray(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, scheduleConfigIds))
      : []

    // Group expected items by scheduleConfigId
    const itemsByConfig = new Map<string, typeof expectedItems>()
    for (const item of expectedItems) {
      const items = itemsByConfig.get(item.paymentScheduleConfigId) || []
      items.push(item)
      itemsByConfig.set(item.paymentScheduleConfigId, items)
    }

    // 8. Build the activities map and summary
    const activitiesStatus: Record<string, ActivityBookingStatusDto> = {}
    let totalExpectedCents = 0
    let totalPaidCents = 0
    let activitiesWithPaymentSchedule = 0
    let overdueCount = 0
    let upcomingDueCount = 0

    const today = new Date().toISOString().split('T')[0] ?? ''
    const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? ''

    for (const activity of activities) {
      const pricing = pricingMap.get(activity.id)
      const scheduleConfig = pricing ? scheduleConfigMap.get(pricing.id) : null
      const items = scheduleConfig ? itemsByConfig.get(scheduleConfig.id) || [] : []

      const hasPaymentSchedule = items.length > 0

      if (hasPaymentSchedule) {
        activitiesWithPaymentSchedule++
      }

      // Get base cost from activity_pricing (authoritative source)
      const baseCostCents = pricing?.totalPriceCents ?? 0

      // Calculate totals for this activity
      let activityExpectedCents = 0
      let activityPaidCents = 0
      let nextDueDate: string | null = null
      let worstStatus: ExpectedPaymentStatus | null = null

      if (hasPaymentSchedule) {
        // When payment schedule exists, use schedule items for tracking
        for (const item of items) {
          activityExpectedCents += item.expectedAmountCents
          activityPaidCents += item.paidAmountCents || 0

          // Track overdue and upcoming due counts
          if (item.dueDate) {
            if (item.status === 'overdue' || (item.dueDate < today && item.status !== 'paid')) {
              overdueCount++
              worstStatus = 'overdue'
            } else if (item.dueDate <= oneWeekFromNow && item.status !== 'paid') {
              upcomingDueCount++
            }

            // Find next unpaid due date
            if (item.status !== 'paid' && (!nextDueDate || item.dueDate < nextDueDate)) {
              nextDueDate = item.dueDate
            }
          }

          // Determine worst status (priority: overdue > partial > pending > paid)
          if (item.status === 'overdue') {
            worstStatus = 'overdue'
          } else if (item.status === 'partial' && worstStatus !== 'overdue') {
            worstStatus = 'partial'
          } else if (item.status === 'pending' && worstStatus !== 'overdue' && worstStatus !== 'partial') {
            worstStatus = 'pending'
          } else if (!worstStatus) {
            worstStatus = item.status as ExpectedPaymentStatus
          }
        }
      } else {
        // No payment schedule - use base cost as expected amount
        activityExpectedCents = baseCostCents
        // Set status to 'unpaid' if there's a cost but no payments yet
        if (baseCostCents > 0) {
          worstStatus = 'pending' as ExpectedPaymentStatus // Show as pending (unpaid)
        }
      }

      totalExpectedCents += activityExpectedCents
      totalPaidCents += activityPaidCents

      activitiesStatus[activity.id] = {
        activityId: activity.id,
        paymentStatus: worstStatus,
        paymentPaidCents: activityPaidCents,
        paymentTotalCents: activityExpectedCents,
        paymentRemainingCents: activityExpectedCents - activityPaidCents,
        commissionStatus: pricing?.commissionTotalCents
          ? ('pending' as CommissionStatus)
          : null,
        commissionTotalCents: pricing?.commissionTotalCents || 0,
        hasPaymentSchedule,
        nextDueDate,
      }
    }

    return {
      tripId,
      activities: activitiesStatus,
      summary: {
        totalActivities: activities.length,
        activitiesWithPaymentSchedule,
        totalExpectedCents,
        totalPaidCents,
        totalRemainingCents: totalExpectedCents - totalPaidCents,
        overdueCount,
        upcomingDueCount,
      },
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(trip: any): TripResponseDto {
    return {
      id: trip.id,
      agencyId: trip.agencyId,
      branchId: trip.branchId,
      ownerId: trip.ownerId,
      name: trip.name,
      description: trip.description,
      tripType: trip.tripType,
      startDate: trip.startDate,
      endDate: trip.endDate,
      bookingDate: trip.bookingDate,
      status: trip.status,
      primaryContactId: trip.primaryContactId,
      referenceNumber: trip.referenceNumber,
      externalReference: trip.externalReference,
      currency: trip.currency,
      estimatedTotalCost: trip.estimatedTotalCost,
      tags: trip.tags || [],
      customFields: trip.customFields,
      isArchived: trip.isArchived,
      isPublished: trip.isPublished,
      timezone: trip.timezone,
      pricingVisibility: trip.pricingVisibility,
      allowPdfDownloads: trip.allowPdfDownloads,
      itineraryStyle: trip.itineraryStyle,
      coverPhotoUrl: trip.coverPhotoUrl || null,
      shareToken: trip.shareToken || null,
      tripGroupId: trip.tripGroupId || null,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    }
  }

  // ============================================================================
  // PUBLISH / UNPUBLISH
  // ============================================================================

  async publishTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const trip = await this.findOne(id)
    if (trip.isPublished) {
      return trip
    }

    const shareToken = crypto.randomBytes(32).toString('hex')
    const [updated] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        isPublished: true,
        shareToken,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    this.eventEmitter.emit('audit.log', {
      entityType: 'trip',
      entityId: id,
      action: 'published',
      actorId,
      metadata: { shareToken },
    })

    return this.mapToResponseDto(updated)
  }

  async unpublishTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const [updated] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        isPublished: false,
        shareToken: null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Trip ${id} not found`)
    }

    this.eventEmitter.emit('audit.log', {
      entityType: 'trip',
      entityId: id,
      action: 'unpublished',
      actorId,
    })

    return this.mapToResponseDto(updated)
  }

  async findByShareToken(token: string) {
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.shareToken, token),
          eq(this.db.schema.trips.isPublished, true),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Shared trip not found')
    }

    // Fetch itineraries for public display
    const itineraries = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, trip.id))

    // Return safe public subset only
    return {
      id: trip.id,
      name: trip.name,
      description: trip.description,
      tripType: trip.tripType,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverPhotoUrl: trip.coverPhotoUrl,
      itineraries: itineraries.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        coverPhoto: it.coverPhoto,
        overview: it.overview,
        startDate: it.startDate,
        endDate: it.endDate,
      })),
    }
  }

  // ============================================================================
  // DUPLICATE TRIP
  // ============================================================================

  async duplicateTrip(tripId: string, actorId: string): Promise<TripResponseDto> {
    return this.db.client.transaction(async (tx) => {
      // 1. Fetch original trip
      const [original] = await tx
        .select()
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      if (!original) {
        throw new NotFoundException(`Trip ${tripId} not found`)
      }

      // 2. Create new trip
      const [newTrip] = await tx
        .insert(this.db.schema.trips)
        .values({
          agencyId: original.agencyId,
          branchId: original.branchId,
          ownerId: actorId,
          name: `${original.name} (Copy)`,
          description: original.description,
          tripType: original.tripType,
          startDate: original.startDate,
          endDate: original.endDate,
          status: 'draft',
          primaryContactId: original.primaryContactId,
          currency: original.currency,
          estimatedTotalCost: original.estimatedTotalCost,
          tags: original.tags,
          customFields: original.customFields,
          timezone: original.timezone,
          pricingVisibility: original.pricingVisibility,
          allowPdfDownloads: original.allowPdfDownloads,
          itineraryStyle: original.itineraryStyle,
          isPublished: false,
          shareToken: null,
        })
        .returning()

      // 3. Copy itineraries
      const originalItineraries = await tx
        .select()
        .from(this.db.schema.itineraries)
        .where(eq(this.db.schema.itineraries.tripId, tripId))

      const itineraryIdMap = new Map<string, string>()

      for (const itin of originalItineraries) {
        const [newItin] = await tx
          .insert(this.db.schema.itineraries)
          .values({
            tripId: newTrip!.id,
            name: itin.name,
            description: itin.description,
            coverPhoto: itin.coverPhoto,
            overview: itin.overview,
            startDate: itin.startDate,
            endDate: itin.endDate,
            status: 'draft',
            isSelected: false,
            sequenceOrder: itin.sequenceOrder,
          })
          .returning()
        itineraryIdMap.set(itin.id, newItin!.id)
      }

      // 4. Copy itinerary days
      const dayIdMap = new Map<string, string>()

      for (const [oldItinId, newItinId] of itineraryIdMap) {
        const days = await tx
          .select()
          .from(this.db.schema.itineraryDays)
          .where(eq(this.db.schema.itineraryDays.itineraryId, oldItinId))

        for (const day of days) {
          const [newDay] = await tx
            .insert(this.db.schema.itineraryDays)
            .values({
              agencyId: original.agencyId,
              itineraryId: newItinId,
              dayNumber: day.dayNumber,
              date: day.date,
              title: day.title,
              notes: day.notes,
              sequenceOrder: day.sequenceOrder,
            })
            .returning()
          dayIdMap.set(day.id, newDay!.id)
        }
      }

      // 5. Copy activities + detail tables
      const activityIdMap = new Map<string, string>()

      // First pass: copy all activities (without parentActivityId remapping)
      for (const [oldDayId, newDayId] of dayIdMap) {
        const activities = await tx
          .select()
          .from(this.db.schema.itineraryActivities)
          .where(eq(this.db.schema.itineraryActivities.itineraryDayId, oldDayId))

        for (const activity of activities) {
          const [newActivity] = await tx
            .insert(this.db.schema.itineraryActivities)
            .values({
              agencyId: original.agencyId,
              itineraryDayId: newDayId,
              name: activity.name,
              activityType: activity.activityType,
              componentType: activity.componentType,
              description: activity.description,
              startDatetime: activity.startDatetime,
              endDatetime: activity.endDatetime,
              sequenceOrder: activity.sequenceOrder,
              status: activity.status,
              confirmationNumber: activity.confirmationNumber,
              notes: activity.notes,
              // parentActivityId remapped in second pass
            })
            .returning()
          if (newActivity) {
            activityIdMap.set(activity.id, newActivity.id)
          }
        }
      }

      // Second pass: remap parentActivityId
      for (const [oldId, newId] of activityIdMap) {
        // Find original activity's parentActivityId
        const [orig] = await tx
          .select({ parentActivityId: this.db.schema.itineraryActivities.parentActivityId })
          .from(this.db.schema.itineraryActivities)
          .where(eq(this.db.schema.itineraryActivities.id, oldId))
          .limit(1)

        if (orig?.parentActivityId && activityIdMap.has(orig.parentActivityId)) {
          await tx
            .update(this.db.schema.itineraryActivities)
            .set({ parentActivityId: activityIdMap.get(orig.parentActivityId) })
            .where(eq(this.db.schema.itineraryActivities.id, newId))
        }
      }

      // Copy all detail tables for each activity
      await this.copyActivityDetails(tx, activityIdMap)

      if (!newTrip) {
        throw new Error('Failed to duplicate trip')
      }

      this.eventEmitter.emit('audit.log', {
        entityType: 'trip',
        entityId: newTrip.id,
        action: 'created',
        actorId,
        metadata: { duplicatedFrom: tripId },
      })

      return this.mapToResponseDto(newTrip)
    })
  }

  private async copyActivityDetails(tx: any, activityIdMap: Map<string, string>) {
    for (const [oldActivityId, newActivityId] of activityIdMap) {
      // Flight details + segments
      const flights = await tx
        .select()
        .from(this.db.schema.flightDetails)
        .where(eq(this.db.schema.flightDetails.activityId, oldActivityId))

      for (const flight of flights) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...flightData } = flight
        await tx
          .insert(this.db.schema.flightDetails)
          .values({ ...flightData, activityId: newActivityId })
      }

      // Flight segments (FK to activityId, not flightDetailId)
      const segments = await tx
        .select()
        .from(this.db.schema.flightSegments)
        .where(eq(this.db.schema.flightSegments.activityId, oldActivityId))
      for (const seg of segments) {
        const { id: _sid, activityId: _sactId, createdAt: _sca, updatedAt: _sua, ...segData } = seg
        await tx
          .insert(this.db.schema.flightSegments)
          .values({ ...segData, activityId: newActivityId })
      }

      // Lodging details
      const lodgings = await tx
        .select()
        .from(this.db.schema.lodgingDetails)
        .where(eq(this.db.schema.lodgingDetails.activityId, oldActivityId))
      for (const lodging of lodgings) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = lodging
        await tx.insert(this.db.schema.lodgingDetails).values({ ...data, activityId: newActivityId })
      }

      // Dining details
      const dinings = await tx
        .select()
        .from(this.db.schema.diningDetails)
        .where(eq(this.db.schema.diningDetails.activityId, oldActivityId))
      for (const dining of dinings) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = dining
        await tx.insert(this.db.schema.diningDetails).values({ ...data, activityId: newActivityId })
      }

      // Transportation details
      const transports = await tx
        .select()
        .from(this.db.schema.transportationDetails)
        .where(eq(this.db.schema.transportationDetails.activityId, oldActivityId))
      for (const transport of transports) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = transport
        await tx.insert(this.db.schema.transportationDetails).values({ ...data, activityId: newActivityId })
      }

      // Options details
      const options = await tx
        .select()
        .from(this.db.schema.optionsDetails)
        .where(eq(this.db.schema.optionsDetails.activityId, oldActivityId))
      for (const option of options) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = option
        await tx.insert(this.db.schema.optionsDetails).values({ ...data, activityId: newActivityId })
      }

      // Custom cruise details
      const cruises = await tx
        .select()
        .from(this.db.schema.customCruiseDetails)
        .where(eq(this.db.schema.customCruiseDetails.activityId, oldActivityId))
      for (const cruise of cruises) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = cruise
        await tx.insert(this.db.schema.customCruiseDetails).values({ ...data, activityId: newActivityId })
      }

      // Port info details
      const ports = await tx
        .select()
        .from(this.db.schema.portInfoDetails)
        .where(eq(this.db.schema.portInfoDetails.activityId, oldActivityId))
      for (const port of ports) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = port
        await tx.insert(this.db.schema.portInfoDetails).values({ ...data, activityId: newActivityId })
      }

      // Activity pricing
      const pricings = await tx
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, oldActivityId))
      for (const pricing of pricings) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = pricing
        await tx.insert(this.db.schema.activityPricing).values({ ...data, activityId: newActivityId })
      }

      // Activity media
      const medias = await tx
        .select()
        .from(this.db.schema.activityMedia)
        .where(eq(this.db.schema.activityMedia.activityId, oldActivityId))
      for (const media of medias) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = media
        await tx.insert(this.db.schema.activityMedia).values({ ...data, activityId: newActivityId })
      }

      // Activity documents
      const docs = await tx
        .select()
        .from(this.db.schema.activityDocuments)
        .where(eq(this.db.schema.activityDocuments.activityId, oldActivityId))
      for (const doc of docs) {
        const { id: _id, activityId: _actId, createdAt: _ca, updatedAt: _ua, ...data } = doc
        await tx.insert(this.db.schema.activityDocuments).values({ ...data, activityId: newActivityId })
      }
    }
  }

  // ============================================================================
  // TRIP GROUPS
  // ============================================================================

  async listTripGroups(agencyId: string) {
    const groups = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        agencyId: this.db.schema.tripGroups.agencyId,
        name: this.db.schema.tripGroups.name,
        description: this.db.schema.tripGroups.description,
        createdAt: this.db.schema.tripGroups.createdAt,
        updatedAt: this.db.schema.tripGroups.updatedAt,
        tripCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${this.db.schema.trips}
          WHERE ${this.db.schema.trips.tripGroupId} = ${this.db.schema.tripGroups.id}
        )`,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.agencyId, agencyId))

    return groups
  }

  async createTripGroup(name: string, agencyId: string, actorId: string) {
    const [group] = await this.db.client
      .insert(this.db.schema.tripGroups)
      .values({
        name,
        agencyId,
        createdBy: actorId,
      })
      .returning()

    return group
  }

  async updateTripGroup(
    groupId: string,
    data: { name?: string; description?: string },
    agencyId: string,
    actorId: string,
  ) {
    try {
      const [group] = await this.db.client
        .update(this.db.schema.tripGroups)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(this.db.schema.tripGroups.id, groupId),
            eq(this.db.schema.tripGroups.agencyId, agencyId),
          ),
        )
        .returning()

      if (!group) {
        throw new NotFoundException(`Trip group with ID ${groupId} not found`)
      }

      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent('trip_group', group.id, 'updated', group.id, actorId, group.name),
      )

      return group
    } catch (error: any) {
      // Handle unique constraint violation
      if (error?.code === '23505') {
        throw new ConflictException('A group with this name already exists')
      }
      throw error
    }
  }

  async deleteTripGroup(groupId: string, agencyId: string, actorId: string) {
    // Transactional: unlink trips then delete group
    await this.db.client.transaction(async (tx) => {
      // Get group first for audit
      const [group] = await tx
        .select()
        .from(this.db.schema.tripGroups)
        .where(
          and(
            eq(this.db.schema.tripGroups.id, groupId),
            eq(this.db.schema.tripGroups.agencyId, agencyId),
          ),
        )
        .limit(1)

      if (!group) {
        throw new NotFoundException(`Trip group with ID ${groupId} not found`)
      }

      // Unlink all trips in this group
      await tx
        .update(this.db.schema.trips)
        .set({ tripGroupId: null, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.tripGroupId, groupId))

      // Delete the group
      await tx
        .delete(this.db.schema.tripGroups)
        .where(eq(this.db.schema.tripGroups.id, groupId))

      this.eventEmitter.emit(
        'audit.deleted',
        new AuditEvent('trip_group', group.id, 'deleted', group.id, actorId, group.name),
      )
    })
  }

  async getTripsByGroup(groupId: string, agencyId: string) {
    return this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        status: this.db.schema.trips.status,
        startDate: this.db.schema.trips.startDate,
      })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.tripGroupId, groupId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
  }
}
