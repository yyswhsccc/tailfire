/**
 * Day Location Service
 *
 * Recalculates itinerary day start/end locations from location-bearing
 * activities (flights, lodging, port_info). Uses advisory locking to
 * prevent concurrent recalculations for the same itinerary.
 *
 * Business rules:
 * - Day end location = last resolvable activity on that day
 * - Day start location = previous day's end location (Day 1 = first flight departure)
 * - Override flags prevent automatic updates
 * - Cascade forward stops at overrides or days with their own location-bearing activities
 */

import { Injectable, Logger } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { eq, and, asc, sql, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { GeocodingService } from './geocoding.service'
import type { GeoLocation } from '../../../../packages/shared-types/src/api'

/** Activity types that can set day locations */
const LOCATION_ACTIVITY_TYPES = ['flight', 'lodging', 'port_info'] as const

interface ResolvedActivity {
  activityId: string
  dayId: string
  activityType: string
  sequenceOrder: number
  /** Resolved end-of-day location (flight arrival, hotel, port) */
  location: GeoLocation
  /** For flights only: the first segment's departure location */
  departureLocation: GeoLocation | null
}

interface DayUpdate {
  dayId: string
  startName: string | null
  startLat: string | null
  startLng: string | null
  endName: string | null
  endLat: string | null
  endLng: string | null
}

/**
 * Simple string-to-integer hash for advisory lock keys.
 * Produces a 32-bit signed integer from a UUID string.
 */
function hashStringToInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0 // Force 32-bit signed integer
  }
  return hash
}

@Injectable()
export class DayLocationService {
  private readonly logger = new Logger(DayLocationService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly geocodingService: GeocodingService,
  ) {}

