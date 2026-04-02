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
import { eq, and, sql, isNull, asc } from 'drizzle-orm'
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
import { AutomationService } from '../automation.service'
import { QUEUES, JOB_TYPES } from '../automation.types'
import type {
  HotelPhotoEnrichmentJobData,
  CruiseCatalogEnrichmentJobData,
  ActivityGeocodingJobData,
  VacationHotelEnrichmentJobData,
  DestinationHeroImageJobData,
} from '../automation.types'
import { UnsplashService } from '../../unsplash/unsplash.service'
import { GooglePlacesEnricherService } from '../../vacation-enrichment/services/google-places-enricher.service'
import { TripadvisorEnricherService } from '../../vacation-enrichment/services/tripadvisor-enricher.service'

const { customCruiseDetails, itineraryActivities, vacationHotelEnrichment, destinations } = schema

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
    private readonly automationService: AutomationService,
    private readonly googlePlacesEnricher: GooglePlacesEnricherService,
    private readonly tripadvisorEnricher: TripadvisorEnricherService,
    private readonly unsplashService: UnsplashService,
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
      case JOB_TYPES.VACATION_HOTEL_ENRICHMENT:
        await this.handleVacationHotelEnrichment(job as Job<VacationHotelEnrichmentJobData>)
        break
      case JOB_TYPES.DESTINATION_HERO_IMAGE:
        await this.handleDestinationHeroImage(job as Job<DestinationHeroImageJobData>)
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

  private async handleVacationHotelEnrichment(job: Job<VacationHotelEnrichmentJobData>): Promise<void> {
    const { hotelId, hotelName, destination } = job.data

    this.logger.log({ message: 'Starting vacation hotel enrichment', hotelId, hotelName, destination })

    // Run Google Places and TripAdvisor enrichment in parallel
    const [googlePlaces, tripadvisor] = await Promise.all([
      this.googlePlacesEnricher.enrich(hotelName, destination),
      this.tripadvisorEnricher.enrich(hotelName, destination),
    ])

    if (!googlePlaces && !tripadvisor) {
      this.logger.log({ message: 'No enrichment data found — skipping', hotelId, hotelName })
      return
    }

    // Upload top 5 photos from Google Places to R2 (fall back to original URLs if storage unavailable)
    let r2PhotoUrls: string[] = googlePlaces?.photoUrls?.slice(0, 5) ?? []

    if (r2PhotoUrls.length > 0 && this.storageService.isMediaAvailable()) {
      const uploadedUrls: string[] = []

      for (let i = 0; i < r2PhotoUrls.length; i++) {
        const photoUrl = r2PhotoUrls[i]!
        try {
          const response = await firstValueFrom(
            this.httpService.get(photoUrl, {
              responseType: 'arraybuffer',
              timeout: 15000,
            }),
          )

          const buffer = Buffer.from(response.data)
          const contentType = (response.headers['content-type'] as string) || 'image/jpeg'
          const extension = contentType.includes('png') ? 'png' : 'jpg'
          const photoHash = createHash('md5').update(`${hotelId}-${i}`).digest('hex')
          const fileName = `vacation-hotel-${photoHash}.${extension}`

          const { url: fileUrl } = await this.storageService.uploadMediaFile(
            buffer,
            `vacation-hotels/${hotelId}`,
            fileName,
            contentType,
          )

          uploadedUrls.push(fileUrl)
        } catch (error) {
          this.logger.warn({
            message: `Failed to upload photo ${i + 1} to R2 — keeping original URL`,
            hotelId,
            error: error instanceof Error ? error.message : String(error),
          })
          uploadedUrls.push(photoUrl) // Keep the original SerpAPI URL as fallback
        }
      }

      r2PhotoUrls = uploadedUrls
    }

    // Build rawData for debugging (full SerpAPI responses)
    const rawData = { googlePlaces, tripadvisor }

    // Upsert into vacationHotelEnrichment table
    const enrichmentFields = {
      googlePlaceId: googlePlaces?.placeId ?? null,
      latitude: googlePlaces?.latitude?.toString() ?? null,
      longitude: googlePlaces?.longitude?.toString() ?? null,
      formattedAddress: googlePlaces?.address ?? null,
      googleRating: googlePlaces?.rating?.toString() ?? null,
      googleReviewCount: googlePlaces?.reviewCount ?? null,
      tripadvisorRating: tripadvisor?.rating?.toString() ?? null,
      tripadvisorReviewCount: tripadvisor?.reviewCount ?? null,
      tripadvisorLink: tripadvisor?.link ?? null,
      website: googlePlaces?.website ?? null,
      phone: googlePlaces?.phone ?? null,
      photos: r2PhotoUrls,
      rawData,
      enrichedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }

    await this.db.client
      .insert(vacationHotelEnrichment)
      .values({ hotelId, ...enrichmentFields })
      .onConflictDoUpdate({
        target: vacationHotelEnrichment.hotelId,
        set: { ...enrichmentFields, updatedAt: new Date() },
      })

    this.logger.log({
      message: 'Vacation hotel enrichment complete',
      hotelId,
      hotelName,
      hasGooglePlaces: !!googlePlaces,
      hasTripAdvisor: !!tripadvisor,
      photoCount: r2PhotoUrls.length,
    })
  }

  /**
   * Destination hero image enrichment via Unsplash.
   * Queries destinations WHERE hero_image_url IS NULL, prioritizes port_city > city > others.
   * Searches Unsplash for each, updates heroImageUrl if found.
   * Re-queues itself if more destinations remain.
   */
  private async handleDestinationHeroImage(job: Job<DestinationHeroImageJobData>): Promise<void> {
    const batchSize = job.data.batchSize || 50

    if (!this.unsplashService.isAvailable()) {
      this.logger.warn('Unsplash not configured — cannot enrich destination hero images')
      return
    }

    // Query destinations without hero images, prioritized by type
    const missing = await this.db.client
      .select({
        id: destinations.id,
        name: destinations.name,
        countryCode: destinations.countryCode,
        destinationType: destinations.destinationType,
      })
      .from(destinations)
      .where(isNull(destinations.heroImageUrl))
      .orderBy(
        sql`CASE destination_type
          WHEN 'port_city' THEN 1
          WHEN 'city' THEN 2
          WHEN 'island' THEN 3
          WHEN 'resort_area' THEN 4
          WHEN 'country' THEN 5
          WHEN 'region' THEN 6
          ELSE 7
        END`,
        asc(destinations.name),
      )
      .limit(batchSize)

    if (missing.length === 0) {
      this.logger.log('Destination hero image enrichment complete — no more destinations without images')
      return
    }

    this.logger.log(`Processing ${missing.length} destinations for hero image enrichment`)

    let updated = 0
    let skipped = 0
    let failed = 0

    for (const dest of missing) {
      try {
        const query = `${dest.name} ${dest.countryCode || ''} travel`.trim()
        const result = await this.unsplashService.searchPhotos(query, 1, 1)

        if (!result.results || result.results.length === 0) {
          skipped++
          continue
        }

        const photo = result.results[0]!
        const heroImageUrl = photo.urls.regular

        await this.db.client
          .update(destinations)
          .set({
            heroImageUrl,
            metadata: sql`jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{unsplash_attribution}',
              ${JSON.stringify({
                photoId: photo.id,
                photographer: photo.user.name,
                profileUrl: photo.user.links.html,
              })}::jsonb
            )`,
          })
          .where(eq(destinations.id, dest.id))

        updated++

        // Trigger download tracking (Unsplash API requirement)
        try {
          await this.unsplashService.triggerDownload(photo.links.download_location)
        } catch {
          // Non-critical — don't fail the job
        }
      } catch (error) {
        failed++
        if (failed <= 5) {
          this.logger.warn({
            message: `Failed to enrich hero image for "${dest.name}"`,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Progress reporting
      const processed = updated + skipped + failed
      if (processed % 10 === 0) {
        await job.updateProgress(Math.round((processed / missing.length) * 100))
      }
    }

    this.logger.log({
      message: 'Destination hero image batch complete',
      updated,
      skipped,
      failed,
      total: missing.length,
    })

    // If we processed a full batch, there may be more — re-queue
    if (missing.length === batchSize) {
      this.logger.log('Full batch processed — re-queuing for next batch')
      await this.automationService.schedule(
        QUEUES.ENRICHMENT,
        JOB_TYPES.DESTINATION_HERO_IMAGE,
        { type: JOB_TYPES.DESTINATION_HERO_IMAGE, batchSize },
        { delay: 5000, jobId: `destination-hero-image-${Date.now()}` },
      )
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Enrichment job ${job.id} started processing`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.ENRICHMENT, job.id, 'processing')
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Enrichment job ${job.id} completed`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.ENRICHMENT, job.id, 'completed')
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error({
      message: 'Enrichment job failed',
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      attemptsMade: job.attemptsMade,
    })
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.ENRICHMENT, job.id, 'failed', error.message)
    }
  }
}
