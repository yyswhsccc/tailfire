/**
 * Trip Lifecycle Service
 *
 * Central engine for system-driven trip stage transitions.
 * Trip stage 'active' is EARNED by having valid bookings — it is not manually set.
 *
 * This service evaluates booking state and promotes/demotes trips accordingly:
 * - Planning → Active: when first valid booking appears
 * - Active → Planning: when all valid bookings are removed
 *
 * The lifecycle service IS the system authority for these transitions.
 * It bypasses canTransitionTripStatus() validation intentionally.
 */

import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, not, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripActiveEvent } from './events/trip-active.event'

@Injectable()
export class TripLifecycleService {
  private readonly logger = new Logger(TripLifecycleService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Evaluate whether a trip's stage should change based on its booking state.
   *
   * Rules:
   * - If trip is 'planning' and has ≥1 booked activity → promote to 'active'
   * - If trip is 'active' and has 0 booked activities → demote to 'planning'
   * - Other statuses (travelling, travelled, cancelled) are not touched
   */
  async evaluateTripStage(tripId: string): Promise<void> {
    // Fetch current trip status and primary contact
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        primaryContactId: this.db.schema.trips.primaryContactId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      this.logger.warn(`Trip ${tripId} not found during lifecycle evaluation`)
      return
    }

    // Only evaluate planning ↔ active transitions
    if (trip.status !== 'planning' && trip.status !== 'active') {
      this.logger.debug(
        `Trip ${tripId} is in '${trip.status}' — skipping lifecycle evaluation`,
      )
      return
    }

    const bookedCount = await this.countBookedActivities(tripId)

    if (trip.status === 'planning' && bookedCount > 0) {
      await this.promoteToActive(tripId, trip.primaryContactId)
    } else if (trip.status === 'active' && bookedCount === 0) {
      await this.demoteToPlanning(tripId)
    }
  }

  /**
   * Called after an activity's bookingStatus is set to 'booked'.
   * Resolves the tripId from the activity, then evaluates the trip stage.
   */
  async onActivityBooked(activityId: string): Promise<void> {
    const tripId = await this.resolveTripId(activityId)
    if (!tripId) {
      this.logger.warn(
        `Could not resolve tripId for activity ${activityId} — skipping lifecycle evaluation`,
      )
      return
    }
    await this.evaluateTripStage(tripId)
  }

  /**
   * Called after a booking is cancelled or removed.
   * Resolves the tripId from the activity, then evaluates the trip stage.
   */
  async onBookingCancelled(activityId: string): Promise<void> {
    const tripId = await this.resolveTripId(activityId)
    if (!tripId) {
      this.logger.warn(
        `Could not resolve tripId for activity ${activityId} — skipping lifecycle evaluation`,
      )
      return
    }
    await this.evaluateTripStage(tripId)
  }

  /**
   * Archive all non-approved itineraries when a trip reaches 'active'.
   * Approved and already-archived itineraries are left untouched.
   */
  async archiveNonApprovedItineraries(tripId: string): Promise<void> {
    const result = await this.db.client
      .update(this.db.schema.itineraries)
      .set({ status: 'archived' })
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          not(eq(this.db.schema.itineraries.status, 'approved')),
          not(eq(this.db.schema.itineraries.status, 'archived')),
        ),
      )
      .returning({ id: this.db.schema.itineraries.id })

    if (result.length > 0) {
      this.logger.log(
        `Archived ${result.length} non-approved itinerary(ies) for trip ${tripId}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Count booked activities for a trip.
   *
   * Includes activities linked via:
   * 1. Day-bound: itinerary_activities → itinerary_days → itineraries → trips
   * 2. Floating: itinerary_activities.trip_id (packages not tied to a day)
   *
   * Excludes informational types (port_info, tour_day) — they don't represent
   * real bookings.
   */
  private async countBookedActivities(tripId: string): Promise<number> {
    type CountRow = { count: string }

    const rows = await this.db.client.execute(sql`
      SELECT COUNT(*) as count
      FROM itinerary_activities ia
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE (i.trip_id = ${tripId} OR ia.trip_id = ${tripId})
        AND ia.booking_status = 'booked'
        AND ia.activity_type NOT IN ('port_info', 'tour_day')
    `) as unknown as CountRow[]

    return Number(rows[0]?.count ?? 0)
  }

  /**
   * Resolve the tripId for an activity.
   *
   * Activities can belong to a trip via:
   * 1. itinerary_day_id → itinerary_days → itineraries.trip_id
   * 2. Direct trip_id column (floating packages)
   */
  private async resolveTripId(activityId: string): Promise<string | null> {
    type TripIdRow = { trip_id: string | null }

    const rows = await this.db.client.execute(sql`
      SELECT COALESCE(i.trip_id, ia.trip_id) as trip_id
      FROM itinerary_activities ia
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE ia.id = ${activityId}
      LIMIT 1
    `) as unknown as TripIdRow[]

    return rows[0]?.trip_id ?? null
  }

  /**
   * Promote a trip from 'planning' to 'active'.
   * Also archives non-approved itineraries and emits the trip.active event.
   */
  private async promoteToActive(
    tripId: string,
    primaryContactId: string | null,
  ): Promise<void> {
    const now = new Date()

    await this.db.client
      .update(this.db.schema.trips)
      .set({
        status: 'active',
        lastStatusChangeAt: now,
        statusAutoTransitionedAt: now,
        updatedAt: now,
      })
      .where(eq(this.db.schema.trips.id, tripId))

    this.logger.log(`Trip ${tripId} promoted: planning → active`)

    // Archive non-approved itineraries
    await this.archiveNonApprovedItineraries(tripId)

    // Emit trip.active event for downstream listeners (e.g., ContactsService)
    const bookingDate = now.toISOString().split('T')[0]!
    this.eventEmitter.emit(
      'trip.active',
      new TripActiveEvent(tripId, primaryContactId, bookingDate),
    )
  }

  /**
   * Demote a trip from 'active' back to 'planning'.
   */
  private async demoteToPlanning(tripId: string): Promise<void> {
    const now = new Date()

    await this.db.client
      .update(this.db.schema.trips)
      .set({
        status: 'planning',
        lastStatusChangeAt: now,
        statusAutoTransitionedAt: now,
        updatedAt: now,
      })
      .where(eq(this.db.schema.trips.id, tripId))

    this.logger.log(`Trip ${tripId} demoted: active → planning (all bookings removed)`)
  }
}
