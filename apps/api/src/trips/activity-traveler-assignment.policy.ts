/**
 * ActivityTravelerAssignmentPolicy — Step 3 of the refactor roadmap (#359).
 *
 * Owns every "fan trip travelers across activities" rule in one place. Before
 * this policy, the same SQL existed verbatim in three services:
 *
 *   - ActivitiesService.create()          (PR #354 — when a new activity is added)
 *   - ActivityBookingsService.markAsBooked() (PR #354 — defensive backstop)
 *   - TripTravelersService.create()       (PR #354 — addToAllActivities option)
 *
 * #347 was the symptom that motivated the consolidation: each service added
 * its own side-effect, drifting independently. This class is now the single
 * authority. Future rule changes (group-booking scoping, archived itineraries,
 * declined travelers) land here once instead of three times.
 *
 * Idempotency: every INSERT relies on the
 *   activity_travelers_unique (activity_id, trip_traveler_id)
 * index documented at packages/database/src/schema/activity-travelers.schema.ts.
 * Safe to call repeatedly.
 */
import { Injectable, Logger } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class ActivityTravelerAssignmentPolicy {
  private readonly logger = new Logger(ActivityTravelerAssignmentPolicy.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Insert one row per current trip traveler onto the given activity.
   *
   * Used when:
   *   - A new activity is created (ActivitiesService.create)
   *   - An activity is being marked booked and has no travelers yet
   *     (ActivityBookingsService.markAsBooked safety net — call
   *     ensureActivityHasAssignments instead to skip the work when the
   *     activity already has assignments)
   */
  async assignAllTripTravelersToActivity(
    activityId: string,
    tripId: string,
  ): Promise<void> {
    try {
      await this.db.client.execute(sql`
        INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
        SELECT ${activityId}::uuid, tt.id, ${tripId}::uuid
        FROM trip_travelers tt
        WHERE tt.trip_id = ${tripId}::uuid
        ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING
      `)
    } catch (error) {
      this.logger.warn(
        `Failed to assign trip travelers to activity ${activityId}: ${error}`,
      )
    }
  }

  /**
   * Same as assignAllTripTravelersToActivity, but pre-checks whether the
   * activity already has assignments and short-circuits if it does. Use this
   * as a defensive backstop where the work is usually unnecessary.
   *
   * Returns { skipped: true } when the pre-check found existing assignments,
   *          { skipped: false } when assignments were inserted.
   */
  async ensureActivityHasAssignments(
    activityId: string,
    tripId: string,
  ): Promise<{ skipped: boolean }> {
    const existing = await this.db.client
      .select({ id: this.db.schema.activityTravelers.id })
      .from(this.db.schema.activityTravelers)
      .where(eq(this.db.schema.activityTravelers.activityId, activityId))
      .limit(1)

    if (existing.length > 0) {
      return { skipped: true }
    }

    await this.assignAllTripTravelersToActivity(activityId, tripId)
    return { skipped: false }
  }

  /**
   * Insert the given traveler onto every existing activity on the trip,
   * across all itineraries plus floating-package activities. Used by
   * TripTravelersService.create when the caller passes addToAllActivities.
   *
   * The join covers two activity-trip linkages because the schema supports
   * both: itinerary_activities.itinerary_day_id → itinerary_days.itinerary_id
   * → itineraries.trip_id  (the normal case), and
   * itinerary_activities.trip_id directly (floating packages). The OR does
   * not double-count — both branches resolve to the same set of activities
   * for a given trip.
   */
  async assignTravelerToAllTripActivities(
    travelerId: string,
    tripId: string,
  ): Promise<void> {
    try {
      await this.db.client.execute(sql`
        INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
        SELECT ia.id, ${travelerId}::uuid, ${tripId}::uuid
        FROM itinerary_activities ia
        LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
        LEFT JOIN itineraries it ON it.id = id_day.itinerary_id
        WHERE it.trip_id = ${tripId}::uuid
           OR ia.trip_id = ${tripId}::uuid
        ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING
      `)
    } catch (error) {
      this.logger.warn(
        `Failed to propagate traveler ${travelerId} to existing activities on trip ${tripId}: ${error}`,
      )
    }
  }
}
