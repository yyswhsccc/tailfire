/**
 * Trips Service
 *
 * Business logic for managing trips.
 */

import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as crypto from 'crypto'
import { eq, and, or, gte, lte, ilike, sql, desc, asc, inArray, isNull, isNotNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripActiveEvent } from './events/trip-active.event'
import { TripCancelledEvent } from './events/trip-cancelled.event'
import { TripTravellingEvent } from './events/trip-travelling.event'
import { TripTravelledEvent } from './events/trip-travelled.event'
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
  CancelTripDto,
} from '@tailfire/shared-types'
import {
  canTransitionTripStatus,
  getTransitionErrorMessage,
  canDeleteTrip,
  getDeleteErrorMessage,
} from '@tailfire/shared-types'
import type { AuthContext } from '../auth/auth.types'
import type { TripAccessService } from './trip-access.service'
import { ItineraryDaysService } from './itinerary-days.service'
import { UserValidationService } from '../common/user-validation.service'
import { AutomationService } from '../automation/automation.service'
import { EmailService } from '../email/email.service'
import { EmailTemplatesService } from '../email/email-templates.service'
import {
  QUEUES,
  JOB_TYPES,
  getTripTransitionJobId,
  getDepartureReminderJobId,
} from '../automation/automation.types'
import type { SendBookingConfirmationDto } from './dto'
import type {
  SharedTripProposalDto,
  SharedItineraryDto,
  SharedItineraryDayDto,
  SharedActivityDto,
  SharedActivityDetailDto,
  SharedActivityPricingDto,
  SharedPricingBreakdownItem,
  ProposalCommentDto,
  ProposalCommentsResponseDto,
} from '@tailfire/shared-types'
import { ItinerariesService } from './itineraries.service'
import { ItineraryVersionsService } from './itinerary-versions.service'

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userValidationService: UserValidationService,
    @Inject(forwardRef(() => AutomationService))
    private readonly automationService: AutomationService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => EmailTemplatesService))
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly itineraryDaysService: ItineraryDaysService,
    @Inject(forwardRef(() => ItinerariesService))
    private readonly itinerariesService: ItinerariesService,
    @Inject(forwardRef(() => ItineraryVersionsService))
    private readonly itineraryVersionsService: ItineraryVersionsService,
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
    const status = dto.status || 'planning'

    // Validate: trips cannot be created in advanced statuses
    // They must go through the workflow (planning → active via status transition)
    const ALLOWED_CREATE_STATUSES = ['inbound', 'planning']
    if (!ALLOWED_CREATE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Trips cannot be created with status "${status}". Use planning or inbound, then transition through the workflow.`
      )
    }

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

    const bookingDate = dto.bookingDate || (status === 'active' ? new Date().toISOString().split('T')[0] : undefined)

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
        commissionFeeRateOverride: dto.commissionFeeRateOverride?.toString(),
        customFields: dto.customFields,
        timezone: dto.timezone,
        tripGroupId: dto.tripGroupId,
        source: dto.source || 'admin',
      })
      .returning()

    if (!trip) {
      throw new Error('Failed to create trip')
    }

    // Auto-create trip collaborator for owner (100% of agent portion)
    if (ownerId) {
      await this.db.client
        .insert(this.db.schema.tripCollaborators)
        .values({
          tripId: trip.id,
          userId: ownerId,
          commissionPercentage: '100', // 100% of agent portion (sole collaborator)
          role: 'lead',
          isActive: true,
          createdBy: ownerId,
        })
        .onConflictDoNothing()
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

    // If trip is being created as 'active' and has a primary contact, emit event
    if (status === 'active' && dto.primaryContactId && bookingDate) {
      this.eventEmitter.emit(
        'trip.active',
        new TripActiveEvent(trip.id, dto.primaryContactId, bookingDate),
      )
    }

    // Schedule auto-transitions if trip is active with dates
    if (status === 'active' && (dto.startDate || dto.endDate)) {
      await this.scheduleStatusTransitions(
        trip.id,
        dto.startDate || null,
        dto.endDate || null,
        dto.timezone,
        'active', // currentStatus
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

    // Soft-delete filter - exclude deleted trips by default
    if (!filters.includeDeleted) {
      conditions.push(isNull(this.db.schema.trips.deletedAt))
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

    // Tags filter (via junction table, visibility-scoped)
    if (filters.tags && filters.tags.length > 0 && auth) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM trip_tags
        JOIN tags ON tags.id = trip_tags.tag_id
        WHERE trip_tags.trip_id = trips.id
        AND tags.name IN (${sql.join(filters.tags.map(t => sql`${t}`), sql`, `)})
        AND tags.agency_id = ${auth.agencyId}
        AND (tags.type = 'system' OR (tags.type = 'agent' AND tags.created_by = ${auth.userId}))
      )`)
    }

    // Trip group filter
    if (filters.tripGroupId) {
      conditions.push(eq(this.db.schema.trips.tripGroupId, filters.tripGroupId))
    }

    // Ungrouped filter — trips not in any group
    if (filters.ungrouped) {
      conditions.push(isNull(this.db.schema.trips.tripGroupId))
    }

    // Unassigned filter — trips with no owner
    if (filters.unassigned) {
      conditions.push(isNull(this.db.schema.trips.ownerId))
    }

    // Has bookings filter — trips with/without booked activities
    if (filters.hasBookings === 'yes') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM itinerary_activities ia
          JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
          JOIN itineraries itin ON itin.id = iday.itinerary_id
          WHERE itin.trip_id = trips.id
          AND ia.booking_status = 'booked'
          AND ia.activity_type NOT IN ('port_info', 'tour_day')
        )`,
      )
    } else if (filters.hasBookings === 'no') {
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM itinerary_activities ia
          JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
          JOIN itineraries itin ON itin.id = iday.itinerary_id
          WHERE itin.trip_id = trips.id
          AND ia.booking_status = 'booked'
          AND ia.activity_type NOT IN ('port_info', 'tour_day')
        )`,
      )
    }

    // Created at range filters
    if (filters.createdAtFrom) {
      conditions.push(
        sql`${this.db.schema.trips.createdAt} >= ${filters.createdAtFrom}`,
      )
    }
    if (filters.createdAtTo) {
      conditions.push(
        sql`${this.db.schema.trips.createdAt} <= ${filters.createdAtTo + 'T23:59:59Z'}`,
      )
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
        commissionFeeRateOverride: this.db.schema.trips.commissionFeeRateOverride,
        tags: this.db.schema.trips.tags,
        customFields: this.db.schema.trips.customFields,
        isArchived: this.db.schema.trips.isArchived,
        isPublished: this.db.schema.trips.isPublished,
        timezone: this.db.schema.trips.timezone,
        pricingVisibility: this.db.schema.trips.pricingVisibility,
        allowPdfDownloads: this.db.schema.trips.allowPdfDownloads,
        itineraryStyle: this.db.schema.trips.itineraryStyle,
        calendarDisplayMode: this.db.schema.trips.calendarDisplayMode,
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

    // Load junction-table tags for all returned trips
    const tripIds = trips.map((t) => t.id)
    const tagsByTrip = new Map<string, Set<string>>()
    if (tripIds.length > 0 && auth) {
      const tagRows = await this.db.client
        .select({
          tripId: this.db.schema.tripTags.tripId,
          tagName: this.db.schema.tags.name,
        })
        .from(this.db.schema.tripTags)
        .innerJoin(this.db.schema.tags, eq(this.db.schema.tags.id, this.db.schema.tripTags.tagId))
        .where(and(
          inArray(this.db.schema.tripTags.tripId, tripIds),
          eq(this.db.schema.tags.agencyId, auth.agencyId),
          or(
            eq(this.db.schema.tags.type, 'system'),
            and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, auth.userId)),
          ),
        ))
        .orderBy(asc(this.db.schema.tags.name))
      tagRows.forEach((r) => {
        if (!tagsByTrip.has(r.tripId)) tagsByTrip.set(r.tripId, new Set())
        tagsByTrip.get(r.tripId)!.add(r.tagName)
      })
    } else if (tripIds.length > 0 && !auth) {
      this.logger.warn('findAll: auth context absent, returning empty tags for trip list')
    }

    // Load owner profiles for all returned trips
    const ownerIds = [...new Set(trips.map((t) => t.ownerId).filter(Boolean))] as string[]
    const ownerMap = new Map<string, { id: string; name: string; email: string }>()
    if (ownerIds.length > 0) {
      const ownerRows = await this.db.client
        .select({
          id: this.db.schema.userProfiles.id,
          firstName: this.db.schema.userProfiles.firstName,
          lastName: this.db.schema.userProfiles.lastName,
          email: this.db.schema.userProfiles.email,
        })
        .from(this.db.schema.userProfiles)
        .where(inArray(this.db.schema.userProfiles.id, ownerIds))
      ownerRows.forEach((r) => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || ''
        ownerMap.set(r.id, { id: r.id, name, email: r.email || '' })
      })
    }

    return {
      data: trips.map((trip) => ({
        ...this.mapToResponseDto(trip),
        tags: [...(tagsByTrip.get(trip.id) || [])],
        owner: trip.ownerId ? ownerMap.get(trip.ownerId) ?? undefined : undefined,
      })),
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
        commissionFeeRateOverride: this.db.schema.trips.commissionFeeRateOverride,
        tags: this.db.schema.trips.tags,
        customFields: this.db.schema.trips.customFields,
        isArchived: this.db.schema.trips.isArchived,
        isPublished: this.db.schema.trips.isPublished,
        timezone: this.db.schema.trips.timezone,
        pricingVisibility: this.db.schema.trips.pricingVisibility,
        allowPdfDownloads: this.db.schema.trips.allowPdfDownloads,
        itineraryStyle: this.db.schema.trips.itineraryStyle,
        calendarDisplayMode: this.db.schema.trips.calendarDisplayMode,
        tripGroupId: this.db.schema.trips.tripGroupId,
        createdAt: this.db.schema.trips.createdAt,
        updatedAt: this.db.schema.trips.updatedAt,
        coverPhotoUrl: coverPhotoSubquery,
      })
      .from(this.db.schema.trips)
      .where(and(eq(this.db.schema.trips.id, id), isNull(this.db.schema.trips.deletedAt)))
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
      if (dto.status === 'cancelled') {
        throw new BadRequestException(
          'Cannot set status to cancelled via update. Use POST /trips/:id/cancel instead.'
        )
      }

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

      // Validate: transitioning to 'active' requires at least one traveler
      if (dto.status === 'active') {
        await this.assertHasTravelers(id, 'set trip to Active')
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

    // Auto-set booking date if transitioning to 'active' status
    const isTransitioningToBooked = dto.status === 'active' && existingTrip.status !== 'active'
    const bookingDate = isTransitioningToBooked && !dto.bookingDate
      ? new Date().toISOString().split('T')[0]
      : dto.bookingDate

    // Track status changes for audit
    const isStatusChange = dto.status && dto.status !== existingTrip.status
    const now = new Date()

    // Strip legacy tags field — tags are managed via junction table endpoints
    const { tags: _legacyTags, ...dtoWithoutTags } = dto as any

    const [trip] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        ...dtoWithoutTags,
        bookingDate,
        estimatedTotalCost: dto.estimatedTotalCost?.toString(),
        updatedAt: now,
        // Set lastStatusChangeAt when status changes manually
        ...(isStatusChange ? { lastStatusChangeAt: now } : {}),
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Sync lead collaborator when owner changes
    if ('ownerId' in dto && dto.ownerId !== existingTrip.ownerId) {
      // Deactivate old owner's lead collaborator
      if (existingTrip.ownerId) {
        await this.db.client
          .update(this.db.schema.tripCollaborators)
          .set({ isActive: false })
          .where(
            and(
              eq(this.db.schema.tripCollaborators.tripId, id),
              eq(this.db.schema.tripCollaborators.userId, existingTrip.ownerId),
              eq(this.db.schema.tripCollaborators.role, 'lead'),
            ),
          )
      }
      // Create or reactivate collaborator for new owner (skip if null/inbound)
      if (dto.ownerId) {
        await this.db.client
          .insert(this.db.schema.tripCollaborators)
          .values({
            tripId: id,
            userId: dto.ownerId,
            commissionPercentage: '100',
            role: 'lead',
            isActive: true,
            createdBy: dto.ownerId,
          })
          .onConflictDoUpdate({
            target: [this.db.schema.tripCollaborators.tripId, this.db.schema.tripCollaborators.userId],
            set: { isActive: true, role: 'lead', commissionPercentage: '100' },
          })
      }
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

    // Emit audit events for group changes + auto-share
    if (isGroupChange) {
      if (dto.tripGroupId) {
        // Trip moved to a group — resolve group info
        const [group] = await this.db.client
          .select({
            name: this.db.schema.tripGroups.name,
            ownerId: this.db.schema.tripGroups.ownerId,
            type: this.db.schema.tripGroups.type,
          })
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

        // Auto-share: give trip owner read access to group (group_bookings only)
        if (
          group &&
          group.type === 'group_booking' &&
          existingTrip.ownerId &&
          existingTrip.ownerId !== group.ownerId
        ) {
          await this.db.client
            .insert(this.db.schema.tripGroupShares)
            .values({
              tripGroupId: dto.tripGroupId,
              sharedWithUserId: existingTrip.ownerId,
              agencyId: existingTrip.agencyId,
              accessLevel: 'read',
              sharedBy: existingTrip.ownerId, // self-triggered via update
              source: 'auto_trip_owner',
              notes: 'Auto-shared: trip owner added to group',
            })
            .onConflictDoNothing()
        }
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

    // If trip is being marked as 'active' for the first time, emit event
    const primaryContactId = trip.primaryContactId || existingTrip.primaryContactId
    if (isTransitioningToBooked && primaryContactId && bookingDate) {
      this.eventEmitter.emit(
        'trip.active',
        new TripActiveEvent(trip.id, primaryContactId, bookingDate),
      )
    }

    // Emit events for manual status changes to travelling or travelled
    if (isStatusChange && dto.status === 'travelling') {
      this.eventEmitter.emit(
        'trip.travelling',
        new TripTravellingEvent(
          trip.id,
          trip.name,
          primaryContactId,
          existingTrip.agencyId,
          false, // isAutoTransition = false for manual changes
          trip.startDate,
        ),
      )
    } else if (isStatusChange && dto.status === 'travelled') {
      this.eventEmitter.emit(
        'trip.travelled',
        new TripTravelledEvent(
          trip.id,
          trip.name,
          primaryContactId,
          existingTrip.agencyId,
          false, // isAutoTransition = false for manual changes
          trip.endDate,
        ),
      )
    }

    // Handle automation scheduling based on status and date changes
    const finalStatus = trip.status
    const startDate = dto.startDate ?? existingTrip.startDate
    const endDate = dto.endDate ?? existingTrip.endDate
    const timezone = dto.timezone ?? existingTrip.timezone ?? undefined
    const datesChanged = dto.startDate !== undefined || dto.endDate !== undefined

    // If transitioning to active, schedule transitions
    if (isTransitioningToBooked && (startDate || endDate)) {
      await this.scheduleStatusTransitions(trip.id, startDate, endDate, timezone, 'active')
    }
    // If already active/travelling and dates changed, reschedule
    else if (
      (finalStatus === 'active' || finalStatus === 'travelling') &&
      datesChanged
    ) {
      await this.rescheduleStatusTransitions(trip.id, startDate, endDate, timezone, finalStatus)
    }
    // If transitioning away from active/travelling to cancelled/travelled, cancel scheduled jobs
    else if (
      dto.status &&
      (existingTrip.status === 'active' || existingTrip.status === 'travelling') &&
      (dto.status === 'cancelled' || dto.status === 'travelled')
    ) {
      await this.cancelScheduledTransitions(trip.id)
    }

    return this.mapToResponseDto(trip)
  }

  /**
   * Update trip ownership (Admin only)
   * Can set to any user in the agency or null (only if status is 'inbound')
   * Now delegates to reassignTripOwner for non-null owners to get contact cascade.
   */
  async updateOwner(id: string, ownerId: string | null, agencyId: string) {
    if (ownerId === null) {
      // Null owner — just update, no cascade
      const [existingTrip] = await this.db.client
        .select().from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, id)).limit(1)

      if (!existingTrip) throw new NotFoundException(`Trip ${id} not found`)
      if (existingTrip.status !== 'inbound') {
        throw new BadRequestException('Trips can only have no owner when status is "inbound"')
      }

      const [trip] = await this.db.client
        .update(this.db.schema.trips)
        .set({ ownerId: null, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.id, id))
        .returning()

      return { trip: this.mapToResponseDto(trip!), cascade: { contactsAssigned: 0, contactsSkipped: [] } }
    }

    const cascade = await this.reassignTripOwner(id, ownerId, agencyId)
    const [updatedTrip] = await this.db.client
      .select().from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id)).limit(1)

    return { trip: this.mapToResponseDto(updatedTrip!), cascade }
  }

  /**
   * Shared method: reassign trip owner with contact cascade.
   *
   * In a transaction:
   *  1. Update trip ownerId
   *  2. Sync lead collaborator (deactivate old, upsert new)
   *  3. Cascade ownership to trip's contacts (travelers + primary contact)
   *     - Unowned contacts → assign to new owner
   *     - Contacts owned by inactive user → reassign
   *     - Contacts owned by active user → skip
   *  4. Emit trip.updated event
   *
   * @returns { contactsAssigned, contactsSkipped }
   */
  async reassignTripOwner(
    tripId: string,
    newOwnerId: string,
    agencyId: string,
  ): Promise<{ contactsAssigned: number; contactsSkipped: { contactName: string; currentOwner: string }[] }> {
    // 1. Get existing trip
    const [existingTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!existingTrip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // 2. Validate new owner is in same agency
    await this.userValidationService.validateUserInAgency(
      newOwnerId,
      agencyId,
      'New owner',
    )

    let contactsAssigned = 0
    const contactsSkipped: { contactName: string; currentOwner: string }[] = []

    await this.db.client.transaction(async (tx) => {
      // 2a. Update trip ownerId
      await tx
        .update(this.db.schema.trips)
        .set({ ownerId: newOwnerId, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.id, tripId))

      // 2b. Sync lead collaborator — deactivate old owner's lead
      if (existingTrip.ownerId) {
        await tx
          .update(this.db.schema.tripCollaborators)
          .set({ isActive: false })
          .where(
            and(
              eq(this.db.schema.tripCollaborators.tripId, tripId),
              eq(this.db.schema.tripCollaborators.userId, existingTrip.ownerId),
              eq(this.db.schema.tripCollaborators.role, 'lead'),
            ),
          )
      }
      // Upsert new owner as lead collaborator
      await tx
        .insert(this.db.schema.tripCollaborators)
        .values({
          tripId,
          userId: newOwnerId,
          commissionPercentage: '100',
          role: 'lead',
          isActive: true,
          createdBy: newOwnerId,
        })
        .onConflictDoUpdate({
          target: [this.db.schema.tripCollaborators.tripId, this.db.schema.tripCollaborators.userId],
          set: { isActive: true, role: 'lead', commissionPercentage: '100' },
        })

      // 2c. Collect traveler contacts via DISTINCT(trip_travelers.contact_id) + primary_contact_id
      const travelers = await tx
        .selectDistinct({ contactId: this.db.schema.tripTravelers.contactId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.tripId, tripId))

      const contactIds = new Set(travelers.map(t => t.contactId))
      if (existingTrip.primaryContactId) {
        contactIds.add(existingTrip.primaryContactId)
      }

      // 2d. For each contact, apply cascade policy
      for (const contactId of contactIds) {
        const [contact] = await tx
          .select({
            id: this.db.schema.contacts.id,
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
            ownerId: this.db.schema.contacts.ownerId,
          })
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, contactId))
          .limit(1)

        if (!contact) continue
        if (contact.ownerId === newOwnerId) continue

        if (!contact.ownerId) {
          await tx.update(this.db.schema.contacts)
            .set({ ownerId: newOwnerId, updatedAt: new Date() })
            .where(eq(this.db.schema.contacts.id, contactId))
          contactsAssigned++
          continue
        }

        const [owner] = await tx
          .select({
            status: this.db.schema.userProfiles.status,
            isActive: this.db.schema.userProfiles.isActive,
            firstName: this.db.schema.userProfiles.firstName,
            lastName: this.db.schema.userProfiles.lastName,
          })
          .from(this.db.schema.userProfiles)
          .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
          .limit(1)

        if (!owner || owner.status !== 'active' || !owner.isActive) {
          await tx.update(this.db.schema.contacts)
            .set({ ownerId: newOwnerId, updatedAt: new Date() })
            .where(eq(this.db.schema.contacts.id, contactId))
          contactsAssigned++
        } else {
          const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'
          const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Unknown'
          contactsSkipped.push({ contactName, currentOwner: ownerName })
        }
      }
    })

    // 2e. Emit trip.updated event
    this.eventEmitter.emit(
      'trip.updated',
      new TripUpdatedEvent(existingTrip.id, existingTrip.name, null, { ownerId: newOwnerId }),
    )

    return { contactsAssigned, contactsSkipped }
  }

  /**
   * Delete a trip
   * Only trips with status 'planning' can be deleted
   *
   * @param id - Trip ID to delete
   * @param ownerId - Owner ID for authorization (Phase 4: when auth is implemented)
   *
   * Phase 4 TODO: When authentication is implemented:
   * 1. Make ownerId required parameter
   * 2. Use ownerId in WHERE clause to scope deletion
   * 3. Add agencyId check for agency-level access control
   */
  async remove(id: string, actorId: string): Promise<void> {
    // 1. Resolve trip first to check status and ownership
    const conditions = [eq(this.db.schema.trips.id, id)]

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

    // 3. Soft-delete the trip
    await this.db.client
      .update(this.db.schema.trips)
      .set({
        deletedAt: new Date(),
        deletedBy: actorId,
        updatedAt: new Date(),
      })
      .where(and(...conditions))

    // Emit trip deleted event
    this.eventEmitter.emit(
      'trip.deleted',
      new TripDeletedEvent(existing.id, existing.name, actorId),
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
   * 2. Trip status must be 'planning' (else: "Cannot delete trip with status '{status}'")
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

      // Soft-delete the trip
      await this.db.client
        .update(this.db.schema.trips)
        .set({
          deletedAt: new Date(),
          deletedBy: ownerId,
          updatedAt: new Date(),
        })
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
    if (newStatus === ('cancelled' as any)) {
      throw new BadRequestException(
        'Cannot set status to cancelled via bulk update. Cancel trips individually via POST /trips/:id/cancel.'
      )
    }

    const success: string[] = []
    const failed: Array<{ id: string; reason: string }> = []

    // Fetch all trips in one query
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
        name: this.db.schema.trips.name,
        primaryContactId: this.db.schema.trips.primaryContactId,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
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

      // Validate: transitioning to 'active' requires at least one traveler
      if (newStatus === 'active') {
        try {
          await this.assertHasTravelers(tripId, 'set trip to Active')
        } catch (e) {
          failed.push({ id: tripId, reason: e instanceof BadRequestException ? e.message : 'Cannot set trip to Active without at least one traveler' })
          continue
        }
      }

      // Auto-set booking date if transitioning to 'active'
      const isTransitioningToBooked = newStatus === 'active' && trip.status !== 'active'
      const bookingDate = isTransitioningToBooked
        ? new Date().toISOString().split('T')[0]
        : undefined

      const now = new Date()

      // Update the trip
      const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: now,
        lastStatusChangeAt: now, // Track manual status change
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

      // If transitioning to 'active', emit booking event
      if (isTransitioningToBooked && trip.primaryContactId && bookingDate) {
        this.eventEmitter.emit(
          'trip.active',
          new TripActiveEvent(trip.id, trip.primaryContactId, bookingDate),
        )
      }

      // Emit events for manual status changes to travelling or travelled
      if (newStatus === 'travelling') {
        this.eventEmitter.emit(
          'trip.travelling',
          new TripTravellingEvent(
            trip.id,
            trip.name,
            trip.primaryContactId,
            trip.agencyId,
            false, // isAutoTransition = false for manual changes
            trip.startDate,
          ),
        )
      } else if (newStatus === 'travelled') {
        this.eventEmitter.emit(
          'trip.travelled',
          new TripTravelledEvent(
            trip.id,
            trip.name,
            trip.primaryContactId,
            trip.agencyId,
            false, // isAutoTransition = false for manual changes
            trip.endDate,
          ),
        )
      }

      success.push(tripId)
    }

    return { success, failed }
  }

  /**
   * Bulk reassign preview (dry-run).
   *
   * Collects unique contacts across all selected trips, classifies each
   * by cascade policy, and returns a preview of what would happen.
   */
  async bulkReassignPreview(tripIds: string[], newOwnerId: string, _agencyId: string) {
    const contactMap = new Map<string, { id: string; firstName: string | null; lastName: string | null; ownerId: string | null }>()

    for (const tripId of tripIds) {
      const travelers = await this.db.client
        .selectDistinct({ contactId: this.db.schema.tripTravelers.contactId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.tripId, tripId))

      const [trip] = await this.db.client
        .select({ primaryContactId: this.db.schema.trips.primaryContactId })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      const ids = new Set(travelers.map(t => t.contactId))
      if (trip?.primaryContactId) ids.add(trip.primaryContactId)

      for (const cid of ids) {
        if (!contactMap.has(cid)) {
          const [contact] = await this.db.client
            .select({
              id: this.db.schema.contacts.id,
              firstName: this.db.schema.contacts.firstName,
              lastName: this.db.schema.contacts.lastName,
              ownerId: this.db.schema.contacts.ownerId,
            })
            .from(this.db.schema.contacts)
            .where(eq(this.db.schema.contacts.id, cid))
            .limit(1)
          if (contact) contactMap.set(cid, contact)
        }
      }
    }

    const contactsToAssign: { id: string; name: string; reason: 'unowned' | 'inactive_owner' }[] = []
    const contactsToSkip: { id: string; name: string; currentOwnerName: string }[] = []

    for (const contact of contactMap.values()) {
      if (contact.ownerId === newOwnerId) continue
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'

      if (!contact.ownerId) {
        contactsToAssign.push({ id: contact.id, name, reason: 'unowned' })
        continue
      }

      const [owner] = await this.db.client
        .select({
          status: this.db.schema.userProfiles.status,
          isActive: this.db.schema.userProfiles.isActive,
          firstName: this.db.schema.userProfiles.firstName,
          lastName: this.db.schema.userProfiles.lastName,
        })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
        .limit(1)

      if (!owner || owner.status !== 'active' || !owner.isActive) {
        contactsToAssign.push({ id: contact.id, name, reason: 'inactive_owner' })
      } else {
        contactsToSkip.push({
          id: contact.id,
          name,
          currentOwnerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Unknown',
        })
      }
    }

    return { tripsCount: tripIds.length, contactsToAssign, contactsToSkip }
  }

  /**
   * Bulk reassign trips to a new owner with contact cascade.
   *
   * Iterates over all trips, calling reassignTripOwner for each,
   * and deduplicates skipped-contact reports across trips.
   */
  async bulkReassign(tripIds: string[], newOwnerId: string, agencyId: string) {
    let totalContactsAssigned = 0
    const allSkipped: { contactName: string; currentOwner: string }[] = []
    const processedSkipKeys = new Set<string>()

    for (const tripId of tripIds) {
      const { contactsAssigned, contactsSkipped } = await this.reassignTripOwner(tripId, newOwnerId, agencyId)
      totalContactsAssigned += contactsAssigned
      for (const s of contactsSkipped) {
        const key = `${s.contactName}|${s.currentOwner}`
        if (!processedSkipKeys.has(key)) {
          processedSkipKeys.add(key)
          allSkipped.push(s)
        }
      }
    }

    return { tripsReassigned: tripIds.length, contactsAssigned: totalContactsAssigned, contactsSkipped: allSkipped }
  }

  /**
   * Get filter options for trips
   *
   * Returns available options for filter dropdowns, scoped by accessible trips
   * (owned + shared + inbound) to match findAll scope.
   */
  async getFilterOptions(auth: AuthContext, tripAccessService: TripAccessService, tripGroupAccessService?: { getAccessibleGroupIds: (auth: AuthContext) => Promise<string[] | 'all'> }): Promise<{
    statuses: TripStatus[]
    tripTypes: string[]
    tags: string[]
    groups: { id: string; name: string }[]
  }> {
    const accessibleTripIds = await tripAccessService.getAccessibleTripIds(auth)

    // Early return if non-admin has no accessible trips
    if (accessibleTripIds !== 'all' && accessibleTripIds.length === 0) {
      // Still filter groups by access
      const groupConditions: any[] = [eq(this.db.schema.tripGroups.agencyId, auth.agencyId)]
      if (tripGroupAccessService && auth.role !== 'admin') {
        const accessibleGroupIds = await tripGroupAccessService.getAccessibleGroupIds(auth)
        if (accessibleGroupIds !== 'all' && accessibleGroupIds.length > 0) {
          groupConditions.push(inArray(this.db.schema.tripGroups.id, accessibleGroupIds))
        } else if (accessibleGroupIds !== 'all') {
          groupConditions.push(sql`false`)
        }
      }
      const groupsResult = await this.db.client
        .select({ id: this.db.schema.tripGroups.id, name: this.db.schema.tripGroups.name })
        .from(this.db.schema.tripGroups)
        .where(and(...groupConditions))
      return {
        statuses: ['inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled'] as TripStatus[],
        tripTypes: ['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom'],
        tags: [],
        groups: groupsResult,
      }
    }

    // Get distinct tag names from junction table (visibility-scoped: system + own agent tags)
    const tripScopeCondition = accessibleTripIds === 'all'
      ? eq(this.db.schema.tags.agencyId, auth.agencyId)
      : inArray(this.db.schema.tripTags.tripId, accessibleTripIds)

    const tagsResult = await this.db.client
      .selectDistinct({ tag: this.db.schema.tags.name })
      .from(this.db.schema.tags)
      .innerJoin(this.db.schema.tripTags, eq(this.db.schema.tags.id, this.db.schema.tripTags.tagId))
      .where(and(
        tripScopeCondition,
        eq(this.db.schema.tags.agencyId, auth.agencyId),
        or(
          eq(this.db.schema.tags.type, 'system'),
          and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, auth.userId)),
        ),
      ))

    const tags = tagsResult
      .map(r => r.tag)
      .filter((tag): tag is string => tag !== null)
      .sort()

    // Get trip groups for the agency (filtered by access for non-admins)
    const groupConditions: any[] = [eq(this.db.schema.tripGroups.agencyId, auth.agencyId)]
    if (tripGroupAccessService && auth.role !== 'admin') {
      const accessibleGroupIds = await tripGroupAccessService.getAccessibleGroupIds(auth)
      if (accessibleGroupIds !== 'all' && accessibleGroupIds.length > 0) {
        groupConditions.push(inArray(this.db.schema.tripGroups.id, accessibleGroupIds))
      } else if (accessibleGroupIds !== 'all') {
        groupConditions.push(sql`false`)
      }
    }
    const groupsResult = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        name: this.db.schema.tripGroups.name,
      })
      .from(this.db.schema.tripGroups)
      .where(and(...groupConditions))

    // Return static options + dynamic tags + groups
    return {
      statuses: ['inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled'] as TripStatus[],
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
          .where(and(
            inArray(this.db.schema.paymentScheduleConfig.activityPricingId, pricingIds),
            isNull(this.db.schema.paymentScheduleConfig.travelerBookingId)
          ))
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
      calendarDisplayMode: trip.calendarDisplayMode || 'trip',
      coverPhotoUrl: trip.coverPhotoUrl || null,
      shareToken: trip.shareToken || null,
      tripGroupId: trip.tripGroupId || null,
      clientSelectedItineraryId: trip.clientSelectedItineraryId || null,
      commissionFeeRateOverride: trip.commissionFeeRateOverride ?? null,
      deletedAt: trip.deletedAt ? trip.deletedAt.toISOString() : null,
      deletedBy: trip.deletedBy || null,
      statusBeforeCancel: trip.statusBeforeCancel || null,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    }
  }

  // ============================================================================
  // TRAVELER VALIDATION
  // ============================================================================

  /**
   * Assert that a trip has at least one traveler.
   * Throws BadRequestException if not.
   */
  private async assertHasTravelers(tripId: string, action: string): Promise<void> {
    const result = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))
    const count = Number(result[0]?.count ?? 0)
    if (count === 0) {
      throw new BadRequestException(
        `Cannot ${action} without at least one traveler. Add travelers first.`
      )
    }
  }

  // ============================================================================
  // PUBLISH / UNPUBLISH
  // ============================================================================

  async publishTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const trip = await this.findOne(id)

    // Require at least one traveler to publish (check even if already published,
    // so removing all travelers from a published trip is surfaced on re-publish)
    await this.assertHasTravelers(id, 'publish a trip')

    if (trip.isPublished && trip.shareToken) {
      return trip
    }

    const shareToken = trip.shareToken || crypto.randomBytes(32).toString('hex')
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

    if (!updated) {
      throw new NotFoundException(`Trip ${id} not found`)
    }

    // Auto-set primary contact to 'quoted' if they're still in 'prospecting'
    if (updated.primaryContactId) {
      await this.db.client.execute(sql`
        UPDATE contacts
        SET contact_status = 'quoted', updated_at = NOW()
        WHERE id = ${updated.primaryContactId}
          AND contact_status = 'prospecting'
          AND is_active = true
      `)
    }

    return this.mapToResponseDto(updated)
  }

  /**
   * Publish version snapshots of ALL proposing itineraries.
   * Ensures the trip is published first (creates shareToken if needed).
   * All-or-nothing: if any itinerary publish fails, none are published.
   */
  async publishTripSnapshot(id: string, actorId: string): Promise<TripResponseDto & { publishedItineraries?: Array<{ itineraryId: string; name: string; versionNumber: number }> }> {
    // Ensure trip is published (idempotent)
    let trip = await this.publishTrip(id, actorId)

    const itineraries = await this.db.client.query.itineraries.findMany({
      where: eq(this.db.schema.itineraries.tripId, id),
    })

    const proposing = itineraries.filter((it) => it.status === 'proposing')
    if (proposing.length === 0) {
      // Fallback to legacy single-itinerary behavior
      const selectedItinerary = itineraries.find((it) => it.isSelected)
        || itineraries.find((it) => it.status === 'approved')
        || itineraries[0] || null

      if (!selectedItinerary) {
        throw new BadRequestException('No itinerary found to publish. Create an itinerary first.')
      }

      const result = await this.itineraryVersionsService.publishVersion(id, selectedItinerary.id, actorId)
      trip = await this.findOne(id)
      this.logger.log(`publishTripSnapshot: tripId=${id}, version=${result.versionNumber}`)
      return { ...trip, publishedItineraries: [{ itineraryId: selectedItinerary.id, name: selectedItinerary.name, versionNumber: result.versionNumber }] }
    }

    // All-or-nothing: publish all proposing itineraries
    const results: Array<{ itineraryId: string; name: string; versionNumber: number }> = []
    for (const itin of proposing) {
      const result = await this.itineraryVersionsService.publishVersion(id, itin.id, actorId)
      results.push({ itineraryId: itin.id, name: itin.name, versionNumber: result.versionNumber })
    }

    // Re-fetch trip to get updated state
    trip = await this.findOne(id)
    this.logger.log(`publishTripSnapshot: tripId=${id}, published ${results.length} itineraries`)
    return { ...trip, publishedItineraries: results }
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

  async findByShareToken(token: string): Promise<SharedTripProposalDto> {
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.shareToken, token),
          eq(this.db.schema.trips.isPublished, true),
          isNull(this.db.schema.trips.deletedAt),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Shared trip not found')
    }

    // Fetch itineraries, agent profile, and primary contact in parallel
    const [itineraries, agentProfile, primaryContact] = await Promise.all([
      this.db.client
        .select()
        .from(this.db.schema.itineraries)
        .where(eq(this.db.schema.itineraries.tripId, trip.id))
        .orderBy(asc(this.db.schema.itineraries.sequenceOrder)),
      trip.ownerId
        ? this.db.client
            .select({
              firstName: this.db.schema.userProfiles.firstName,
              lastName: this.db.schema.userProfiles.lastName,
              avatarUrl: this.db.schema.userProfiles.avatarUrl,
              publicPhone: this.db.schema.userProfiles.publicPhone,
              bio: this.db.schema.userProfiles.bio,
            })
            .from(this.db.schema.userProfiles)
            .where(
              and(
                eq(this.db.schema.userProfiles.id, trip.ownerId),
                eq(this.db.schema.userProfiles.isPublicProfile, true),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] || null)
        : Promise.resolve(null),
      trip.primaryContactId
        ? this.db.client
            .select({
              firstName: this.db.schema.contacts.firstName,
              lastName: this.db.schema.contacts.lastName,
            })
            .from(this.db.schema.contacts)
            .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
            .limit(1)
            .then((rows) => rows[0] || null)
        : Promise.resolve(null),
    ])

    // Determine pricing visibility
    const pricingVisible = trip.pricingVisibility === 'show_all'

    // Multi-itinerary: include 'proposing' always, plus 'approved' (so client can see their approved choice)
    // Legacy fallback: approved itineraries without clientSelectedItineraryId still appear
    const qualifyingItineraries = itineraries.filter(
      (it) => it.status === 'proposing' || it.status === 'approved',
    )

    // Build proposed itineraries from published snapshots
    const proposedItineraries: SharedItineraryDto[] = []
    for (const itin of qualifyingItineraries) {
      let dto: SharedItineraryDto | null = null
      if (itin.publishedVersion) {
        // STRICT: Once published, always serve snapshot — never leak live drafts
        const snapshot = await this.itineraryVersionsService.getPublishedSnapshot(itin.id)
        if (snapshot) {
          dto = snapshot
          dto.publishedVersion = itin.publishedVersion
        }
      } else {
        // LEGACY FALLBACK: Never-published trips still show live data for backward compat
        dto = await this.buildProposalItinerary(itin, pricingVisible)
        if (dto) {
          dto.publishedVersion = itin.publishedVersion
        }
      }
      if (dto) {
        proposedItineraries.push(dto)
      }
    }

    // Legacy compat: pick client-selected or first
    const selectedId = trip.clientSelectedItineraryId
    const legacyItinerary = proposedItineraries.find((it) => it.id === selectedId)
      || proposedItineraries[0] || null

    const primaryContactName = primaryContact
      ? [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ') || null
      : null

    return {
      id: trip.id,
      name: trip.name,
      description: trip.description,
      tripType: trip.tripType,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverPhotoUrl: trip.coverPhotoUrl,
      pricingVisible,
      currency: trip.currency || 'USD',
      itineraries: itineraries.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        coverPhoto: it.coverPhoto,
        overview: it.overview,
        startDate: it.startDate,
        endDate: it.endDate,
      })),
      itinerary: legacyItinerary,
      proposedItineraries,
      agent: agentProfile
        ? {
            firstName: agentProfile.firstName,
            lastName: agentProfile.lastName,
            avatarUrl: agentProfile.avatarUrl,
            publicPhone: agentProfile.publicPhone,
            bio: agentProfile.bio,
          }
        : null,
      primaryContactName,
      publishedVersion: legacyItinerary?.publishedVersion ?? null,
      clientSelectedItineraryId: trip.clientSelectedItineraryId,
    }
  }

  /**
   * Preview proposal with live data (authenticated admin endpoint).
   * Used by the admin "Preview" button to see current draft state.
   */
  async previewProposal(tripId: string): Promise<SharedTripProposalDto> {
    const trip = await this.findOne(tripId)
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    const itineraries = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, tripId))
      .orderBy(asc(this.db.schema.itineraries.sequenceOrder))

    const pricingVisible = trip.pricingVisibility === 'show_all'

    // Build ALL itineraries with LIVE data (preview shows everything, not just proposing)
    const proposedItineraries: SharedItineraryDto[] = []
    for (const itin of itineraries) {
      const dto = await this.buildProposalItinerary(itin, pricingVisible)
      if (dto) {
        dto.publishedVersion = itin.publishedVersion
        proposedItineraries.push(dto)
      }
    }

    const legacyItinerary = proposedItineraries[0] || null

    // Get agent profile
    let agentProfile = null
    if (trip.ownerId) {
      const [profile] = await this.db.client
        .select({
          firstName: this.db.schema.userProfiles.firstName,
          lastName: this.db.schema.userProfiles.lastName,
          avatarUrl: this.db.schema.userProfiles.avatarUrl,
          publicPhone: this.db.schema.userProfiles.publicPhone,
          bio: this.db.schema.userProfiles.bio,
        })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, trip.ownerId))
        .limit(1)
      if (profile) {
        agentProfile = profile
      }
    }

    // Get primary contact name
    let primaryContactName: string | null = null
    if (trip.primaryContactId) {
      const [contact] = await this.db.client
        .select({
          firstName: this.db.schema.contacts.firstName,
          lastName: this.db.schema.contacts.lastName,
        })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
        .limit(1)
      if (contact) {
        primaryContactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null
      }
    }

    return {
      id: trip.id,
      name: trip.name,
      description: trip.description,
      tripType: trip.tripType,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverPhotoUrl: trip.coverPhotoUrl,
      pricingVisible,
      currency: trip.currency || 'USD',
      itineraries: itineraries.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        coverPhoto: it.coverPhoto,
        overview: it.overview,
        startDate: it.startDate,
        endDate: it.endDate,
      })),
      itinerary: legacyItinerary,
      proposedItineraries,
      agent: agentProfile,
      primaryContactName,
      publishedVersion: legacyItinerary?.publishedVersion ?? null,
      clientSelectedItineraryId: trip.clientSelectedItineraryId,
    }
  }

  // ============================================================================
  // CLIENT ITINERARY SELECTION
  // ============================================================================

  /**
   * Client selects their preferred itinerary from multiple proposals.
   * Selection is reversible until an itinerary is approved.
   */
  async selectItinerary(token: string, itineraryId: string) {
    const { trip, itineraries } = await this.resolveShareToken(token)

    // Verify the itinerary belongs to this trip and is proposing
    const target = itineraries.find((it) => it.id === itineraryId && it.status === 'proposing')
    if (!target) {
      throw new BadRequestException('Itinerary not available for selection')
    }

    // Cannot change if already approved
    const approved = itineraries.find((it) => it.status === 'approved')
    if (approved) {
      throw new BadRequestException('An itinerary has already been approved')
    }

    await this.db.client.update(this.db.schema.trips)
      .set({ clientSelectedItineraryId: itineraryId, updatedAt: new Date() })
      .where(eq(this.db.schema.trips.id, trip.id))

    this.eventEmitter.emit('proposal.itinerary_selected', {
      tripId: trip.id,
      itineraryId,
      itineraryName: target.name,
    })

    return { success: true, selectedItineraryId: itineraryId }
  }

  // ============================================================================
  // SHARED PROPOSAL COMMENTS & APPROVAL
  // ============================================================================

  /**
   * Resolve a share token to its trip + selected itinerary.
   * Reusable helper for all public share endpoints.
   */
  private async resolveShareToken(token: string) {
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.shareToken, token),
          eq(this.db.schema.trips.isPublished, true),
          isNull(this.db.schema.trips.deletedAt),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Shared trip not found')
    }

    const itineraries = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, trip.id))
      .orderBy(asc(this.db.schema.itineraries.sequenceOrder))

    // Multi-itinerary: resolve the selected itinerary based on client selection or legacy logic
    const selectedItinerary = this.resolveSelectedItinerary(trip, itineraries)

    return { trip, selectedItinerary, itineraries }
  }

  /**
   * Resolve the selected itinerary for share endpoints.
   * Multi-itinerary: uses clientSelectedItineraryId if set.
   * Legacy: falls back to isSelected > approved > first.
   */
  private resolveSelectedItinerary(trip: any, itineraries: any[]): any | null {
    // Multi-itinerary: prefer client's selection
    if (trip.clientSelectedItineraryId) {
      const clientSelected = itineraries.find((it) => it.id === trip.clientSelectedItineraryId)
      if (clientSelected) return clientSelected
    }

    // Legacy fallback
    let selected = itineraries.find((it) => it.isSelected)
      || itineraries.find((it) => it.status === 'approved')
      || itineraries.find((it) => it.status === 'proposing')
      || itineraries[0] || null

    // Prefer published itinerary if selected has no published version
    if (selected && !selected.publishedVersion) {
      const publishedAlt = itineraries.find((it) => it.publishedVersion)
      if (publishedAlt) selected = publishedAlt
    }

    return selected
  }

  /**
   * Get all comments for a proposal (public, no auth).
   * Scoped by itineraryId and filtered to the current published version.
   */
  async getProposalComments(token: string, itineraryId?: string): Promise<ProposalCommentsResponseDto> {
    const { trip, selectedItinerary, itineraries } = await this.resolveShareToken(token)

    // Resolve which itinerary to use: explicit param > selected > legacy
    let targetItinerary = selectedItinerary
    if (itineraryId) {
      targetItinerary = itineraries.find((it) => it.id === itineraryId) || selectedItinerary
    }

    if (!targetItinerary) {
      return { comments: [], commentCounts: {} }
    }

    const publishedVersion = targetItinerary.publishedVersion

    // Build filter conditions: tripId + itineraryId + not deleted
    const conditions = [
      eq(this.db.schema.proposalComments.tripId, trip.id),
      eq(this.db.schema.proposalComments.itineraryId, targetItinerary.id),
      eq(this.db.schema.proposalComments.isDeleted, false),
    ]

    // Version-scoped: only show comments for current published version (or null for legacy)
    if (publishedVersion) {
      conditions.push(eq(this.db.schema.proposalComments.versionNumber, publishedVersion))
    } else {
      conditions.push(isNull(this.db.schema.proposalComments.versionNumber))
    }

    const rows = await this.db.client
      .select()
      .from(this.db.schema.proposalComments)
      .where(and(...conditions))
      .orderBy(asc(this.db.schema.proposalComments.createdAt))

    const comments: ProposalCommentDto[] = rows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      dayId: row.dayId || null,
      versionNumber: row.versionNumber || null,
      authorType: row.authorType,
      authorName: row.authorName,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }))

    // Build comment counts per activity and per day
    const commentCounts: Record<string, number> = {}
    for (const c of comments) {
      const key = c.activityId || 'general'
      commentCounts[key] = (commentCounts[key] || 0) + 1
      // Also count day-level comments
      if (c.dayId) {
        const dayKey = `day:${c.dayId}`
        commentCounts[dayKey] = (commentCounts[dayKey] || 0) + 1
      }
    }

    return { comments, commentCounts }
  }

  /**
   * Create a client comment on a proposal (public, no auth)
   * Fix F: Validate activityId/dayId against snapshot when published.
   * Change 5: Accept dayId, auto-set versionNumber, emit event.
   * Change 6: Accept itineraryId for multi-itinerary scoping.
   */
  async createProposalComment(
    token: string,
    dto: { itineraryId?: string; activityId?: string; dayId?: string; content: string },
  ): Promise<ProposalCommentDto> {
    const { trip, selectedItinerary, itineraries } = await this.resolveShareToken(token)

    // Resolve target itinerary: explicit param > selected > legacy
    let targetItinerary = selectedItinerary
    if (dto.itineraryId) {
      targetItinerary = itineraries.find((it) => it.id === dto.itineraryId) || selectedItinerary
    }

    if (!targetItinerary) {
      throw new BadRequestException('No itinerary found for this proposal')
    }

    // Alias for backward compat with the rest of the method
    const selectedItineraryRef = targetItinerary

    if (!trip.primaryContactId) {
      throw new BadRequestException('No primary contact set for this trip — cannot post client comment')
    }

    // Fix F: Validate activityId/dayId against snapshot when published
    if (dto.activityId && selectedItineraryRef.publishedVersion) {
      const snapshot = await this.itineraryVersionsService.getPublishedSnapshot(selectedItineraryRef.id)
      const snapshotActivityIds = snapshot?.days?.flatMap(d => d.activities?.map(a => a.id) ?? []) ?? []
      if (!snapshotActivityIds.includes(dto.activityId)) {
        throw new BadRequestException('Activity not found in published version')
      }
    } else if (dto.activityId) {
      // Legacy: validate against live tables
      const [activity] = await this.db.client
        .select({ id: this.db.schema.itineraryActivities.id })
        .from(this.db.schema.itineraryActivities)
        .innerJoin(
          this.db.schema.itineraryDays,
          eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
        )
        .where(
          and(
            eq(this.db.schema.itineraryActivities.id, dto.activityId),
            eq(this.db.schema.itineraryDays.itineraryId, selectedItineraryRef.id),
          ),
        )
        .limit(1)
      if (!activity) {
        throw new BadRequestException('Activity not found in this proposal')
      }
    }

    if (dto.dayId && selectedItineraryRef.publishedVersion) {
      const snapshot = await this.itineraryVersionsService.getPublishedSnapshot(selectedItineraryRef.id)
      const snapshotDayIds = snapshot?.days?.map(d => d.id) ?? []
      if (!snapshotDayIds.includes(dto.dayId)) {
        throw new BadRequestException('Day not found in published version')
      }
    }

    // Resolve primary contact name
    let authorName = 'Client'
    if (trip.primaryContactId) {
      const [contact] = await this.db.client
        .select({
          firstName: this.db.schema.contacts.firstName,
          lastName: this.db.schema.contacts.lastName,
        })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
        .limit(1)

      if (contact) {
        authorName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Client'
      }
    }

    // Auto-set versionNumber from current publishedVersion
    const versionNumber = selectedItineraryRef.publishedVersion || null

    const [comment] = await this.db.client
      .insert(this.db.schema.proposalComments)
      .values({
        tripId: trip.id,
        itineraryId: selectedItineraryRef.id,
        activityId: dto.activityId || null,
        dayId: dto.dayId || null,
        versionNumber,
        authorType: 'client',
        contactId: trip.primaryContactId,
        authorName,
        content: dto.content,
      })
      .returning()

    if (!comment) {
      throw new BadRequestException('Failed to create comment')
    }

    // Emit event for notifications
    this.eventEmitter.emit('proposal.comment_created', {
      tripId: trip.id,
      itineraryId: selectedItineraryRef.id,
      commentId: comment.id,
      authorType: 'client',
      authorName,
      activityId: dto.activityId || null,
      dayId: dto.dayId || null,
    })

    return {
      id: comment.id,
      activityId: comment.activityId,
      dayId: comment.dayId || null,
      versionNumber: comment.versionNumber || null,
      authorType: comment.authorType,
      authorName: comment.authorName,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    }
  }

  /**
   * Create an agent comment on a proposal (authenticated)
   */
  async createAgentComment(
    tripId: string,
    itineraryId: string,
    dto: { activityId?: string; dayId?: string; content: string },
    userId: string,
  ): Promise<ProposalCommentDto> {
    // Validate itineraryId belongs to tripId
    const [itinerary] = await this.db.client
      .select({
        id: this.db.schema.itineraries.id,
        publishedVersion: this.db.schema.itineraries.publishedVersion,
      })
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new BadRequestException('Itinerary not found for this trip')
    }

    // Fix F: Validate activityId against snapshot when published
    if (dto.activityId && itinerary.publishedVersion) {
      const snapshot = await this.itineraryVersionsService.getPublishedSnapshot(itineraryId)
      const snapshotActivityIds = snapshot?.days?.flatMap(d => d.activities?.map(a => a.id) ?? []) ?? []
      if (!snapshotActivityIds.includes(dto.activityId)) {
        // Also check live tables for agent comments (they can comment on live activities too)
        const [activity] = await this.db.client
          .select({ id: this.db.schema.itineraryActivities.id })
          .from(this.db.schema.itineraryActivities)
          .innerJoin(
            this.db.schema.itineraryDays,
            eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
          )
          .where(
            and(
              eq(this.db.schema.itineraryActivities.id, dto.activityId),
              eq(this.db.schema.itineraryDays.itineraryId, itineraryId),
            ),
          )
          .limit(1)
        if (!activity) {
          throw new BadRequestException('Activity not found in this itinerary')
        }
      }
    } else if (dto.activityId) {
      const [activity] = await this.db.client
        .select({ id: this.db.schema.itineraryActivities.id })
        .from(this.db.schema.itineraryActivities)
        .innerJoin(
          this.db.schema.itineraryDays,
          eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
        )
        .where(
          and(
            eq(this.db.schema.itineraryActivities.id, dto.activityId),
            eq(this.db.schema.itineraryDays.itineraryId, itineraryId),
          ),
        )
        .limit(1)
      if (!activity) {
        throw new BadRequestException('Activity not found in this itinerary')
      }
    }

    // Get agent name
    const [profile] = await this.db.client
      .select({
        firstName: this.db.schema.userProfiles.firstName,
        lastName: this.db.schema.userProfiles.lastName,
      })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    const authorName = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Agent'
      : 'Agent'

    // Auto-set versionNumber from current publishedVersion
    const versionNumber = itinerary.publishedVersion || null

    const [comment] = await this.db.client
      .insert(this.db.schema.proposalComments)
      .values({
        tripId,
        itineraryId,
        activityId: dto.activityId || null,
        dayId: dto.dayId || null,
        versionNumber,
        authorType: 'agent',
        userId,
        authorName,
        content: dto.content,
      })
      .returning()

    if (!comment) {
      throw new BadRequestException('Failed to create comment')
    }

    // Emit event for notifications
    this.eventEmitter.emit('proposal.comment_created', {
      tripId,
      itineraryId,
      commentId: comment.id,
      authorType: 'agent',
      authorName,
      activityId: dto.activityId || null,
      dayId: dto.dayId || null,
    })

    return {
      id: comment.id,
      activityId: comment.activityId,
      dayId: comment.dayId || null,
      versionNumber: comment.versionNumber || null,
      authorType: comment.authorType,
      authorName: comment.authorName,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    }
  }

  /**
   * Approve a proposal (public, no auth — idempotent).
   * Multi-itinerary: requires clientSelectedItineraryId to be set first.
   * Single-itinerary: auto-selects the only proposing itinerary.
   */
  async approveProposal(token: string): Promise<{ success: boolean; status: string }> {
    const { trip, itineraries } = await this.resolveShareToken(token)

    const proposing = itineraries.filter((it) => it.status === 'proposing')

    // Idempotent: check if any itinerary is already approved
    const alreadyApproved = itineraries.find((it) => it.status === 'approved')
    if (alreadyApproved) {
      return { success: true, status: 'approved' }
    }

    // Determine target itinerary
    let targetId = trip.clientSelectedItineraryId

    // Auto-select for single-itinerary proposals
    if (!targetId && proposing.length === 1) {
      targetId = proposing[0]!.id
    }

    if (!targetId) {
      throw new BadRequestException('Please select an itinerary option before approving')
    }

    // Verify target is actually proposing
    const target = proposing.find((it) => it.id === targetId)
    if (!target) {
      throw new BadRequestException('Selected itinerary is not available for approval')
    }

    // Set the selected itinerary to 'approved' + isSelected
    await this.itinerariesService.update(
      targetId,
      { status: 'approved', isSelected: true },
      trip.id,
    )

    // Also persist the selection if it wasn't already set
    if (!trip.clientSelectedItineraryId) {
      await this.db.client.update(this.db.schema.trips)
        .set({ clientSelectedItineraryId: targetId, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.id, trip.id))
    }

    // Emit event for notifications
    this.eventEmitter.emit('proposal.approved', {
      tripId: trip.id,
      tripName: trip.name,
      itineraryId: targetId,
      itineraryName: target.name,
    })

    return { success: true, status: 'approved' }
  }

  // ============================================================================
  // ACTIVITY RESPONSES (public share endpoints)
  // ============================================================================

  /**
   * Create or update a client's response to an activity (confirm/decline).
   * Upserts per (itinerary, activity, version).
   * Change 6: Accept itineraryId for multi-itinerary scoping.
   */
  async createActivityResponse(
    token: string,
    dto: { itineraryId?: string; activityId: string; response: 'confirmed' | 'declined'; note?: string },
  ) {
    const { trip, selectedItinerary, itineraries } = await this.resolveShareToken(token)

    // Resolve target itinerary: explicit param > selected > legacy
    let targetItinerary = selectedItinerary
    if (dto.itineraryId) {
      targetItinerary = itineraries.find((it) => it.id === dto.itineraryId) || selectedItinerary
    }

    if (!targetItinerary) {
      throw new BadRequestException('No itinerary found for this proposal')
    }
    if (!targetItinerary.publishedVersion) {
      throw new BadRequestException('No published version — cannot respond to activities')
    }

    // Alias for readability
    const selectedItineraryRef = targetItinerary

    // Validate activityId against snapshot
    const snapshot = await this.itineraryVersionsService.getPublishedSnapshot(selectedItineraryRef.id)
    const snapshotActivityIds = snapshot?.days?.flatMap(d => d.activities?.map(a => a.id) ?? []) ?? []
    if (!snapshotActivityIds.includes(dto.activityId)) {
      throw new BadRequestException('Activity not found in published version')
    }

    // Resolve contact name
    let contactName = 'Client'
    if (trip.primaryContactId) {
      const [contact] = await this.db.client
        .select({ firstName: this.db.schema.contacts.firstName, lastName: this.db.schema.contacts.lastName })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
        .limit(1)
      if (contact) {
        contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Client'
      }
    }

    // Upsert: ON CONFLICT (itinerary_id, activity_id, version_number) → UPDATE
    const [upserted] = await this.db.client
      .insert(this.db.schema.clientActivityResponses)
      .values({
        tripId: trip.id,
        itineraryId: selectedItineraryRef.id,
        activityId: dto.activityId,
        versionNumber: selectedItineraryRef.publishedVersion,
        response: dto.response,
        contactId: trip.primaryContactId || null,
        contactName,
        note: dto.note || null,
      })
      .onConflictDoUpdate({
        target: [
          this.db.schema.clientActivityResponses.itineraryId,
          this.db.schema.clientActivityResponses.activityId,
          this.db.schema.clientActivityResponses.versionNumber,
        ],
        set: {
          response: dto.response,
          note: dto.note || null,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!upserted) {
      throw new BadRequestException('Failed to save activity response')
    }

    // Find activity name from snapshot for notification
    const activityName = snapshot?.days
      ?.flatMap(d => d.activities ?? [])
      ?.find(a => a.id === dto.activityId)?.name || 'activity'

    // Emit event for notifications
    this.eventEmitter.emit('proposal.activity_response', {
      tripId: trip.id,
      itineraryId: selectedItineraryRef.id,
      activityId: dto.activityId,
      activityName,
      response: dto.response,
      contactName,
    })

    return {
      id: upserted.id,
      activityId: upserted.activityId,
      versionNumber: upserted.versionNumber,
      response: upserted.response,
      contactName: upserted.contactName,
      note: upserted.note,
      createdAt: upserted.createdAt.toISOString(),
    }
  }

  /**
   * Get all activity responses for the current published version.
   * Change 6: Accept itineraryId for multi-itinerary scoping.
   */
  async getActivityResponses(token: string, itineraryId?: string) {
    const { selectedItinerary, itineraries } = await this.resolveShareToken(token)

    // Resolve target itinerary: explicit param > selected > legacy
    let targetItinerary = selectedItinerary
    if (itineraryId) {
      targetItinerary = itineraries.find((it) => it.id === itineraryId) || selectedItinerary
    }

    if (!targetItinerary || !targetItinerary.publishedVersion) {
      return { responses: [], responseMap: {} }
    }

    const rows = await this.db.client
      .select()
      .from(this.db.schema.clientActivityResponses)
      .where(
        and(
          eq(this.db.schema.clientActivityResponses.itineraryId, targetItinerary.id),
          eq(this.db.schema.clientActivityResponses.versionNumber, targetItinerary.publishedVersion),
        ),
      )

    const responses = rows.map((r) => ({
      id: r.id,
      activityId: r.activityId,
      versionNumber: r.versionNumber,
      response: r.response,
      contactName: r.contactName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }))

    const responseMap: Record<string, string> = {}
    for (const r of responses) {
      responseMap[r.activityId] = r.response
    }

    return { responses, responseMap }
  }

  /**
   * Decline a proposal (public, no auth).
   * Archives the itinerary and optionally posts a reason as a comment.
   * Client decline is implicit — the itinerary is archived, not given a separate status.
   */
  async declineProposal(
    token: string,
    reason?: string,
  ): Promise<{ success: boolean; status: string }> {
    const { trip, selectedItinerary } = await this.resolveShareToken(token)

    if (!selectedItinerary) {
      throw new BadRequestException('No itinerary found for this proposal')
    }

    // Idempotent: already archived
    if (selectedItinerary.status === 'archived') {
      return { success: true, status: 'archived' }
    }

    await this.itinerariesService.update(
      selectedItinerary.id,
      { status: 'archived' },
      trip.id,
    )

    // If reason provided, post as general comment
    if (reason) {
      await this.createProposalComment(token, { content: reason })
    }

    // Emit event for notifications
    this.eventEmitter.emit('proposal.declined', {
      tripId: trip.id,
      tripName: trip.name,
      itineraryId: selectedItinerary.id,
    })

    return { success: true, status: 'archived' }
  }

  // ============================================================================
  // ADMIN ACTIVITY RESPONSES (authenticated)
  // ============================================================================

  /**
   * Get activity responses for an itinerary's published version (admin endpoint).
   * Returns responses scoped to the published version only.
   */
  async getAdminActivityResponses(
    tripId: string,
    itineraryId: string,
  ): Promise<{ responses: any[]; responseMap: Record<string, string> }> {
    // Validate itinerary belongs to trip (throws NotFoundException if not found)
    const itinerary = await this.itinerariesService.findOne(itineraryId, tripId)

    if (!itinerary.publishedVersion) {
      return { responses: [], responseMap: {} }
    }

    const rows = await this.db.client
      .select()
      .from(this.db.schema.clientActivityResponses)
      .where(
        and(
          eq(this.db.schema.clientActivityResponses.itineraryId, itineraryId),
          eq(this.db.schema.clientActivityResponses.versionNumber, itinerary.publishedVersion),
        ),
      )

    const responses = rows.map((r) => ({
      id: r.id,
      activityId: r.activityId,
      versionNumber: r.versionNumber,
      response: r.response,
      contactName: r.contactName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }))

    const responseMap: Record<string, string> = {}
    for (const r of responses) {
      responseMap[r.activityId] = r.response
    }

    return { responses, responseMap }
  }

  // ============================================================================
  // AGENT COMMENTS QUERY (authenticated)
  // ============================================================================

  /**
   * Get comments for an itinerary, optionally filtered by activity.
   * Used by the admin Comments tab.
   */
  async getAgentComments(
    tripId: string,
    itineraryId: string,
    activityId?: string,
  ): Promise<ProposalCommentsResponseDto> {
    const conditions = [
      eq(this.db.schema.proposalComments.tripId, tripId),
      eq(this.db.schema.proposalComments.itineraryId, itineraryId),
      eq(this.db.schema.proposalComments.isDeleted, false),
    ]

    if (activityId) {
      conditions.push(eq(this.db.schema.proposalComments.activityId, activityId))
    }

    const rows = await this.db.client
      .select()
      .from(this.db.schema.proposalComments)
      .where(and(...conditions))
      .orderBy(asc(this.db.schema.proposalComments.createdAt))

    const comments = rows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      dayId: row.dayId || null,
      versionNumber: row.versionNumber || null,
      authorType: row.authorType,
      authorName: row.authorName,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }))

    // Build comment counts keyed by activityId and dayId
    const commentCounts: Record<string, number> = {}
    for (const c of comments) {
      if (c.activityId) {
        commentCounts[c.activityId] = (commentCounts[c.activityId] || 0) + 1
      }
      if (c.dayId) {
        const key = `day:${c.dayId}`
        commentCounts[key] = (commentCounts[key] || 0) + 1
      }
    }

    return { comments, commentCounts }
  }

  // ============================================================================
  // SHARED PROPOSAL HELPERS (private)
  // ============================================================================

  /**
   * Public wrapper for buildProposalItinerary — used by ItineraryVersionsService
   * to build a snapshot for publishing.
   */
  async buildItinerarySnapshot(
    itinerary: typeof this.db.schema.itineraries.$inferSelect,
    pricingVisible: boolean,
  ): Promise<SharedItineraryDto> {
    return this.buildProposalItinerary(itinerary, pricingVisible)
  }

  private async buildProposalItinerary(
    itinerary: typeof this.db.schema.itineraries.$inferSelect,
    pricingVisible: boolean,
  ): Promise<SharedItineraryDto> {
    // Reuse existing tested code path for fetching days + activities
    const daysWithActivities = await this.itineraryDaysService.findAllWithActivities(itinerary.id)

    // Collect all activity IDs across all days
    const allActivityIds: string[] = []
    for (const day of daysWithActivities) {
      for (const activity of day.activities) {
        allActivityIds.push(activity.id)
      }
    }

    if (allActivityIds.length === 0) {
      return {
        id: itinerary.id,
        name: itinerary.name,
        description: itinerary.description,
        coverPhoto: itinerary.coverPhoto,
        overview: itinerary.overview,
        startDate: itinerary.startDate,
        endDate: itinerary.endDate,
        status: itinerary.status,
        publishedVersion: itinerary.publishedVersion,
        days: daysWithActivities.map((day) => ({
          id: day.id,
          dayNumber: day.dayNumber,
          date: day.date,
          title: day.title,
          sequenceOrder: day.sequenceOrder,
          activities: [],
        })),
      }
    }

    // Batch-fetch all detail tables, pricing, media, and child activities in parallel
    const [
      flightDetailsMap,
      flightSegmentsMap,
      lodgingDetailsMap,
      transportDetailsMap,
      diningDetailsMap,
      cruiseDetailsMap,
      tourDetailsMap,
      packageDetailsMap,
      portInfoDetailsMap,
      optionsDetailsMap,
      tourDayDetailsMap,
      pricingMap,
      childActivitiesMap,
      mediaRows,
    ] = await Promise.all([
      this.batchFetchByActivityIds(this.db.schema.flightDetails, allActivityIds),
      this.batchFetchFlightSegments(allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.lodgingDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.transportationDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.diningDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.customCruiseDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.customTourDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.packageDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.portInfoDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.optionsDetails, allActivityIds),
      this.batchFetchByActivityIds(this.db.schema.tourDayDetails, allActivityIds),
      this.batchFetchPricing(allActivityIds),
      this.batchFetchChildActivities(allActivityIds, pricingVisible),
      this.batchFetchMedia(allActivityIds),
    ])

    const mediaMap = this.buildMediaMap(mediaRows)

    // Build day DTOs
    let days: SharedItineraryDayDto[] = daysWithActivities.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      title: day.title,
      sequenceOrder: day.sequenceOrder,
      activities: day.activities.map((activity) =>
        this.toPublicActivity(activity, {
          flightDetails: flightDetailsMap.get(activity.id),
          flightSegments: flightSegmentsMap.get(activity.id) || [],
          lodgingDetails: lodgingDetailsMap.get(activity.id),
          transportDetails: transportDetailsMap.get(activity.id),
          diningDetails: diningDetailsMap.get(activity.id),
          cruiseDetails: cruiseDetailsMap.get(activity.id),
          tourDetails: tourDetailsMap.get(activity.id),
          packageDetails: packageDetailsMap.get(activity.id),
          portInfoDetails: portInfoDetailsMap.get(activity.id),
          optionsDetails: optionsDetailsMap.get(activity.id),
          tourDayDetails: tourDayDetailsMap.get(activity.id),
          pricing: pricingMap.get(activity.id),
          childActivities: childActivitiesMap.get(activity.id) || [],
          media: mediaMap.get(activity.id) || [],
          pricingVisible,
        }),
      ),
    }))

    // Trim trailing empty days (e.g. Day 9 after return flight)
    // Mid-trip free days are preserved
    let lastIdx = days.length - 1
    while (lastIdx >= 0 && days[lastIdx]!.activities.length === 0) lastIdx--
    days = days.slice(0, lastIdx + 1)

    return {
      id: itinerary.id,
      name: itinerary.name,
      description: itinerary.description,
      coverPhoto: itinerary.coverPhoto,
      overview: itinerary.overview,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      status: itinerary.status,
      publishedVersion: itinerary.publishedVersion,
      days,
    }
  }

  /**
   * Generic batch-fetch for any detail table with an activityId column.
   * Returns a Map<activityId, row>.
   */
  private async batchFetchByActivityIds<T extends { activityId: string }>(
    table: any,
    activityIds: string[],
  ): Promise<Map<string, T>> {
    if (activityIds.length === 0) return new Map()
    const rows: T[] = await this.db.client
      .select()
      .from(table)
      .where(inArray(table.activityId, activityIds))
    const map = new Map<string, T>()
    for (const row of rows) {
      map.set(row.activityId, row)
    }
    return map
  }

  private async batchFetchFlightSegments(activityIds: string[]) {
    if (activityIds.length === 0) return new Map<string, any[]>()
    const rows = await this.db.client
      .select()
      .from(this.db.schema.flightSegments)
      .where(inArray(this.db.schema.flightSegments.activityId, activityIds))
      .orderBy(asc(this.db.schema.flightSegments.segmentOrder))
    const map = new Map<string, any[]>()
    for (const row of rows) {
      if (!map.has(row.activityId)) map.set(row.activityId, [])
      map.get(row.activityId)!.push(row)
    }
    return map
  }

  private async batchFetchPricing(activityIds: string[]) {
    if (activityIds.length === 0) return new Map<string, any>()
    const rows = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(inArray(this.db.schema.activityPricing.activityId, activityIds))
    const map = new Map<string, any>()
    for (const row of rows) {
      map.set(row.activityId, row)
    }
    return map
  }

  private async batchFetchChildActivities(
    parentActivityIds: string[],
    pricingVisible: boolean,
  ): Promise<Map<string, SharedActivityDto[]>> {
    if (parentActivityIds.length === 0) return new Map()
    const children = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(inArray(this.db.schema.itineraryActivities.parentActivityId, parentActivityIds))
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    // Fetch pricing, thumbnails, and media for children
    const childIds = children.map((c) => c.id)
    const [childPricingMap, childThumbnailMap, childMediaRows] = await Promise.all([
      this.batchFetchPricing(childIds),
      this.batchFetchThumbnails(childIds),
      this.batchFetchMedia(childIds),
    ])
    const childMediaMap = this.buildMediaMap(childMediaRows)

    const map = new Map<string, SharedActivityDto[]>()
    for (const child of children) {
      const parentId = child.parentActivityId!
      if (!map.has(parentId)) map.set(parentId, [])
      map.get(parentId)!.push(
        this.toPublicActivity(
          {
            ...child,
            startDatetime: child.startDatetime?.toISOString() || null,
            endDatetime: child.endDatetime?.toISOString() || null,
            proposalStatus: child.proposalStatus || 'draft',
            bookingStatus: child.bookingStatus || 'unbooked',
            confirmationNumber: child.confirmationNumber || null,
            thumbnail: childThumbnailMap.get(child.id) || child.photos?.[0]?.url || null,
          } as any,
          {
            pricing: childPricingMap.get(child.id),
            media: childMediaMap.get(child.id) || [],
            pricingVisible,
            flightSegments: [],
            childActivities: [],
          },
        ),
      )
    }
    return map
  }

  private async batchFetchThumbnails(activityIds: string[]): Promise<Map<string, string>> {
    if (activityIds.length === 0) return new Map()
    const mediaRows = await this.batchFetchMedia(activityIds)

    const map = new Map<string, string>()
    for (const row of mediaRows) {
      // First image wins per activity
      if (!map.has(row.activityId)) {
        map.set(row.activityId, row.fileUrl)
      }
    }
    return map
  }

  private async batchFetchMedia(activityIds: string[]): Promise<Array<{ activityId: string; fileUrl: string; caption: string | null }>> {
    if (activityIds.length === 0) return []
    return this.db.client
      .select({
        activityId: this.db.schema.activityMedia.activityId,
        fileUrl: this.db.schema.activityMedia.fileUrl,
        caption: this.db.schema.activityMedia.caption,
      })
      .from(this.db.schema.activityMedia)
      .where(
        and(
          inArray(this.db.schema.activityMedia.activityId, activityIds),
          eq(this.db.schema.activityMedia.mediaType, 'image'),
        ),
      )
      .orderBy(asc(this.db.schema.activityMedia.orderIndex))
  }

  private buildMediaMap(mediaRows: Array<{ activityId: string; fileUrl: string; caption: string | null }>): Map<string, Array<{ url: string; caption: string | null }>> {
    const map = new Map<string, Array<{ url: string; caption: string | null }>>()
    for (const row of mediaRows) {
      if (!map.has(row.activityId)) {
        map.set(row.activityId, [])
      }
      map.get(row.activityId)!.push({ url: row.fileUrl, caption: row.caption })
    }
    return map
  }

  /**
   * Whitelist-only public DTO mapper. Strips notes, commission, internal IDs, timestamps.
   */
  private toPublicActivity(
    activity: any,
    context: {
      flightDetails?: any
      flightSegments?: any[]
      lodgingDetails?: any
      transportDetails?: any
      diningDetails?: any
      cruiseDetails?: any
      tourDetails?: any
      packageDetails?: any
      portInfoDetails?: any
      optionsDetails?: any
      tourDayDetails?: any
      pricing?: any
      childActivities?: SharedActivityDto[]
      media?: Array<{ url: string; caption: string | null }>
      pricingVisible: boolean
    },
  ): SharedActivityDto {
    const detail = this.buildActivityDetail(activity.activityType, context)
    const pricing = context.pricingVisible
      ? this.toPublicPricing(context.pricing)
      : null

    const media = context.media || []

    return {
      id: activity.id,
      activityType: activity.activityType,
      name: activity.name,
      description: activity.description || null,
      sequenceOrder: activity.sequenceOrder,
      startDatetime: activity.startDatetime || null,
      endDatetime: activity.endDatetime || null,
      timezone: activity.timezone || null,
      location: activity.location || null,
      address: activity.address || null,
      proposalStatus: activity.proposalStatus || 'draft',
      bookingStatus: activity.bookingStatus || 'unbooked',
      confirmationNumber: activity.confirmationNumber || null,
      thumbnail: activity.thumbnail || null,
      media,
      pricing,
      detail,
    }
  }

  private toPublicPricing(pricing: any): SharedActivityPricingDto | null {
    if (!pricing) return null
    const breakdownItems: SharedPricingBreakdownItem[] | null =
      pricing.pricingBreakdownJson
        ? (pricing.pricingBreakdownJson as any[]).map((item) => ({
            // Sanitize labels: strip traveler names, use generic descriptions
            description: this.sanitizePricingLabel(item.label || ''),
            amountCents: item.priceCents ?? 0,
          }))
        : null

    return {
      totalPriceCents: pricing.totalPriceCents ?? 0,
      currency: pricing.currency || 'USD',
      pricingType: pricing.pricingType || null,
      breakdownItems,
    }
  }

  private sanitizePricingLabel(label: string): string {
    // Replace full names with generic labels like "Traveler 1", "Traveler 2"
    // Common patterns: "Mrs Jacqueline Belanger", "Adult 1", "Child 1"
    // Keep generic labels as-is, replace name-like labels
    if (/^(adult|child|infant|senior|student|traveler|guest)/i.test(label)) {
      return label
    }
    // If it looks like a person's name (2+ capitalized words), genericize it
    if (/^[A-Z][a-z]+ [A-Z]/.test(label) || /^(Mr|Mrs|Ms|Dr|Miss)\b/.test(label)) {
      return 'Traveler'
    }
    return label
  }

  private buildActivityDetail(
    activityType: string,
    context: any,
  ): SharedActivityDetailDto | null {
    switch (activityType) {
      case 'flight': {
        const d = context.flightDetails
        const segments = (context.flightSegments || []).map((s: any) => ({
          segmentOrder: s.segmentOrder ?? 0,
          airline: s.airline || null,
          flightNumber: s.flightNumber || null,
          departureAirportCode: s.departureAirportCode || null,
          departureAirportName: s.departureAirportName || null,
          departureDate: s.departureDate || null,
          departureTime: s.departureTime || null,
          departureTerminal: s.departureTerminal || null,
          arrivalAirportCode: s.arrivalAirportCode || null,
          arrivalAirportName: s.arrivalAirportName || null,
          arrivalDate: s.arrivalDate || null,
          arrivalTime: s.arrivalTime || null,
          arrivalTerminal: s.arrivalTerminal || null,
        }))
        return {
          type: 'flight' as const,
          airline: d?.airline || null,
          flightNumber: d?.flightNumber || null,
          departureAirportCode: d?.departureAirportCode || null,
          departureDate: d?.departureDate || null,
          departureTime: d?.departureTime || null,
          departureTerminal: d?.departureTerminal || null,
          arrivalAirportCode: d?.arrivalAirportCode || null,
          arrivalDate: d?.arrivalDate || null,
          arrivalTime: d?.arrivalTime || null,
          arrivalTerminal: d?.arrivalTerminal || null,
          segments,
        }
      }
      case 'lodging': {
        const d = context.lodgingDetails
        if (!d) return null
        return {
          type: 'lodging' as const,
          propertyName: d.propertyName || null,
          checkInDate: d.checkInDate || null,
          checkInTime: d.checkInTime || null,
          checkOutDate: d.checkOutDate || null,
          checkOutTime: d.checkOutTime || null,
          roomType: d.roomType || null,
          roomCount: d.roomCount ?? 1,
          amenities: d.amenities || [],
        }
      }
      case 'transportation': {
        const d = context.transportDetails
        if (!d) return null
        return {
          type: 'transportation' as const,
          subtype: d.subtype || null,
          providerName: d.providerName || null,
          vehicleType: d.vehicleType || null,
          pickupDate: d.pickupDate || null,
          pickupTime: d.pickupTime || null,
          pickupAddress: d.pickupAddress || null,
          dropoffDate: d.dropoffDate || null,
          dropoffTime: d.dropoffTime || null,
          dropoffAddress: d.dropoffAddress || null,
          pickupName: d.pickupName || null,
          pickupLat: d.pickupLat || null,
          pickupLng: d.pickupLng || null,
          pickupPlaceId: d.pickupPlaceId || null,
          dropoffName: d.dropoffName || null,
          dropoffLat: d.dropoffLat || null,
          dropoffLng: d.dropoffLng || null,
          dropoffPlaceId: d.dropoffPlaceId || null,
          rentalCompany: d.rentalCompany || null,
          rentalBookingRef: d.rentalBookingRef || null,
          rentalCarClass: d.rentalCarClass || null,
          rentalFuelPolicy: d.rentalFuelPolicy || null,
          departureStation: d.departureStation || null,
          arrivalStation: d.arrivalStation || null,
          isRoundTrip: d.isRoundTrip === 1,
        }
      }
      case 'dining': {
        const d = context.diningDetails
        if (!d) return null
        return {
          type: 'dining' as const,
          restaurantName: d.restaurantName || null,
          cuisineType: d.cuisineType || null,
          mealType: d.mealType || null,
          reservationDate: d.reservationDate || null,
          reservationTime: d.reservationTime || null,
          partySize: d.partySize || null,
          priceRange: d.priceRange || null,
          dressCode: d.dressCode || null,
        }
      }
      case 'custom_cruise': {
        const d = context.cruiseDetails
        if (!d) return null
        const portCalls = (d.portCallsJson as any[] || []).map((p: any) => ({
          day: p.day ?? 0,
          portName: p.portName || '',
          arriveTime: p.arriveTime || null,
          departTime: p.departTime || null,
        }))
        return {
          type: 'custom_cruise' as const,
          cruiseLineName: d.cruiseLineName || null,
          shipName: d.shipName || null,
          itineraryName: d.itineraryName || null,
          nights: d.nights || null,
          departurePort: d.departurePort || null,
          departureDate: d.departureDate || null,
          arrivalPort: d.arrivalPort || null,
          arrivalDate: d.arrivalDate || null,
          cabinCategory: d.cabinCategory || null,
          cabinDescription: d.cabinDescription || null,
          region: d.region || null,
          portCalls,
        }
      }
      case 'custom_tour': {
        const d = context.tourDetails
        if (!d) return null
        const itineraryDays = (d.itineraryJson as any[] || []).map((day: any) => ({
          dayNumber: day.dayNumber ?? 0,
          title: day.title || null,
          description: day.description || null,
          overnightCity: day.overnightCity || null,
        }))
        return {
          type: 'custom_tour' as const,
          tourName: d.tourName || null,
          days: d.days || null,
          nights: d.nights || null,
          startCity: d.startCity || null,
          endCity: d.endCity || null,
          itineraryDays,
        }
      }
      case 'package': {
        const d = context.packageDetails
        return {
          type: 'package' as const,
          supplierName: d?.supplierName || null,
          childActivities: context.childActivities || [],
        }
      }
      case 'port_info': {
        const d = context.portInfoDetails
        if (!d) return null
        return {
          type: 'port_info' as const,
          portType: d.portType || null,
          portName: d.portName || null,
          portLocation: d.portLocation || null,
          arrivalDate: d.arrivalDate || null,
          arrivalTime: d.arrivalTime || null,
          departureDate: d.departureDate || null,
          departureTime: d.departureTime || null,
          tenderRequired: d.tenderRequired ?? false,
        }
      }
      case 'options': {
        const d = context.optionsDetails
        if (!d) return null
        return {
          type: 'options' as const,
          optionCategory: d.optionCategory || null,
          isSelected: d.isSelected ?? false,
          providerName: d.providerName || null,
          durationMinutes: d.durationMinutes || null,
          inclusions: d.inclusions || [],
        }
      }
      // Legacy types and tour_day use generic fallback
      default:
        return { type: 'generic' as const }
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
          status: 'planning',
          primaryContactId: original.primaryContactId,
          currency: original.currency,
          estimatedTotalCost: original.estimatedTotalCost,
          customFields: original.customFields,
          timezone: original.timezone,
          pricingVisibility: original.pricingVisibility,
          allowPdfDownloads: original.allowPdfDownloads,
          itineraryStyle: original.itineraryStyle,
          isPublished: false,
          shareToken: null,
        })
        .returning()

      // 2b. Auto-create trip collaborator for the duplicator
      await tx
        .insert(this.db.schema.tripCollaborators)
        .values({
          tripId: newTrip!.id,
          userId: actorId,
          commissionPercentage: '100',
          role: 'lead',
          isActive: true,
          createdBy: actorId,
        })
        .onConflictDoNothing()

      // 3. Copy trip tags (junction table) — only system tags + duplicator's own agent tags
      const originalTripTags = await tx
        .select({ tagId: this.db.schema.tripTags.tagId })
        .from(this.db.schema.tripTags)
        .innerJoin(this.db.schema.tags, eq(this.db.schema.tags.id, this.db.schema.tripTags.tagId))
        .where(and(
          eq(this.db.schema.tripTags.tripId, tripId),
          or(
            eq(this.db.schema.tags.type, 'system'),
            and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, actorId)),
          ),
        ))

      if (originalTripTags.length > 0) {
        await tx
          .insert(this.db.schema.tripTags)
          .values(originalTripTags.map(t => ({ tripId: newTrip!.id, tagId: t.tagId })))
      }

      // 4. Copy itineraries
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
              proposalStatus: activity.proposalStatus,
              bookingStatus: activity.bookingStatus,
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

  async listTripGroups(agencyId: string, type?: string, auth?: AuthContext) {
    const conditions: any[] = [eq(this.db.schema.tripGroups.agencyId, agencyId)]
    if (type) {
      conditions.push(eq(this.db.schema.tripGroups.type, type as any))
    }

    // Non-admin users can only see groups they own, are shared with, or that are folders
    if (auth && auth.role !== 'admin') {
      conditions.push(
        or(
          eq(this.db.schema.tripGroups.type, 'folder'),
          eq(this.db.schema.tripGroups.ownerId, auth.userId),
          sql`${this.db.schema.tripGroups.id} IN (
            SELECT trip_group_id FROM trip_group_shares
            WHERE shared_with_user_id = ${auth.userId}
          )`,
        )!,
      )
    }

    const groups = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        agencyId: this.db.schema.tripGroups.agencyId,
        name: this.db.schema.tripGroups.name,
        description: this.db.schema.tripGroups.description,
        type: this.db.schema.tripGroups.type,
        groupNumber: this.db.schema.tripGroups.groupNumber,
        primarySupplierId: this.db.schema.tripGroups.primarySupplierId,
        destination: this.db.schema.tripGroups.destination,
        startDate: this.db.schema.tripGroups.startDate,
        endDate: this.db.schema.tripGroups.endDate,
        status: this.db.schema.tripGroups.status,
        ownerId: this.db.schema.tripGroups.ownerId,
        createdAt: this.db.schema.tripGroups.createdAt,
        updatedAt: this.db.schema.tripGroups.updatedAt,
        tripCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${this.db.schema.trips}
          WHERE ${this.db.schema.trips.tripGroupId} = "trip_groups"."id"
        )`,
      })
      .from(this.db.schema.tripGroups)
      .where(and(...conditions))

    return groups
  }

  async createTripGroup(
    data: {
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
    agencyId: string,
    actorId: string,
  ) {
    const [group] = await this.db.client
      .insert(this.db.schema.tripGroups)
      .values({
        name: data.name,
        agencyId,
        createdBy: actorId,
        ownerId: actorId,
        type: (data.type as any) || 'folder',
        groupNumber: data.groupNumber,
        primarySupplierId: data.primarySupplierId,
        destination: data.destination,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status as any ?? (data.type === 'group_booking' ? 'planning' : undefined),
        description: data.description,
      })
      .returning()

    return group
  }

  async updateTripGroup(
    groupId: string,
    data: {
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
    agencyId: string,
    actorId: string,
  ) {
    try {
      const [group] = await this.db.client
        .update(this.db.schema.tripGroups)
        .set({ ...data, updatedAt: new Date() } as any)
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
        endDate: this.db.schema.trips.endDate,
        primaryContactId: this.db.schema.trips.primaryContactId,
        primaryContactFirstName: this.db.schema.contacts.firstName,
        primaryContactLastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.trips)
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.trips.primaryContactId, this.db.schema.contacts.id),
      )
      .where(
        and(
          eq(this.db.schema.trips.tripGroupId, groupId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .orderBy(asc(this.db.schema.trips.startDate), asc(this.db.schema.trips.name))
  }

  async getGroupTravelers(groupId: string, agencyId: string) {
    // 1. Get travelers from trip_travelers table
    const tripTravelerRows = await this.db.client
      .selectDistinct({
        travelerId: this.db.schema.tripTravelers.id,
        contactId: this.db.schema.tripTravelers.contactId,
        role: this.db.schema.tripTravelers.role,
        tripId: this.db.schema.trips.id,
        tripName: this.db.schema.trips.name,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        email: this.db.schema.contacts.email,
        phone: this.db.schema.contacts.phone,
      })
      .from(this.db.schema.tripTravelers)
      .innerJoin(
        this.db.schema.trips,
        eq(this.db.schema.tripTravelers.tripId, this.db.schema.trips.id),
      )
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id),
      )
      .where(
        and(
          eq(this.db.schema.trips.tripGroupId, groupId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .orderBy(asc(this.db.schema.contacts.lastName), asc(this.db.schema.contacts.firstName))

    if (tripTravelerRows.length > 0) {
      return tripTravelerRows
    }

    // 2. Fallback: get primary contacts from trips (for imported trips without trip_travelers)
    const primaryContactRows = await this.db.client
      .select({
        travelerId: this.db.schema.trips.primaryContactId,
        contactId: this.db.schema.trips.primaryContactId,
        role: sql<string>`'primary_contact'`,
        tripId: this.db.schema.trips.id,
        tripName: this.db.schema.trips.name,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        email: this.db.schema.contacts.email,
        phone: this.db.schema.contacts.phone,
      })
      .from(this.db.schema.trips)
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.trips.primaryContactId, this.db.schema.contacts.id),
      )
      .where(
        and(
          eq(this.db.schema.trips.tripGroupId, groupId),
          eq(this.db.schema.trips.agencyId, agencyId),
          isNotNull(this.db.schema.trips.primaryContactId),
        ),
      )
      .orderBy(asc(this.db.schema.contacts.lastName), asc(this.db.schema.contacts.firstName))

    // Deduplicate by contactId
    const seen = new Set<string>()
    return primaryContactRows.filter((row) => {
      if (!row.contactId || seen.has(row.contactId)) return false
      seen.add(row.contactId)
      return true
    })
  }

  /**
   * Get financial summary for a trip group
   */
  async getGroupSummary(groupId: string, agencyId: string) {
    // Verify group exists and belongs to agency
    const [group] = await this.db.client
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

    // Aggregate pricing across all trips in one query
    // Only aggregate from selected itineraries to avoid overcounting
    const rows = await this.db.client.execute(sql`
      SELECT
        t.id as trip_id,
        t.name as trip_name,
        t.status,
        COALESCE(SUM(ap.total_price_cents), 0)::int as package_price_cents,
        COALESCE(SUM(ap.commission_total_cents), 0)::int as commission_projected_cents,
        COALESCE(SUM(ct.received_cents), 0)::int as commission_received_cents
      FROM trips t
      LEFT JOIN itineraries i ON i.trip_id = t.id AND i.is_selected = true
      LEFT JOIN itinerary_days id ON id.itinerary_id = i.id
      LEFT JOIN itinerary_activities ia ON ia.itinerary_day_id = id.id
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
      WHERE t.trip_group_id = ${groupId}
        AND t.agency_id = ${agencyId}
      GROUP BY t.id, t.name, t.status
    `)

    const tripSummaries = (rows as any[]).map((row) => {
      // Balance = commission still owed (projected minus received)
      const commissionBalance = row.commission_projected_cents - row.commission_received_cents
      return {
        tripId: row.trip_id,
        tripName: row.trip_name,
        status: row.status,
        packagePriceCents: row.package_price_cents,
        commissionProjectedCents: row.commission_projected_cents,
        commissionReceivedCents: row.commission_received_cents,
        balanceCents: commissionBalance,
        paymentStatus: commissionBalance <= 0 ? 'paid' as const : row.commission_received_cents > 0 ? 'partial' as const : row.commission_projected_cents > 0 ? 'outstanding' as const : 'none' as const,
      }
    })

    return {
      groupId,
      totalPackagePriceCents: tripSummaries.reduce((sum, t) => sum + t.packagePriceCents, 0),
      totalCommissionProjectedCents: tripSummaries.reduce((sum, t) => sum + t.commissionProjectedCents, 0),
      totalCommissionReceivedCents: tripSummaries.reduce((sum, t) => sum + t.commissionReceivedCents, 0),
      totalBalanceCents: tripSummaries.reduce((sum, t) => sum + t.balanceCents, 0),
      currency: 'CAD',
      tripSummaries,
    }
  }

  /**
   * Cancel all trips in a group via existing cancelTrip() method
   */
  async cancelGroupTrips(
    groupId: string,
    reason: string,
    agencyId: string,
    actorId: string,
  ) {
    const [group] = await this.db.client
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

    const trips = await this.db.client
      .select({ id: this.db.schema.trips.id, status: this.db.schema.trips.status })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.tripGroupId, groupId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )

    const cancelled: string[] = []
    const skipped: { tripId: string; reason: string }[] = []

    for (const trip of trips) {
      if (!canTransitionTripStatus(trip.status as TripStatus, 'cancelled')) {
        skipped.push({
          tripId: trip.id,
          reason: getTransitionErrorMessage(trip.status as TripStatus, 'cancelled'),
        })
        continue
      }
      try {
        await this.cancelTrip(trip.id, { reason: `Group cancellation: ${reason}` }, actorId)
        cancelled.push(trip.id)
      } catch (e: any) {
        skipped.push({ tripId: trip.id, reason: e.message })
      }
    }

    // Only update group status to cancelled if at least one trip was cancelled
    if (cancelled.length > 0) {
      await this.db.client
        .update(this.db.schema.tripGroups)
        .set({ status: 'cancelled' as any, updatedAt: new Date() })
        .where(eq(this.db.schema.tripGroups.id, groupId))

      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent('trip_group', group.id, 'updated', group.id, actorId, group.name),
      )
    }

    return { cancelled, skipped }
  }

  /**
   * Add trips to a group (transactional with auto-share)
   */
  async addTripsToGroup(
    groupId: string,
    tripIds: string[],
    agencyId: string,
    actorId: string,
  ) {
    return await this.db.client.transaction(async (tx) => {
      const [group] = await tx
        .select({
          id: this.db.schema.tripGroups.id,
          name: this.db.schema.tripGroups.name,
          ownerId: this.db.schema.tripGroups.ownerId,
          type: this.db.schema.tripGroups.type,
          agencyId: this.db.schema.tripGroups.agencyId,
        })
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

      let added = 0
      for (const tripId of tripIds) {
        const result = await tx
          .update(this.db.schema.trips)
          .set({ tripGroupId: groupId, updatedAt: new Date() })
          .where(
            and(
              eq(this.db.schema.trips.id, tripId),
              eq(this.db.schema.trips.agencyId, agencyId),
            ),
          )
          .returning({ id: this.db.schema.trips.id, ownerId: this.db.schema.trips.ownerId })

        if (result.length === 0) continue
        added++

        const tripResult = result[0]!

        // Auto-share: give trip owner read access to group (group_bookings only)
        if (
          tripResult.ownerId &&
          tripResult.ownerId !== group.ownerId &&
          group.type === 'group_booking'
        ) {
          await tx
            .insert(this.db.schema.tripGroupShares)
            .values({
              tripGroupId: groupId,
              sharedWithUserId: tripResult.ownerId,
              agencyId,
              accessLevel: 'read',
              sharedBy: actorId,
              source: 'auto_trip_owner',
              notes: 'Auto-shared: trip owner added to group',
            })
            .onConflictDoNothing()
        }

        this.eventEmitter.emit(
          'audit.status_changed',
          new AuditEvent('trip', tripId, 'moved_to_group', tripId, actorId, group.name),
        )
      }

      return { added }
    })
  }

  /**
   * Remove a trip from a group
   */
  async removeTripFromGroup(
    groupId: string,
    tripId: string,
    agencyId: string,
    actorId: string,
  ) {
    const [group] = await this.db.client
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

    await this.db.client
      .update(this.db.schema.trips)
      .set({ tripGroupId: null, updatedAt: new Date() })
      .where(
        and(
          eq(this.db.schema.trips.id, tripId),
          eq(this.db.schema.trips.tripGroupId, groupId),
        ),
      )

    this.eventEmitter.emit(
      'audit.status_changed',
      new AuditEvent('trip', tripId, 'removed_from_group', tripId, actorId, group.name),
    )
  }

  // ============================================================================
  // TRIP GROUP DOCUMENTS & MEDIA
  // ============================================================================

  async listGroupDocuments(groupId: string, agencyId: string) {
    // Verify group belongs to agency
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id })
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

    return this.db.client
      .select()
      .from(this.db.schema.tripGroupDocuments)
      .where(eq(this.db.schema.tripGroupDocuments.tripGroupId, groupId))
  }

  async createGroupDocument(
    groupId: string,
    data: { fileUrl: string; fileName: string; fileSize?: number; documentType?: string },
    agencyId: string,
    actorId: string,
  ) {
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id, name: this.db.schema.tripGroups.name })
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

    const [doc] = await this.db.client
      .insert(this.db.schema.tripGroupDocuments)
      .values({
        tripGroupId: groupId,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        documentType: data.documentType,
        uploadedBy: actorId,
      })
      .returning()

    if (!doc) {
      throw new Error('Failed to create group document')
    }

    this.eventEmitter.emit(
      'audit.created',
      new AuditEvent('trip_group', groupId, 'created', doc.id, actorId, data.fileName),
    )

    return doc
  }

  async deleteGroupDocument(groupId: string, documentId: string, agencyId: string, actorId: string) {
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id, name: this.db.schema.tripGroups.name })
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

    const [doc] = await this.db.client
      .delete(this.db.schema.tripGroupDocuments)
      .where(
        and(
          eq(this.db.schema.tripGroupDocuments.id, documentId),
          eq(this.db.schema.tripGroupDocuments.tripGroupId, groupId),
        ),
      )
      .returning()

    if (!doc) {
      throw new NotFoundException(`Document with ID ${documentId} not found`)
    }

    this.eventEmitter.emit(
      'audit.deleted',
      new AuditEvent('trip_group', groupId, 'deleted', documentId, actorId, doc.fileName),
    )

    return doc
  }

  async listGroupMedia(groupId: string, agencyId: string) {
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id })
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

    return this.db.client
      .select()
      .from(this.db.schema.tripGroupMedia)
      .where(eq(this.db.schema.tripGroupMedia.tripGroupId, groupId))
  }

  async createGroupMedia(
    groupId: string,
    data: { fileUrl: string; fileName: string; fileSize?: number; mediaType?: string; caption?: string },
    agencyId: string,
    actorId: string,
  ) {
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id, name: this.db.schema.tripGroups.name })
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

    const [media] = await this.db.client
      .insert(this.db.schema.tripGroupMedia)
      .values({
        tripGroupId: groupId,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mediaType: (data.mediaType as any) || 'image',
        caption: data.caption,
        uploadedBy: actorId,
      })
      .returning()

    if (!media) {
      throw new Error('Failed to create group media')
    }

    this.eventEmitter.emit(
      'audit.created',
      new AuditEvent('trip_group', groupId, 'created', media.id, actorId, data.fileName),
    )

    return media
  }

  async updateGroupMedia(
    groupId: string,
    mediaId: string,
    data: { caption?: string; orderIndex?: number },
  ) {
    const [updated] = await this.db.client
      .update(this.db.schema.tripGroupMedia)
      .set({
        ...(data.caption !== undefined && { caption: data.caption }),
        ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
      })
      .where(
        and(
          eq(this.db.schema.tripGroupMedia.id, mediaId),
          eq(this.db.schema.tripGroupMedia.tripGroupId, groupId),
        ),
      )
      .returning()

    if (!updated) {
      throw new NotFoundException(`Media with ID ${mediaId} not found`)
    }

    return updated
  }

  async deleteGroupMedia(groupId: string, mediaId: string, agencyId: string, actorId: string) {
    const [group] = await this.db.client
      .select({ id: this.db.schema.tripGroups.id })
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

    const [media] = await this.db.client
      .delete(this.db.schema.tripGroupMedia)
      .where(
        and(
          eq(this.db.schema.tripGroupMedia.id, mediaId),
          eq(this.db.schema.tripGroupMedia.tripGroupId, groupId),
        ),
      )
      .returning()

    if (!media) {
      throw new NotFoundException(`Media with ID ${mediaId} not found`)
    }

    this.eventEmitter.emit(
      'audit.deleted',
      new AuditEvent('trip_group', groupId, 'deleted', mediaId, actorId, media.fileName),
    )

    return media
  }

  // ============================================================================
  // TRIP CANCELLATION
  // ============================================================================

  /**
   * Cancel a trip with reason tracking
   *
   * @param id - Trip ID
   * @param dto - Cancellation details
   * @param actorId - User performing the cancellation
   */
  async cancelTrip(
    id: string,
    dto: CancelTripDto,
    actorId: string,
  ): Promise<TripResponseDto> {
    const [existingTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!existingTrip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException('Cancellation reason is required')
    }

    // Validate transition to cancelled is allowed
    if (!canTransitionTripStatus(existingTrip.status as TripStatus, 'cancelled')) {
      const errorMessage = getTransitionErrorMessage(
        existingTrip.status as TripStatus,
        'cancelled',
      )
      throw new BadRequestException(errorMessage)
    }

    const now = new Date()

    const [trip] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: dto.reason,
        cancelledBy: actorId,
        statusBeforeCancel: existingTrip.status,
        lastStatusChangeAt: now,
        updatedAt: now,
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`)
    }

    // Cancel any scheduled transitions
    await this.cancelScheduledTransitions(id)

    // Emit cancelled event
    this.eventEmitter.emit(
      'trip.cancelled',
      new TripCancelledEvent(
        trip.id,
        trip.name,
        trip.primaryContactId,
        actorId,
        dto.reason || null,
        existingTrip.status,
        dto.notifyTravelers || false,
      ),
    )

    return this.mapToResponseDto(trip)
  }

  /**
   * Restore a soft-deleted trip
   *
   * @param id - Trip ID
   * @param actorId - User performing the restore
   */
  async restoreTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!trip) throw new NotFoundException(`Trip with ID ${id} not found`)
    if (!trip.deletedAt) throw new BadRequestException('Trip is not deleted')

    const [restored] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    this.eventEmitter.emit('audit.updated', {
      entityType: 'trip',
      entityId: id,
      action: 'restored',
      actorId,
      changes: { restored: true },
    })

    return this.mapToResponseDto(restored)
  }

  /**
   * Un-cancel a trip, restoring its previous status
   *
   * @param id - Trip ID
   * @param actorId - User performing the un-cancel
   */
  async uncancelTrip(id: string, actorId: string): Promise<TripResponseDto> {
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    if (!trip) throw new NotFoundException(`Trip with ID ${id} not found`)
    if (trip.status !== 'cancelled') throw new BadRequestException('Trip is not cancelled')

    // Always restore to planning — bookings made before cancellation may no longer
    // be valid (active trips), or trip dates may have passed (travelling trips).
    // The agent must re-evaluate and re-book after uncancelling.
    const restoreStatus = 'planning' as const

    const [restored] = await this.db.client
      .update(this.db.schema.trips)
      .set({
        status: restoreStatus,
        cancelledAt: null,
        cancellationReason: null,
        cancelledBy: null,
        statusBeforeCancel: null,
        lastStatusChangeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.trips.id, id))
      .returning()

    if (!restored) throw new NotFoundException(`Trip with ID ${id} not found`)

    // No automation scheduling needed — restored trips always land in planning,
    // which has no automated transitions. Scheduling will be triggered again when
    // the trip transitions to active.

    this.eventEmitter.emit('audit.updated', {
      entityType: 'trip',
      entityId: id,
      action: 'status_changed',
      actorId,
      changes: { status: restoreStatus, previousStatus: 'cancelled', uncancelled: true },
    })

    return this.mapToResponseDto(restored)
  }

  // ============================================================================
  // AUTOMATION SCHEDULING
  // ============================================================================

  /**
   * Schedule status transitions for a trip based on its dates
   * Called when a trip becomes active or its dates are updated
   *
   * @param tripId - Trip ID
   * @param startDate - Trip start date (YYYY-MM-DD)
   * @param endDate - Trip end date (YYYY-MM-DD)
   * @param timezone - Trip timezone
   * @param currentStatus - Current trip status (optional, to skip redundant scheduling)
   */
  async scheduleStatusTransitions(
    tripId: string,
    startDate: string | null,
    endDate: string | null,
    timezone?: string,
    currentStatus?: string,
  ): Promise<void> {
    // Schedule travelling transition for start date
    // Skip if trip is already travelling or beyond
    if (startDate && currentStatus !== 'travelling' && currentStatus !== 'travelled' && currentStatus !== 'cancelled') {
      const travellingAt = this.automationService.computeLocalMidnight(startDate, timezone)
      const jobId = getTripTransitionJobId(tripId, 'travelling')

      if (this.automationService.isInFuture(travellingAt)) {
        // Future date - schedule at that time
        await this.automationService.scheduleAt(
          QUEUES.TRIP_AUTOMATION,
          JOB_TYPES.TRIP_STATUS_TRANSITION,
          {
            type: JOB_TYPES.TRIP_STATUS_TRANSITION,
            tripId,
            toStatus: 'travelling',
            reason: 'scheduled',
          },
          travellingAt,
          { jobId },
        )
        this.logger.log(`Scheduled travelling transition for trip ${tripId} at ${travellingAt.toISOString()}`)
      } else {
        // Past or same-day - schedule immediately (no delay for travelling)
        await this.automationService.schedule(
          QUEUES.TRIP_AUTOMATION,
          JOB_TYPES.TRIP_STATUS_TRANSITION,
          {
            type: JOB_TYPES.TRIP_STATUS_TRANSITION,
            tripId,
            toStatus: 'travelling',
            reason: 'scheduled',
          },
          { jobId, delay: 0 },
        )
        this.logger.log(`Scheduled immediate travelling transition for trip ${tripId} (past/same-day start)`)
      }
    }

    // Schedule travelled transition for day after end date
    // Skip if trip is already travelled or cancelled
    if (endDate && currentStatus !== 'travelled' && currentStatus !== 'cancelled') {
      const travelledAt = this.automationService.computeDayAfterMidnight(endDate, timezone)
      const jobId = getTripTransitionJobId(tripId, 'travelled')

      if (this.automationService.isInFuture(travelledAt)) {
        // Future date - schedule at that time
        await this.automationService.scheduleAt(
          QUEUES.TRIP_AUTOMATION,
          JOB_TYPES.TRIP_STATUS_TRANSITION,
          {
            type: JOB_TYPES.TRIP_STATUS_TRANSITION,
            tripId,
            toStatus: 'travelled',
            reason: 'scheduled',
          },
          travelledAt,
          { jobId },
        )
        this.logger.log(`Scheduled travelled transition for trip ${tripId} at ${travelledAt.toISOString()}`)
      } else {
        // Past or same-day - schedule with 2s delay to ensure travelling runs first
        await this.automationService.schedule(
          QUEUES.TRIP_AUTOMATION,
          JOB_TYPES.TRIP_STATUS_TRANSITION,
          {
            type: JOB_TYPES.TRIP_STATUS_TRANSITION,
            tripId,
            toStatus: 'travelled',
            reason: 'scheduled',
          },
          { jobId, delay: 2000 },
        )
        this.logger.log(`Scheduled immediate travelled transition for trip ${tripId} (past/same-day end)`)
      }
    }

    // Schedule departure reminders for active trips
    if (startDate && (currentStatus === 'active' || !currentStatus)) {
      await this.scheduleDepartureReminders(tripId, startDate, timezone)
    }
  }

  /**
   * Schedule departure reminders for a trip
   * Sends reminders at: 30, 14, 7, and 1 day before departure
   */
  private async scheduleDepartureReminders(
    tripId: string,
    startDate: string,
    timezone?: string,
  ): Promise<void> {
    // Get trip details for contact
    const trip = await this.findOne(tripId)
    if (!trip?.primaryContactId) {
      this.logger.warn(`Trip ${tripId} has no primary contact - skipping departure reminders`)
      return
    }

    const reminderDays: Array<30 | 14 | 7 | 1> = [30, 14, 7, 1]
    const now = new Date()

    for (const daysBeforeDeparture of reminderDays) {
      // Calculate reminder date (days before departure at midnight local time)
      const reminderDate = this.automationService.computeLocalMidnight(startDate, timezone)
      reminderDate.setDate(reminderDate.getDate() - daysBeforeDeparture)

      // Only schedule if reminder date is in the future
      if (reminderDate > now) {
        const jobId = getDepartureReminderJobId(tripId, daysBeforeDeparture)

        try {
          await this.automationService.scheduleAt(
            QUEUES.CLIENT_CARE,
            JOB_TYPES.DEPARTURE_REMINDER,
            {
              type: JOB_TYPES.DEPARTURE_REMINDER,
              tripId,
              contactId: trip.primaryContactId,
              agencyId: trip.agencyId,
              daysBeforeDeparture,
            },
            reminderDate,
            { jobId },
          )

          this.logger.debug(`Scheduled ${daysBeforeDeparture}-day departure reminder for trip ${tripId}`)
        } catch (error) {
          // Log but don't fail - booking should succeed even if scheduling fails
          this.logger.warn(`Failed to schedule ${daysBeforeDeparture}-day departure reminder for trip ${tripId}: ${error}`)
        }
      }
    }
  }

  /**
   * Cancel all departure reminders for a trip
   */
  private async cancelDepartureReminders(tripId: string): Promise<void> {
    const reminderDays: Array<30 | 14 | 7 | 1> = [30, 14, 7, 1]

    for (const days of reminderDays) {
      const jobId = getDepartureReminderJobId(tripId, days)
      try {
        await this.automationService.cancel(jobId, QUEUES.CLIENT_CARE)
      } catch {
        // Ignore cancellation errors - job may not exist
      }
    }
  }

  /**
   * Cancel all scheduled transitions and reminders for a trip
   * Called when trip is cancelled or dates change
   */
  async cancelScheduledTransitions(tripId: string): Promise<void> {
    const inProgressJobId = getTripTransitionJobId(tripId, 'travelling')
    const completedJobId = getTripTransitionJobId(tripId, 'travelled')

    const cancelledInProgress = await this.automationService.cancel(inProgressJobId, QUEUES.TRIP_AUTOMATION)
    const cancelledCompleted = await this.automationService.cancel(completedJobId, QUEUES.TRIP_AUTOMATION)

    // Also cancel departure reminders
    await this.cancelDepartureReminders(tripId)

    if (cancelledInProgress || cancelledCompleted) {
      this.logger.log(`Cancelled scheduled transitions for trip ${tripId}`)
    }
  }

  /**
   * Reschedule transitions when trip dates change
   * Cancels existing jobs and schedules new ones
   */
  async rescheduleStatusTransitions(
    tripId: string,
    startDate: string | null,
    endDate: string | null,
    timezone?: string,
    currentStatus?: string,
  ): Promise<void> {
    await this.cancelScheduledTransitions(tripId)
    await this.scheduleStatusTransitions(tripId, startDate, endDate, timezone, currentStatus)
  }

  // ============================================================================
  // BOOKING CONFIRMATION EMAIL
  // ============================================================================

  /**
   * Send booking confirmation email
   * Agent-triggered email sent to clients when a trip is booked
   */
  async sendBookingConfirmation(
    tripId: string,
    agencyId: string,
    dto: SendBookingConfirmationDto = {},
  ): Promise<{
    success: boolean
    emailLogId?: string
    providerMessageId?: string
    recipients: string[]
    error?: string
  }> {
    this.logger.log(`Sending booking confirmation for trip ${tripId}`)

    // Get trip details
    const trip = await this.findOne(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Get primary contact
    const primaryContact = trip.primaryContactId
      ? await this.db.client
          .select()
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
          .limit(1)
          .then(rows => rows[0])
      : null

    // Get trip passengers
    const passengers = await this.db.client
      .select({
        email: this.db.schema.contacts.email,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.tripTravelers)
      .innerJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
      )
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    // Get trip agent/owner
    const agent = trip.ownerId
      ? await this.db.client
          .select({
            email: this.db.schema.userProfiles.email,
            firstName: this.db.schema.userProfiles.firstName,
            lastName: this.db.schema.userProfiles.lastName,
          })
          .from(this.db.schema.userProfiles)
          .where(eq(this.db.schema.userProfiles.id, trip.ownerId))
          .limit(1)
          .then(rows => rows[0])
      : null

    // Build recipient list
    const toEmails: string[] = []
    const ccEmails: string[] = []

    // Add explicit recipients
    if (dto.to?.length) {
      toEmails.push(...dto.to)
    }

    // Include primary contact (default: true)
    const includePrimaryContact = dto.includePrimaryContact ?? true
    if (includePrimaryContact && primaryContact?.email) {
      if (!toEmails.includes(primaryContact.email)) {
        toEmails.push(primaryContact.email)
      }
    }

    // Include passengers if requested
    if (dto.includePassengers) {
      for (const passenger of passengers) {
        if (passenger.email && !toEmails.includes(passenger.email)) {
          toEmails.push(passenger.email)
        }
      }
    }

    // CC the agent if requested
    if (dto.includeAgent && agent?.email) {
      ccEmails.push(agent.email)
    }

    // Add explicit CC recipients
    if (dto.cc?.length) {
      ccEmails.push(...dto.cc.filter(e => !ccEmails.includes(e)))
    }

    // Must have at least one recipient
    if (toEmails.length === 0) {
      throw new BadRequestException('No valid recipients for booking confirmation email')
    }

    // Render email template
    let rendered: { subject: string; html: string; text?: string }
    try {
      rendered = await this.emailTemplatesService.renderTemplate('booking-confirmation', {
        agencyId,
        tripId,
        contactId: primaryContact?.id,
      })
    } catch {
      // Fallback template when database template doesn't exist
      this.logger.warn('Email template "booking-confirmation" not found, using fallback template')
      const contactName = primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() : 'Valued Customer'
      const agentName = agent ? `${agent.firstName} ${agent.lastName}`.trim() : 'Your Travel Advisor'
      rendered = {
        subject: `Booking Confirmed: ${trip.name}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Booking Confirmed!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your trip has been successfully booked</p>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${contactName},</p>

    <p>Great news! Your trip has been confirmed and all bookings are in place.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #c59746; margin-top: 0; font-size: 18px;">Trip Details</h2>
      <p><strong>Trip Name:</strong> ${trip.name}</p>
      ${trip.referenceNumber ? `<p><strong>Reference:</strong> ${trip.referenceNumber}</p>` : ''}
      ${trip.startDate ? `<p><strong>Travel Dates:</strong> ${trip.startDate}${trip.endDate ? ` - ${trip.endDate}` : ''}</p>` : ''}
    </div>

    <p>Your dedicated travel advisor is here to assist you every step of the way.</p>

    <p>Warm regards,<br>
    <strong style="color: #c59746;">${agentName}</strong></p>
  </div>
</body>
</html>`,
        text: `Booking Confirmed: ${trip.name}\n\nDear ${contactName},\n\nGreat news! Your trip has been confirmed.\n\nTrip: ${trip.name}\n${trip.referenceNumber ? `Reference: ${trip.referenceNumber}\n` : ''}\n\nWarm regards,\n${agentName}`,
      }
    }

    // Send email
    const result = await this.emailService.sendEmail({
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      agencyId,
      tripId,
      contactId: primaryContact?.id,
      templateSlug: 'booking-confirmation',
    })

    return {
      success: result.success,
      emailLogId: result.emailLogId,
      providerMessageId: result.providerMessageId,
      recipients: [...toEmails, ...ccEmails],
      error: result.error,
    }
  }

  // ============================================================================
  // TRIP LOCATIONS (for transportation form autocomplete)
  // ============================================================================

  /**
   * Returns all known locations from a trip's activities for use as
   * autocomplete suggestions in the transportation form.
   *
   * Extracts locations from:
   * - Lodging activities (hotels): property name + address + coordinates
   * - Flight segments: departure/arrival airport name + IATA code + coordinates
   * - Port info activities: port name + coordinates
   * - Itinerary days: start/end location names + coordinates
   *
   * Results are deduplicated by name.
   */
  async getTripLocations(tripId: string): Promise<TripLocation[]> {
    // Step 1: Get all itinerary IDs for the trip
    const itineraryRows = await this.db.client
      .select({ id: this.db.schema.itineraries.id })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, tripId))

    if (itineraryRows.length === 0) return []
    const itineraryIds = itineraryRows.map((r) => r.id)

    // Step 2: Get all itinerary days (for day-level locations)
    const days = await this.db.client
      .select({
        id: this.db.schema.itineraryDays.id,
        dayNumber: this.db.schema.itineraryDays.dayNumber,
        startLocationName: this.db.schema.itineraryDays.startLocationName,
        startLocationLat: this.db.schema.itineraryDays.startLocationLat,
        startLocationLng: this.db.schema.itineraryDays.startLocationLng,
        endLocationName: this.db.schema.itineraryDays.endLocationName,
        endLocationLat: this.db.schema.itineraryDays.endLocationLat,
        endLocationLng: this.db.schema.itineraryDays.endLocationLng,
      })
      .from(this.db.schema.itineraryDays)
      .where(inArray(this.db.schema.itineraryDays.itineraryId, itineraryIds))

    if (days.length === 0) return []
    const dayIds = days.map((d) => d.id)

    // Step 3: Get all activities for these days (lodging + flight + port_info)
    const activities = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        activityType: this.db.schema.itineraryActivities.activityType,
      })
      .from(this.db.schema.itineraryActivities)
      .where(
        and(
          inArray(this.db.schema.itineraryActivities.itineraryDayId, dayIds),
          inArray(this.db.schema.itineraryActivities.activityType, ['lodging', 'flight', 'port_info'] as any[]),
        ),
      )

    const activityIds = activities.map((a) => a.id)

    // Step 4: Batch-fetch detail rows in parallel
    const [lodgingRows, flightSegmentRows, portInfoRows] = await Promise.all([
      activityIds.length > 0
        ? this.db.client
            .select({
              activityId: this.db.schema.lodgingDetails.activityId,
              propertyName: this.db.schema.lodgingDetails.propertyName,
              address: this.db.schema.lodgingDetails.address,
            })
            .from(this.db.schema.lodgingDetails)
            .where(inArray(this.db.schema.lodgingDetails.activityId, activityIds))
        : Promise.resolve([]),
      activityIds.length > 0
        ? this.db.client
            .select({
              activityId: this.db.schema.flightSegments.activityId,
              departureAirportCode: this.db.schema.flightSegments.departureAirportCode,
              departureAirportName: this.db.schema.flightSegments.departureAirportName,
              departureAirportLat: this.db.schema.flightSegments.departureAirportLat,
              departureAirportLon: this.db.schema.flightSegments.departureAirportLon,
              arrivalAirportCode: this.db.schema.flightSegments.arrivalAirportCode,
              arrivalAirportName: this.db.schema.flightSegments.arrivalAirportName,
              arrivalAirportLat: this.db.schema.flightSegments.arrivalAirportLat,
              arrivalAirportLon: this.db.schema.flightSegments.arrivalAirportLon,
            })
            .from(this.db.schema.flightSegments)
            .where(inArray(this.db.schema.flightSegments.activityId, activityIds))
            .orderBy(asc(this.db.schema.flightSegments.segmentOrder))
        : Promise.resolve([]),
      activityIds.length > 0
        ? this.db.client
            .select({
              activityId: this.db.schema.portInfoDetails.activityId,
              portName: this.db.schema.portInfoDetails.portName,
              coordinates: this.db.schema.portInfoDetails.coordinates,
            })
            .from(this.db.schema.portInfoDetails)
            .where(inArray(this.db.schema.portInfoDetails.activityId, activityIds))
        : Promise.resolve([]),
    ])

    // Step 5: Build location list
    const locations: TripLocation[] = []
    const seenNames = new Set<string>()

    const addLocation = (loc: TripLocation) => {
      if (!loc.name) return
      const key = loc.name.trim().toLowerCase()
      if (seenNames.has(key)) return
      seenNames.add(key)
      locations.push(loc)
    }

    // Lodging locations
    for (const row of lodgingRows) {
      if (row.propertyName) {
        addLocation({
          type: 'hotel',
          name: row.propertyName,
          address: row.address ?? null,
          lat: null,
          lng: null,
        })
      }
    }

    // Airport locations (departure + arrival from each segment)
    for (const seg of flightSegmentRows) {
      if (seg.departureAirportName) {
        addLocation({
          type: 'airport',
          name: seg.departureAirportName,
          address: null,
          lat: seg.departureAirportLat ?? null,
          lng: seg.departureAirportLon ?? null,
          iataCode: seg.departureAirportCode ?? undefined,
        })
      }
      if (seg.arrivalAirportName) {
        addLocation({
          type: 'airport',
          name: seg.arrivalAirportName,
          address: null,
          lat: seg.arrivalAirportLat ?? null,
          lng: seg.arrivalAirportLon ?? null,
          iataCode: seg.arrivalAirportCode ?? undefined,
        })
      }
    }

    // Port locations
    for (const row of portInfoRows) {
      if (row.portName) {
        const coords = row.coordinates as { lat?: number; lng?: number } | null
        addLocation({
          type: 'port',
          name: row.portName,
          address: null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
      }
    }

    // Day-level start/end locations
    for (const day of days) {
      if (day.startLocationName) {
        addLocation({
          type: 'day_location',
          name: day.startLocationName,
          address: null,
          lat: day.startLocationLat != null ? Number(day.startLocationLat) : null,
          lng: day.startLocationLng != null ? Number(day.startLocationLng) : null,
          dayNumber: day.dayNumber,
        })
      }
      if (day.endLocationName) {
        addLocation({
          type: 'day_location',
          name: day.endLocationName,
          address: null,
          lat: day.endLocationLat != null ? Number(day.endLocationLat) : null,
          lng: day.endLocationLng != null ? Number(day.endLocationLng) : null,
          dayNumber: day.dayNumber,
        })
      }
    }

    return locations
  }
}

export interface TripLocation {
  type: 'hotel' | 'airport' | 'port' | 'day_location'
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  iataCode?: string
  dayNumber?: number
}
