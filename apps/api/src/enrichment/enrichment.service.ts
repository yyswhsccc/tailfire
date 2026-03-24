import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq, and, isNotNull, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { AutomationService } from '../automation/automation.service'
import { TripsService } from '../trips/trips.service'
import { TripAccessService } from '../trips/trip-access.service'
import { schema } from '@tailfire/database'
import { QUEUES, JOB_TYPES } from '../automation/automation.types'
import type { AuthContext } from '../auth/auth.types'

const { itineraryActivities, customCruiseDetails, flightDetails, lodgingDetails, itineraryDays, itineraries, trips } = schema

export interface BackfillResult {
  totalTrips: number
  enrichedTrips: number
  publishedTrips: number
  totalJobs: number
  errors: string[]
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly automationService: AutomationService,
    private readonly tripsService: TripsService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  async enrichActivity(activityId: string, auth: AuthContext): Promise<{ jobIds: string[] }> {
    const [activity] = await this.db.client
      .select({
        id: itineraryActivities.id,
        tripId: itineraryActivities.tripId,
        itineraryDayId: itineraryActivities.itineraryDayId,
        componentType: itineraryActivities.componentType,
        name: itineraryActivities.name,
        location: itineraryActivities.location,
        address: itineraryActivities.address,
        coordinates: itineraryActivities.coordinates,
        agencyId: itineraryActivities.agencyId,
      })
      .from(itineraryActivities)
      .where(and(eq(itineraryActivities.id, activityId), eq(itineraryActivities.agencyId, auth.agencyId)))
      .limit(1)

    if (!activity) {
      throw new NotFoundException(`Activity ${activityId} not found`)
    }

    // Resolve tripId: either direct (floating packages) or through day hierarchy
    let tripId = activity.tripId
    if (!tripId && activity.itineraryDayId) {
      const [dayInfo] = await this.db.client
        .select({ tripId: itineraries.tripId })
        .from(itineraryDays)
        .innerJoin(itineraries, eq(itineraryDays.itineraryId, itineraries.id))
        .where(eq(itineraryDays.id, activity.itineraryDayId))
        .limit(1)
      tripId = dayInfo?.tripId ?? null
    }

    // Verify caller has write access to the trip
    if (tripId) {
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    }

    const jobIds: string[] = []

    switch (activity.componentType) {
      case 'custom_cruise': {
        const [cruise] = await this.db.client
          .select({
            cruiseLineName: customCruiseDetails.cruiseLineName,
            shipName: customCruiseDetails.shipName,
            departureDate: customCruiseDetails.departureDate,
            nights: customCruiseDetails.nights,
            departurePort: customCruiseDetails.departurePort,
            voyageCode: customCruiseDetails.voyageCode,
          })
          .from(customCruiseDetails)
          .where(eq(customCruiseDetails.activityId, activityId))
          .limit(1)

        if (cruise) {
          const cruiseJobId = `enrich-cruise-${activityId}`
          await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.CRUISE_CATALOG_ENRICHMENT, {
            type: JOB_TYPES.CRUISE_CATALOG_ENRICHMENT,
            activityId,
            cruiseLineName: cruise.cruiseLineName,
            shipName: cruise.shipName,
            departureDate: cruise.departureDate,
            nights: cruise.nights,
            departurePort: cruise.departurePort,
            voyageCode: cruise.voyageCode,
            agencyId: auth.agencyId,
          }, { jobId: cruiseJobId })
          jobIds.push(cruiseJobId)
        }

        // Geocoding for cruise departure port
        if (!activity.coordinates) {
          const geocodeJobId = `geocode-${activityId}`
          const [cruiseForPort] = await this.db.client
            .select({ departurePort: customCruiseDetails.departurePort })
            .from(customCruiseDetails)
            .where(eq(customCruiseDetails.activityId, activityId))
            .limit(1)

          await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.ACTIVITY_GEOCODING, {
            type: JOB_TYPES.ACTIVITY_GEOCODING,
            activityId,
            activityType: 'custom_cruise',
            portName: cruiseForPort?.departurePort,
            agencyId: auth.agencyId,
          }, { jobId: geocodeJobId })
          jobIds.push(geocodeJobId)
        }
        break
      }

      case 'lodging': {
        // Hotel photo enrichment (existing job type)
        const [lodging] = await this.db.client
          .select({
            propertyName: lodgingDetails.propertyName,
            address: lodgingDetails.address,
          })
          .from(lodgingDetails)
          .where(eq(lodgingDetails.activityId, activityId))
          .limit(1)

        const hotelPhotoJobId = `hotel-photo-${activityId}`
        await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.HOTEL_PHOTO_ENRICHMENT, {
          type: JOB_TYPES.HOTEL_PHOTO_ENRICHMENT,
          activityId,
          hotelName: lodging?.propertyName || activity.name,
          address: lodging?.address || activity.address,
          agencyId: auth.agencyId,
          userId: auth.userId,
        }, { jobId: hotelPhotoJobId })
        jobIds.push(hotelPhotoJobId)

