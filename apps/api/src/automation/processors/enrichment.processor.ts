/**
 * Enrichment Processor
 *
 * BullMQ processor for background data enrichment jobs.
 * Currently handles hotel photo enrichment via Google Places API.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Job } from 'bullmq'
import { createHash } from 'crypto'
import { firstValueFrom } from 'rxjs'
import { ApiProvider } from '@tailfire/shared-types'
import type { MediaType } from '@tailfire/database'
import { GooglePlacesHotelsProvider } from '../../external-apis/providers/google-places/google-places-hotels.provider'
import { CredentialResolverService } from '../../api-credentials/credential-resolver.service'
import { ActivityMediaService, ExternalUrlAttribution } from '../../trips/activity-media.service'
import { StorageService } from '../../trips/storage.service'
import { QUEUES, JOB_TYPES } from '../automation.types'
import type { HotelPhotoEnrichmentJobData } from '../automation.types'

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
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.HOTEL_PHOTO_ENRICHMENT:
        await this.handleHotelPhotoEnrichment(job as Job<HotelPhotoEnrichmentJobData>)
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
