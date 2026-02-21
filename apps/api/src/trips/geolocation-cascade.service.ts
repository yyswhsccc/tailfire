/**
 * Geolocation Cascade Service
 *
 * Computes and applies forward-propagation of location changes
 * from location-changing activities to subsequent itinerary days.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type {
  GeoLocation,
  CascadePreview,
  CascadeConfirmation,
  DayLocation,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class GeolocationCascadeService {
  private readonly logger = new Logger(GeolocationCascadeService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Compute which days would be affected by a location change.
   * Does NOT write anything — returns a preview for user confirmation.
   */
  async computeCascade(
    itineraryId: string,
    triggerDayId: string,
    newLocation: GeoLocation,
    trigger: { activityId: string; activityType: string; description?: string }
  ): Promise<CascadePreview> {
    // Get all days for this itinerary, ordered by sequence
    const days = await this.db.client
      .select()
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.itineraryId, itineraryId))
      .orderBy(asc(this.db.schema.itineraryDays.sequenceOrder))

    // Find the trigger day index
    const triggerIdx = days.findIndex(d => d.id === triggerDayId)
    if (triggerIdx === -1) {
      return {
        affectedDays: [],
        trigger: {
          activityId: trigger.activityId,
          activityType: trigger.activityType,
          description: trigger.description || '',
        },
      }
    }

    const affectedDays: CascadePreview['affectedDays'] = []

    // The trigger day gets its end location updated
    const triggerDay = days[triggerIdx]
    if (triggerDay && !triggerDay.endLocationOverride) {
      affectedDays.push({
        dayId: triggerDay.id,
        dayNumber: triggerDay.dayNumber,
        date: triggerDay.date || undefined,
        before: this.toDayLocation(triggerDay),
        after: {
          ...this.toDayLocation(triggerDay),
          endLocation: newLocation,
        },
      })
    }

    // Propagate forward: set start location of subsequent days
    for (let i = triggerIdx + 1; i < days.length; i++) {
      const day = days[i]
      if (!day) continue

      // Stop if this day has a start location override
      if (day.startLocationOverride) break

      // Stop if this day already has the same start location
      if (
        day.startLocationName === newLocation.name &&
        Number(day.startLocationLat) === newLocation.lat &&
        Number(day.startLocationLng) === newLocation.lng
      ) {
        break
      }

      const before = this.toDayLocation(day)
      const after: DayLocation = {
        ...before,
        startLocation: newLocation,
      }

      // If end location is not overridden and not already set by another activity,
      // also update it (traveler stays in same place if nothing else changes)
      if (!day.endLocationOverride && !day.endLocationName) {
        after.endLocation = newLocation
      }

      affectedDays.push({
        dayId: day.id,
        dayNumber: day.dayNumber,
        date: day.date || undefined,
        before,
        after,
      })
    }

    return {
      affectedDays,
      trigger: {
        activityId: trigger.activityId,
        activityType: trigger.activityType,
        description: trigger.description || '',
      },
    }
  }

  /**
   * Apply a confirmed cascade — updates only the days the user approved.
   */
  async applyCascade(
    itineraryId: string,
    confirmation: CascadeConfirmation,
    preview: CascadePreview
  ): Promise<void> {
    const approvedSet = new Set(confirmation.dayIds)

    const updates = preview.affectedDays
      .filter(ad => approvedSet.has(ad.dayId))
      .map(ad => {
        const setValues: Record<string, any> = { updatedAt: new Date() }

        // Update start location if changed (compare by value, not reference)
        if (!this.locationsEqual(ad.after.startLocation, ad.before.startLocation)) {
          if (ad.after.startLocation) {
            setValues.startLocationName = ad.after.startLocation.name
            setValues.startLocationLat = ad.after.startLocation.lat.toString()
            setValues.startLocationLng = ad.after.startLocation.lng.toString()
          } else {
            setValues.startLocationName = null
            setValues.startLocationLat = null
            setValues.startLocationLng = null
          }
        }

        // Update end location if changed (compare by value, not reference)
        if (!this.locationsEqual(ad.after.endLocation, ad.before.endLocation)) {
          if (ad.after.endLocation) {
            setValues.endLocationName = ad.after.endLocation.name
            setValues.endLocationLat = ad.after.endLocation.lat.toString()
            setValues.endLocationLng = ad.after.endLocation.lng.toString()
          } else {
            setValues.endLocationName = null
            setValues.endLocationLat = null
            setValues.endLocationLng = null
          }
        }

        return this.db.client
          .update(this.db.schema.itineraryDays)
          .set(setValues)
          .where(eq(this.db.schema.itineraryDays.id, ad.dayId))
      })

    if (updates.length > 0) {
      await Promise.all(updates)

      // Mark itinerary as having unpublished changes
      await this.db.client
        .update(this.db.schema.itineraries)
        .set({ hasUnpublishedChanges: true })
        .where(eq(this.db.schema.itineraries.id, itineraryId))

      this.logger.log(`Applied cascade to ${updates.length} days in itinerary ${itineraryId}`)
    }
  }

  private locationsEqual(a: GeoLocation | null, b: GeoLocation | null): boolean {
    if (a === b) return true
    if (!a || !b) return false
    return a.name === b.name && a.lat === b.lat && a.lng === b.lng
  }

  private toDayLocation(day: any): DayLocation {
    return {
      startLocation: day.startLocationName
        ? { name: day.startLocationName, lat: Number(day.startLocationLat), lng: Number(day.startLocationLng) }
        : null,
      endLocation: day.endLocationName
        ? { name: day.endLocationName, lat: Number(day.endLocationLat), lng: Number(day.endLocationLng) }
        : null,
      startLocationOverride: day.startLocationOverride ?? false,
      endLocationOverride: day.endLocationOverride ?? false,
    }
  }
}
