/**
 * Activity Documents Controller
 *
 * API endpoints for managing activity documents.
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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ActivityDocumentsService,
  VALID_DOCUMENT_TYPES,
} from './activity-documents.service'
import { ActivitiesService } from './activities.service'
import { DeprecationInterceptor } from '../common/interceptors/deprecation.interceptor'
import { StorageService } from './storage.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ApiTags } from '@nestjs/swagger'

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

@ApiTags('Activity Documents')
@Controller('activities/:activityId/documents')
export class ActivityDocumentsController {
  constructor(
    private readonly documentsService: ActivityDocumentsService,
    private readonly storageService: StorageService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Add download URL to document
   */
  private async addDownloadUrl(doc: any) {
    if (this.storageService.isAvailable() && doc.fileUrl) {
      try {
        const downloadUrl = await this.storageService.getSignedUrl(doc.fileUrl, 3600)
        return { ...doc, downloadUrl }
      } catch {
        return { ...doc, downloadUrl: null }
      }
    }
    return { ...doc, downloadUrl: null }
  }

  /**
   * List all documents for an activity
   *
   * Access check: User must have read access to the trip.
   */
  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth)
    const documents = await this.documentsService.findByActivityId(activityId)

    // Add signed download URLs to each document
    const documentsWithUrls = await Promise.all(
      documents.map((doc) => this.addDownloadUrl(doc))
    )

    return { documents: documentsWithUrls }
  }

  /**
   * Get a single document
   *
   * Access check: User must have read access to the trip.
   */
  @Get(':documentId')
  async get(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('documentId') documentId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth)
    const document = await this.documentsService.findById(documentId)
    if (!document) {
      throw new NotFoundException('Document not found')
    }
    // Verify document belongs to this activity
    if (document.activityId !== activityId) {
      throw new BadRequestException('Document does not belong to this activity')
    }
    return this.addDownloadUrl(document)
  }

  /**
   * Upload a new document
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
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
        `Invalid file type. Allowed types: PDF, JPEG, PNG, GIF, WebP, DOC, DOCX, XLS, XLSX, TXT`
      )
    }

    // Validate document type if provided
    if (
      documentType &&
      !VALID_DOCUMENT_TYPES.includes(documentType as (typeof VALID_DOCUMENT_TYPES)[number])
    ) {
      throw new BadRequestException(
        `Invalid document type. Allowed types: ${VALID_DOCUMENT_TYPES.join(', ')}`
      )
    }

    // Check if storage is available
    if (!this.storageService.isAvailable()) {
      throw new BadRequestException(
        'Storage service not configured. Please check Supabase credentials.'
      )
    }

    // Upload to storage
    const fileUrl = await this.storageService.uploadDocument(
      file.buffer,
      activityId,
      file.originalname,
      file.mimetype
    )

    // Create database record
    const document = await this.documentsService.create({
      activityId,
      documentType: documentType || null,
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    })

    return document
  }

  /**
   * Update document metadata
   *
   * Access check: User must have write access to the trip.
   */
  @Patch(':documentId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('documentId') documentId: string,
    @Body() body: { documentType?: string; fileName?: string }
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)

    // Verify document exists and belongs to this activity
    const existing = await this.documentsService.findById(documentId)
    if (!existing) {
      throw new NotFoundException('Document not found')
    }
    if (existing.activityId !== activityId) {
      throw new BadRequestException('Document does not belong to this activity')
    }

    // Validate document type if provided
    if (
      body.documentType &&
      !VALID_DOCUMENT_TYPES.includes(body.documentType as (typeof VALID_DOCUMENT_TYPES)[number])
    ) {
      throw new BadRequestException(
        `Invalid document type. Allowed types: ${VALID_DOCUMENT_TYPES.join(', ')}`
      )
    }

    const document = await this.documentsService.update(documentId, {
      documentType: body.documentType,
      fileName: body.fileName,
    })

    return document!
  }

  /**
   * Delete a document
   *
   * Access check: User must have write access to the trip.
   */
  @Delete(':documentId')
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('activityId') activityId: string,
    @Param('documentId') documentId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(activityId, auth, true)
    // Get document to get file URL
    const document = await this.documentsService.findById(documentId)
    if (!document) {
      throw new NotFoundException('Document not found')
    }

    // Verify document belongs to activity
    if (document.activityId !== activityId) {
      throw new BadRequestException('Document does not belong to this activity')
    }

    // Delete from storage
    if (this.storageService.isAvailable()) {
      try {
        await this.storageService.deleteDocument(document.fileUrl)
      } catch (error) {
        // Log but don't fail - database record should still be deleted
        console.error('Failed to delete file from storage:', error)
      }
    }

    // Delete database record
    await this.documentsService.delete(documentId)

    return { success: true }
  }
}

