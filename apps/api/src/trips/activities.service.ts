/**
 * Activities Service
 *
 * Business logic for managing itinerary activities.
 * Activities belong to days and can be reordered within/between days.
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, ne, and, or, desc, asc, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { StorageService } from './storage.service'
import { TravellerSplitsService } from '../financials/traveller-splits.service'
import { ActivityTotalsService } from './activity-totals.service'
import { ActivityTravelersService } from './activity-travelers.service'
import { TravelerBookingsService } from './traveler-bookings.service'
import { AuditEvent } from '../activity-logs/events/audit.event'
import { sanitizeForAudit, computeAuditDiff } from '../activity-logs/audit-sanitizer'
import type {
  ActivityResponseDto,
  CreateActivityDto,
  UpdateActivityDto,
  ReorderActivitiesDto,
  MoveActivityDto,
  ActivityFilterDto,
  PackageResponseDto,
  PackageLinkedActivityDto,
  PricingType,
  ActivityPricingDto,
  TripPackageTotalsDto,
} from '@tailfire/shared-types'
import type { AuthContext } from '../auth/auth.types'
import { TripAccessService } from './trip-access.service'
import { DayLocationService } from './day-location.service'
import * as Sentry from '@sentry/nestjs'

// Type for activity thumbnails map
type ThumbnailMap = Map<string, string>

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
    private readonly travellerSplitsService: TravellerSplitsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly activityTotalsService: ActivityTotalsService,
    private readonly activityTravelersService: ActivityTravelersService,
    private readonly travelerBookingsService: TravelerBookingsService,
    private readonly tripAccessService: TripAccessService,
    private readonly dayLocationService: DayLocationService,
  ) {}

  // ============================================================================
  // TRIP ACCESS VERIFICATION
  // ============================================================================

  /**
   * Verify the user has read access to the trip containing this day
   * @throws ForbiddenException if access denied
   */
  async verifyTripAccessFromDayId(dayId: string, auth: AuthContext, writeRequired = false): Promise<string> {
    const tripId = await this.getTripIdFromDayId(dayId)
    if (!tripId) {
      throw new NotFoundException(`Day ${dayId} not found or not associated with a trip`)
    }

    if (writeRequired) {
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    } else {
      await this.tripAccessService.verifyReadAccess(tripId, auth)
    }

    return tripId
  }

  /**
   * Verify the user has read access to the trip containing this activity
   * @throws ForbiddenException if access denied
   */
  async verifyTripAccessFromActivityId(activityId: string, auth: AuthContext, writeRequired = false): Promise<string> {
    // Get activity to find dayId
    const [activity] = await this.db.client
      .select({ itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    if (!activity) {
      throw new NotFoundException(`Activity ${activityId} not found`)
    }

    // Floating activities (no day) - get tripId from activity.tripId if available
    if (!activity.itineraryDayId) {
      const [activityWithTrip] = await this.db.client
        .select({ tripId: this.db.schema.itineraryActivities.tripId })
        .from(this.db.schema.itineraryActivities)
        .where(eq(this.db.schema.itineraryActivities.id, activityId))
        .limit(1)

      if (!activityWithTrip?.tripId) {
        throw new BadRequestException(`Activity ${activityId} is not associated with a trip`)
      }

      if (writeRequired) {
        await this.tripAccessService.verifyWriteAccess(activityWithTrip.tripId, auth)
      } else {
        await this.tripAccessService.verifyReadAccess(activityWithTrip.tripId, auth)
      }

      return activityWithTrip.tripId
    }

    return this.verifyTripAccessFromDayId(activity.itineraryDayId, auth, writeRequired)
  }

  /**
   * Verify the user has access to a trip directly by tripId
   * @throws ForbiddenException if access denied
   */
  async verifyTripAccessFromTripId(tripId: string, auth: AuthContext, writeRequired = false): Promise<string> {
    if (writeRequired) {
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    } else {
      await this.tripAccessService.verifyReadAccess(tripId, auth)
    }
    return tripId
  }

  /**
   * Get all activities with optional filtering
   */
  async findAll(filters: ActivityFilterDto = {}): Promise<ActivityResponseDto[]> {
    const {
      itineraryDayId,
      activityType,
      status,
      sortBy = 'sequenceOrder',
      sortOrder = 'asc',
      limit = 100,
      offset = 0,
    } = filters

    // Build where conditions
    const conditions = []
    if (itineraryDayId) {
      conditions.push(eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId))
    }
    if (activityType) {
      conditions.push(eq(this.db.schema.itineraryActivities.activityType, activityType))
    }
    if (status) {
      conditions.push(eq(this.db.schema.itineraryActivities.status, status))
    }

    // Map sortBy to actual column reference
    const sortColumn = this.db.schema.itineraryActivities[sortBy] || this.db.schema.itineraryActivities.sequenceOrder

    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sortOrder === 'asc'
          ? asc(sortColumn)
          : desc(sortColumn)
      )
      .limit(limit)
      .offset(offset)

    // Fetch thumbnails from activity_media
    const activityIds = activities.map(a => a.id)
    const thumbnailMap = await this.fetchThumbnails(activityIds)

    return activities.map(a => this.formatActivityResponse(a, thumbnailMap))
  }

  /**
   * Get activities for a specific day
   */
  async findByDay(itineraryDayId: string): Promise<ActivityResponseDto[]> {
    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId))
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    // Fetch thumbnails from activity_media
    const activityIds = activities.map(a => a.id)
    const thumbnailMap = await this.fetchThumbnails(activityIds)

    return activities.map(a => this.formatActivityResponse(a, thumbnailMap))
  }

  /**
   * Get all activities that have a specific parent activity ID
   * Used for cruise → port_info relationships
   */
  async findByParentId(parentActivityId: string): Promise<ActivityResponseDto[]> {
    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.parentActivityId, parentActivityId))
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    // Fetch thumbnails from activity_media
    const activityIds = activities.map(a => a.id)
    const thumbnailMap = await this.fetchThumbnails(activityIds)

    return activities.map(a => this.formatActivityResponse(a, thumbnailMap))
  }

  /**
   * Delete all activities with a specific parent
   * Note: CASCADE delete will also remove these when parent is deleted,
   * but this method allows explicit cleanup during regeneration
   */
  async deleteByParentId(parentActivityId: string): Promise<number> {
    // First get the activities to clean up storage
    const activities = await this.findByParentId(parentActivityId)

    // Clean up storage for each activity
    if (this.storageService.isAvailable()) {
      for (const activity of activities) {
        try {
          await this.storageService.deleteComponentDocuments(activity.id)
        } catch (error) {
          console.error(`Failed to cleanup storage for activity ${activity.id}:`, error)
        }
      }
    }

    // Delete the activities
    await this.db.client
      .delete(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.parentActivityId, parentActivityId))

    return activities.length
  }

  /**
   * Check if an activity has any child activities
   * Efficient existence check without loading all children
   */
  async hasChildActivities(parentActivityId: string): Promise<boolean> {
    const [result] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.parentActivityId, parentActivityId))
      .limit(1)
    return (result?.count ?? 0) > 0
  }

  /**
   * Get a single activity by ID
   * Returns PackageResponseDto for packages (with pricing, details, children, travelers, totals)
   * Returns ActivityResponseDto with pricing for other activity types
   */
  async findOne(id: string): Promise<ActivityResponseDto | PackageResponseDto> {
    const [activity] = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .limit(1)

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`)
    }

    // Always fetch pricing for all activity types
    const pricing = await this.getActivityPricing(id)

    // For packages, return full PackageResponseDto with additional data
    if (activity.activityType === 'package') {
      return this.buildPackageResponse(activity, pricing)
    }

    // For other activity types, return ActivityResponseDto with pricing
    const baseResponse = this.formatActivityResponse(activity)
    // Extract activityPricingId from pricing for payment schedule config
    const activityPricingId = pricing?.id ?? null
    const pricingDto: ActivityPricingDto | null = pricing
      ? {
          totalPriceCents: pricing.totalPriceCents,
          taxesAndFeesCents: pricing.taxesAndFeesCents,
          commissionTotalCents: pricing.commissionTotalCents,
          commissionSplitPercentage: pricing.commissionSplitPercentage,
          currency: pricing.currency,
          pricingType: pricing.pricingType,
          pricingBreakdownJson: pricing.pricingBreakdownJson,
        }
      : null
    return {
      ...baseResponse,
      pricing: pricingDto,
      activityPricingId,
      pricingBreakdownJson: pricing?.pricingBreakdownJson ?? null,
    }
  }

  /**
   * Get activity pricing from activity_pricing table
   * Returns pricing data including the activityPricingId for payment schedule config
   */
  private async getActivityPricing(
    activityId: string
  ): Promise<(ActivityPricingDto & { id: string }) | null> {
    const [pricing] = await this.db.client
      .select({
        id: this.db.schema.activityPricing.id,
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        taxesAndFeesCents: this.db.schema.activityPricing.taxesAndFeesCents,
        commissionTotalCents: this.db.schema.activityPricing.commissionTotalCents,
        commissionSplitPercentage: this.db.schema.activityPricing.commissionSplitPercentage,
        currency: this.db.schema.activityPricing.currency,
        pricingType: this.db.schema.activityPricing.pricingType,
        pricingBreakdownJson: this.db.schema.activityPricing.pricingBreakdownJson,
      })
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, activityId))
      .limit(1)

    if (!pricing) return null

    return {
      id: pricing.id,
      totalPriceCents: pricing.totalPriceCents ?? 0,
      taxesAndFeesCents: pricing.taxesAndFeesCents ?? null,
      commissionTotalCents: pricing.commissionTotalCents ?? null,
      commissionSplitPercentage: pricing.commissionSplitPercentage
        ? parseFloat(pricing.commissionSplitPercentage)
        : null,
      currency: pricing.currency || 'CAD',
      pricingType: (pricing.pricingType || null) as PricingType | null,
      pricingBreakdownJson: (pricing.pricingBreakdownJson as any[]) ?? null,
    }
  }

  /**
   * Build full PackageResponseDto with pricing, details, children, travelers, and totals
   */
  private async buildPackageResponse(
    activity: any,
    pricing: (ActivityPricingDto & { id: string }) | null
  ): Promise<PackageResponseDto> {
    const activityId = activity.id

    // Fetch all package-related data in parallel
    const [packageDetails, children, travelers, travelerBookings, totals, tripId] = await Promise.all([
      this.getPackageDetails(activityId),
      this.getLinkedActivitiesWithDayInfo(activityId),
      this.activityTravelersService.findByActivityId(activityId),
      this.travelerBookingsService.findByActivityId(activityId),
      this.activityTotalsService.calculatePackageTotal(activityId),
      this.getTripIdForActivity(activityId),
    ])

    const baseResponse = this.formatActivityResponse(activity)

    // Format cancellation deadline if present (may be Date or ISO string)
    let formattedCancellationDeadline: string | null = null
    if (packageDetails?.cancellationDeadline) {
      const deadline = packageDetails.cancellationDeadline
      if (typeof deadline === 'object' && deadline !== null && 'toISOString' in deadline) {
        formattedCancellationDeadline = (deadline as Date).toISOString().split('T')[0] ?? null
      } else {
        formattedCancellationDeadline = String(deadline).split('T')[0] ?? null
      }
    }

    // Extract activityPricingId from pricing for payment schedule config
    const activityPricingId = pricing?.id ?? null
    const pricingDto: ActivityPricingDto | null = pricing
      ? {
          totalPriceCents: pricing.totalPriceCents,
          taxesAndFeesCents: pricing.taxesAndFeesCents,
          commissionTotalCents: pricing.commissionTotalCents,
          commissionSplitPercentage: pricing.commissionSplitPercentage,
          currency: pricing.currency,
          pricingType: pricing.pricingType,
          pricingBreakdownJson: pricing.pricingBreakdownJson,
        }
      : null

    return {
      ...baseResponse,
      pricing: pricingDto,
      activityPricingId,
      pricingBreakdownJson: pricing?.pricingBreakdownJson ?? null,
      packageDetails: packageDetails
        ? {
            supplierId: packageDetails.supplierId,
            supplierName: packageDetails.supplierName,
            paymentStatus: packageDetails.paymentStatus || 'unpaid',
            pricingType: packageDetails.pricingType,
            cancellationPolicy: packageDetails.cancellationPolicy,
            cancellationDeadline: formattedCancellationDeadline,
            termsAndConditions: packageDetails.termsAndConditions,
            groupBookingNumber: packageDetails.groupBookingNumber,
          }
        : null,
      activities: children,
      travelers: travelers.map((t) => ({
        id: t.id,
        tripTravelerId: t.tripTravelerId,
        travelerName: t.travelerName,
        createdAt: t.createdAt,
      })),
      travelerBookings,
      totalPriceCents: totals.totalCost,
      totalPaidCents: totals.totalPaid,
      totalUnpaidCents: totals.totalUnpaid,
      tripId: tripId || '',
    }
  }

  /**
   * Get linked activities with day info for packages
   * Returns activities with day context for display in package UI
   */
  async getLinkedActivitiesWithDayInfo(packageId: string): Promise<PackageLinkedActivityDto[]> {
    const results = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        name: this.db.schema.itineraryActivities.name,
        activityType: this.db.schema.itineraryActivities.activityType,
        status: this.db.schema.itineraryActivities.status,
        parentActivityId: this.db.schema.itineraryActivities.parentActivityId,
        sequenceOrder: this.db.schema.itineraryActivities.sequenceOrder,
        dayNumber: this.db.schema.itineraryDays.dayNumber,
        dayDate: this.db.schema.itineraryDays.date,
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        // Compute endDayNumber in SQL — only for activity types that span days
        // Uses date(endDatetime at time zone 'UTC') to avoid local-tz date shift on late-night times
        endDayNumber: sql<number | null>`
          CASE
            WHEN ${this.db.schema.itineraryActivities.activityType} IN ('lodging', 'custom_cruise')
              AND ${this.db.schema.itineraryActivities.endDatetime} IS NOT NULL
              AND ${this.db.schema.itineraryDays.date} IS NOT NULL
              AND date(${this.db.schema.itineraryActivities.endDatetime} at time zone 'UTC') > ${this.db.schema.itineraryDays.date}
            THEN ${this.db.schema.itineraryDays.dayNumber}
              + (date(${this.db.schema.itineraryActivities.endDatetime} at time zone 'UTC') - ${this.db.schema.itineraryDays.date})
            ELSE NULL
          END
        `,
      })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .leftJoin(
        this.db.schema.activityPricing,
        eq(this.db.schema.itineraryActivities.id, this.db.schema.activityPricing.activityId)
      )
      .where(eq(this.db.schema.itineraryActivities.parentActivityId, packageId))
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    return results.map((r) => {
      // Format dayDate - handle both Date objects and ISO strings
      let formattedDate: string | null = null
      if (r.dayDate) {
        if (typeof r.dayDate === 'object' && r.dayDate !== null && 'toISOString' in r.dayDate) {
          formattedDate = (r.dayDate as Date).toISOString().split('T')[0] ?? null
        } else {
          formattedDate = String(r.dayDate).split('T')[0] ?? null
        }
      }

      return {
        id: r.id,
        name: r.name,
        activityType: r.activityType as any,
        status: r.status as any,
        dayNumber: r.dayNumber,
        // Defensive: only lodging/custom_cruise can have spans
        endDayNumber: ['lodging', 'custom_cruise'].includes(r.activityType) ? (r.endDayNumber ?? null) : null,
        dayDate: formattedDate,
        parentActivityId: r.parentActivityId,
        sequenceOrder: r.sequenceOrder,
        totalPriceCents: r.totalPriceCents ?? null,
      }
    })
  }

  /**
   * Get trip ID for an activity (resolves through day → itinerary → trip chain)
   * For floating packages (no day), returns null
   */
  private async getTripIdForActivity(activityId: string): Promise<string | null> {
    const [result] = await this.db.client
      .select({ tripId: this.db.schema.itineraries.tripId })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .leftJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    return result?.tripId || null
  }

  /**
   * Create a new activity
   *
   * @param dto - Activity creation data
   * @param actorId - User ID performing the action (for audit logging)
   * @param tripId - Trip ID (passed from controller to avoid extra lookup)
   * @param packageDetails - Optional package-specific details (for package activities)
   */
  async create(
    dto: CreateActivityDto,
    actorId?: string | null,
    tripId?: string,
    packageDetails?: {
      supplierId?: string | null
      supplierName?: string | null
      cancellationPolicy?: string | null
      cancellationDeadline?: string | null
      termsAndConditions?: string | null
      groupBookingNumber?: string | null
    }
  ): Promise<ActivityResponseDto> {
    // Package activities can have null itineraryDayId (floating packages)
    const isPackage = dto.activityType === 'package'

    // For non-packages, verify day exists
    if (!isPackage || dto.itineraryDayId) {
      if (dto.itineraryDayId) {
        await this.verifyDayExists(dto.itineraryDayId)
      } else if (!isPackage) {
        throw new BadRequestException('itineraryDayId is required for non-package activities')
      }
    }

    // Get trip data (currency and agencyId)
    let tripCurrency = 'CAD'
    let agencyId: string | null = null
    if (dto.itineraryDayId) {
      const tripData = await this.getTripDataFromDayId(dto.itineraryDayId)
      tripCurrency = tripData.currency
      agencyId = tripData.agencyId
    } else if (tripId) {
      // For floating packages, get data from trip directly
      const [trip] = await this.db.client
        .select({
          currency: this.db.schema.trips.currency,
          agencyId: this.db.schema.trips.agencyId,
        })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)
      tripCurrency = trip?.currency || 'CAD'
      agencyId = trip?.agencyId || null
    }

    if (!agencyId) {
      throw new BadRequestException('Could not determine agency for activity')
    }

    // If no sequence order provided, get the next available
    let sequenceOrder = dto.sequenceOrder ?? 0
    if (dto.sequenceOrder === undefined && dto.itineraryDayId) {
      const maxSeq = await this.getMaxSequenceOrder(dto.itineraryDayId)
      sequenceOrder = maxSeq + 1
    }

    const [activity] = await this.db.client
      .insert(this.db.schema.itineraryActivities)
      .values({
        agencyId, // Required for RLS
        itineraryDayId: dto.itineraryDayId || null, // Nullable for packages
        tripId: tripId || null, // For floating packages (packages without a specific day)
        parentActivityId: dto.parentActivityId || null,
        activityType: dto.activityType,
        componentType: dto.activityType, // Default to activityType for backward compatibility
        name: dto.name,
        description: dto.description || null,
        sequenceOrder,
        startDatetime: dto.startDatetime ? new Date(dto.startDatetime) : null,
        endDatetime: dto.endDatetime ? new Date(dto.endDatetime) : null,
        timezone: dto.timezone || null,
        location: dto.location || null,
        address: dto.address || null,
        coordinates: dto.coordinates || null,
        notes: dto.notes || null,
        confirmationNumber: dto.confirmationNumber || null,
        status: dto.status || 'proposed',
        pricingType: dto.pricingType || null,
        currency: dto.currency || tripCurrency,
        photos: dto.photos || null,
      })
      .returning()

    if (!activity) {
      throw new Error('Failed to create activity')
    }

    // Auto-create activity_pricing row with DTO values
    let activityPricingId: string | null = null
    try {
      const [pricing] = await this.db.client
        .insert(this.db.schema.activityPricing)
        .values({
          agencyId, // Required for RLS
          activityId: activity.id,
          currency: dto.currency || tripCurrency,
          pricingType: dto.pricingType || 'flat_rate',
          basePrice: '0',
          totalPriceCents: dto.totalPriceCents ?? 0,
          taxesAndFeesCents: dto.taxesCents ?? 0,
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          pricingBreakdownJson: dto.pricingBreakdownJson ?? null,
        })
        .onConflictDoNothing({ target: this.db.schema.activityPricing.activityId })
        .returning({ id: this.db.schema.activityPricing.id })
      activityPricingId = pricing?.id || null
    } catch (error) {
      this.logger.warn(`Failed to auto-create activity_pricing for activity ${activity.id}: ${error}`)
      // Don't fail the activity creation if pricing fails
    }

    // Package-specific auto-setup: create package_details and payment_schedule_config
    if (isPackage) {
      try {
        // Create package_details record
        await this.createPackageDetails(activity.id, packageDetails)
        this.logger.log(`Created package_details for package ${activity.id}`)

        // Create payment_schedule_config (prevents "missing schedule" warnings)
        if (activityPricingId) {
          await this.createPaymentScheduleConfig(activityPricingId, agencyId)
          this.logger.log(`Created payment_schedule_config for package ${activity.id}`)
        }
      } catch (error) {
        this.logger.warn(`Failed to auto-create package details for activity ${activity.id}: ${error}`)
        // Don't fail the activity creation if package detail setup fails
      }
    }

    // Emit audit event (after all DB operations succeed)
    const resolvedTripId = tripId ?? (dto.itineraryDayId ? await this.getTripIdFromDayId(dto.itineraryDayId) : null)
    if (resolvedTripId) {
      this.eventEmitter.emit(
        'audit.created',
        new AuditEvent(
          'activity',
          activity.id,
          'created',
          resolvedTripId,
          actorId ?? null,
          `${activity.activityType} - ${activity.name}`,
          {
            after: sanitizeForAudit('activity', activity),
            subType: activity.activityType,
          }
        )
      )
    }

    // Mark itinerary as having unpublished changes
    await this.markItineraryChanged(activity.itineraryDayId)

    return this.formatActivityResponse(activity)
  }

  /**
   * Bulk create multiple activities in a single INSERT query.
   * Used for optimized bulk operations like cruise port schedule generation.
   *
   * Note: This skips audit logging and pricing row creation for performance.
   * Use only for internal batch operations where individual audit trails are not needed.
   *
   * @param agencyId - Agency ID (required for RLS)
   * @param activities - Array of activity data to insert
   * @returns Array of created activities with IDs
   */
  async bulkCreate(
    agencyId: string,
    activities: Array<{
      itineraryDayId: string
      parentActivityId?: string | null
      activityType: 'lodging' | 'flight' | 'tour' | 'transportation' | 'dining' | 'options' | 'custom_cruise' | 'port_info'
      name: string
      description?: string | null
      sequenceOrder?: number
      startDatetime?: string | null
      endDatetime?: string | null
      timezone?: string | null
      location?: string | null
      address?: string | null
      coordinates?: { lat: number; lng: number } | null
      notes?: string | null
      confirmationNumber?: string | null
      status?: 'proposed' | 'confirmed' | 'cancelled' | 'optional'
    }>
  ): Promise<Array<{ id: string; itineraryDayId: string | null; name: string }>> {
    if (activities.length === 0) return []

    const start = Date.now()

    // Prepare values for bulk insert
    const values = activities.map((dto, idx) => ({
      agencyId, // Required for RLS
      itineraryDayId: dto.itineraryDayId,
      parentActivityId: dto.parentActivityId || null,
      activityType: dto.activityType,
      componentType: dto.activityType, // Backward compatibility
      name: dto.name,
      description: dto.description || null,
      sequenceOrder: dto.sequenceOrder ?? idx,
      startDatetime: dto.startDatetime ? new Date(dto.startDatetime) : null,
      endDatetime: dto.endDatetime ? new Date(dto.endDatetime) : null,
      timezone: dto.timezone || null,
      location: dto.location || null,
      address: dto.address || null,
      coordinates: dto.coordinates || null,
      notes: dto.notes || null,
      confirmationNumber: dto.confirmationNumber || null,
      status: dto.status || 'proposed',
    }))

    // Single bulk INSERT with RETURNING
    const created = await this.db.client
      .insert(this.db.schema.itineraryActivities)
      .values(values)
      .returning({
        id: this.db.schema.itineraryActivities.id,
        itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
        name: this.db.schema.itineraryActivities.name,
      })

    const duration = Date.now() - start
    // Use debug level for performance metrics to avoid noise in production logs
    this.logger.debug({
      message: 'Bulk activity insert completed',
      event: 'bulk_activity_insert_ms',
      duration,
      activityCount: activities.length,
    })

    return created
  }

  /**
   * Update an activity
   *
   * @param id - Activity ID
   * @param dto - Update data
   * @param actorId - User ID performing the action (for audit logging)
   * @param tripId - Trip ID (passed from controller to avoid extra lookup)
   */
  async update(id: string, dto: UpdateActivityDto, actorId?: string | null, tripId?: string): Promise<ActivityResponseDto> {
    // Fetch the activity (needed for before state and tripId resolution)
    const [beforeActivity] = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .limit(1)

    if (!beforeActivity) {
      throw new NotFoundException(`Activity with ID ${id} not found`)
    }

    // Bypass prevention: block direct booking status changes for packaged activities
    // Users must use the dedicated /bookings/activities endpoints for booking operations,
    // which enforce package control rules
    if ((dto.isBooked !== undefined || dto.bookingDate !== undefined) && beforeActivity.parentActivityId) {
      // Check if parent is a package
      const parent = await this.findOneInternal(beforeActivity.parentActivityId)
      if (parent?.activityType === 'package') {
        throw new BadRequestException('Activity is linked to a package. Use package booking instead.')
      }
    }

    const [activity] = await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({
        ...(dto.activityType && { activityType: dto.activityType, componentType: dto.activityType }),
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sequenceOrder !== undefined && { sequenceOrder: dto.sequenceOrder }),
        ...(dto.startDatetime !== undefined && {
          startDatetime: dto.startDatetime ? new Date(dto.startDatetime) : null
        }),
        ...(dto.endDatetime !== undefined && {
          endDatetime: dto.endDatetime ? new Date(dto.endDatetime) : null
        }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.coordinates !== undefined && { coordinates: dto.coordinates }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.confirmationNumber !== undefined && { confirmationNumber: dto.confirmationNumber }),
        ...(dto.status && { status: dto.status }),
        ...(dto.isBooked !== undefined && { isBooked: dto.isBooked }),
        ...(dto.isVisibleInCalendar !== undefined && { isVisibleInCalendar: dto.isVisibleInCalendar }),
        ...(dto.bookingDate !== undefined && {
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : null
        }),
        ...(dto.pricingType !== undefined && { pricingType: dto.pricingType }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.photos !== undefined && { photos: dto.photos }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .returning()

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found after update`)
    }

    // Update activity_pricing if any pricing fields are provided
    const hasPricingUpdates =
      dto.totalPriceCents !== undefined ||
      dto.taxesCents !== undefined ||
      dto.pricingType !== undefined ||
      dto.commissionTotalCents !== undefined ||
      dto.commissionSplitPercentage !== undefined

    if (hasPricingUpdates) {
      // Child pricing guard: block pricing updates on children linked to packages
      if (beforeActivity.parentActivityId) {
        const parent = await this.findOneInternal(beforeActivity.parentActivityId)
        if (parent?.activityType === 'package') {
          throw new BadRequestException(
            'Cannot update pricing on activities linked to a package. Unlink from package first.'
          )
        }
      }

      // Update activity_pricing table
      try {
        await this.db.client.execute(sql`
          UPDATE activity_pricing
          SET
            total_price_cents = COALESCE(${dto.totalPriceCents ?? null}, total_price_cents),
            taxes_and_fees_cents = COALESCE(${dto.taxesCents ?? null}, taxes_and_fees_cents),
            pricing_type = COALESCE(${dto.pricingType ?? null}, pricing_type),
            commission_total_cents = COALESCE(${dto.commissionTotalCents ?? null}, commission_total_cents),
            commission_split_percentage = COALESCE(${dto.commissionSplitPercentage?.toString() ?? null}, commission_split_percentage),
            updated_at = NOW()
          WHERE activity_id = ${id}
        `)
      } catch (error) {
        this.logger.warn(`Failed to update activity_pricing for activity ${id}: ${error}`)
        // Don't fail the update if pricing update fails
      }
    }

    // Cascade booking status to children when a package booking status changes
    if (beforeActivity.activityType === 'package' && dto.isBooked !== undefined) {
      if (dto.isBooked === true) {
        // Mark non-cancelled children as booked
        await this.db.client
          .update(this.db.schema.itineraryActivities)
          .set({
            isBooked: true,
            status: 'confirmed',
            bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.db.schema.itineraryActivities.parentActivityId, id),
              ne(this.db.schema.itineraryActivities.status, 'cancelled')
            )
          )
      } else {
        // Un-book non-cancelled children when package is un-booked
        await this.db.client
          .update(this.db.schema.itineraryActivities)
          .set({
            isBooked: false,
            status: 'proposed',
            bookingDate: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(this.db.schema.itineraryActivities.parentActivityId, id),
              ne(this.db.schema.itineraryActivities.status, 'cancelled')
            )
          )
      }
    }

    // Emit audit event (after DB operation succeeds)
    // For floating activities (null itineraryDayId), we need tripId passed explicitly
    const resolvedTripId = tripId ?? (beforeActivity.itineraryDayId ? await this.getTripIdFromDayId(beforeActivity.itineraryDayId) : null)
    if (resolvedTripId) {
      const auditDiff = computeAuditDiff('activity', beforeActivity, activity)

      // Only emit if there were actual changes
      if (auditDiff.changedFields.length > 0) {
        this.eventEmitter.emit(
          'audit.updated',
          new AuditEvent(
            'activity',
            activity.id,
            'updated',
            resolvedTripId,
            actorId ?? null,
            `${activity.activityType} - ${activity.name}`,
            {
              before: auditDiff.before,
              after: auditDiff.after,
              changedFields: auditDiff.changedFields,
              subType: activity.activityType,
            }
          )
        )
      }
    }

    // Mark itinerary as having unpublished changes
    await this.markItineraryChanged(activity.itineraryDayId)

    return this.formatActivityResponse(activity)
  }

  /**
   * Delete an activity
   *
   * @param id - Activity ID
   * @param actorId - User ID performing the action (for audit logging)
   * @param tripId - Trip ID (passed from controller to avoid extra lookup)
   */
  async remove(id: string, actorId?: string | null, tripId?: string): Promise<void> {
    // Fetch activity before deletion (needed for audit log)
    const [activity] = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .limit(1)

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`)
    }

    // Resolve tripId before deletion (while we still have the activity)
    // For floating activities (null itineraryDayId), we need tripId passed explicitly
    const resolvedTripId = tripId ?? (activity.itineraryDayId ? await this.getTripIdFromDayId(activity.itineraryDayId) : null)

    // Capture itineraryId BEFORE delete for day location cascade
    let preDeleteItineraryId: string | null = null
    if (activity.itineraryDayId) {
      try {
        const [day] = await this.db.client
          .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
          .from(this.db.schema.itineraryDays)
          .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
          .limit(1)
        preDeleteItineraryId = day?.itineraryId ?? null
      } catch {
        // Non-fatal: cascade will be skipped if we can't resolve
      }
    }

    // Clean up traveller splits before database delete
    // Note: CASCADE delete would also remove these, but explicit cleanup ensures
    // proper logging and potential notification handling
    try {
      await this.travellerSplitsService.deleteActivitySplits(id)
      this.logger.log(`Cleaned up traveller splits for deleted activity ${id}`)
    } catch (error) {
      this.logger.warn(`Failed to cleanup splits for activity ${id}: ${error}`)
      // Continue with deletion - CASCADE will handle it
    }

    // Clean up storage files before database delete
    if (this.storageService.isAvailable()) {
      try {
        await this.storageService.deleteComponentDocuments(id)
      } catch (error) {
        // Log but don't fail - database cleanup should still proceed
        this.logger.error(`Failed to cleanup storage for activity ${id}:`, error)
      }
    }

    await this.db.client
      .delete(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))

    // Emit audit event (after DB delete succeeds)
    if (resolvedTripId) {
      this.eventEmitter.emit(
        'audit.deleted',
        new AuditEvent(
          'activity',
          id,
          'deleted',
          resolvedTripId,
          actorId ?? null,
          `${activity.activityType} - ${activity.name}`,
          {
            before: sanitizeForAudit('activity', activity),
            subType: activity.activityType,
          }
        )
      )
    }

    // Mark itinerary as having unpublished changes
    await this.markItineraryChanged(activity.itineraryDayId)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    if (activity.itineraryDayId && preDeleteItineraryId) {
      try {
        await this.dayLocationService.recalculateFromDay(preDeleteItineraryId, activity.itineraryDayId)
      } catch (error) {
        Sentry.captureException(error, {
          tags: { service: 'day-location', trigger: 'activity-delete' },
          extra: { activityId: id, dayId: activity.itineraryDayId, itineraryId: preDeleteItineraryId },
        })
      }
    }
  }

  /**
   * Reorder activities within a day (drag-and-drop)
   */
  async reorder(itineraryDayId: string, dto: ReorderActivitiesDto): Promise<ActivityResponseDto[]> {
    // Verify all activity IDs belong to this day
    const activityIds = dto.activityOrders.map((a: { id: string; sequenceOrder: number }) => a.id)
    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(
        and(
          eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId),
          inArray(this.db.schema.itineraryActivities.id, activityIds)
        )
      )

    if (activities.length !== activityIds.length) {
      throw new BadRequestException('One or more activity IDs are invalid or do not belong to this day')
    }

    // Update sequence orders
    await Promise.all(
      dto.activityOrders.map((order: { id: string; sequenceOrder: number }) =>
        this.db.client
          .update(this.db.schema.itineraryActivities)
          .set({
            sequenceOrder: order.sequenceOrder,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.itineraryActivities.id, order.id))
      )
    )

    // Mark itinerary as having unpublished changes
    await this.markItineraryChanged(itineraryDayId)

    // Cascade day location recalculation (non-fatal — reorder may change which activity is "last")
    try {
      const [day] = await this.db.client
        .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.id, itineraryDayId))
        .limit(1)
      if (day?.itineraryId) {
        await this.dayLocationService.recalculateFromDay(day.itineraryId, itineraryDayId)
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'day-location', trigger: 'activity-reorder' },
        extra: { itineraryDayId },
      })
    }

    // Return updated activities
    return this.findByDay(itineraryDayId)
  }

  /**
   * Move activity to a different day
   * Note: If moving to a different trip, traveller splits are cleared since
   * they're tied to the original trip's travellers
   */
  async move(id: string, dto: MoveActivityDto): Promise<ActivityResponseDto> {
    // Get current activity with its day info
    const currentActivity = await this.findOne(id)

    // Floating activities (no itineraryDayId) can be moved by simply assigning a day
    let currentTripId: string | null = null
    if (currentActivity.itineraryDayId) {
      const [currentDay] = await this.db.client
        .select({ id: this.db.schema.itineraryDays.id })
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.id, currentActivity.itineraryDayId))
        .limit(1)

      if (!currentDay) {
        throw new NotFoundException(`Current day not found`)
      }

      currentTripId = await this.getTripIdFromDayId(currentActivity.itineraryDayId)
    }

    // Verify target day exists
    await this.verifyDayExists(dto.targetDayId)

    // Fetch target day's date for datetime adjustment
    const [targetDay] = await this.db.client
      .select({ date: this.db.schema.itineraryDays.date })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, dto.targetDayId))
      .limit(1)

    // Calculate timezone-safe datetime adjustments using string manipulation
    let newStartDatetime: Date | null = null
    let newEndDatetime: Date | null = null

    const targetDateStr = targetDay?.date // e.g., "2025-03-15"

    if (targetDateStr) {
      if (currentActivity.startDatetime) {
        // Extract UTC time portion from existing start and apply to target date
        const existingStart = new Date(currentActivity.startDatetime)
        const startIso = existingStart.toISOString()
        const timePortion = startIso.substring(11, 19) // "HH:mm:ss"
        newStartDatetime = new Date(`${targetDateStr}T${timePortion}Z`)

        if (currentActivity.endDatetime) {
          // Preserve duration: compute offset and apply to new start
          const existingEnd = new Date(currentActivity.endDatetime)
          const durationMs = existingEnd.getTime() - existingStart.getTime()
          newEndDatetime = new Date(newStartDatetime.getTime() + durationMs)
        }
      } else {
        // No existing start - default to 09:00 UTC on target date
        newStartDatetime = new Date(`${targetDateStr}T09:00:00Z`)
        // Leave endDatetime null if no existing start
      }
    }
    // If targetDateStr is null (undated day), newStartDatetime/newEndDatetime remain null
    // and the update will preserve existing values via nullish coalescing

    // Check if moving to a different trip (splits would become stale)
    const targetTripId = await this.getTripIdFromDayId(dto.targetDayId)

    if (currentTripId && targetTripId && currentTripId !== targetTripId) {
      // Moving to different trip - clear splits as they're no longer valid
      try {
        await this.travellerSplitsService.deleteActivitySplits(id)
        this.logger.log(`Cleared traveller splits for activity ${id} (moved to different trip)`)
      } catch (error) {
        this.logger.warn(`Failed to cleanup splits for moved activity ${id}: ${error}`)
        // Continue with move - splits will be orphaned but not cause issues
      }
    }

    // If no sequence order provided, append to end of target day
    let sequenceOrder = dto.sequenceOrder ?? 0
    if (dto.sequenceOrder === undefined) {
      const maxSeq = await this.getMaxSequenceOrder(dto.targetDayId)
      sequenceOrder = maxSeq + 1
    }

    // Convert string datetimes back to Date for DB update (findOne returns ISO strings)
    const existingStartDate = currentActivity.startDatetime ? new Date(currentActivity.startDatetime) : null
    const existingEndDate = currentActivity.endDatetime ? new Date(currentActivity.endDatetime) : null

    const [activity] = await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({
        itineraryDayId: dto.targetDayId,
        sequenceOrder,
        startDatetime: newStartDatetime ?? existingStartDate,
        endDatetime: newEndDatetime ?? existingEndDate,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .returning()

    // Mark both source and target days' itineraries as having unpublished changes
    if (currentActivity.itineraryDayId) {
      await this.markItineraryChanged(currentActivity.itineraryDayId)
    }
    await this.markItineraryChanged(dto.targetDayId)

    // Cascade day location recalculation for both source and target days (non-fatal)
    try {
      // Source day lost the activity — recalculate
      if (currentActivity.itineraryDayId) {
        const [sourceDay] = await this.db.client
          .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
          .from(this.db.schema.itineraryDays)
          .where(eq(this.db.schema.itineraryDays.id, currentActivity.itineraryDayId))
          .limit(1)
        if (sourceDay?.itineraryId) {
          await this.dayLocationService.recalculateFromDay(sourceDay.itineraryId, currentActivity.itineraryDayId)
        }
      }
      // Target day gained the activity — recalculate
      const [targetDayInfo] = await this.db.client
        .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.id, dto.targetDayId))
        .limit(1)
      if (targetDayInfo?.itineraryId) {
        await this.dayLocationService.recalculateFromDay(targetDayInfo.itineraryId, dto.targetDayId)
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'day-location', trigger: 'activity-move' },
        extra: { activityId: id, sourceDayId: currentActivity.itineraryDayId, targetDayId: dto.targetDayId },
      })
    }

    return this.formatActivityResponse(activity)
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Format activity for API response.
   * Both activityType (canonical) and componentType (deprecated) are included
   * via the spread for backward compatibility.
   */
  private formatActivityResponse(activity: any, thumbnailMap?: ThumbnailMap): ActivityResponseDto {
    // Determine thumbnail: first check activity_media (from thumbnailMap), then fall back to photos array
    const mediaThumbnail = thumbnailMap?.get(activity.id) || null
    const photosThumbnail = activity.photos?.[0]?.url || null
    const thumbnail = mediaThumbnail || photosThumbnail

    return {
      ...activity,
      // Note: activityType is canonical, componentType is deprecated (both come from spread)
      parentActivityId: activity.parentActivityId || null,
      description: activity.description || null,
      startDatetime: activity.startDatetime?.toISOString() || null,
      endDatetime: activity.endDatetime?.toISOString() || null,
      timezone: activity.timezone || null,
      location: activity.location || null,
      address: activity.address || null,
      coordinates: activity.coordinates || null,
      notes: activity.notes || null,
      confirmationNumber: activity.confirmationNumber || null,
      // Booking tracking
      isBooked: activity.isBooked ?? false,
      isVisibleInCalendar: activity.isVisibleInCalendar ?? true,
      bookingDate: activity.bookingDate?.toISOString() || null,
      bookingId: activity.bookingId || null,
      pricing: null, // Pricing comes from activity_pricing table, fetched separately
      pricingType: activity.pricingType || null,
      photos: activity.photos || null,
      thumbnail,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    }
  }

  /**
   * Batch fetch thumbnails from activity_media for given activity IDs
   * Returns a map of activityId -> first image URL
   */
  private async fetchThumbnails(activityIds: string[]): Promise<ThumbnailMap> {
    if (activityIds.length === 0) return new Map()

    // Fetch first image for each activity (ordered by orderIndex)
    const mediaRecords = await this.db.client
      .select({
        activityId: this.db.schema.activityMedia.activityId,
        fileUrl: this.db.schema.activityMedia.fileUrl,
        orderIndex: this.db.schema.activityMedia.orderIndex,
      })
      .from(this.db.schema.activityMedia)
      .where(
        and(
          inArray(this.db.schema.activityMedia.activityId, activityIds),
          eq(this.db.schema.activityMedia.mediaType, 'image')
        )
      )
      .orderBy(asc(this.db.schema.activityMedia.orderIndex))

    // Create a map of activityId -> first image URL
    const thumbnailMap: ThumbnailMap = new Map()
    for (const record of mediaRecords) {
      // Only set if we don't already have a thumbnail for this activity (first one wins)
      if (!thumbnailMap.has(record.activityId)) {
        thumbnailMap.set(record.activityId, record.fileUrl)
      }
    }

    return thumbnailMap
  }

  private async verifyDayExists(itineraryDayId: string): Promise<void> {
    const [day] = await this.db.client
      .select()
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, itineraryDayId))
      .limit(1)

    if (!day) {
      throw new NotFoundException(`Itinerary day with ID ${itineraryDayId} not found`)
    }
  }

  private async getMaxSequenceOrder(itineraryDayId: string): Promise<number> {
    const [result] = await this.db.client
      .select({
        maxSeq: this.db.schema.itineraryActivities.sequenceOrder,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId))
      .orderBy(desc(this.db.schema.itineraryActivities.sequenceOrder))
      .limit(1)

    return result?.maxSeq ?? -1
  }

  /**
   * Get the trip ID for a given day ID by traversing day → itinerary → trip
   */
  private async getTripIdFromDayId(dayId: string): Promise<string | null> {
    const [day] = await this.db.client
      .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, dayId))
      .limit(1)

    if (!day) return null

    const [itinerary] = await this.db.client
      .select({ tripId: this.db.schema.itineraries.tripId })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, day.itineraryId))
      .limit(1)

    return itinerary?.tripId ?? null
  }

  /**
   * Mark the parent itinerary as having unpublished changes.
   * Called after activity create/update/remove/reorder.
   */
  private async markItineraryChanged(dayId: string | null): Promise<void> {
    if (!dayId) return
    const [day] = await this.db.client
      .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, dayId))
      .limit(1)
    if (day) {
      await this.db.client
        .update(this.db.schema.itineraries)
        .set({ hasUnpublishedChanges: true })
        .where(eq(this.db.schema.itineraries.id, day.itineraryId))
    }
  }

  /**
   * Get trip data (currency, agencyId) from day ID
   * Used to propagate trip-level data to activities
   */
  private async getTripDataFromDayId(dayId: string): Promise<{ currency: string; agencyId: string }> {
    const tripId = await this.getTripIdFromDayId(dayId)
    if (!tripId) {
      this.logger.warn(`Could not find trip for dayId ${dayId}, defaulting to CAD currency`)
      throw new BadRequestException(`Could not find trip for day ${dayId}`)
    }

    const [trip] = await this.db.client
      .select({
        currency: this.db.schema.trips.currency,
        agencyId: this.db.schema.trips.agencyId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip?.currency) {
      this.logger.warn(`Trip ${tripId} has no currency set, defaulting to CAD`)
    }

    if (!trip?.agencyId) {
      throw new BadRequestException(`Trip ${tripId} has no agency`)
    }

    return {
      currency: trip.currency || 'CAD',
      agencyId: trip.agencyId,
    }
  }

  /**
   * Duplicate an activity within the same day.
   * Creates a copy with " (Copy)" appended to the name and new sortOrder at end of day.
   * Performs deep copy: base activity + detail tables + pricing.
   *
   * @param dayId - The day ID (from URL path) - source of truth
   * @param activityId - The activity ID to duplicate
   * @returns The newly created activity
   *
   * Validation:
   * - Activity must exist
   * - Activity must belong to the specified dayId
   * - Throws BadRequestException if validation fails
   */
  async duplicate(
    dayId: string,
    activityId: string,
    actorId?: string | null
  ): Promise<ActivityResponseDto> {
    // 1. Fetch source activity (validates existence)
    const sourceActivity = await this.findOne(activityId)

    // 2. Validate activity belongs to specified dayId (prevents cross-day/trip duplication)
    if (sourceActivity.itineraryDayId !== dayId) {
      throw new BadRequestException(
        `Activity ${activityId} does not belong to day ${dayId}`
      )
    }

    // 3. Execute all operations in a transaction with proper locking
    const newActivityId = await this.db.client.transaction(async (tx) => {
      // 3a. Lock the parent day row to serialize concurrent operations
      await tx.execute(
        sql`SELECT id FROM itinerary_days WHERE id = ${dayId} FOR UPDATE`
      )

      // 3b. Get max sequence order (safe now since we hold the day lock)
      const [maxSeqResult] = await tx.execute(
        sql`SELECT COALESCE(MAX(sequence_order), -1) as max_seq
            FROM itinerary_activities
            WHERE itinerary_day_id = ${dayId}`
      ) as unknown as [{ max_seq: number }]
      const newSequenceOrder = (maxSeqResult?.max_seq ?? -1) + 1

      // 3c. Create the base activity row
      const [newActivity] = await tx
        .insert(this.db.schema.itineraryActivities)
        .values({
          agencyId: (sourceActivity as any).agencyId, // Required for RLS (exists via spread)
          itineraryDayId: dayId,
          activityType: sourceActivity.activityType,
          componentType: sourceActivity.componentType,
          name: `${sourceActivity.name} (Copy)`,
          description: sourceActivity.description || null,
          sequenceOrder: newSequenceOrder,
          startDatetime: sourceActivity.startDatetime ? new Date(sourceActivity.startDatetime) : null,
          endDatetime: sourceActivity.endDatetime ? new Date(sourceActivity.endDatetime) : null,
          timezone: sourceActivity.timezone || null,
          location: sourceActivity.location || null,
          address: sourceActivity.address || null,
          coordinates: sourceActivity.coordinates || null,
          notes: sourceActivity.notes || null,
          confirmationNumber: sourceActivity.confirmationNumber || null,
          status: sourceActivity.status,
          pricingType: sourceActivity.pricingType || null,
          currency: sourceActivity.currency || 'USD',
          photos: sourceActivity.photos || null,
        })
        .returning({ id: this.db.schema.itineraryActivities.id })

      if (!newActivity) {
        throw new Error('Failed to create duplicate activity')
      }

      const newId = newActivity.id

      // 3d. Copy type-specific detail table based on activityType
      await this.copyDetailTable(tx, activityId, newId, sourceActivity.activityType)

      // 3e. Copy activity_pricing if exists
      await this.copyActivityPricing(tx, activityId, newId)

      return newId
    })

    this.logger.log(`Duplicated activity ${activityId} -> ${newActivityId} (deep copy)`)

    // Mark itinerary as having unpublished changes
    await this.markItineraryChanged(dayId)

    // Emit audit event for the duplicated activity (after transaction succeeds)
    const resolvedTripId = await this.getTripIdFromDayId(dayId)
    if (resolvedTripId) {
      const newActivity = await this.findOne(newActivityId)
      this.eventEmitter.emit(
        'audit.created',
        new AuditEvent(
          'activity',
          newActivityId,
          'created',
          resolvedTripId,
          actorId ?? null,
          `${newActivity.activityType} - ${newActivity.name} (duplicated)`,
          {
            after: sanitizeForAudit('activity', newActivity),
            subType: newActivity.activityType,
            sourceId: activityId,
          }
        )
      )
      return newActivity
    }

    return this.findOne(newActivityId)
  }

  /**
   * Copy type-specific detail table for an activity
   */
  private async copyDetailTable(
    tx: Parameters<Parameters<typeof this.db.client.transaction>[0]>[0],
    sourceId: string,
    targetId: string,
    activityType: string
  ): Promise<void> {
    switch (activityType) {
      case 'flight': {
        const [source] = await tx
          .select()
          .from(this.db.schema.flightDetails)
          .where(eq(this.db.schema.flightDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.flightDetails).values({
            activityId: targetId,
            airline: source.airline,
            flightNumber: source.flightNumber,
            departureAirportCode: source.departureAirportCode,
            departureDate: source.departureDate,
            departureTime: source.departureTime,
            departureTimezone: source.departureTimezone,
            departureTerminal: source.departureTerminal,
            departureGate: source.departureGate,
            arrivalAirportCode: source.arrivalAirportCode,
            arrivalDate: source.arrivalDate,
            arrivalTime: source.arrivalTime,
            arrivalTimezone: source.arrivalTimezone,
            arrivalTerminal: source.arrivalTerminal,
            arrivalGate: source.arrivalGate,
          })
        }
        break
      }
      case 'lodging': {
        const [source] = await tx
          .select()
          .from(this.db.schema.lodgingDetails)
          .where(eq(this.db.schema.lodgingDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.lodgingDetails).values({
            activityId: targetId,
            // Property info
            propertyName: source.propertyName,
            address: source.address,
            phone: source.phone,
            website: source.website,
            // Check-in/out
            checkInDate: source.checkInDate,
            checkInTime: source.checkInTime,
            checkOutDate: source.checkOutDate,
            checkOutTime: source.checkOutTime,
            timezone: source.timezone,
            // Room details
            roomType: source.roomType,
            roomCount: source.roomCount,
            amenities: source.amenities,
            // Additional
            specialRequests: source.specialRequests,
          })
        }
        break
      }
      case 'transportation': {
        const [source] = await tx
          .select()
          .from(this.db.schema.transportationDetails)
          .where(eq(this.db.schema.transportationDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.transportationDetails).values({
            activityId: targetId,
            // Type classification
            subtype: source.subtype,
            // Provider
            providerName: source.providerName,
            providerPhone: source.providerPhone,
            providerEmail: source.providerEmail,
            // Vehicle details
            vehicleType: source.vehicleType,
            vehicleModel: source.vehicleModel,
            vehicleCapacity: source.vehicleCapacity,
            licensePlate: source.licensePlate,
            // Pickup details
            pickupDate: source.pickupDate,
            pickupTime: source.pickupTime,
            pickupTimezone: source.pickupTimezone,
            pickupAddress: source.pickupAddress,
            pickupNotes: source.pickupNotes,
            // Dropoff details
            dropoffDate: source.dropoffDate,
            dropoffTime: source.dropoffTime,
            dropoffTimezone: source.dropoffTimezone,
            dropoffAddress: source.dropoffAddress,
            dropoffNotes: source.dropoffNotes,
            // Driver info
            driverName: source.driverName,
            driverPhone: source.driverPhone,
            // Car rental specific
            rentalPickupLocation: source.rentalPickupLocation,
            rentalDropoffLocation: source.rentalDropoffLocation,
            rentalInsuranceType: source.rentalInsuranceType,
            rentalMileageLimit: source.rentalMileageLimit,
            // Additional
            features: source.features,
            specialRequests: source.specialRequests,
            flightNumber: source.flightNumber,
            isRoundTrip: source.isRoundTrip,
          })
        }
        break
      }
      case 'dining': {
        const [source] = await tx
          .select()
          .from(this.db.schema.diningDetails)
          .where(eq(this.db.schema.diningDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.diningDetails).values({
            activityId: targetId,
            // Restaurant info
            restaurantName: source.restaurantName,
            cuisineType: source.cuisineType,
            mealType: source.mealType,
            // Reservation
            reservationDate: source.reservationDate,
            reservationTime: source.reservationTime,
            timezone: source.timezone,
            partySize: source.partySize,
            // Location
            address: source.address,
            phone: source.phone,
            website: source.website,
            coordinates: source.coordinates,
            // Additional
            priceRange: source.priceRange,
            dressCode: source.dressCode,
            dietaryRequirements: source.dietaryRequirements,
            specialRequests: source.specialRequests,
            menuUrl: source.menuUrl,
          })
        }
        break
      }
      case 'options': {
        const [source] = await tx
          .select()
          .from(this.db.schema.optionsDetails)
          .where(eq(this.db.schema.optionsDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.optionsDetails).values({
            activityId: targetId,
            // Option info
            optionCategory: source.optionCategory,
            isSelected: source.isSelected,
            // Availability
            availabilityStartDate: source.availabilityStartDate,
            availabilityEndDate: source.availabilityEndDate,
            bookingDeadline: source.bookingDeadline,
            // Capacity
            minParticipants: source.minParticipants,
            maxParticipants: source.maxParticipants,
            spotsAvailable: source.spotsAvailable,
            // Timing
            durationMinutes: source.durationMinutes,
            meetingPoint: source.meetingPoint,
            meetingTime: source.meetingTime,
            // Provider
            providerName: source.providerName,
            providerPhone: source.providerPhone,
            providerEmail: source.providerEmail,
            providerWebsite: source.providerWebsite,
            // Details
            inclusions: source.inclusions,
            exclusions: source.exclusions,
            requirements: source.requirements,
            whatToBring: source.whatToBring,
            // Display
            displayOrder: source.displayOrder,
            highlightText: source.highlightText,
            instructionsText: source.instructionsText,
          })
        }
        break
      }
      case 'custom_cruise': {
        const [source] = await tx
          .select()
          .from(this.db.schema.customCruiseDetails)
          .where(eq(this.db.schema.customCruiseDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.customCruiseDetails).values({
            activityId: targetId,
            // Traveltek Identity
            traveltekCruiseId: source.traveltekCruiseId,
            source: source.source,
            // Cruise Line Info
            cruiseLineName: source.cruiseLineName,
            cruiseLineCode: source.cruiseLineCode,
            cruiseLineId: source.cruiseLineId,
            shipName: source.shipName,
            shipCode: source.shipCode,
            shipClass: source.shipClass,
            shipImageUrl: source.shipImageUrl,
            cruiseShipId: source.cruiseShipId,
            // Voyage Details
            itineraryName: source.itineraryName,
            voyageCode: source.voyageCode,
            region: source.region,
            cruiseRegionId: source.cruiseRegionId,
            nights: source.nights,
            seaDays: source.seaDays,
            // Departure
            departurePort: source.departurePort,
            departurePortId: source.departurePortId,
            departureDate: source.departureDate,
            departureTime: source.departureTime,
            departureTimezone: source.departureTimezone,
            // Arrival
            arrivalPort: source.arrivalPort,
            arrivalPortId: source.arrivalPortId,
            arrivalDate: source.arrivalDate,
            arrivalTime: source.arrivalTime,
            arrivalTimezone: source.arrivalTimezone,
            // Cabin
            cabinCategory: source.cabinCategory,
            cabinCode: source.cabinCode,
            cabinNumber: source.cabinNumber,
            cabinDeck: source.cabinDeck,
            cabinImageUrl: source.cabinImageUrl,
            cabinDescription: source.cabinDescription,
            // Booking
            bookingNumber: source.bookingNumber,
            fareCode: source.fareCode,
            bookingDeadline: source.bookingDeadline,
            // JSON Data
            portCallsJson: source.portCallsJson,
            cabinPricingJson: source.cabinPricingJson,
            shipContentJson: source.shipContentJson,
            // Additional
            inclusions: source.inclusions,
            specialRequests: source.specialRequests,
          })
        }
        break
      }
      case 'port_info': {
        const [source] = await tx
          .select()
          .from(this.db.schema.portInfoDetails)
          .where(eq(this.db.schema.portInfoDetails.activityId, sourceId))
          .limit(1)
        if (source) {
          await tx.insert(this.db.schema.portInfoDetails).values({
            activityId: targetId,
            // Port Type
            portType: source.portType,
            // Port Info
            portName: source.portName,
            portLocation: source.portLocation,
            // Timing
            arrivalDate: source.arrivalDate,
            arrivalTime: source.arrivalTime,
            departureDate: source.departureDate,
            departureTime: source.departureTime,
            timezone: source.timezone,
            // Port Details
            dockName: source.dockName,
            address: source.address,
            coordinates: source.coordinates,
            // Contact
            phone: source.phone,
            website: source.website,
            // Excursion
            excursionNotes: source.excursionNotes,
            tenderRequired: source.tenderRequired,
            // Additional
            specialRequests: source.specialRequests,
          })
        }
        break
      }
      // 'activity' type has no detail table - nothing to copy
    }
  }

  /**
   * Copy activity_pricing row if exists
   */
  private async copyActivityPricing(
    tx: Parameters<Parameters<typeof this.db.client.transaction>[0]>[0],
    sourceId: string,
    targetId: string
  ): Promise<void> {
    const [source] = await tx
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, sourceId))
      .limit(1)

    if (source) {
      await tx.insert(this.db.schema.activityPricing).values({
        agencyId: source.agencyId, // Required for RLS
        activityId: targetId,
        pricingType: source.pricingType,
        basePrice: source.basePrice,
        totalPriceCents: source.totalPriceCents,
        taxesAndFeesCents: source.taxesAndFeesCents,
        currency: source.currency,
        invoiceType: source.invoiceType,
        commissionTotalCents: source.commissionTotalCents,
        commissionSplitPercentage: source.commissionSplitPercentage,
        commissionExpectedDate: source.commissionExpectedDate,
        termsAndConditions: source.termsAndConditions,
        cancellationPolicy: source.cancellationPolicy,
        supplier: source.supplier,
        bookingReference: source.bookingReference,
        netPriceCents: source.netPriceCents,
        nonRefundableDeposit: source.nonRefundableDeposit,
        cancellationScheduleJson: source.cancellationScheduleJson,
      })
    }
  }

  // ============================================================================
  // Internal Helpers (used by package guard logic)
  // ============================================================================

  /**
   * Internal find that returns raw DB row (used by guards that need activityType)
   */
  private async findOneInternal(id: string): Promise<any | null> {
    const [activity] = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .limit(1)
    return activity || null
  }

  // ============================================================================
  // Package-Specific Methods
  // ============================================================================

  /**
   * Link activities to a package.
   * Sets the parentActivityId of the specified activities to the package ID.
   *
   * Validation:
   * - Package must exist and be of type 'package'
   * - Activities cannot be packages themselves (no nesting)
   * - Prevents circular parent/child relationships
   *
   * @param packageId - The package activity ID
   * @param activityIds - Array of activity IDs to link
   */
  async linkChildrenToPackage(packageId: string, activityIds: string[], actorId?: string | null): Promise<void> {
    if (activityIds.length === 0) return

    // Verify package exists and is of type 'package'
    const pkg = await this.findOneInternal(packageId)
    if (!pkg) {
      throw new NotFoundException(`Package activity ${packageId} not found`)
    }
    if (pkg.activityType !== 'package') {
      throw new BadRequestException('Can only link children to package activities')
    }

    // Verify all activities exist and none are packages
    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(inArray(this.db.schema.itineraryActivities.id, activityIds))

    if (activities.length !== activityIds.length) {
      throw new BadRequestException('One or more activity IDs are invalid')
    }

    // Check none are packages (prevent nesting)
    const packageActivities = activities.filter(a => a.activityType === 'package')
    if (packageActivities.length > 0) {
      throw new BadRequestException('Cannot nest packages. Packages cannot be children of other packages.')
    }

    // Verify all children belong to the same agency as the package
    const crossAgency = activities.filter(a => a.agencyId !== pkg.agencyId)
    if (crossAgency.length > 0) {
      throw new BadRequestException('All activities must belong to the same agency as the package')
    }

    // Verify all children belong to the same trip as the package
    // Regular activities store trip association via itinerary_day_id → itinerary_days → itineraries,
    // NOT via the trip_id column (which is only set for floating packages).
    if (pkg.tripId) {
      for (const activity of activities) {
        let activityTripId = activity.tripId
        if (!activityTripId && activity.itineraryDayId) {
          activityTripId = await this.getTripIdFromDayId(activity.itineraryDayId)
        }
        if (activityTripId && activityTripId !== pkg.tripId) {
          throw new BadRequestException('All activities must belong to the same trip as the package')
        }
      }
    }

    // Check for cycles (prevent an activity from being its own ancestor)
    for (const activityId of activityIds) {
      await this.validateNoParentCycle(activityId, packageId)
    }

    // Link all activities to the package
    await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({ parentActivityId: packageId, updatedAt: new Date() })
      .where(inArray(this.db.schema.itineraryActivities.id, activityIds))

    // Emit audit event
    const tripId = pkg.tripId ?? (pkg.itineraryDayId ? await this.getTripIdFromDayId(pkg.itineraryDayId) : null)
    if (tripId) {
      const linkedNames = activities.map(a => a.name).join(', ')
      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent(
          'activity',
          packageId,
          'updated',
          tripId,
          actorId ?? null,
          `Linked ${activityIds.length} activit${activityIds.length === 1 ? 'y' : 'ies'} to ${pkg.name}`,
          { childrenLinked: activityIds, linkedNames, count: activityIds.length, subType: 'package' }
        )
      )
    }

    // Mark itinerary as having unpublished changes
    if (pkg.itineraryDayId) {
      await this.markItineraryChanged(pkg.itineraryDayId)
    }
  }

  /**
   * Unlink activities from a package.
   * Sets the parentActivityId to NULL for the specified activities.
   *
   * @param packageId - The package activity ID
   * @param activityIds - Array of activity IDs to unlink
   */
  async unlinkChildrenFromPackage(packageId: string, activityIds: string[], actorId?: string | null): Promise<void> {
    if (activityIds.length === 0) return

    // Fetch activity names for audit log before unlinking
    const activities = await this.db.client
      .select({ id: this.db.schema.itineraryActivities.id, name: this.db.schema.itineraryActivities.name })
      .from(this.db.schema.itineraryActivities)
      .where(inArray(this.db.schema.itineraryActivities.id, activityIds))

    await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({ parentActivityId: null, updatedAt: new Date() })
      .where(
        and(
          inArray(this.db.schema.itineraryActivities.id, activityIds),
          eq(this.db.schema.itineraryActivities.parentActivityId, packageId)
        )
      )

    // Emit audit event
    const pkg = await this.findOneInternal(packageId)
    if (pkg) {
      const tripId = pkg.tripId ?? (pkg.itineraryDayId ? await this.getTripIdFromDayId(pkg.itineraryDayId) : null)
      if (tripId) {
        const unlinkedNames = activities.map(a => a.name).join(', ')
        this.eventEmitter.emit(
          'audit.updated',
          new AuditEvent(
            'activity',
            packageId,
            'updated',
            tripId,
            actorId ?? null,
            `Unlinked ${activityIds.length} activit${activityIds.length === 1 ? 'y' : 'ies'} from ${pkg.name}`,
            { childrenUnlinked: activityIds, unlinkedNames, count: activityIds.length, subType: 'package' }
          )
        )
      }

      // Mark itinerary as having unpublished changes
      if (pkg.itineraryDayId) {
        await this.markItineraryChanged(pkg.itineraryDayId)
      }
    }
  }

  /**
   * Get all unlinked activities for a trip (activities not in any package)
   * Used for the activity linker UI.
   *
   * Activities can belong to a trip via:
   * 1. itinerary_day_id → itinerary_days → itineraries → trips
   * 2. Direct trip_id (for floating packages - though packages are excluded here)
   *
   * @param tripId - Trip ID
   * @param itineraryId - Optional itinerary ID to filter activities by specific itinerary
   */
  async findUnlinkedByTrip(tripId: string, itineraryId?: string): Promise<ActivityResponseDto[]> {
    // Build the trip/itinerary filter condition
    const tripOrItineraryCondition = itineraryId
      ? // When itineraryId provided, only get activities from that specific itinerary
        eq(this.db.schema.itineraries.id, itineraryId)
      : // Otherwise get all activities for the trip (via any itinerary or direct trip_id)
        or(
          eq(this.db.schema.itineraries.tripId, tripId),
          eq(this.db.schema.itineraryActivities.tripId, tripId)
        )

    const activities = await this.db.client
      .select({
        activity: this.db.schema.itineraryActivities,
        dayNumber: this.db.schema.itineraryDays.dayNumber,
        dayDate: this.db.schema.itineraryDays.date,
        // Compute endDayNumber in SQL — only for activity types that span days
        // Uses date(endDatetime at time zone 'UTC') to avoid local-tz date shift on late-night times
        endDayNumber: sql<number | null>`
          CASE
            WHEN ${this.db.schema.itineraryActivities.activityType} IN ('lodging', 'custom_cruise')
              AND ${this.db.schema.itineraryActivities.endDatetime} IS NOT NULL
              AND ${this.db.schema.itineraryDays.date} IS NOT NULL
              AND date(${this.db.schema.itineraryActivities.endDatetime} at time zone 'UTC') > ${this.db.schema.itineraryDays.date}
            THEN ${this.db.schema.itineraryDays.dayNumber}
              + (date(${this.db.schema.itineraryActivities.endDatetime} at time zone 'UTC') - ${this.db.schema.itineraryDays.date})
            ELSE NULL
          END
        `,
      })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .leftJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(
        and(
          tripOrItineraryCondition,
          sql`${this.db.schema.itineraryActivities.parentActivityId} IS NULL`,
          sql`${this.db.schema.itineraryActivities.activityType} != 'package'`
        )
      )
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    if (activities.length === 0) {
      return []
    }

    // Get activity IDs for batch pricing query
    const activityIds = activities.map(a => a.activity.id)

    // Fetch pricing for all activities in a single query
    const pricingData = await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        currency: this.db.schema.activityPricing.currency,
      })
      .from(this.db.schema.activityPricing)
      .where(inArray(this.db.schema.activityPricing.activityId, activityIds))

    const pricingMap = new Map(
      pricingData.map(p => [p.activityId, p])
    )

    // Fetch payment data (computed from expected_payment_items)
    const paymentData = await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
        paidCents: sql<number>`COALESCE(SUM(${this.db.schema.expectedPaymentItems.paidAmountCents}), 0)::int`,
        expectedCents: sql<number>`COALESCE(SUM(${this.db.schema.expectedPaymentItems.expectedAmountCents}), 0)::int`,
      })
      .from(this.db.schema.activityPricing)
      .innerJoin(
        this.db.schema.paymentScheduleConfig,
        eq(this.db.schema.paymentScheduleConfig.activityPricingId, this.db.schema.activityPricing.id)
      )
      .innerJoin(
        this.db.schema.expectedPaymentItems,
        eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, this.db.schema.paymentScheduleConfig.id)
      )
      .where(inArray(this.db.schema.activityPricing.activityId, activityIds))
      .groupBy(this.db.schema.activityPricing.activityId)

    const paymentDataMap = new Map(
      paymentData.map(p => [p.activityId, p])
    )

    // Fetch primary supplier for all activities in a single query
    const supplierData = await this.db.client
      .select({
        activityId: this.db.schema.activitySuppliers.activityId,
        supplierName: this.db.schema.suppliers.name,
      })
      .from(this.db.schema.activitySuppliers)
      .innerJoin(
        this.db.schema.suppliers,
        eq(this.db.schema.activitySuppliers.supplierId, this.db.schema.suppliers.id)
      )
      .where(
        and(
          inArray(this.db.schema.activitySuppliers.activityId, activityIds),
          eq(this.db.schema.activitySuppliers.primarySupplier, true)
        )
      )

    const supplierMap = new Map(
      supplierData.map(s => [s.activityId, s.supplierName])
    )

    // Fetch cruise line name for cruise activities (stored in custom_cruise_details, not activity_suppliers)
    const cruiseLineData = await this.db.client
      .select({
        activityId: this.db.schema.customCruiseDetails.activityId,
        cruiseLineName: this.db.schema.customCruiseDetails.cruiseLineName,
      })
      .from(this.db.schema.customCruiseDetails)
      .where(inArray(this.db.schema.customCruiseDetails.activityId, activityIds))

    const cruiseLineMap = new Map(
      cruiseLineData.map(c => [c.activityId, c.cruiseLineName])
    )

    // Return activities with pricing, supplier, payment, and day data enriched
    return activities.map(r => {
      const baseResponse = this.formatActivityResponse(r.activity)
      const pricing = pricingMap.get(r.activity.id)
      const payment = paymentDataMap.get(r.activity.id)
      // Use activity_suppliers first, fall back to cruise_line_name for cruises
      const supplierName = supplierMap.get(r.activity.id)
        ?? cruiseLineMap.get(r.activity.id)
        ?? null

      // Compute payment status from transaction data
      let paymentStatus: string | null = null
      if (payment) {
        if (payment.paidCents >= payment.expectedCents && payment.expectedCents > 0) {
          paymentStatus = 'paid'
        } else if (payment.paidCents > 0) {
          paymentStatus = 'deposit_paid'
        } else {
          paymentStatus = 'unpaid'
        }
      }

      // Format day date
      let formattedDayDate: string | null = null
      if (r.dayDate) {
        formattedDayDate = typeof r.dayDate === 'object' && 'toISOString' in (r.dayDate as any)
          ? (r.dayDate as unknown as Date).toISOString().split('T')[0]!
          : String(r.dayDate).split('T')[0]!
      }

      return {
        ...baseResponse,
        supplierName,
        confirmationNumber: r.activity.confirmationNumber ?? null,
        isBooked: r.activity.isBooked,
        paymentStatus,
        paidCents: payment?.paidCents ?? null,
        currency: pricing?.currency ?? 'CAD',
        pricing: pricing ? {
          totalPriceCents: pricing.totalPriceCents ?? 0,
          currency: pricing.currency ?? 'CAD',
          pricingType: null,
        } : null,
        // Day data for display (endDayNumber computed in SQL)
        _dayNumber: r.dayNumber ?? null,
        _dayDate: formattedDayDate,
        // Defensive: only lodging/custom_cruise can have spans
        _endDayNumber: ['lodging', 'custom_cruise'].includes(r.activity.activityType) ? (r.endDayNumber ?? null) : null,
      }
    })
  }

  /**
   * Get all packages for a trip with enriched summary data
   *
   * Packages can belong to a trip via:
   * 1. Direct trip_id (floating packages - preferred)
   * 2. itinerary_day_id → itinerary_days → itineraries → trips (legacy)
   *
   * Returns enriched package data including activityCount, supplierName,
   * paymentStatus, and totalPriceCents for efficient list display.
   *
   * @param tripId - Trip ID
   */
  async findPackagesByTrip(tripId: string): Promise<PackageResponseDto[]> {
    // Query 1: Floating packages with direct trip_id
    const floatingPackages = await this.db.client
      .select({
        activity: this.db.schema.itineraryActivities,
      })
      .from(this.db.schema.itineraryActivities)
      .where(
        and(
          eq(this.db.schema.itineraryActivities.tripId, tripId),
          eq(this.db.schema.itineraryActivities.activityType, 'package')
        )
      )

    // Query 2: Packages linked via itinerary chain (for legacy packages without trip_id)
    const linkedPackages = await this.db.client
      .select({
        activity: this.db.schema.itineraryActivities,
      })
      .from(this.db.schema.itineraryActivities)
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          eq(this.db.schema.itineraryActivities.activityType, 'package'),
          // Exclude packages that have trip_id set (already in floatingPackages)
          sql`${this.db.schema.itineraryActivities.tripId} IS NULL`
        )
      )

    // Merge results (floating packages first, then legacy)
    const allPackages = [...floatingPackages, ...linkedPackages]

    // Sort by sequence order
    allPackages.sort((a, b) => (a.activity.sequenceOrder ?? 0) - (b.activity.sequenceOrder ?? 0))

    if (allPackages.length === 0) {
      return []
    }

    // Get package IDs for batch queries
    const packageIds = allPackages.map(p => p.activity.id)

    // Fetch child counts for all packages in a single query
    const childCounts = await this.db.client
      .select({
        parentActivityId: this.db.schema.itineraryActivities.parentActivityId,
        count: sql<number>`count(*)::int`,
      })
      .from(this.db.schema.itineraryActivities)
      .where(inArray(this.db.schema.itineraryActivities.parentActivityId, packageIds))
      .groupBy(this.db.schema.itineraryActivities.parentActivityId)

    const childCountMap = new Map(
      childCounts.map(c => [c.parentActivityId, c.count])
    )

    // Fetch package details for all packages in a single query
    const packageDetails = await this.db.client
      .select({
        activityId: this.db.schema.packageDetails.activityId,
        supplierName: this.db.schema.packageDetails.supplierName,
        paymentStatus: this.db.schema.packageDetails.paymentStatus,
      })
      .from(this.db.schema.packageDetails)
      .where(inArray(this.db.schema.packageDetails.activityId, packageIds))

    const packageDetailsMap = new Map(
      packageDetails.map(d => [d.activityId, d])
    )

    // Fetch pricing for all packages in a single query
    const pricingData = await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        currency: this.db.schema.activityPricing.currency,
      })
      .from(this.db.schema.activityPricing)
      .where(inArray(this.db.schema.activityPricing.activityId, packageIds))

    const pricingMap = new Map(
      pricingData.map(p => [p.activityId, p])
    )

    // Fetch payment data for all packages (computed from expected_payment_items)
    const paymentData = packageIds.length > 0 ? await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
        paidCents: sql<number>`COALESCE(SUM(${this.db.schema.expectedPaymentItems.paidAmountCents}), 0)::int`,
        expectedCents: sql<number>`COALESCE(SUM(${this.db.schema.expectedPaymentItems.expectedAmountCents}), 0)::int`,
      })
      .from(this.db.schema.activityPricing)
      .innerJoin(
        this.db.schema.paymentScheduleConfig,
        eq(this.db.schema.paymentScheduleConfig.activityPricingId, this.db.schema.activityPricing.id)
      )
      .innerJoin(
        this.db.schema.expectedPaymentItems,
        eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, this.db.schema.paymentScheduleConfig.id)
      )
      .where(inArray(this.db.schema.activityPricing.activityId, packageIds))
      .groupBy(this.db.schema.activityPricing.activityId)
    : []

    const paymentDataMap = new Map(
      paymentData.map(p => [p.activityId, p])
    )

    // Fetch itinerary IDs for each package based on linked activities' itineraries
    // This allows filtering packages by selected itinerary in the UI
    const itineraryIdsQuery = await this.db.client
      .select({
        parentActivityId: this.db.schema.itineraryActivities.parentActivityId,
        itineraryId: this.db.schema.itineraries.id,
      })
      .from(this.db.schema.itineraryActivities)
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(inArray(this.db.schema.itineraryActivities.parentActivityId, packageIds))

    // Group itinerary IDs by parent activity (package)
    const itineraryIdsMap = new Map<string, Set<string>>()
    for (const row of itineraryIdsQuery) {
      if (row.parentActivityId) {
        const existing = itineraryIdsMap.get(row.parentActivityId) || new Set()
        existing.add(row.itineraryId)
        itineraryIdsMap.set(row.parentActivityId, existing)
      }
    }

    // Debug: Log child counts
    this.logger.debug(`[findPackagesByTrip] tripId=${tripId}, packages=${packageIds.length}, childCounts=${JSON.stringify(childCounts)}`)

    // Build enriched package responses
    return allPackages.map(r => {
      const activity = r.activity
      const baseResponse = this.formatActivityResponse(activity)
      const details = packageDetailsMap.get(activity.id)
      const pricing = pricingMap.get(activity.id)
      const activityCount = childCountMap.get(activity.id) ?? 0
      const itineraryIds = Array.from(itineraryIdsMap.get(activity.id) ?? [])
      this.logger.debug(`[findPackagesByTrip] Package ${activity.name}: activityCount=${activityCount}, itineraryIds=${JSON.stringify(itineraryIds)}`)

      // Compute payment status from actual transaction data
      const payment = paymentDataMap.get(activity.id)
      let computedPaymentStatus: string
      if (payment) {
        if (payment.paidCents >= payment.expectedCents && payment.expectedCents > 0) {
          computedPaymentStatus = 'paid'
        } else if (payment.paidCents > 0) {
          computedPaymentStatus = 'deposit_paid'
        } else {
          computedPaymentStatus = 'unpaid'
        }
      } else {
        // No payment schedule — fall back to packageDetails.paymentStatus
        computedPaymentStatus = details?.paymentStatus ?? 'unpaid'
      }

      const totalPaidCents = payment?.paidCents ?? 0
      const totalPriceCentsVal = pricing?.totalPriceCents ?? 0

      return {
        ...baseResponse,
        tripId,
        activityCount,
        itineraryIds, // For filtering packages by selected itinerary
        supplierName: details?.supplierName ?? null,
        paymentStatus: computedPaymentStatus,
        totalPriceCents: totalPriceCentsVal,
        totalPaidCents,
        totalUnpaidCents: Math.max(0, totalPriceCentsVal - totalPaidCents),
        packageDetails: details ? {
          supplierId: null,
          supplierName: details.supplierName,
          paymentStatus: details.paymentStatus ?? 'unpaid',
          pricingType: null,
          cancellationPolicy: null,
          cancellationDeadline: null,
          termsAndConditions: null,
          groupBookingNumber: null,
        } : null,
        activities: [], // Not fetched for list view - use children endpoint
        travelers: [], // Not fetched for list view
        travelerBookings: [], // Not fetched for list view
        pricing: pricing ? {
          totalPriceCents: pricing.totalPriceCents ?? 0,
          currency: pricing.currency ?? 'CAD',
          pricingType: null,
        } : null,
      } as PackageResponseDto
    })
  }

  /**
   * Validate that setting parentActivityId won't create a cycle.
   * Walks up the parent chain to ensure the proposed parent is not a descendant of the child.
   *
   * @param childId - The activity that would become a child
   * @param proposedParentId - The activity that would become the parent
   */
  private async validateNoParentCycle(childId: string, proposedParentId: string): Promise<void> {
    const MAX_DEPTH = 10 // Safety limit for recursion
    let currentId: string | null = proposedParentId
    let depth = 0

    while (currentId && depth < MAX_DEPTH) {
      if (currentId === childId) {
        throw new BadRequestException('Cannot create circular parent/child relationship')
      }
      const parent = await this.findOneInternal(currentId)
      currentId = parent?.parentActivityId || null
      depth++
    }

    if (depth >= MAX_DEPTH) {
      throw new BadRequestException('Parent chain too deep - possible circular reference')
    }
  }

  /**
   * Create package-specific details record
   * Called after creating a package activity
   *
   * @param activityId - The package activity ID
   * @param details - Package-specific details
   */
  async createPackageDetails(
    activityId: string,
    details?: {
      supplierId?: string | null
      supplierName?: string | null
      cancellationPolicy?: string | null
      cancellationDeadline?: string | null
      termsAndConditions?: string | null
      groupBookingNumber?: string | null
    }
  ): Promise<void> {
    const [activity] = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        directTripId: this.db.schema.itineraryActivities.tripId,
        itineraryTripId: this.db.schema.itineraries.tripId,
      })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .leftJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    const tripId = activity?.directTripId ?? activity?.itineraryTripId
    if (!tripId) {
      throw new NotFoundException(`Trip not found for activity ${activityId}`)
    }

    await this.db.client
      .insert(this.db.schema.packageDetails)
      .values({
        tripId,
        activityId,
        supplierId: details?.supplierId || null,
        supplierName: details?.supplierName || null,
        cancellationPolicy: details?.cancellationPolicy || null,
        cancellationDeadline: details?.cancellationDeadline || null,
        termsAndConditions: details?.termsAndConditions || null,
        groupBookingNumber: details?.groupBookingNumber || null,
      })
      .onConflictDoNothing({ target: this.db.schema.packageDetails.activityId })
  }

  /**
   * Update package-specific details
   *
   * @param activityId - The package activity ID
   * @param details - Package-specific details to update
   */
  async updatePackageDetails(
    activityId: string,
    details: {
      supplierId?: string | null
      supplierName?: string | null
      paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
      pricingType?: 'flat_rate' | 'per_person'
      cancellationPolicy?: string | null
      cancellationDeadline?: string | null
      termsAndConditions?: string | null
      groupBookingNumber?: string | null
    }
  ): Promise<void> {
    await this.db.client
      .update(this.db.schema.packageDetails)
      .set({
        ...(details.supplierId !== undefined && { supplierId: details.supplierId }),
        ...(details.supplierName !== undefined && { supplierName: details.supplierName }),
        ...(details.paymentStatus !== undefined && { paymentStatus: details.paymentStatus }),
        ...(details.pricingType !== undefined && { pricingType: details.pricingType }),
        ...(details.cancellationPolicy !== undefined && { cancellationPolicy: details.cancellationPolicy }),
        ...(details.cancellationDeadline !== undefined && { cancellationDeadline: details.cancellationDeadline }),
        ...(details.termsAndConditions !== undefined && { termsAndConditions: details.termsAndConditions }),
        ...(details.groupBookingNumber !== undefined && { groupBookingNumber: details.groupBookingNumber }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.packageDetails.activityId, activityId))
  }

  /**
   * Get package details for an activity
   *
   * @param activityId - The package activity ID
   */
  async getPackageDetails(activityId: string): Promise<any | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.packageDetails)
      .where(eq(this.db.schema.packageDetails.activityId, activityId))
      .limit(1)
    return details || null
  }

  /**
   * Create payment_schedule_config for a package
   * Called after creating a package activity to prevent "missing schedule" warnings
   *
   * @param activityPricingId - The activity_pricing ID for the package
   * @param agencyId - Agency ID (required for RLS)
   */
  async createPaymentScheduleConfig(activityPricingId: string, _agencyId: string): Promise<void> {
    await this.db.client
      .insert(this.db.schema.paymentScheduleConfig)
      .values({
        activityPricingId,
        // Note: agencyId not stored in paymentScheduleConfig - it's on activityPricing
        scheduleType: 'full', // Use 'full' as default (pay entire balance upfront)
      })
      .onConflictDoNothing()
  }

  /**
   * Get trip totals for packages
   * Returns aggregated financial data for all packages in a trip.
   *
   * @param tripId - Trip ID
   */
  async getTripPackageTotals(tripId: string): Promise<TripPackageTotalsDto> {
    type TotalsRow = {
      total_packages: string
      grand_total_cents: string
      booked_total_cents: string
      total_collected_cents: string
      expected_commission_cents: string
      pending_commission_cents: string
    }

    // Payment chain: activity → activity_pricing → payment_schedule_config → expected_payment_items → payment_transactions
    const [result] = await this.db.client.execute(sql`
      WITH trip_packages AS (
        SELECT ia.id, ia.is_booked
        FROM itinerary_activities ia
        LEFT JOIN itinerary_days id ON ia.itinerary_day_id = id.id
        LEFT JOIN itineraries i ON id.itinerary_id = i.id
        WHERE ia.parent_activity_id IS NULL
          AND (
            i.trip_id = ${tripId}
            OR ia.trip_id = ${tripId}
          )
      ),
      package_totals AS (
        SELECT
          tp.id,
          tp.is_booked,
          COALESCE(ap.total_price_cents, 0) as price_cents,
          COALESCE(ap.commission_total_cents, 0) as commission_cents
        FROM trip_packages tp
        LEFT JOIN activity_pricing ap ON ap.activity_id = tp.id
      ),
      payments AS (
        SELECT
          tp.id as package_id,
          COALESCE(SUM(ptx.amount_cents), 0) as paid_cents
        FROM trip_packages tp
        LEFT JOIN activity_pricing ap ON ap.activity_id = tp.id
        LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap.id
        LEFT JOIN expected_payment_items epi ON epi.payment_schedule_config_id = psc.id
        LEFT JOIN payment_transactions ptx ON ptx.expected_payment_item_id = epi.id
        GROUP BY tp.id
      )
      SELECT
        COUNT(DISTINCT pt.id)::text as total_packages,
        COALESCE(SUM(pt.price_cents), 0)::text as grand_total_cents,
        COALESCE(SUM(pt.price_cents) FILTER (WHERE pt.is_booked = true), 0)::text as booked_total_cents,
        COALESCE(SUM(p.paid_cents), 0)::text as total_collected_cents,
        COALESCE(SUM(pt.commission_cents) FILTER (WHERE pt.is_booked = true), 0)::text as expected_commission_cents,
        COALESCE(SUM(pt.commission_cents) FILTER (WHERE pt.is_booked = false), 0)::text as pending_commission_cents
      FROM package_totals pt
      LEFT JOIN payments p ON p.package_id = pt.id
    `) as unknown as TotalsRow[]

    const grandTotal = Number(result?.grand_total_cents ?? 0)
    const bookedTotal = Number(result?.booked_total_cents ?? 0)
    const totalCollected = Number(result?.total_collected_cents ?? 0)

    return {
      totalPackages: Number(result?.total_packages ?? 0),
      grandTotalCents: grandTotal,
      bookedTotalCents: bookedTotal,
      totalCollectedCents: totalCollected,
      outstandingCents: bookedTotal - totalCollected,
      expectedCommissionCents: Number(result?.expected_commission_cents ?? 0),
      pendingCommissionCents: Number(result?.pending_commission_cents ?? 0),
    }
  }
}
