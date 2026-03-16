/**
 * Enrichment Processor
 *
 * BullMQ processor for background data enrichment jobs.
 * Handles hotel photo enrichment, cruise catalog enrichment, and activity geocoding.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Job } from 'bullmq'
import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { firstValueFrom } from 'rxjs'
import { ApiProvider } from '@tailfire/shared-types'
import { schema } from '@tailfire/database'
import type { MediaType } from '@tailfire/database'
import { GooglePlacesHotelsProvider } from '../../external-apis/providers/google-places/google-places-hotels.provider'
import { CredentialResolverService } from '../../api-credentials/credential-resolver.service'
import { ActivityMediaService, ExternalUrlAttribution } from '../../trips/activity-media.service'
import { StorageService } from '../../trips/storage.service'
import { GeocodingService } from '../../trips/geocoding.service'
import { CatalogMatcherService } from '../../catalog-matcher/catalog-matcher.service'
import { DatabaseService } from '../../db/database.service'
import { QUEUES, JOB_TYPES } from '../automation.types'
import type {
  HotelPhotoEnrichmentJobData,
  CruiseCatalogEnrichmentJobData,
  ActivityGeocodingJobData,
} from '../automation.types'

const { customCruiseDetails, itineraryActivities } = schema

const DEFAULT_MAX_PHOTOS = 3

@Processor(QUEUES.ENRICHMENT)
@Injectable()
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly googlePlaces: GooglePlacesHotelsProvider,
    private readonly credentialResolver: CredentialResolverService,
    private readonly mediaService: ActivityMediaService,
    private readonly storageService: StorageService,
    private readonly catalogMatcher: CatalogMatcherService,
    private readonly geocodingService: GeocodingService,
    private readonly db: DatabaseService,
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.HOTEL_PHOTO_ENRICHMENT:
        await this.handleHotelPhotoEnrichment(job as Job<HotelPhotoEnrichmentJobData>)
        break
      case JOB_TYPES.CRUISE_CATALOG_ENRICHMENT:
        await this.handleCruiseCatalogEnrichment(job as Job<CruiseCatalogEnrichmentJobData>)
        break
      case JOB_TYPES.ACTIVITY_GEOCODING:
        await this.handleActivityGeocoding(job as Job<ActivityGeocodingJobData>)
        break
      default:
        this.logger.warn(`Unknown enrichment job type: ${job.name}`)
    }
  }

  private async handleHotelPhotoEnrichment(job: Job<HotelPhotoEnrichmentJobData>): Promise<void> {
    const { activityId, hotelName, address, maxPhotos = DEFAULT_MAX_PHOTOS } = job.data

    if (!hotelName) {
      this.logger.warn({ message: 'Skipping photo enrichment — no hotel name', activityId })
      return
    }

    this.logger.log({ message: 'Starting hotel photo enrichment', activityId, hotelName })

    // Check if already enriched (idempotency)
    const existingUrls = await this.mediaService.getExistingMediaUrls(activityId, 'accommodation')
    if (existingUrls.size > 0) {
      this.logger.log({ message: 'Activity already has photos — skipping', activityId, existingCount: existingUrls.size })
      return
    }

    // Check storage availability
    if (!this.storageService.isMediaAvailable()) {
      this.logger.warn({ message: 'Media storage not configured — skipping photo enrichment', activityId })
      return
    }

    // Initialize Google Places credentials
    let apiKey: string
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.GOOGLE_PLACES)
      if (!creds?.apiKey || typeof creds.apiKey !== 'string') {
        this.logger.warn({ message: 'Google Places API key not configured — skipping', activityId })
        return
      }
      apiKey = creds.apiKey as string
      await this.googlePlaces.setCredentials(creds)
    } catch {
      this.logger.warn({ message: 'Failed to resolve Google Places credentials — skipping', activityId })
      return
    }

    // Search for the hotel
    const searchResult = await this.googlePlaces.search({
      hotelName,
      destination: address || undefined,
    })

    if (!searchResult.success || !searchResult.data?.length) {
      this.logger.log({ message: 'No Google Places results for hotel', activityId, hotelName })
      return
    }

    const bestMatch = searchResult.data[0]!
    const photos = bestMatch.photos?.slice(0, maxPhotos)

    if (!photos?.length) {
      this.logger.log({ message: 'Hotel found but no photos available', activityId, hotelName, placeId: bestMatch.placeId })
      return
    }

    // Download and store photos
    let imported = 0
    let failed = 0

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!
      if (!photo.photoReference) continue

      try {
        const photoUrl = `https://places.googleapis.com/v1/${photo.photoReference}/media?maxWidthPx=800&key=${apiKey}`

        const response = await firstValueFrom(
          this.httpService.get(photoUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
          }),
        )

        const buffer = Buffer.from(response.data)
        const contentType = (response.headers['content-type'] as string) || 'image/jpeg'

        const photoHash = createHash('md5').update(`${photo.photoReference}-${i}`).digest('hex')
        const extension = contentType.includes('png') ? 'png' : 'jpg'
        const fileName = `google-places-${photoHash}.${extension}`

        const { url: fileUrl } = await this.storageService.uploadMediaFile(
          buffer,
          `media/${activityId}`,
          fileName,
          contentType,
        )

        const attribution: ExternalUrlAttribution = {
          source: 'google_places',
          sourceUrl: 'https://maps.google.com/',
          photographerName: photo.attribution || null,
        }

        await this.mediaService.create({
          activityId,
          entityType: 'accommodation',
          mediaType: 'image' as MediaType,
          fileUrl,
          fileName,
          fileSize: buffer.length,
          caption: `${hotelName} - Photo ${i + 1}`,
          attribution,
        })

        imported++
      } catch (error) {
        failed++
        this.logger.warn({
          message: `Failed to import photo ${i + 1}`,
          activityId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.logger.log({
      message: 'Hotel photo enrichment complete',
      activityId,
      hotelName,
      imported,
      failed,
    })
  }

  private async handleCruiseCatalogEnrichment(job: Job<CruiseCatalogEnrichmentJobData>): Promise<void> {
    const { activityId, agencyId, cruiseLineName, shipName, departureDate, nights, departurePort, voyageCode } = job.data

    this.logger.log({ message: 'Starting cruise catalog enrichment', activityId, cruiseLineName, shipName })

    // Verify activity belongs to the expected agency
    const [activity] = await this.db.client
      .select({ id: itineraryActivities.id })
      .from(itineraryActivities)
      .where(and(eq(itineraryActivities.id, activityId), eq(itineraryActivities.agencyId, agencyId)))
      .limit(1)

    if (!activity) {
      this.logger.warn({ message: 'Activity not found or agency mismatch — skipping', activityId, agencyId })
      return
    }

    const match = await this.catalogMatcher.matchCatalogSailing({
      cruiseLineName,
      shipName,
      departureDate,
      nights,
      departurePort,
      voyageCode,
    })

    if (!match) {
      this.logger.log({ message: 'No catalog match found for cruise', activityId, cruiseLineName, shipName })
      return
    }

    this.logger.log({
      message: 'Matched catalog sailing',
      activityId,
      strategy: match.strategy,
      score: match.score,
      sailingId: match.sailingId,
    })

    const enrichment = await this.catalogMatcher.enrichCruiseFromSailing(match)

    // Update custom_cruise_details with enrichment data
    await this.db.client
      .update(customCruiseDetails)
      .set({
        source: 'traveltek',
        traveltekCruiseId: match.providerIdentifier,
        cruiseLineId: enrichment.cruiseLineId,
        cruiseShipId: enrichment.cruiseShipId,
        cruiseRegionId: enrichment.cruiseRegionId,
        region: enrichment.region,
        shipImageUrl: enrichment.shipImageUrl,
        shipClass: enrichment.shipClass,
        departurePortId: enrichment.departurePortId,
        arrivalPortId: enrichment.arrivalPortId,
        departureTimezone: enrichment.departureTimezone,
        arrivalTimezone: enrichment.arrivalTimezone,
        departurePort: enrichment.departurePort || undefined,
        arrivalPort: enrichment.arrivalPort || undefined,
        portCallsJson: enrichment.portCallsJson,
        updatedAt: new Date(),
      })
      .where(eq(customCruiseDetails.activityId, activityId))

    // Import ship images to activity media (stores external URLs directly, no storage upload needed)
    const imagesToImport: Array<{ url: string; caption?: string; attribution?: { source: string; sourceUrl?: string; photographerName?: string } }> = []

    if (enrichment.shipImageUrl) {
      imagesToImport.push({
        url: enrichment.shipImageUrl,
        caption: `${shipName || 'Ship'} - Main Image`,
        attribution: { source: 'traveltek_catalog' },
      })
    }

    for (const img of enrichment.shipGalleryImages.slice(0, 5)) {
      imagesToImport.push({
        url: img.url,
        caption: img.caption || `${shipName || 'Ship'} Gallery`,
        attribution: { source: 'traveltek_catalog' },
      })
    }

    if (imagesToImport.length > 0) {
      try {
        const result = await this.mediaService.importExternalImagesBatch(activityId, imagesToImport, 'cruise')
        this.logger.log({
          message: 'Ship images imported',
          activityId,
          successful: result.successful.length,
          failed: result.failed.length,
          skipped: result.skipped,
        })
      } catch (err) {
        this.logger.warn({ message: 'Failed to import ship images batch', activityId, error: (err as Error).message })
      }
    }

    this.logger.log({
      message: 'Cruise catalog enrichment complete',
      activityId,
      portCalls: enrichment.portCallsJson.length,
      hasShipImage: !!enrichment.shipImageUrl,
      hasRegion: !!enrichment.region,
    })
  }

  private async handleActivityGeocoding(job: Job<ActivityGeocodingJobData>): Promise<void> {
    const { activityId, agencyId, activityType, propertyName, address, departureAirportCode, locationName, portName } = job.data

    this.logger.log({ message: 'Starting activity geocoding', activityId, activityType })

    // Idempotency: skip if coordinates already set; also verify agency ownership
    const [activity] = await this.db.client
      .select({ coordinates: itineraryActivities.coordinates })
      .from(itineraryActivities)
      .where(and(eq(itineraryActivities.id, activityId), eq(itineraryActivities.agencyId, agencyId)))
      .limit(1)

    if (!activity) {
      this.logger.warn({ message: 'Activity not found or agency mismatch — skipping', activityId, agencyId })
      return
    }

    if (activity?.coordinates) {
      this.logger.log({ message: 'Activity already has coordinates — skipping', activityId })
      return
    }

    let result: { name: string; lat: number; lng: number } | null = null

    switch (activityType) {
      case 'flight':
        if (departureAirportCode) {
          result = await this.geocodingService.resolveLocation({ iataCode: departureAirportCode })
        }
        break
      case 'lodging':
        result = await this.geocodingService.resolveLocation({ address: address || undefined, name: propertyName || undefined })
        break
      case 'custom_cruise':
        if (portName) {
          result = await this.geocodingService.resolveLocation({ portName })
        }
        break
      default:
        // tour, custom_tour, transportation, dining, etc.
        result = await this.geocodingService.resolveLocation({ name: locationName || undefined })
        break
    }

    if (result) {
      await this.db.client
        .update(itineraryActivities)
        .set({ coordinates: { lat: result.lat, lng: result.lng } })
        .where(eq(itineraryActivities.id, activityId))

      this.logger.log({ message: 'Activity geocoded', activityId, lat: result.lat, lng: result.lng })
    } else {
      this.logger.log({ message: 'Geocoding returned no result — skipping', activityId, activityType })
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error({
      message: 'Enrichment job failed',
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      attemptsMade: job.attemptsMade,
    })
  }
}