// TODO: Remove legacy controller after frontend migration is complete (target: Q1 2025)
// Legacy controller for backwards compatibility with old route
@ApiTags('Component Documents')
@Controller('components/:componentId/documents')
@UseInterceptors(new DeprecationInterceptor({
  sunsetDate: '2025-03-31',
  successorPath: '/api/v1/activities/:activityId/documents',
  notice: 'This endpoint is deprecated. Migrate to /activities/:activityId/documents before March 31, 2025.'
}))
export class ComponentDocumentsController {
  constructor(
    private readonly documentsService: ActivityDocumentsService,
    private readonly storageService: StorageService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  private async addDownloadUrl(doc: any) {
    if (this.storageService.isAvailable() && doc.fileUrl) {
      try {
        const downloadUrl = await this.storageService.getSignedUrl(doc.fileUrl, 3600)
        return { ...doc, downloadUrl }
      } catch {
        return { ...doc, downloadUrl: null }
      }
    }
    return { ...doc, downloadUrl: null }
  }

  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth)
    const documents = await this.documentsService.findByActivityId(componentId)
    const documentsWithUrls = await Promise.all(
      documents.map((doc) => this.addDownloadUrl(doc))
    )
    return { documents: documentsWithUrls }
  }

  @Get(':documentId')
  async get(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('documentId') documentId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth)
    const document = await this.documentsService.findById(documentId)
    if (!document) {
      throw new NotFoundException('Document not found')
    }
    // Verify document belongs to this component
    if (document.activityId !== componentId) {
      throw new BadRequestException('Document does not belong to this component')
    }
    return this.addDownloadUrl(document)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    if (!file) {
      throw new BadRequestException('No file provided')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type.`)
    }

    if (documentType && !VALID_DOCUMENT_TYPES.includes(documentType as (typeof VALID_DOCUMENT_TYPES)[number])) {
      throw new BadRequestException(`Invalid document type. Allowed types: ${VALID_DOCUMENT_TYPES.join(', ')}`)
    }

    if (!this.storageService.isAvailable()) {
      throw new BadRequestException('Storage service not configured.')
    }

    const fileUrl = await this.storageService.uploadDocument(file.buffer, componentId, file.originalname, file.mimetype)

    const document = await this.documentsService.create({
      activityId: componentId,
      documentType: documentType || null,
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    })

    return document
  }

  @Patch(':documentId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('documentId') documentId: string,
    @Body() body: { documentType?: string; fileName?: string }
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)

    // Verify document exists and belongs to this component
    const existing = await this.documentsService.findById(documentId)
    if (!existing) {
      throw new NotFoundException('Document not found')
    }
    if (existing.activityId !== componentId) {
      throw new BadRequestException('Document does not belong to this component')
    }

    if (body.documentType && !VALID_DOCUMENT_TYPES.includes(body.documentType as (typeof VALID_DOCUMENT_TYPES)[number])) {
      throw new BadRequestException(`Invalid document type.`)
    }

    const document = await this.documentsService.update(documentId, {
      documentType: body.documentType,
      fileName: body.fileName,
    })

    return document!
  }

  @Delete(':documentId')
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('componentId') componentId: string,
    @Param('documentId') documentId: string
  ) {
    await this.activitiesService.verifyTripAccessFromActivityId(componentId, auth, true)
    const document = await this.documentsService.findById(documentId)
    if (!document) {
      throw new NotFoundException('Document not found')
    }

    if (document.activityId !== componentId) {
      throw new BadRequestException('Document does not belong to this component')
    }

    if (this.storageService.isAvailable()) {
      try {
        await this.storageService.deleteDocument(document.fileUrl)
      } catch (error) {
        console.error('Failed to delete file from storage:', error)
      }
    }

    await this.documentsService.delete(documentId)

    return { success: true }
  }
}