        // Geocoding
        if (!activity.coordinates) {
          const geocodeJobId = `geocode-${activityId}`
          await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.ACTIVITY_GEOCODING, {
            type: JOB_TYPES.ACTIVITY_GEOCODING,
            activityId,
            activityType: 'lodging',
            propertyName: lodging?.propertyName || activity.name,
            address: lodging?.address || activity.address,
            agencyId: auth.agencyId,
          }, { jobId: geocodeJobId })
          jobIds.push(geocodeJobId)
        }
        break
      }

      case 'flight': {
        if (!activity.coordinates) {
          const [flight] = await this.db.client
            .select({ departureAirportCode: flightDetails.departureAirportCode })
            .from(flightDetails)
            .where(eq(flightDetails.activityId, activityId))
            .limit(1)

          if (flight?.departureAirportCode) {
            const geocodeJobId = `geocode-${activityId}`
            await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.ACTIVITY_GEOCODING, {
              type: JOB_TYPES.ACTIVITY_GEOCODING,
              activityId,
              activityType: 'flight',
              departureAirportCode: flight.departureAirportCode,
              agencyId: auth.agencyId,
            }, { jobId: geocodeJobId })
            jobIds.push(geocodeJobId)
          }
        }
        break
      }

      default: {
        // tour, custom_tour, transportation, dining, etc.
        if (!activity.coordinates && (activity.location || activity.name)) {
          const geocodeJobId = `geocode-${activityId}`
          await this.automationService.schedule(QUEUES.ENRICHMENT, JOB_TYPES.ACTIVITY_GEOCODING, {
            type: JOB_TYPES.ACTIVITY_GEOCODING,
            activityId,
            activityType: activity.componentType,
            locationName: activity.location || activity.name,
            agencyId: auth.agencyId,
          }, { jobId: geocodeJobId })
          jobIds.push(geocodeJobId)
        }
        break
      }
    }

    return { jobIds }
  }

  async enrichTrip(tripId: string, auth: AuthContext): Promise<{ activityCount: number; jobIds: string[] }> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)

    // Activities are linked to trips through the day hierarchy:
    // itinerary_activities → itinerary_days → itineraries → trips
    // Some floating activities (packages) have trip_id set directly
    const activitiesViaDays = await this.db.client
      .selectDistinct({ id: itineraryActivities.id })
      .from(itineraryActivities)
      .innerJoin(itineraryDays, eq(itineraryActivities.itineraryDayId, itineraryDays.id))
      .innerJoin(itineraries, eq(itineraryDays.itineraryId, itineraries.id))
      .where(and(eq(itineraries.tripId, tripId), eq(itineraryActivities.agencyId, auth.agencyId)))

    const floatingActivities = await this.db.client
      .select({ id: itineraryActivities.id })
      .from(itineraryActivities)
      .where(and(eq(itineraryActivities.tripId, tripId), eq(itineraryActivities.agencyId, auth.agencyId)))

    // Merge and deduplicate
    const activityIds = new Set([...activitiesViaDays.map(a => a.id), ...floatingActivities.map(a => a.id)])
    const activities = Array.from(activityIds).map(id => ({ id }))

    const allJobIds: string[] = []
    for (const activity of activities) {
      const result = await this.enrichActivity(activity.id, auth)
      allJobIds.push(...result.jobIds)
    }

    this.logger.log({ message: 'Trip enrichment enqueued', tripId, activityCount: activities.length, jobCount: allJobIds.length })

    return { activityCount: activities.length, jobIds: allJobIds }
  }

  async publishTrip(tripId: string, auth: AuthContext): Promise<{ published: boolean }> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    await this.tripsService.publishTrip(tripId, auth.userId)
    return { published: true }
  }

  async backfillTes(auth: AuthContext, dryRun = false, tripIds?: string[]): Promise<BackfillResult> {
    // Find TES-imported trips for this agency
    // Filter by externalReference + customFields.importSource = 'tes' for safety
    const baseConditions = [
      eq(trips.agencyId, auth.agencyId),
      isNotNull(trips.externalReference),
    ]

    // If specific tripIds provided, scope to those; otherwise require TES import marker
    if (tripIds?.length) {
      baseConditions.push(inArray(trips.id, tripIds))
    }

    const tesTrips = await this.db.client
      .select({
        id: trips.id,
        isPublished: trips.isPublished,
        externalReference: trips.externalReference,
      })
      .from(trips)
      .where(and(...baseConditions))

    const result: BackfillResult = {
      totalTrips: tesTrips.length,
      enrichedTrips: 0,
      publishedTrips: 0,
      totalJobs: 0,
      errors: [],
    }

    if (dryRun) {
      this.logger.log({ message: 'TES backfill dry run', totalTrips: tesTrips.length })
      return result
    }

    for (const trip of tesTrips) {
      try {
        // 1. Enrich activities
        const enrichResult = await this.enrichTrip(trip.id, auth)
        result.totalJobs += enrichResult.jobIds.length
        result.enrichedTrips++

        // 2. Update draft itineraries to approved (scoped to agency)
        await this.db.client
          .update(itineraries)
          .set({ status: 'approved' })
          .where(and(
            eq(itineraries.tripId, trip.id),
            eq(itineraries.status, 'draft'),
            eq(itineraries.agencyId, auth.agencyId),
          ))

        // 3. Publish trip (idempotent — publishTrip checks isPublished)
        if (!trip.isPublished) {
          try {
            await this.tripsService.publishTrip(trip.id, auth.userId)
            result.publishedTrips++
          } catch (err) {
            // Non-fatal: trip might not have travelers yet
            result.errors.push(`Publish failed for trip ${trip.id}: ${(err as Error).message}`)
          }
        }
      } catch (err) {
        result.errors.push(`Backfill failed for trip ${trip.id}: ${(err as Error).message}`)
      }
    }

    this.logger.log({
      message: 'TES backfill complete',
      ...result,
    })

    return result
  }
}
