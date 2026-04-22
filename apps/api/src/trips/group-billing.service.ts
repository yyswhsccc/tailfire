/**
 * Group Billing Service
 *
 * Resolves billing targets for activities within trip groups.
 * When a trip is in a group_booking with a master trip, new activities
 * default their billing to the master trip.
 */

import { Injectable } from '@nestjs/common'
import { eq, and, isNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class GroupBillingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve the billedToTripId for a new activity.
   * Returns the master trip ID if the activity's trip is in a group_booking with a master,
   * or null if not in a group or no master is set.
   */
  async resolveDefaultBillingTarget(tripId: string): Promise<string | null> {
    // Find the trip's group and check for a master trip
    const [trip] = await this.db.client
      .select({
        tripGroupId: this.db.schema.trips.tripGroupId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip?.tripGroupId) return null

    const [group] = await this.db.client
      .select({
        type: this.db.schema.tripGroups.type,
        masterTripId: this.db.schema.tripGroups.masterTripId,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, trip.tripGroupId))
      .limit(1)

    if (!group || group.type !== 'group_booking' || !group.masterTripId) return null

    // Don't set billedToTripId if this IS the master trip
    if (group.masterTripId === tripId) return null

    return group.masterTripId
  }

  /**
   * Validate that a billing target is in the same group as the activity's trip.
   * Returns true if valid, false if not.
   */
  async validateBillingTarget(activityTripId: string, billedToTripId: string): Promise<boolean> {
    if (activityTripId === billedToTripId) return true // Billing to own trip is always valid

    // Both trips must be in the same group
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        tripGroupId: this.db.schema.trips.tripGroupId,
      })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.id, activityTripId),
        ),
      )
      .limit(1)

    const [sourceTripRow] = trips
    if (!sourceTripRow?.tripGroupId) return false

    const [targetTrip] = await this.db.client
      .select({ tripGroupId: this.db.schema.trips.tripGroupId })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, billedToTripId))
      .limit(1)

    return targetTrip?.tripGroupId === sourceTripRow.tripGroupId
  }

  /**
   * Clear billing references when a trip is removed from a group.
   * Any activities in OTHER trips that were billed to this trip get reset to null.
   */
  async clearBillingReferencesToTrip(tripId: string): Promise<number> {
    const result = await this.db.client
      .update(this.db.schema.activityPricing)
      .set({ billedToTripId: null, updatedAt: new Date() })
      .where(eq(this.db.schema.activityPricing.billedToTripId, tripId))
      .returning({ id: this.db.schema.activityPricing.id })

    return result.length
  }

  /**
   * Clear billing references when a trip is removed from its group.
   * Also resets billedToTripId on the trip's own activities if they point to
   * a trip that's no longer in the same group.
   */
  async handleTripRemovedFromGroup(tripId: string): Promise<void> {
    // 1. Clear other trips' activities that were billed to this trip
    await this.clearBillingReferencesToTrip(tripId)

    // 2. Clear this trip's activities that were billed to other trips (no longer in same group)
    // Get all activities for this trip that have a billing target
    const activities = await this.db.client
      .select({
        pricingId: this.db.schema.activityPricing.id,
        billedToTripId: this.db.schema.activityPricing.billedToTripId,
      })
      .from(this.db.schema.activityPricing)
      .innerJoin(
        this.db.schema.itineraryActivities,
        eq(this.db.schema.activityPricing.activityId, this.db.schema.itineraryActivities.id),
      )
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
      )
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          // Only activities with a billing target set
        ),
      )

    const pricingIdsToReset = activities
      .filter(a => a.billedToTripId && a.billedToTripId !== tripId)
      .map(a => a.pricingId)

    if (pricingIdsToReset.length > 0) {
      const { inArray } = await import('drizzle-orm')
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({ billedToTripId: null, updatedAt: new Date() })
        .where(inArray(this.db.schema.activityPricing.id, pricingIdsToReset))
    }
  }
}
