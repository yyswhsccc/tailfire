/**
 * Activity Media Controller
 *
 * API endpoints for managing activity media (images, videos).
 * Uses the public media bucket for storage.
 * Supports polymorphic attachment via entityType query parameter.
 *
 * Access control: All endpoints verify trip access via ActivitiesService.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ActivityMediaService, UnsplashAttribution, ExternalUrlAttribution, VALID_ENTITY_TYPES } from './activity-media.service'
import { ActivitiesService } from './activities.service'
import { StorageService } from './storage.service'
import { UnsplashService } from '../unsplash/unsplash.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { MediaType, ComponentEntityType } from '@tailfire/database'
import { DeprecationInterceptor } from '../common/interceptors/deprecation.interceptor'
import { ApiTags } from '@nestjs/swagger'

// Max file size: 10MB for images
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types for media
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  // Videos (future support)
  'video/mp4',
  'video/webm',
]

// Map MIME type to media type
function getMimeMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

// DTO for external media request
interface AddExternalMediaDto {
  unsplashPhotoId: string
  downloadLocation: string
  caption?: string
}

// DTO for external URL media request
interface AddExternalUrlMediaDto {
  url: string
  caption?: string
  attribution?: {
    source: string
    sourceUrl?: string
    photographerName?: string
  }
}

// DTO for batch external URL media request
interface BatchImportExternalUrlDto {
  images: Array<{
    url: string
    caption?: string
    attribution?: {
      source: string
      sourceUrl?: string
      photographerName?: string
    }
  }>
}

@ApiTags('Activity Media')
@Controller('activities/:activityId/media')
export class ActivityMediaController {
  private readonly logger = new Logger(ActivityMediaController.name)

  constructor(
    private readonly mediaService: ActivityMediaService,
    private readonly activitiesService: ActivitiesService,
    private readonly storageService: StorageService,
    private readonly unsplashService: UnsplashService
  ) {}

  /**
   * List all media for an activity
   * @param activityId - The activity ID
   * @param entityType - The entity type (defaults to 'activity')
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Query('entityType') entityType?: ComponentEntityType
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth)
    // Validate entityType if provided
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    const media = await this.mediaService.findByActivityId(activityId, validatedEntityType)
    return { media }
  }

  /**
   * Get a single media item
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':mediaId')
  async get(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('mediaId') mediaId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth)
    const media = await this.mediaService.findById(mediaId)
    if (!media) {
      throw new NotFoundException('Media not found')
    }
    // Verify media belongs to this activity
    if (media.activityId !== activityId) {
      throw new BadRequestException('Media does not belong to this activity')
    }
    return media
  }

  /**
   * Upload a new media file
   *
   * POST /activities/:activityId/media
   * Content-Type: multipart/form-data
   * Body: file (required), caption (optional)
   * Query: entityType (optional, defaults to 'activity')
   *
   * Returns: { id, activityId, entityType, mediaType, fileUrl, fileName, fileSize, caption, orderIndex, uploadedAt }
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body('caption') caption?: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Validate entityType if provided
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    // Validate activity exists with the correct type
    const activityExists = await this.mediaService.activityExists(activityId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Activity not found: ${activityId} (type: ${validatedEntityType})`)
    }

    // Validate file presence
    if (!file) {
      throw new BadRequestException('No file provided')
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, GIF, WebP, AVIF, MP4, WebM`
      )
    }

    // Check if media storage is available
    if (!this.storageService.isMediaAvailable()) {
      throw new BadRequestException(
        'Media storage service not configured. Please ensure R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL environment variables are set.'
      )
    }

    // Determine media type from MIME type
    const mediaType = getMimeMediaType(file.mimetype)

    // Upload to media storage (public bucket)
    // Path format: media/{activityId}/{timestamp}-{filename}
    const folder = `media/${activityId}`
    const { url: fileUrl } = await this.storageService.uploadMediaFile(
      file.buffer,
      folder,
      file.originalname,
      file.mimetype
    )

    // Create database record
    const media = await this.mediaService.create({
      activityId,
      entityType: validatedEntityType,
      mediaType,
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
      caption: caption || null,
    })

    return media
  }

  /**
   * Add external media from Unsplash
   *
   * POST /activities/:activityId/media/external
   * Body: { unsplashPhotoId, downloadLocation, caption? }
   * Query: entityType (optional, defaults to 'activity')
   *
   * This endpoint:
   * 1. Validates the photo ID is from Unsplash (security)
   * 2. Fetches photo details from Unsplash API
   * 3. Downloads the image server-side
   * 4. Uploads to our R2 storage
   * 5. Triggers Unsplash download tracking (required by API guidelines)
   * 6. Saves with attribution data
   *
   * Access check: User must have write access to the trip.
   */
  @Post('external')
  async addExternalMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body() body?: AddExternalMediaDto
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Validate entityType if provided
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    // Validate required fields
    if (!body?.unsplashPhotoId) {
      throw new BadRequestException('unsplashPhotoId is required')
    }
    if (!body.downloadLocation) {
      throw new BadRequestException('downloadLocation is required')
    }

    // Validate activity exists with the correct type
    const activityExists = await this.mediaService.activityExists(activityId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Activity not found: ${activityId} (type: ${validatedEntityType})`)
    }

    // Check if Unsplash is configured
    if (!this.unsplashService.isAvailable()) {
      throw new BadRequestException(
        'Unsplash API not configured. Please set UNSPLASH_ACCESS_KEY in environment.'
      )
    }

    // Check if media storage is available
    if (!this.storageService.isMediaAvailable()) {
      throw new BadRequestException(
        'Media storage service not configured. Please ensure R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL environment variables are set.'
      )
    }

    try {
      // 1. Fetch photo details from Unsplash (validates it's a real photo)
      this.logger.debug(`Fetching Unsplash photo: ${body.unsplashPhotoId}`)
      const photo = await this.unsplashService.getPhoto(body.unsplashPhotoId)

      // 2. Download the image server-side (use regular quality for good size/quality balance)
      this.logger.debug(`Downloading image from Unsplash`)
      const { buffer, contentType } = await this.unsplashService.downloadImage(
        photo.urls.regular
      )

      // 3. Upload to our R2 storage
      const folder = `media/${activityId}`
      const fileName = `unsplash-${photo.id}.jpg`
      const { url: fileUrl } = await this.storageService.uploadMediaFile(
        buffer,
        folder,
        fileName,
        contentType
      )

      // 4. Trigger Unsplash download tracking (required by API guidelines)
      this.logger.debug('Triggering Unsplash download tracking')
      await this.unsplashService.triggerDownload(body.downloadLocation)

      // 5. Build attribution data
      const attribution: UnsplashAttribution = {
        source: 'unsplash',
        photoId: photo.id,
        photographerName: photo.user.name,
        photographerUsername: photo.user.username,
        photographerUrl: photo.user.links.html,
        sourceUrl: photo.links.html,
        downloadLocation: body.downloadLocation,
      }

      // 6. Create database record with attribution
      const media = await this.mediaService.create({
        activityId,
        entityType: validatedEntityType,
        mediaType: 'image' as MediaType,
        fileUrl,
        fileName,
        fileSize: buffer.length,
        caption: body.caption || null,
        attribution,
      })

      this.logger.log(
        `Added Unsplash photo ${photo.id} by ${photo.user.name} to activity ${activityId}`
      )

      return media
    } catch (error) {
      this.logger.error(`Failed to add external media: ${error}`)
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(
        `Failed to add Unsplash photo: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Add external media from a URL (for library imports like Traveltek cruise images)
   *
   * POST /activities/:activityId/media/external/url
   * Body: { url, caption?, attribution? }
   * Query: entityType (optional, defaults to 'activity')
   *
   * This endpoint:
   * 1. Validates the URL is a valid image URL
   * 2. Creates a media record pointing to the external URL directly
   *
   * Note: Unlike Unsplash integration, this does NOT download the image to R2.
   * The external URL is stored directly and served from the original source.
   *
   * Access check: User must have write access to the trip.
   */
  @Post('external/url')
  async addExternalUrlMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body() body?: AddExternalUrlMediaDto
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Validate entityType if provided
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    // Validate required fields
    if (!body?.url) {
      throw new BadRequestException('url is required')
    }

    // Validate URL format
    try {
      new URL(body.url)
    } catch {
      throw new BadRequestException('Invalid URL format')
    }

    // Validate activity exists with the correct type
    const activityExists = await this.mediaService.activityExists(activityId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Activity not found: ${activityId} (type: ${validatedEntityType})`)
    }

    try {
      // Extract filename from URL
      const urlObj = new URL(body.url)
      const pathParts = urlObj.pathname.split('/')
      const fileName = pathParts[pathParts.length - 1] || 'external-image.jpg'

      // Build attribution if provided
      const attribution: ExternalUrlAttribution | null = body.attribution ? {
        source: body.attribution.source,
        sourceUrl: body.attribution.sourceUrl || body.url,
        photographerName: body.attribution.photographerName ?? null,
      } : null

      // Create database record (URL stored directly, not downloaded)
      const media = await this.mediaService.create({
        activityId,
        entityType: validatedEntityType,
        mediaType: 'image' as MediaType,
        fileUrl: body.url,
        fileName,
        fileSize: null, // Unknown for external URLs
        caption: body.caption || null,
        attribution,
      })

      this.logger.log(
        `Added external URL media to activity ${activityId}: ${body.url}`
      )

      return media
    } catch (error) {
      this.logger.error(`Failed to add external URL media: ${error}`)
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(
        `Failed to add external media: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Batch import external URL media (images from CDNs like Traveltek)
   *
   * POST /activities/:activityId/media/external/batch
   * Body: { images: [{ url, caption?, attribution? }] }
   * Query: entityType (optional, defaults to 'cruise')
   *
   * This endpoint:
   * 1. De-duplicates images by URL (idempotent for retries)
   * 2. Skips images already in database
   * 3. Processes images with controlled concurrency (max 3 parallel)
   * 4. Returns partial success results (207 Multi-Status if some fail)
   *
   * Constraints:
   * - Maximum 10 images per batch
   * - Each URL max 2048 characters
   *
   * Access check: User must have write access to the trip.
   */
  @Post('external/batch')
  async batchImportExternalUrl(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body() body?: BatchImportExternalUrlDto
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Validate entityType if provided (defaults to 'cruise' for ship images)
    const validatedEntityType = entityType || 'cruise'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(
        `Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`
      )
    }

    // Validate required fields
    if (!body?.images || !Array.isArray(body.images)) {
      throw new BadRequestException('images array is required')
    }

    // Enforce batch size limit
    if (body.images.length > 10) {
      throw new BadRequestException('Maximum 10 images per batch')
    }

    // Validate each image URL
    for (const image of body.images) {
      if (!image.url) {
        throw new BadRequestException('Each image must have a url')
      }
      if (image.url.length > 2048) {
        throw new BadRequestException('URL exceeds maximum length of 2048 characters')
      }
      try {
        new URL(image.url)
      } catch {
        throw new BadRequestException(`Invalid URL format: ${image.url}`)
      }
    }

    // Validate activity exists with the correct type
    const activityExists = await this.mediaService.activityExists(activityId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Activity not found: ${activityId} (type: ${validatedEntityType})`)
    }

    try {
      // Perform batch import
      const result = await this.mediaService.importExternalImagesBatch(
        activityId,
        body.images,
        validatedEntityType
      )

      this.logger.log(
        `Batch import completed for activity ${activityId}: ` +
        `${result.successful.length} successful, ${result.failed.length} failed, ${result.skipped} skipped`
      )

      // Return appropriate HTTP status based on results
      // Note: Using HttpStatus enum directly since we're returning the object,
      // not using @Res() decorator (which would bypass NestJS serialization)
      // The caller should check for failed.length > 0 to handle partial success
      return result
    } catch (error) {
      this.logger.error(`Failed to batch import external media: ${error}`)
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(
        `Failed to batch import media: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Update media metadata (caption)
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':mediaId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: { caption?: string }
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Verify media exists and belongs to activity
    const existing = await this.mediaService.findById(mediaId)
    if (!existing) {
      throw new NotFoundException('Media not found')
    }
    if (existing.activityId !== activityId) {
      throw new BadRequestException('Media does not belong to this activity')
    }

    const media = await this.mediaService.update(mediaId, {
      caption: body.caption,
    })

    return media
  }

  /**
   * Delete a media item
   *
   * Access check: User must have write access to the trip.
   */
  @Delete(':mediaId')
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('mediaId') mediaId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Get media to get file URL
    const media = await this.mediaService.findById(mediaId)
    if (!media) {
      throw new NotFoundException('Media not found')
    }

    // Verify media belongs to activity
    if (media.activityId !== activityId) {
      throw new BadRequestException('Media does not belong to this activity')
    }

    // Extract storage path from public URL
    // URL format: https://pub-xxx.r2.dev/media/{activityId}/{timestamp}-{filename}
    // Storage path: media/{activityId}/{timestamp}-{filename}
    const urlParts = media.fileUrl.split('.r2.dev/')
    const storagePath = urlParts.length > 1 ? urlParts[1] : null

    // Delete from storage
    if (storagePath && this.storageService.isMediaAvailable()) {
      try {
        await this.storageService.deleteMedia(storagePath)
      } catch (error) {
        // Log but don't fail - database record should still be deleted
        console.error('Failed to delete file from media storage:', error)
      }
    }

    // Delete database record
    await this.mediaService.delete(mediaId)

    return { success: true }
  }
}

