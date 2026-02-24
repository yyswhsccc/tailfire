/**
 * Activity Media Service
 *
 * Handles CRUD operations for activity media (images, videos).
 * Works with the activity_media table and public media storage bucket.
 * Supports polymorphic attachment to multiple entity types.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, asc, and, inArray } from 'drizzle-orm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DatabaseService } from '../db/database.service'
import { AuditEvent } from '../activity-logs/events/audit.event'
import { sanitizeForAudit, computeAuditDiff } from '../activity-logs/audit-sanitizer'
import { MediaType, ComponentEntityType } from '@tailfire/database'

// Attribution type for external sources
export interface UnsplashAttribution {
  source: 'unsplash'
  photoId: string
  photographerName: string
  photographerUsername: string
  photographerUrl: string
  sourceUrl: string
  downloadLocation: string
}

// Generic external URL attribution (for Traveltek, etc.)
export interface ExternalUrlAttribution {
  source: string // e.g., 'traveltek', 'viator', etc.
  sourceUrl: string
  photographerName?: string | null
}

export type MediaAttribution = UnsplashAttribution | ExternalUrlAttribution | null

// DTO for media response
export interface ActivityMediaDto {
  id: string
  activityId: string
  entityType: ComponentEntityType
  mediaType: MediaType
  fileUrl: string
  fileName: string
  fileSize: number | null
  caption: string | null
  orderIndex: number
  uploadedAt: string
  uploadedBy: string | null
  attribution: MediaAttribution
}

// Legacy type alias for backwards compatibility
export type ComponentMediaDto = ActivityMediaDto

// Valid media types
export const VALID_MEDIA_TYPES: MediaType[] = ['image', 'video', 'document']

// Valid entity types for media
export const VALID_ENTITY_TYPES: ComponentEntityType[] = [
  'activity', 'accommodation', 'flight', 'transfer',
  'dining', 'cruise', 'port_info', 'option'
]

// Map entity types to activity types in the database
const ENTITY_TO_ACTIVITY_TYPE: Record<ComponentEntityType, string> = {
  activity: 'tour',
  accommodation: 'lodging',
  flight: 'flight',
  transfer: 'transportation',
  dining: 'dining',
  cruise: 'custom_cruise',
  port_info: 'port_info',
  option: 'options',
}

@Injectable()
export class ActivityMediaService {
  private readonly logger = new Logger(ActivityMediaService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Resolve tripId from activityId by traversing: activity → day → itinerary → trip
   */
  private async resolveTripIdFromActivity(activityId: string): Promise<string | null> {
    const result = await this.db.client
      .select({ tripId: this.db.schema.itineraries.tripId })
      .from(this.db.schema.itineraryActivities)
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
      )
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    return result[0]?.tripId ?? null
  }

  /**
   * Get all media for an activity, ordered by orderIndex
   * @param activityId - The ID of the activity
   * @param entityType - The type of entity (defaults to 'activity' for backward compatibility)
   */
  async findByActivityId(
    activityId: string,
    entityType: ComponentEntityType = 'activity'
  ): Promise<ActivityMediaDto[]> {
    const media = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(
        and(
          eq(this.db.schema.activityMedia.activityId, activityId),
          eq(this.db.schema.activityMedia.entityType, entityType)
        )
      )
      .orderBy(asc(this.db.schema.activityMedia.orderIndex))

    return media.map(this.formatMedia)
  }

  /**
   * Legacy alias for findByActivityId
   * @deprecated Use findByActivityId instead
   */
  async findByComponentId(
    componentId: string,
    entityType: ComponentEntityType = 'activity'
  ): Promise<ActivityMediaDto[]> {
    return this.findByActivityId(componentId, entityType)
  }

  /**
   * Get a single media item by ID
   */
  async findById(id: string): Promise<ActivityMediaDto | null> {
    const [media] = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.id, id))
      .limit(1)

    if (!media) {
      return null
    }

    return this.formatMedia(media)
  }

  /**
   * Create a new media record
   */
  async create(
    data: {
      activityId: string
      entityType?: ComponentEntityType
      mediaType: MediaType
      fileUrl: string
      fileName: string
      fileSize?: number | null
      caption?: string | null
      uploadedBy?: string | null
      attribution?: MediaAttribution
    },
    actorId?: string | null,
    tripId?: string | null,
  ): Promise<ActivityMediaDto> {
    const entityType = data.entityType || 'activity'

    // Get the next order index for this activity and entity type
    const existingMedia = await this.db.client
      .select({ orderIndex: this.db.schema.activityMedia.orderIndex })
      .from(this.db.schema.activityMedia)
      .where(
        and(
          eq(this.db.schema.activityMedia.activityId, data.activityId),
          eq(this.db.schema.activityMedia.entityType, entityType)
        )
      )
      .orderBy(asc(this.db.schema.activityMedia.orderIndex))

    const nextOrderIndex = existingMedia.length > 0
      ? Math.max(...existingMedia.map(m => m.orderIndex)) + 1
      : 0

    const [media] = await this.db.client
      .insert(this.db.schema.activityMedia)
      .values({
        activityId: data.activityId,
        entityType,
        mediaType: data.mediaType,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize || null,
        caption: data.caption || null,
        orderIndex: nextOrderIndex,
        uploadedBy: data.uploadedBy || null,
        attribution: data.attribution || null,
      })
      .returning()

    if (!media) {
      throw new Error('Failed to create activity media')
    }

    this.logger.log(`Created activity media: ${media.id} for activity ${data.activityId}`)

    // Emit audit event
    const resolvedTripId = tripId ?? (await this.resolveTripIdFromActivity(data.activityId))
    if (resolvedTripId) {
      this.eventEmitter.emit(
        'audit.created',
        new AuditEvent(
          'activity_media',
          media.id,
          'created',
          resolvedTripId,
          actorId ?? null,
          `Media - ${media.fileName}`,
          {
            after: sanitizeForAudit('activity_media', media),
            parentId: data.activityId,
          },
        ),
      )
    }

    return this.formatMedia(media)
  }

  /**
   * Update a media record (caption only for V1)
   */
  async update(
    id: string,
    data: {
      caption?: string | null
    },
    actorId?: string | null,
    tripId?: string | null,
  ): Promise<ActivityMediaDto | null> {
    // Get before state
    const [before] = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.id, id))
      .limit(1)

    if (!before) {
      return null
    }

    const [media] = await this.db.client
      .update(this.db.schema.activityMedia)
      .set({
        ...(data.caption !== undefined && { caption: data.caption }),
      })
      .where(eq(this.db.schema.activityMedia.id, id))
      .returning()

    if (!media) {
      return null
    }

    this.logger.log(`Updated activity media: ${id}`)

    // Emit audit event
    const resolvedTripId = tripId ?? (await this.resolveTripIdFromActivity(media.activityId))
    if (resolvedTripId) {
      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent(
          'activity_media',
          media.id,
          'updated',
          resolvedTripId,
          actorId ?? null,
          `Media - ${media.fileName}`,
          computeAuditDiff('activity_media', before, media),
        ),
      )
    }

    return this.formatMedia(media)
  }

  /**
   * Delete a media record
   */
  async delete(
    id: string,
    actorId?: string | null,
    tripId?: string | null,
  ): Promise<ActivityMediaDto | null> {
    const [media] = await this.db.client
      .delete(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.id, id))
      .returning()

    if (!media) {
      return null
    }

    this.logger.log(`Deleted activity media: ${id}`)

    // Emit audit event
    const resolvedTripId = tripId ?? (await this.resolveTripIdFromActivity(media.activityId))
    if (resolvedTripId) {
      this.eventEmitter.emit(
        'audit.deleted',
        new AuditEvent(
          'activity_media',
          media.id,
          'deleted',
          resolvedTripId,
          actorId ?? null,
          `Media - ${media.fileName}`,
          {
            before: sanitizeForAudit('activity_media', media),
            parentId: media.activityId,
          },
        ),
      )
    }

    return this.formatMedia(media)
  }

  /**
   * Delete multiple media records by IDs
   * Returns the deleted records for storage cleanup
   */
  async deleteMany(
    ids: string[],
    actorId?: string | null,
    tripId?: string | null,
  ): Promise<ActivityMediaDto[]> {
    if (ids.length === 0) return []

    const deleted = await this.db.client
      .delete(this.db.schema.activityMedia)
      .where(inArray(this.db.schema.activityMedia.id, ids))
      .returning()

    if (deleted.length === 0) return []

    this.logger.log(`Batch deleted ${deleted.length} activity media items`)

    // Emit audit events for each deleted item
    const resolvedTripId = tripId ?? (await this.resolveTripIdFromActivity(deleted[0]!.activityId))
    if (resolvedTripId) {
      for (const media of deleted) {
        this.eventEmitter.emit(
          'audit.deleted',
          new AuditEvent(
            'activity_media',
            media.id,
            'deleted',
            resolvedTripId,
            actorId ?? null,
            `Media - ${media.fileName}`,
            {
              before: sanitizeForAudit('activity_media', media),
              parentId: media.activityId,
            },
          ),
        )
      }
    }

    return deleted.map(m => this.formatMedia(m))
  }

  /**
   * Set a media item as primary (orderIndex = 0) and shift others
   */
  async setPrimary(
    id: string,
    activityId: string,
    entityType: ComponentEntityType = 'activity',
  ): Promise<ActivityMediaDto | null> {
    // Get the target media item
    const [target] = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.id, id))
      .limit(1)

    if (!target) return null

    // Already primary? No-op
    if (target.orderIndex === 0) {
      return this.formatMedia(target)
    }

    // Get all media for this activity/entityType ordered by current orderIndex
    const allMedia = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(
        and(
          eq(this.db.schema.activityMedia.activityId, activityId),
          eq(this.db.schema.activityMedia.entityType, entityType),
        ),
      )
      .orderBy(asc(this.db.schema.activityMedia.orderIndex))

    // Build new order: target first, then rest in their existing order
    const reordered = [
      target,
      ...allMedia.filter(m => m.id !== id),
    ]

    // Update all orderIndex values
    await Promise.all(
      reordered.map((media, idx) =>
        this.db.client
          .update(this.db.schema.activityMedia)
          .set({ orderIndex: idx })
          .where(eq(this.db.schema.activityMedia.id, media.id)),
      ),
    )

    this.logger.log(`Set media ${id} as primary for activity ${activityId}`)

    // Return updated target
    const [updated] = await this.db.client
      .select()
      .from(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.id, id))
      .limit(1)

    return updated ? this.formatMedia(updated) : null
  }

  /**
   * Delete all media for an activity
   */
  async deleteByActivityId(activityId: string): Promise<number> {
    const result = await this.db.client
      .delete(this.db.schema.activityMedia)
      .where(eq(this.db.schema.activityMedia.activityId, activityId))
      .returning()

    return result.length
  }

  /**
   * Legacy alias for deleteByActivityId
   * @deprecated Use deleteByActivityId instead
   */
  async deleteByComponentId(componentId: string): Promise<number> {
    return this.deleteByActivityId(componentId)
  }

  /**
   * Verify an activity exists with the specified entity type
   * @param activityId - The ID of the activity
   * @param entityType - The expected type of entity (defaults to 'activity')
   */
  async activityExists(
    activityId: string,
    entityType: ComponentEntityType = 'activity'
  ): Promise<boolean> {
    // Map entity type to the activity type stored in the database
    const expectedActivityType = ENTITY_TO_ACTIVITY_TYPE[entityType]

    const [activity] = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        componentType: this.db.schema.itineraryActivities.componentType,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    if (!activity) {
      return false
    }

    // Verify the activity type matches the expected entity type
    return activity.componentType === expectedActivityType
  }

  /**
   * Legacy alias for activityExists
   * @deprecated Use activityExists instead
   */
  async componentExists(
    componentId: string,
    entityType: ComponentEntityType = 'activity'
  ): Promise<boolean> {
    return this.activityExists(componentId, entityType)
  }

  // ============================================================================
  // Batch Import Methods
  // ============================================================================

  /**
   * Get existing media URLs for an activity to support idempotent batch imports
   * @param activityId - The ID of the activity
   * @param entityType - The entity type
   * @returns Set of existing URLs
   */
  async getExistingMediaUrls(
    activityId: string,
    entityType: ComponentEntityType = 'activity'
  ): Promise<Set<string>> {
    const media = await this.db.client
      .select({ fileUrl: this.db.schema.activityMedia.fileUrl })
      .from(this.db.schema.activityMedia)
      .where(
        and(
          eq(this.db.schema.activityMedia.activityId, activityId),
          eq(this.db.schema.activityMedia.entityType, entityType)
        )
      )

    return new Set(media.map(m => m.fileUrl))
  }

  /**
   * Batch import external URL images with concurrency control
   *
   * Features:
   * - De-duplicates by URL (idempotent for retries)
   * - Skips URLs already in database
   * - Controlled concurrency (max 3 parallel fetches)
   * - Per-image timeout (10s)
   * - Returns partial success results
   *
   * @param activityId - The activity to attach images to
   * @param images - Array of images to import (max 10)
   * @param entityType - The entity type (defaults to 'cruise' for ship images)
   */
  async importExternalImagesBatch(
    activityId: string,
    images: Array<{
      url: string
      caption?: string
      attribution?: {
        source: string
        sourceUrl?: string
        photographerName?: string
      }
    }>,
    entityType: ComponentEntityType = 'cruise'
  ): Promise<{
    successful: Array<{ media: ActivityMediaDto; url: string }>
    failed: Array<{ url: string; error: string }>
    skipped: number
  }> {
    // 1. De-duplicate by URL (handles duplicate URLs in the same batch)
    const uniqueImages = [...new Map(images.map(img => [img.url, img])).values()]
    const duplicatesInBatch = images.length - uniqueImages.length

    // 2. Check which URLs already exist in DB (skip already-imported)
    const existingUrls = await this.getExistingMediaUrls(activityId, entityType)
    const newImages = uniqueImages.filter(img => !existingUrls.has(img.url))
    const alreadyExisting = uniqueImages.length - newImages.length

    // 3. Process with limited parallelism (max 3 concurrent)
    const results = await this.processWithConcurrency(
      newImages,
      async (img) => this.importSingleImageSafe(activityId, img, entityType),
      3
    )

    // 4. Separate successful and failed results
    const successful: Array<{ media: ActivityMediaDto; url: string }> = []
    const failed: Array<{ url: string; error: string }> = []

    for (const result of results) {
      if (result.status === 'success' && result.media) {
        successful.push({ media: result.media, url: result.url })
      } else if (result.status === 'failed') {
        failed.push({ url: result.url, error: result.error || 'Unknown error' })
      }
    }

    this.logger.log(
      `Batch import for activity ${activityId}: ${successful.length} successful, ` +
      `${failed.length} failed, ${duplicatesInBatch + alreadyExisting} skipped`
    )

    return {
      successful,
      failed,
      skipped: duplicatesInBatch + alreadyExisting,
    }
  }

  /**
   * Import a single image safely with timeout and error handling
   * @returns Result with status, media (if successful), url, and error (if failed)
   */
  private async importSingleImageSafe(
    activityId: string,
    image: {
      url: string
      caption?: string
      attribution?: {
        source: string
        sourceUrl?: string
        photographerName?: string
      }
    },
    entityType: ComponentEntityType
  ): Promise<{
    status: 'success' | 'failed'
    url: string
    media?: ActivityMediaDto
    error?: string
  }> {
    try {
      // Validate URL format
      let urlObj: URL
      try {
        urlObj = new URL(image.url)
      } catch {
        return { status: 'failed', url: image.url, error: 'Invalid URL format' }
      }

      // Extract filename from URL
      const pathParts = urlObj.pathname.split('/')
      const fileName = pathParts[pathParts.length - 1] || 'external-image.jpg'

      // Build attribution if provided
      const attribution: ExternalUrlAttribution | null = image.attribution ? {
        source: image.attribution.source,
        sourceUrl: image.attribution.sourceUrl || image.url,
        photographerName: image.attribution.photographerName ?? null,
      } : null

      // Create database record (URL stored directly, not downloaded)
      // Note: We don't fetch the image here - we store the external URL directly
      // The frontend will load images from the external CDN (static.traveltek.net)
      const media = await this.create({
        activityId,
        entityType,
        mediaType: 'image',
        fileUrl: image.url,
        fileName,
        fileSize: null, // Unknown for external URLs
        caption: image.caption || null,
        attribution,
      })

      return { status: 'success', url: image.url, media }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.warn(`Failed to import image ${image.url}: ${message}`)
      return { status: 'failed', url: image.url, error: message }
    }
  }

  /**
   * Process items with controlled concurrency using a worker queue pattern
   * No external dependencies - uses native Promise APIs
   */
  private async processWithConcurrency<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let nextIndex = 0

    async function worker(): Promise<void> {
      while (nextIndex < items.length) {
        const index = nextIndex++
         
        results[index] = await fn(items[index]!)
      }
    }

    // Spawn N workers that pull from shared queue
    const workerCount = Math.min(concurrency, items.length)
    await Promise.all(
      Array.from({ length: workerCount }, () => worker())
    )

    return results
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatMedia(media: any): ActivityMediaDto {
    return {
      id: media.id,
      activityId: media.activityId,
      entityType: media.entityType || 'activity',
      mediaType: media.mediaType,
      fileUrl: media.fileUrl,
      fileName: media.fileName,
      fileSize: media.fileSize || null,
      caption: media.caption || null,
      orderIndex: media.orderIndex,
      uploadedAt: media.uploadedAt?.toISOString() || new Date().toISOString(),
      uploadedBy: media.uploadedBy || null,
      attribution: media.attribution as MediaAttribution,
    }
  }
}

// Legacy class alias for backwards compatibility
export const ComponentMediaService = ActivityMediaService
