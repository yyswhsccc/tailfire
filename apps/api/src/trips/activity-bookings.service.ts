/**
 * Activity Bookings Service
 *
 * Business logic for managing activity booking status.
 *
 * Key Distinction:
 * - Activity = Core entity (tour, flight, dining, transportation, custom-cruise, package, etc.)
 * - Package = An activity type that holds sub-activities
 * - Booking = A status applied to an activity (bookingStatus field + bookingDate)
 */

import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { sql, and, eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ActivitiesService } from './activities.service'
import { BookingValidationService } from './booking-validation.service'
import { TripLifecycleService } from './trip-lifecycle.service'
import { ActivityTravelerAssignmentPolicy } from './activity-traveler-assignment.policy'
import { TasksService } from '../tasks/tasks.service'
import type {
  MarkActivityBookedDto,
  ActivityBookingsFilterDto,
  ActivityBookingResponseDto,
  ActivityBookingsListResponseDto,
  BookingValidationResult,
} from '@tailfire/shared-types'

@Injectable()
export class ActivityBookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly activitiesService: ActivitiesService,
    private readonly bookingValidationService: BookingValidationService,
    private readonly tripLifecycleService: TripLifecycleService,
    private readonly travelerAssignment: ActivityTravelerAssignmentPolicy,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Mark an activity as booked
   *
   * Business rules:
   * - Activities with parentActivityId pointing to a package cannot be booked individually
   * - Activities with activityType === 'package' CAN be booked (they are the booking authority)
   * - bookingDate defaults to today in YYYY-MM-DD format (UTC)
   */
  async markAsBooked(
    activityId: string,
    dto: MarkActivityBookedDto,
    actorId?: string | null
  ): Promise<ActivityBookingResponseDto> {
    // Fetch activity with trip context
    const activity = await this.fetchActivityWithTripId(activityId)

    if (!activity) {
      throw new NotFoundException('Activity not found')
    }

    // Package guard: block if activity is a child of a package
    if (activity.parentActivityId && activity.parentActivityType === 'package') {
      throw new BadRequestException('Activity is linked to a package. Use package booking instead.')
    }

    // UX shortcut: when the activity has no travelers but the trip does,
    // assume the booking applies to every trip traveler. The user can still
    // unassign individuals afterward via the per-activity Travelers editor.
    // Without this, every "Mark as Booked" required clicking through to add
    // every traveler manually, even on trips where everyone is on every
    // activity — the dominant case. Bug #347.
    await this.travelerAssignment.ensureActivityHasAssignments(activityId, activity.tripId)

    // Tier 1 booking validation
    const validation = await this.bookingValidationService.validateBooking(activityId)
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Activity does not meet booking requirements',
        errors: validation.errors,
      })
    }

    // Determine booking date (default to today UTC)
    const bookingDate: string = dto.bookingDate ?? new Date().toISOString().split('T')[0]!

    // Route through ActivitiesService.update() to preserve audit events
    await this.activitiesService.update(
      activityId,
      { bookingStatus: 'booked', bookingDate },
      actorId,
      activity.tripId
    )

    // Evaluate trip lifecycle — first booking may promote planning → active
    await this.tripLifecycleService.onActivityBooked(activityId)

    // Count cascaded children for package bookings
    let cascadedCount = 0
    if (activity.activityType === 'package') {
      const result = await this.db.client
        .select({ count: sql`count(*)::int` })
        .from(this.db.schema.itineraryActivities)
        .where(
          and(
            eq(this.db.schema.itineraryActivities.parentActivityId, activityId),
            eq(this.db.schema.itineraryActivities.bookingStatus, 'booked')
          )
        )
      cascadedCount = (result as any)[0]?.count ?? 0
    }

    // Auto-create insurance review task
    const [tripForTask] = await this.db.client
      .select({ agencyId: this.db.schema.trips.agencyId })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, activity.tripId))
      .limit(1)

    if (tripForTask) {
      await this.createInsuranceTaskIfNeeded(
        activity.tripId, activityId, activity.name, bookingDate,
        tripForTask.agencyId, actorId || ''
      )
    }

    // Check payment schedule status
    const paymentScheduleMissing = await this.getPaymentScheduleMissing(activityId)

    return {
      id: activityId,
      name: activity.name,
      activityType: activity.activityType,
      bookingStatus: 'booked' as const,
      bookingDate,
      parentActivityId: activity.parentActivityId,
      paymentScheduleMissing,
      bookable: true,
      blockedReason: null,
      cascadedCount,
    }
  }

  /**
   * Validate booking requirements without changing state (dry run)
   */
  async validateBooking(activityId: string): Promise<BookingValidationResult> {
    return this.bookingValidationService.validateBooking(activityId)
  }

  /**
   * Remove booking status from an activity
   */
  async unmarkAsBooked(
    activityId: string,
    actorId?: string | null
  ): Promise<ActivityBookingResponseDto> {
    // Fetch activity with trip context
    const activity = await this.fetchActivityWithTripId(activityId)

    if (!activity) {
      throw new NotFoundException('Activity not found')
    }

    // Package guard: block if activity is a child of a package
    if (activity.parentActivityId && activity.parentActivityType === 'package') {
      throw new BadRequestException('Activity is linked to a package. Use package booking instead.')
    }

    // Route through ActivitiesService.update() to preserve audit events
    await this.activitiesService.update(
      activityId,
      { bookingStatus: 'unbooked', bookingDate: null },
      actorId,
      activity.tripId
    )

    // Evaluate trip lifecycle — removing last booking may demote active → planning
    await this.tripLifecycleService.onBookingCancelled(activityId)

    // Check payment schedule status
    const paymentScheduleMissing = await this.getPaymentScheduleMissing(activityId)

    return {
      id: activityId,
      name: activity.name,
      activityType: activity.activityType,
      bookingStatus: 'unbooked' as const,
      bookingDate: null,
      parentActivityId: activity.parentActivityId,
      paymentScheduleMissing,
      bookable: true,
      blockedReason: null,
    }
  }

  /**
   * List activities with booking information
   *
   * Business rules:
   * - tripId is required for scoping
   * - bookingStatus defaults to 'booked'
   * - Children of package activities are included with bookable: false
   */
  async listBooked(filter: ActivityBookingsFilterDto): Promise<ActivityBookingsListResponseDto> {
    const { tripId, itineraryId, bookingStatus = 'booked' } = filter

    // Build the query with proper joins
    // Single SQL query with COUNT(*) OVER() for total
    // Join parent activity to check if it's a package
    type ActivityBookingRow = {
      id: string
      name: string
      activity_type: string
      booking_status: string
      booking_date: string | null
      parent_activity_id: string | null
      parent_activity_type: string | null
      payment_schedule_missing: boolean
      bookable: boolean
      blocked_reason: string | null
      total_count: string
    }

    const results = await this.db.client.execute(sql`
      SELECT
        ia.id,
        ia.name,
        ia.activity_type,
        ia.booking_status,
        ia.booking_date,
        ia.parent_activity_id,
        parent.activity_type as parent_activity_type,
        CASE WHEN ap.id IS NULL OR psc.id IS NULL THEN true ELSE false END as payment_schedule_missing,
        CASE WHEN ia.parent_activity_id IS NOT NULL AND parent.activity_type = 'package' THEN false ELSE true END as bookable,
        CASE WHEN ia.parent_activity_id IS NOT NULL AND parent.activity_type = 'package' THEN 'part_of_package' ELSE NULL END as blocked_reason,
        COUNT(*) OVER() as total_count
      FROM itinerary_activities ia
      LEFT JOIN itinerary_activities parent ON parent.id = ia.parent_activity_id
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap.id AND psc.traveler_booking_id IS NULL
      WHERE ia.itinerary_day_id IN (
        SELECT id FROM itinerary_days WHERE itinerary_id IN (
          SELECT id FROM itineraries WHERE trip_id = ${tripId}
        )
      )
      ${itineraryId ? sql`AND ia.itinerary_day_id IN (
        SELECT id FROM itinerary_days WHERE itinerary_id = ${itineraryId}
      )` : sql``}
      AND ia.booking_status = ${bookingStatus}
      ORDER BY ia.created_at DESC
    `) as unknown as ActivityBookingRow[]

    // Handle empty results
    if (!results || results.length === 0) {
      return { activities: [], total: 0 }
    }

    const firstRow = results[0]!
    const total = Number(firstRow.total_count) || 0
    const activities: ActivityBookingResponseDto[] = results.map((row) => ({
      id: row.id,
      name: row.name,
      activityType: row.activity_type,
      bookingStatus: row.booking_status as 'unbooked' | 'booked' | 'cancelled',
      bookingDate: row.booking_date
        ? new Date(row.booking_date).toISOString().split('T')[0]!
        : null,
      parentActivityId: row.parent_activity_id || null,
      paymentScheduleMissing: row.payment_schedule_missing,
      bookable: row.bookable,
      blockedReason: (row.blocked_reason as 'part_of_package') || null,
    }))

    return { activities, total }
  }

  /**
   * Auto-create an insurance review task after a booking is confirmed.
   *
   * Logic:
   * 1. If an open insurance task already exists on the trip AND insurance has been sold,
   *    create a "review coverage for new booking" task (medium priority).
   * 2. If no open insurance task exists, create the initial "review and initiate coverage" task
   *    (high priority, assigned to trip owner).
   * 3. If an open insurance task exists but insurance has NOT been sold, do nothing (task is already pending).
   *
   * Errors are swallowed — booking must not fail due to task creation issues.
   */
  private async createInsuranceTaskIfNeeded(
    tripId: string,
    activityId: string,
    activityName: string,
    bookingDate: string,
    agencyId: string,
    userId: string,
  ): Promise<void> {
    try {
      // Check for existing open insurance task on this trip
      const existingTask = await this.db.client
        .select({ id: this.db.schema.tasks.id })
        .from(this.db.schema.tasks)
        .where(and(
          eq(this.db.schema.tasks.tripId, tripId),
          sql`title ILIKE '%insurance%'`,
          sql`status != 'completed'`,
          eq(this.db.schema.tasks.isDeleted, false),
        ))
        .limit(1)

      if (existingTask.length > 0) {
        // Open insurance task exists — check if insurance already sold (need review task for new booking)
        const insuranceExists = await this.db.client
          .select({ id: this.db.schema.tripInsurancePackages.id })
          .from(this.db.schema.tripInsurancePackages)
          .where(eq(this.db.schema.tripInsurancePackages.tripId, tripId))
          .limit(1)

        if (insuranceExists.length > 0) {
          // Insurance exists + new booking = create review task
          const dueDate = new Date(bookingDate)
          dueDate.setDate(dueDate.getDate() + 3)

          await this.tasksService.create({
            title: `Review insurance coverage for new booking — ${activityName}`,
            tripId,
            activityId,
            priority: 'medium',
            taskType: 'automatic',
            dueDate: dueDate.toISOString().split('T')[0],
          }, agencyId, userId)
        }
        return // Don't create duplicate insurance task
      }

      // No open insurance task — create one
      const dueDate = new Date(bookingDate)
      dueDate.setDate(dueDate.getDate() + 3)

      // Get trip owner for assignment
      const [trip] = await this.db.client
        .select({ ownerId: this.db.schema.trips.ownerId })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      await this.tasksService.create({
        title: 'Review and initiate insurance coverage',
        tripId,
        priority: 'high',
        taskType: 'automatic',
        dueDate: dueDate.toISOString().split('T')[0],
        assigneeUserId: trip?.ownerId || userId,
        assigneeType: 'user',
      }, agencyId, userId)
    } catch (err) {
      // Don't fail the booking if task creation fails — log and continue
      console.error(`Failed to create insurance task for trip ${tripId}:`, err)
    }
  }

  /**
   * Check if payment schedule is missing for an activity
   *
   * Returns true if:
   * - No activity_pricing row exists
   * - activity_pricing exists but no payment_schedule_config
   */
  private async getPaymentScheduleMissing(activityId: string): Promise<boolean> {
    type PricingScheduleRow = {
      id: string
      schedule_id: string | null
    }

    const result = await this.db.client.execute(sql`
      SELECT ap.id, psc.id as schedule_id
      FROM activity_pricing ap
      LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap.id AND psc.traveler_booking_id IS NULL
      WHERE ap.activity_id = ${activityId}
      LIMIT 1
    `) as unknown as PricingScheduleRow[]

    // No pricing row OR no schedule config
    if (!result || result.length === 0) {
      return true
    }
    const firstRow = result[0]!
    if (firstRow.schedule_id === null) {
      return true
    }

    return false
  }

  /**
   * Fetch activity with trip context for audit logging
   * Also fetches parent activity type to check if it's a package
   */
  private async fetchActivityWithTripId(activityId: string): Promise<{
    id: string
    name: string
    activityType: string
    parentActivityId: string | null
    parentActivityType: string | null
    bookingStatus: string
    bookingDate: Date | null
    tripId: string
  } | null> {
    type ActivityWithTripRow = {
      id: string
      name: string
      activity_type: string
      parent_activity_id: string | null
      parent_activity_type: string | null
      booking_status: string
      booking_date: Date | null
      trip_id: string
    }

    const result = await this.db.client.execute(sql`
      SELECT
        ia.id,
        ia.name,
        ia.activity_type,
        ia.parent_activity_id,
        parent.activity_type as parent_activity_type,
        ia.booking_status,
        ia.booking_date,
        i.trip_id
      FROM itinerary_activities ia
      LEFT JOIN itinerary_activities parent ON parent.id = ia.parent_activity_id
      JOIN itinerary_days id ON id.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      WHERE ia.id = ${activityId}
      LIMIT 1
    `) as unknown as ActivityWithTripRow[]

    if (!result || result.length === 0) {
      return null
    }

    const row = result[0]!
    return {
      id: row.id,
      name: row.name,
      activityType: row.activity_type,
      parentActivityId: row.parent_activity_id || null,
      parentActivityType: row.parent_activity_type || null,
      bookingStatus: row.booking_status,
      bookingDate: row.booking_date,
      tripId: row.trip_id,
    }
  }

}