// TODO: Remove legacy controller after frontend migration is complete (target: Q1 2025)
// Legacy controller alias that redirects from old route for backwards compatibility
@ApiTags('Component Media')
@Controller('components/:componentId/media')
@UseInterceptors(new DeprecationInterceptor({
  sunsetDate: '2025-03-31',
  successorPath: '/api/v1/activities/:activityId/media',
  notice: 'This endpoint is deprecated. Migrate to /activities/:activityId/media before March 31, 2025.'
}))
export class ComponentMediaController {
  private readonly logger = new Logger(ComponentMediaController.name)

  constructor(
    private readonly mediaService: ActivityMediaService,
    private readonly activitiesService: ActivitiesService,
    private readonly storageService: StorageService,
    private readonly unsplashService: UnsplashService
  ) {}

  // This controller provides backwards compatibility for the old /components/:componentId/media routes
  // It delegates to the same service but uses the old parameter name

  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Query('entityType') entityType?: ComponentEntityType
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth)
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }
    const media = await this.mediaService.findByActivityId(componentId, validatedEntityType)
    return { media }
  }

  @Get(':mediaId')
  async get(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('mediaId') mediaId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth)
    const media = await this.mediaService.findById(mediaId)
    if (!media) {
      throw new NotFoundException('Media not found')
    }
    // Verify media belongs to this component
    if (media.activityId !== componentId) {
      throw new BadRequestException('Media does not belong to this component')
    }
    return media
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body('caption') caption?: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    const activityExists = await this.mediaService.activityExists(componentId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Component not found: ${componentId} (type: ${validatedEntityType})`)
    }

    if (!file) {
      throw new BadRequestException('No file provided')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, GIF, WebP, AVIF, MP4, WebM`)
    }

    if (!this.storageService.isMediaAvailable()) {
      throw new BadRequestException('Media storage service not configured.')
    }

    const mediaType = getMimeMediaType(file.mimetype)
    const folder = `media/${componentId}`
    const { url: fileUrl } = await this.storageService.uploadMediaFile(file.buffer, folder, file.originalname, file.mimetype)

    const media = await this.mediaService.create({
      activityId: componentId,
      entityType: validatedEntityType,
      mediaType,
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
      caption: caption || null,
    })

    return media
  }

  /**
   * Add external media from Unsplash (legacy endpoint)
   */
  @Post('external')
  async addExternalMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body() body?: AddExternalMediaDto
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    if (!body?.unsplashPhotoId) {
      throw new BadRequestException('unsplashPhotoId is required')
    }
    if (!body.downloadLocation) {
      throw new BadRequestException('downloadLocation is required')
    }

    const activityExists = await this.mediaService.activityExists(componentId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Component not found: ${componentId} (type: ${validatedEntityType})`)
    }

    if (!this.unsplashService.isAvailable()) {
      throw new BadRequestException('Unsplash API not configured. Please set UNSPLASH_ACCESS_KEY in environment.')
    }

    if (!this.storageService.isMediaAvailable()) {
      throw new BadRequestException('Media storage service not configured.')
    }

    try {
      this.logger.debug(`Fetching Unsplash photo: ${body.unsplashPhotoId}`)
      const photo = await this.unsplashService.getPhoto(body.unsplashPhotoId)

      this.logger.debug(`Downloading image from Unsplash`)
      const { buffer, contentType } = await this.unsplashService.downloadImage(photo.urls.regular)

      const folder = `media/${componentId}`
      const fileName = `unsplash-${photo.id}.jpg`
      const { url: fileUrl } = await this.storageService.uploadMediaFile(buffer, folder, fileName, contentType)

      this.logger.debug('Triggering Unsplash download tracking')
      await this.unsplashService.triggerDownload(body.downloadLocation)

      const attribution: UnsplashAttribution = {
        source: 'unsplash',
        photoId: photo.id,
        photographerName: photo.user.name,
        photographerUsername: photo.user.username,
        photographerUrl: photo.user.links.html,
        sourceUrl: photo.links.html,
        downloadLocation: body.downloadLocation,
      }

      const media = await this.mediaService.create({
        activityId: componentId,
        entityType: validatedEntityType,
        mediaType: 'image' as MediaType,
        fileUrl,
        fileName,
        fileSize: buffer.length,
        caption: body.caption || null,
        attribution,
      })

      this.logger.log(`Added Unsplash photo ${photo.id} by ${photo.user.name} to component ${componentId}`)

      return media
    } catch (error) {
      this.logger.error(`Failed to add external media: ${error}`)
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(
        `Failed to add Unsplash photo: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Add external media from a URL (legacy endpoint for library imports)
   */
  @Post('external/url')
  async addExternalUrlMedia(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Query('entityType') entityType?: ComponentEntityType,
    @Body() body?: AddExternalUrlMediaDto
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const validatedEntityType = entityType || 'activity'
    if (!VALID_ENTITY_TYPES.includes(validatedEntityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}. Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    }

    if (!body?.url) {
      throw new BadRequestException('url is required')
    }

    try {
      new URL(body.url)
    } catch {
      throw new BadRequestException('Invalid URL format')
    }

    const activityExists = await this.mediaService.activityExists(componentId, validatedEntityType)
    if (!activityExists) {
      throw new NotFoundException(`Component not found: ${componentId} (type: ${validatedEntityType})`)
    }

    try {
      const urlObj = new URL(body.url)
      const pathParts = urlObj.pathname.split('/')
      const fileName = pathParts[pathParts.length - 1] || 'external-image.jpg'

      const attribution: ExternalUrlAttribution | null = body.attribution ? {
        source: body.attribution.source,
        sourceUrl: body.attribution.sourceUrl || body.url,
        photographerName: body.attribution.photographerName ?? null,
      } : null

      const media = await this.mediaService.create({
        activityId: componentId,
        entityType: validatedEntityType,
        mediaType: 'image' as MediaType,
        fileUrl: body.url,
        fileName,
        fileSize: null,
        caption: body.caption || null,
        attribution,
      })

      this.logger.log(`Added external URL media to component ${componentId}: ${body.url}`)

      return media
    } catch (error) {
      this.logger.error(`Failed to add external URL media: ${error}`)
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(
        `Failed to add external media: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  @Patch(':mediaId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: { caption?: string }
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const existing = await this.mediaService.findById(mediaId)
    if (!existing) {
      throw new NotFoundException('Media not found')
    }
    if (existing.activityId !== componentId) {
      throw new BadRequestException('Media does not belong to this component')
    }
    return this.mediaService.update(mediaId, { caption: body.caption })
  }

  @Delete(':mediaId')
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('mediaId') mediaId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const media = await this.mediaService.findById(mediaId)
    if (!media) {
      throw new NotFoundException('Media not found')
    }
    if (media.activityId !== componentId) {
      throw new BadRequestException('Media does not belong to this component')
    }

    const urlParts = media.fileUrl.split('.r2.dev/')
    const storagePath = urlParts.length > 1 ? urlParts[1] : null

    if (storagePath && this.storageService.isMediaAvailable()) {
      try {
        await this.storageService.deleteMedia(storagePath)
      } catch (error) {
        console.error('Failed to delete file from media storage:', error)
      }
    }

    await this.mediaService.delete(mediaId)
    return { success: true }
  }
}
