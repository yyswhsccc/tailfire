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

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ActivitiesService } from './activities.service'
import { BookingValidationService } from './booking-validation.service'
import type {
  MarkActivityBookedDto,
  ActivityBookingsFilterDto,
  ActivityBookingResponseDto,
  ActivityBookingsListResponseDto,
} from '@tailfire/shared-types'

@Injectable()
export class ActivityBookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly activitiesService: ActivitiesService,
    private readonly bookingValidationService: BookingValidationService
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
    }
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
