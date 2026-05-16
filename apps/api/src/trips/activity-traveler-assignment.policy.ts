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
 * **Error mode: best-effort (per Issue #368 doctrine).**
 * All methods here are prefixed with `try*` because every traveler assignment
 * is a UX-convenience side effect — losing one assignment to a transient DB
 * hiccup is recoverable on the next save/edit and does not corrupt user state.
 * Failures are logged via `logger.warn` and swallowed.
 *
 * **Return shape: explicit { ok, error? } (per Issue #374 / Codex retrospective).**
 * Callers may NOT rely on success — but they CAN introspect the outcome via
 * the return value. Forms that opted into a fan-out (e.g.
 * TripTravelersService.create with addToAllActivities=true) can surface
 * partial-failure toasts to the user. Other callers can ignore the result
 * with an explicit comment.
 *
 * Other policy classes (payment schedules, ledger writes, audit trails)
 * MUST follow strict mode — throw or return explicit `{ ok, error }`. See
 * CLAUDE.md > "Policy Error Handling — Strict by Default".
 *
 * Idempotency: every INSERT relies on the
 *   activity_travelers_unique (activity_id, trip_traveler_id)
 * index documented at packages/database/src/schema/activity-travelers.schema.ts.
 * Safe to call repeatedly.
 */
import { Injectable, Logger } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

/**
 * Outcome of a best-effort policy call.
 *
 * - `ok: true` → the operation completed (no exception).
 * - `ok: false` → an error was caught and logged; `error` carries the cause.
 *
 * Callers that need to react to failure (e.g. surface a partial-failure
 * toast) read `ok`. Callers that are fire-and-forget can ignore the result.
 */
export interface BestEffortResult {
  ok: boolean
  error?: unknown
}

export interface EnsureAssignmentsResult extends BestEffortResult {
  /** True when the pre-check found existing assignments and no INSERT ran. */
  skipped: boolean
}

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
   *     tryEnsureActivityHasAssignments instead to skip the work when the
   *     activity already has assignments)
   */
  async tryAssignAllTripTravelersToActivity(
    activityId: string,
    tripId: string,
  ): Promise<BestEffortResult> {
    try {
      await this.db.client.execute(sql`
        INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
        SELECT ${activityId}::uuid, tt.id, ${tripId}::uuid
        FROM trip_travelers tt
        WHERE tt.trip_id = ${tripId}::uuid
        ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING
      `)
      return { ok: true }
    } catch (error) {
      this.logger.warn(
        `Failed to assign trip travelers to activity ${activityId}: ${error}`,
      )
      return { ok: false, error }
    }
  }

  /**
   * Same as tryAssignAllTripTravelersToActivity, but pre-checks whether the
   * activity already has assignments and short-circuits if it does. Use this
   * as a defensive backstop where the work is usually unnecessary.
   *
   * Returns `{ ok: true, skipped: true }` when the pre-check found existing
   * assignments and no INSERT was needed. `{ ok, skipped: false, error? }`
   * otherwise — `ok` reflects whether the delegated INSERT succeeded.
   */
  async tryEnsureActivityHasAssignments(
    activityId: string,
    tripId: string,
  ): Promise<EnsureAssignmentsResult> {
    const existing = await this.db.client
      .select({ id: this.db.schema.activityTravelers.id })
      .from(this.db.schema.activityTravelers)
      .where(eq(this.db.schema.activityTravelers.activityId, activityId))
      .limit(1)

    if (existing.length > 0) {
      return { ok: true, skipped: true }
    }

    const result = await this.tryAssignAllTripTravelersToActivity(activityId, tripId)
    return { ok: result.ok, skipped: false, error: result.error }
  }

  /**
   * Insert one row per current trip traveler onto the given activity, resolving
   * the trip from the activity itself rather than requiring the caller to know it.
   *
   * Use this from call sites that already have the activity id but would need
   * an extra join to get the trip (e.g. ComponentOrchestrationService —
   * #430). Resolves trip via both linkages the schema supports:
   * itinerary_activities.itinerary_day_id → itinerary_days.itinerary_id →
   * itineraries.trip_id, or itinerary_activities.trip_id directly (floating
   * activities).
   */
  async tryAssignAllTripTravelersToActivityById(
    activityId: string,
  ): Promise<BestEffortResult> {
    try {
      await this.db.client.execute(sql`
        INSERT INTO activity_travelers (activity_id, trip_traveler_id, trip_id)
        SELECT ia.id, tt.id, tt.trip_id
        FROM itinerary_activities ia
        LEFT JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
        LEFT JOIN itineraries it ON it.id = id_day.itinerary_id
        JOIN trip_travelers tt
          ON tt.trip_id = COALESCE(it.trip_id, ia.trip_id)
        WHERE ia.id = ${activityId}::uuid
        ON CONFLICT (activity_id, trip_traveler_id) DO NOTHING
      `)
      return { ok: true }
    } catch (error) {
      this.logger.warn(
        `Failed to assign trip travelers to activity ${activityId} (by id): ${error}`,
      )
      return { ok: false, error }
    }
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
  async tryAssignTravelerToAllTripActivities(
    travelerId: string,
    tripId: string,
  ): Promise<BestEffortResult> {
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
      return { ok: true }
    } catch (error) {
      this.logger.warn(
        `Failed to propagate traveler ${travelerId} to existing activities on trip ${tripId}: ${error}`,
      )
      return { ok: false, error }
    }
  }
}