  /**
   * Recalculate day locations for an itinerary, starting from the given day
   * and cascading forward. Uses a PostgreSQL advisory lock to prevent
   * concurrent recalculations for the same itinerary.
   */
  async recalculateFromDay(itineraryId: string, dayId: string): Promise<void> {
    const lockKey = hashStringToInt(itineraryId)

    await this.db.client.transaction(async (tx) => {
      // Acquire advisory lock scoped to this transaction
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`)

      // Step 1: Fetch all days for the itinerary, ordered by day_number
      const days = await tx
        .select({
          dayId: this.db.schema.itineraryDays.id,
          dayNumber: this.db.schema.itineraryDays.dayNumber,
          startLocationName: this.db.schema.itineraryDays.startLocationName,
          startLocationLat: this.db.schema.itineraryDays.startLocationLat,
          startLocationLng: this.db.schema.itineraryDays.startLocationLng,
          endLocationName: this.db.schema.itineraryDays.endLocationName,
          endLocationLat: this.db.schema.itineraryDays.endLocationLat,
          endLocationLng: this.db.schema.itineraryDays.endLocationLng,
          startLocationOverride: this.db.schema.itineraryDays.startLocationOverride,
          endLocationOverride: this.db.schema.itineraryDays.endLocationOverride,
        })
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.itineraryId, itineraryId))
        .orderBy(asc(this.db.schema.itineraryDays.dayNumber))

      if (days.length === 0) return

      // Find the trigger day index
      const triggerIdx = days.findIndex(d => d.dayId === dayId)
      if (triggerIdx === -1) {
        this.logger.warn(`Day ${dayId} not found in itinerary ${itineraryId}`)
        return
      }

      // Step 2: Fetch all location-relevant activities for the itinerary
      const dayIds = days.map(d => d.dayId)
      const resolvedActivities = await this.fetchAndResolveActivities(tx, dayIds)

      // Group resolved activities by day
      const activitiesByDay = new Map<string, ResolvedActivity[]>()
      for (const activity of resolvedActivities) {
        const existing = activitiesByDay.get(activity.dayId) || []
        existing.push(activity)
        activitiesByDay.set(activity.dayId, existing)
      }

      // Step 3: Compute locations for each day (start from trigger, cascade forward)
      // We track all days from trigger onward to properly cascade end -> start locations.
      const dayUpdates: DayUpdate[] = []

      for (let i = triggerIdx; i < days.length; i++) {
        const day = days[i]!
        const dayActivities = (activitiesByDay.get(day.dayId) || [])
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)

        // --- Compute end location ---
        let computedEnd: GeoLocation | null = null

        if (dayActivities.length > 0) {
          // Last activity with a resolvable location
          computedEnd = dayActivities[dayActivities.length - 1]!.location
        }

        // Fallback: previous day's computed end location (from our running updates)
        if (!computedEnd && i > 0) {
          const prevUpdate = dayUpdates[dayUpdates.length - 1]
          if (prevUpdate?.endName) {
            computedEnd = {
              name: prevUpdate.endName,
              lat: Number(prevUpdate.endLat),
              lng: Number(prevUpdate.endLng),
            }
          } else if (i - 1 < triggerIdx) {
            // Previous day is before our trigger — use DB values
            const prevDay = days[i - 1]!
            if (prevDay.endLocationName) {
              computedEnd = {
                name: prevDay.endLocationName,
                lat: Number(prevDay.endLocationLat),
                lng: Number(prevDay.endLocationLng),
              }
            }
          }
        }

        // Ultimate fallback: first activity on the entire itinerary
        if (!computedEnd && resolvedActivities.length > 0) {
          computedEnd = resolvedActivities[0]!.location
        }

        // --- Compute start location ---
        let computedStart: GeoLocation | null = null

        if (i === 0 || day.dayNumber <= 1) {
          // Day 1 (or first day): start = first flight's departure airport
          const firstFlight = this.findFirstFlightDeparture(dayActivities, resolvedActivities)
          computedStart = firstFlight
        }

        if (!computedStart && i > 0) {
          // Inherit from previous day's end location
          const prevUpdate = dayUpdates[dayUpdates.length - 1]
          if (prevUpdate?.endName) {
            computedStart = {
              name: prevUpdate.endName,
              lat: Number(prevUpdate.endLat),
              lng: Number(prevUpdate.endLng),
            }
          } else if (i - 1 < triggerIdx) {
            const prevDay = days[i - 1]!
            if (prevDay.endLocationName) {
              computedStart = {
                name: prevDay.endLocationName,
                lat: Number(prevDay.endLocationLat),
                lng: Number(prevDay.endLocationLng),
              }
            }
          }
        }

        // Determine what actually changes
        const startChanged = !day.startLocationOverride && this.locationDiffers(
          computedStart,
          day.startLocationName,
          day.startLocationLat,
          day.startLocationLng,
        )

        const endChanged = !day.endLocationOverride && this.locationDiffers(
          computedEnd,
          day.endLocationName,
          day.endLocationLat,
          day.endLocationLng,
        )

        // Always track the effective end location for cascade, even if not written
        const effectiveEndName = endChanged
          ? (computedEnd?.name ?? null)
          : day.endLocationName
        const effectiveEndLat = endChanged
          ? (computedEnd?.lat?.toString() ?? null)
          : day.endLocationLat
        const effectiveEndLng = endChanged
          ? (computedEnd?.lng?.toString() ?? null)
          : day.endLocationLng

        dayUpdates.push({
          dayId: day.dayId,
          startName: startChanged ? (computedStart?.name ?? null) : day.startLocationName,
          startLat: startChanged ? (computedStart?.lat?.toString() ?? null) : day.startLocationLat,
          startLng: startChanged ? (computedStart?.lng?.toString() ?? null) : day.startLocationLng,
          endName: effectiveEndName,
          endLat: effectiveEndLat,
          endLng: effectiveEndLng,
        })

        // Stop cascading after trigger day if nothing changed and next day
        // has its own activities or an override
        if (i > triggerIdx && !startChanged && !endChanged) {
          const nextDay = days[i + 1]
          if (nextDay?.startLocationOverride) break
          if (dayActivities.length > 0) break
        }
      }

      // Step 4: Write only the days that actually changed
      const actualUpdates = dayUpdates.filter((update, idx) => {
        const day = days[triggerIdx + idx]
        if (!day) return false

        const startDiff = !day.startLocationOverride && this.locationDiffers(
          update.startName
            ? { name: update.startName, lat: Number(update.startLat), lng: Number(update.startLng) }
            : null,
          day.startLocationName,
          day.startLocationLat,
          day.startLocationLng,
        )

        const endDiff = !day.endLocationOverride && this.locationDiffers(
          update.endName
            ? { name: update.endName, lat: Number(update.endLat), lng: Number(update.endLng) }
            : null,
          day.endLocationName,
          day.endLocationLat,
          day.endLocationLng,
        )

        return startDiff || endDiff
      })

      for (const update of actualUpdates) {
        const day = days.find(d => d.dayId === update.dayId)!

        const startDiff = !day.startLocationOverride && this.locationDiffers(
          update.startName
            ? { name: update.startName, lat: Number(update.startLat), lng: Number(update.startLng) }
            : null,
          day.startLocationName,
          day.startLocationLat,
          day.startLocationLng,
        )

        const endDiff = !day.endLocationOverride && this.locationDiffers(
          update.endName
            ? { name: update.endName, lat: Number(update.endLat), lng: Number(update.endLng) }
            : null,
          day.endLocationName,
          day.endLocationLat,
          day.endLocationLng,
        )

        const setFields: Record<string, unknown> = { updatedAt: new Date() }

        if (startDiff) {
          setFields.startLocationName = update.startName
          setFields.startLocationLat = update.startLat
          setFields.startLocationLng = update.startLng
        }

        if (endDiff) {
          setFields.endLocationName = update.endName
          setFields.endLocationLat = update.endLat
          setFields.endLocationLng = update.endLng
        }

        await tx
          .update(this.db.schema.itineraryDays)
          .set(setFields)
          .where(eq(this.db.schema.itineraryDays.id, update.dayId))
      }

      if (actualUpdates.length > 0) {
        this.logger.log(
          `Recalculated locations for ${actualUpdates.length} day(s) in itinerary ${itineraryId}`,
        )
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Activity fetching and resolution
  // ---------------------------------------------------------------------------

  /**
   * Fetch location-relevant activities for the given days and resolve
   * their coordinates using the GeocodingService.
   */
  private async fetchAndResolveActivities(
    tx: Parameters<Parameters<typeof this.db.client.transaction>[0]>[0],
    dayIds: string[],
  ): Promise<ResolvedActivity[]> {
    if (dayIds.length === 0) return []

    // Fetch activities with their type-specific details
    const activities = await tx
      .select({
        id: this.db.schema.itineraryActivities.id,
        dayId: this.db.schema.itineraryActivities.itineraryDayId,
        activityType: this.db.schema.itineraryActivities.activityType,
        sequenceOrder: this.db.schema.itineraryActivities.sequenceOrder,
        location: this.db.schema.itineraryActivities.location,
        address: this.db.schema.itineraryActivities.address,
        coordinates: this.db.schema.itineraryActivities.coordinates,
        name: this.db.schema.itineraryActivities.name,
      })
      .from(this.db.schema.itineraryActivities)
      .where(
        and(
          inArray(this.db.schema.itineraryActivities.itineraryDayId, dayIds),
          inArray(this.db.schema.itineraryActivities.activityType, [...LOCATION_ACTIVITY_TYPES]),
        ),
      )
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    // Fetch flight segments for flight activities
    const flightActivityIds = activities
      .filter(a => a.activityType === 'flight')
      .map(a => a.id)

    const flightSegments = flightActivityIds.length > 0
      ? await tx
          .select({
            activityId: this.db.schema.flightSegments.activityId,
            segmentOrder: this.db.schema.flightSegments.segmentOrder,
            arrivalAirportCode: this.db.schema.flightSegments.arrivalAirportCode,
            arrivalAirportName: this.db.schema.flightSegments.arrivalAirportName,
            arrivalAirportCity: this.db.schema.flightSegments.arrivalAirportCity,
            arrivalAirportLat: this.db.schema.flightSegments.arrivalAirportLat,
            arrivalAirportLon: this.db.schema.flightSegments.arrivalAirportLon,
            departureAirportCode: this.db.schema.flightSegments.departureAirportCode,
            departureAirportName: this.db.schema.flightSegments.departureAirportName,
            departureAirportCity: this.db.schema.flightSegments.departureAirportCity,
            departureAirportLat: this.db.schema.flightSegments.departureAirportLat,
            departureAirportLon: this.db.schema.flightSegments.departureAirportLon,
          })
          .from(this.db.schema.flightSegments)
          .where(inArray(this.db.schema.flightSegments.activityId, flightActivityIds))
          .orderBy(asc(this.db.schema.flightSegments.segmentOrder))
      : []

    // Fetch lodging details for lodging activities
    const lodgingActivityIds = activities
      .filter(a => a.activityType === 'lodging')
      .map(a => a.id)

    const lodgingDetails = lodgingActivityIds.length > 0
      ? await tx
          .select({
            activityId: this.db.schema.lodgingDetails.activityId,
            address: this.db.schema.lodgingDetails.address,
            propertyName: this.db.schema.lodgingDetails.propertyName,
          })
          .from(this.db.schema.lodgingDetails)
          .where(inArray(this.db.schema.lodgingDetails.activityId, lodgingActivityIds))
      : []

    // Fetch port info details for port_info activities
    const portInfoActivityIds = activities
      .filter(a => a.activityType === 'port_info')
      .map(a => a.id)

    const portInfoDetails = portInfoActivityIds.length > 0
      ? await tx
          .select({
            activityId: this.db.schema.portInfoDetails.activityId,
            portName: this.db.schema.portInfoDetails.portName,
            portLocation: this.db.schema.portInfoDetails.portLocation,
            coordinates: this.db.schema.portInfoDetails.coordinates,
          })
          .from(this.db.schema.portInfoDetails)
          .where(inArray(this.db.schema.portInfoDetails.activityId, portInfoActivityIds))
      : []

    // Index details by activity ID for quick lookup
    const segmentsByActivity = new Map<string, typeof flightSegments>()
    for (const seg of flightSegments) {
      const existing = segmentsByActivity.get(seg.activityId) || []
      existing.push(seg)
      segmentsByActivity.set(seg.activityId, existing)
    }

    const lodgingByActivity = new Map<string, (typeof lodgingDetails)[0]>()
    for (const ld of lodgingDetails) {
      lodgingByActivity.set(ld.activityId, ld)
    }

    const portInfoByActivity = new Map<string, (typeof portInfoDetails)[0]>()
    for (const pi of portInfoDetails) {
      portInfoByActivity.set(pi.activityId, pi)
    }

    // Resolve each activity's location
    const resolved: ResolvedActivity[] = []
    for (const activity of activities) {
      if (!activity.dayId) continue

      try {
        const result = await this.resolveActivityLocation(
          activity,
          segmentsByActivity.get(activity.id),
          lodgingByActivity.get(activity.id),
          portInfoByActivity.get(activity.id),
        )

        if (result) {
          resolved.push({
            activityId: activity.id,
            dayId: activity.dayId,
            activityType: activity.activityType,
            sequenceOrder: activity.sequenceOrder,
            location: result.location,
            departureLocation: result.departureLocation,
          })
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { service: 'DayLocationService', method: 'fetchAndResolveActivities' },
          extra: {
            activityId: activity.id,
            activityType: activity.activityType,
            activityName: activity.name,
          },
        })
        this.logger.error(
          `Failed to resolve location for activity ${activity.id} (${activity.activityType}): ${error}`,
        )
        // Continue processing other activities
      }
    }

    return resolved
  }

  // ---------------------------------------------------------------------------
  // Per-type location resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a single activity's location based on its type.
   * Returns the end-of-day location and, for flights, the departure location.
   */
  private async resolveActivityLocation(
    activity: {
      id: string
      activityType: string
      location: string | null
      address: string | null
      coordinates: { lat: number; lng: number } | null
      name: string
    },
    segments?: Array<{
      activityId: string
      segmentOrder: number
      arrivalAirportCode: string | null
      arrivalAirportName: string | null
      arrivalAirportCity: string | null
      arrivalAirportLat: number | null
      arrivalAirportLon: number | null
      departureAirportCode: string | null
      departureAirportName: string | null
      departureAirportCity: string | null
      departureAirportLat: number | null
      departureAirportLon: number | null
    }>,
    lodging?: {
      activityId: string
      address: string | null
      propertyName: string | null
    },
    portInfo?: {
      activityId: string
      portName: string | null
      portLocation: string | null
      coordinates: { lat: number; lng: number } | null
    },
  ): Promise<{ location: GeoLocation; departureLocation: GeoLocation | null } | null> {
    switch (activity.activityType) {
      case 'flight':
        return await this.resolveFlightLocation(activity, segments)

      case 'lodging': {
        const loc = await this.resolveLodgingLocation(activity, lodging)
        return loc ? { location: loc, departureLocation: null } : null
      }

      case 'port_info': {
        const loc = await this.resolvePortInfoLocation(activity, portInfo)
        return loc ? { location: loc, departureLocation: null } : null
      }

      default:
        return null
    }
  }

  /**
   * Resolve flight arrival location from last segment's arrival airport,
   * and departure location from first segment's departure airport.
   */
  private async resolveFlightLocation(
    activity: { id: string; name: string },
    segments?: Array<{
      segmentOrder: number
      arrivalAirportCode: string | null
      arrivalAirportName: string | null
      arrivalAirportCity: string | null
      arrivalAirportLat: number | null
      arrivalAirportLon: number | null
      departureAirportCode: string | null
      departureAirportName: string | null
      departureAirportCity: string | null
      departureAirportLat: number | null
      departureAirportLon: number | null
    }>,
  ): Promise<{ location: GeoLocation; departureLocation: GeoLocation | null } | null> {
    if (!segments || segments.length === 0) return null

    // Sort by segment order
    const sorted = [...segments].sort((a, b) => a.segmentOrder - b.segmentOrder)
    const lastSegment = sorted[sorted.length - 1]!
    const firstSegment = sorted[0]!

    // Resolve arrival (end location)
    let arrivalLocation: GeoLocation | null = null

    if (lastSegment.arrivalAirportLat != null && lastSegment.arrivalAirportLon != null) {
      arrivalLocation = {
        name: lastSegment.arrivalAirportCity
          || lastSegment.arrivalAirportName
          || lastSegment.arrivalAirportCode
          || activity.name,
        lat: lastSegment.arrivalAirportLat,
        lng: lastSegment.arrivalAirportLon,
      }
    } else if (lastSegment.arrivalAirportCode) {
      arrivalLocation = await this.geocodingService.resolveLocation({
        iataCode: lastSegment.arrivalAirportCode,
        name: lastSegment.arrivalAirportName
          || lastSegment.arrivalAirportCity
          || `${lastSegment.arrivalAirportCode} airport`,
      })
    }

    if (!arrivalLocation) return null

    // Resolve departure (for Day 1 start location)
    let departureLocation: GeoLocation | null = null

    if (firstSegment.departureAirportLat != null && firstSegment.departureAirportLon != null) {
      departureLocation = {
        name: firstSegment.departureAirportCity
          || firstSegment.departureAirportName
          || firstSegment.departureAirportCode
          || 'Departure',
        lat: firstSegment.departureAirportLat,
        lng: firstSegment.departureAirportLon,
      }
    } else if (firstSegment.departureAirportCode) {
      departureLocation = await this.geocodingService.resolveLocation({
        iataCode: firstSegment.departureAirportCode,
        name: firstSegment.departureAirportName
          || firstSegment.departureAirportCity
          || `${firstSegment.departureAirportCode} airport`,
      })
    }

    return { location: arrivalLocation, departureLocation }
  }

  /**
   * Resolve lodging location from activity coordinates or lodging address.
   */
  private async resolveLodgingLocation(
    activity: {
      id: string
      name: string
      coordinates: { lat: number; lng: number } | null
      address: string | null
    },
    lodging?: {
      address: string | null
      propertyName: string | null
    },
  ): Promise<GeoLocation | null> {
    // Use activity coordinates if available
    if (activity.coordinates?.lat != null && activity.coordinates?.lng != null) {
      return {
        name: lodging?.propertyName || activity.name,
        lat: activity.coordinates.lat,
        lng: activity.coordinates.lng,
      }
    }

    // Geocode the lodging address
    const addressToGeocode = lodging?.address || activity.address
    if (addressToGeocode) {
      return await this.geocodingService.resolveLocation({
        address: addressToGeocode,
        name: lodging?.propertyName || activity.name,
      })
    }

    return null
  }

  /**
   * Resolve port_info location from port_info_details coordinates,
   * activity coordinates, or geocode port name/location.
   */
  private async resolvePortInfoLocation(
    activity: {
      id: string
      name: string
      location: string | null
      coordinates: { lat: number; lng: number } | null
    },
    portInfo?: {
      portName: string | null
      portLocation: string | null
      coordinates: { lat: number; lng: number } | null
    },
  ): Promise<GeoLocation | null> {
    // Use port_info_details coordinates first
    if (portInfo?.coordinates?.lat != null && portInfo?.coordinates?.lng != null) {
      return {
        name: portInfo.portName || portInfo.portLocation || activity.name,
        lat: portInfo.coordinates.lat,
        lng: portInfo.coordinates.lng,
      }
    }

    // Use activity coordinates
    if (activity.coordinates?.lat != null && activity.coordinates?.lng != null) {
      return {
        name: portInfo?.portName || portInfo?.portLocation || activity.name,
        lat: activity.coordinates.lat,
        lng: activity.coordinates.lng,
      }
    }

    // Geocode: try cruise port catalog first (via portName), then general geocoding
    const portName = portInfo?.portName || portInfo?.portLocation || activity.location
    if (portName) {
      const resolved = await this.geocodingService.resolveLocation({
        portName,
      })
      if (resolved) return resolved

      // Fall back to address/name geocoding
      return await this.geocodingService.resolveLocation({
        address: portName,
        name: activity.name,
      })
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the first flight's departure location from resolved activities.
   * Used for Day 1 start location.
   */
  private findFirstFlightDeparture(
    dayActivities: ResolvedActivity[],
    allActivities: ResolvedActivity[],
  ): GeoLocation | null {
    // Look for a flight on this day first
    const dayFlight = dayActivities.find(a => a.activityType === 'flight' && a.departureLocation)
    if (dayFlight?.departureLocation) return dayFlight.departureLocation

    // Fall back to first flight across all days
    const anyFlight = allActivities.find(a => a.activityType === 'flight' && a.departureLocation)
    if (anyFlight?.departureLocation) return anyFlight.departureLocation

    return null
  }

  /**
   * Check if a computed location differs from the stored location.
   */
  private locationDiffers(
    computed: GeoLocation | null,
    storedName: string | null,
    storedLat: string | null,
    storedLng: string | null,
  ): boolean {
    if (!computed && !storedName) return false
    if (!computed && storedName) return true
    if (computed && !storedName) return true

    return (
      computed!.name !== storedName ||
      computed!.lat.toString() !== storedLat ||
      computed!.lng.toString() !== storedLng
    )
  }
}
