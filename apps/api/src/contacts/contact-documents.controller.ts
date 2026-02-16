/**
 * Contact Documents Controller
 *
 * API endpoints for managing contact documents.
 *
 * Access control: All endpoints verify sensitive data access via ContactAccessService.
 * Documents like passports/visas are sensitive; basic-share users are excluded.
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
  ForbiddenException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ContactDocumentsService,
  VALID_CONTACT_DOCUMENT_TYPES,
} from './contact-documents.service'
import { ContactAccessService } from './contact-access.service'
import { StorageService } from '../trips/storage.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ApiTags } from '@nestjs/swagger'

const MAX_FILE_SIZE = 10 * 1024 * 1024

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

@ApiTags('Contact Documents')
@Controller('contacts/:contactId/documents')
export class ContactDocumentsController {
  constructor(
    private readonly documentsService: ContactDocumentsService,
    private readonly storageService: StorageService,
    private readonly contactAccessService: ContactAccessService,
  ) {}

  private async verifySensitiveAccess(contactId: string, auth: AuthContext): Promise<void> {
    const result = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
    if (!result.canAccessBasic) {
      throw new NotFoundException('Contact not found')
    }
    if (!result.canAccessSensitive) {
      throw new ForbiddenException('You do not have access to this contact\'s documents')
    }
  }

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
    @Param('contactId') contactId: string,
  ) {
    await this.verifySensitiveAccess(contactId, auth)
    const documents = await this.documentsService.findByContactId(contactId)

    const documentsWithUrls = await Promise.all(
      documents.map((doc) => this.addDownloadUrl(doc))
    )

    return { documents: documentsWithUrls }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: string,
  ) {
    await this.verifySensitiveAccess(contactId, auth)

    if (!file) {
      throw new BadRequestException('No file provided')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed types: PDF, JPEG, PNG, GIF, WebP, DOC, DOCX, XLS, XLSX, TXT'
      )
    }

    if (
      documentType &&
      !VALID_CONTACT_DOCUMENT_TYPES.includes(documentType as (typeof VALID_CONTACT_DOCUMENT_TYPES)[number])
    ) {
      throw new BadRequestException(
        `Invalid document type. Allowed types: ${VALID_CONTACT_DOCUMENT_TYPES.join(', ')}`
      )
    }

    if (!this.storageService.isAvailable()) {
      throw new BadRequestException(
        'Storage service not configured. Please check Supabase credentials.'
      )
    }

    const fileUrl = await this.storageService.uploadDocument(
      file.buffer,
      `contacts/${contactId}`,
      file.originalname,
      file.mimetype,
    )

    const document = await this.documentsService.create(
      {
        contactId,
        documentType: documentType || null,
        fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        uploadedBy: auth.userId,
      },
      auth.userId,
    )

    return document
  }

  @Patch(':documentId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('documentId') documentId: string,
    @Body() body: { documentType?: string; fileName?: string },
  ) {
    await this.verifySensitiveAccess(contactId, auth)

    const existing = await this.documentsService.findById(documentId)
    if (!existing) {
      throw new NotFoundException('Document not found')
    }
    if (existing.contactId !== contactId) {
      throw new BadRequestException('Document does not belong to this contact')
    }

    const normalizedType = body.documentType === '' ? null : body.documentType
    if (
      normalizedType &&
      !VALID_CONTACT_DOCUMENT_TYPES.includes(normalizedType as (typeof VALID_CONTACT_DOCUMENT_TYPES)[number])
    ) {
      throw new BadRequestException(
        `Invalid document type. Allowed types: ${VALID_CONTACT_DOCUMENT_TYPES.join(', ')}`
      )
    }

    const document = await this.documentsService.update(
      documentId,
      {
        documentType: normalizedType,
        fileName: body.fileName,
      },
      auth.userId,
    )

    return document!
  }

  @Delete(':documentId')
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.verifySensitiveAccess(contactId, auth)

    const document = await this.documentsService.findById(documentId)
    if (!document) {
      throw new NotFoundException('Document not found')
    }
    if (document.contactId !== contactId) {
      throw new BadRequestException('Document does not belong to this contact')
    }

    if (this.storageService.isAvailable()) {
      try {
        await this.storageService.deleteDocument(document.fileUrl)
      } catch (error) {
        console.error('Failed to delete file from storage:', error)
      }
    }

    await this.documentsService.delete(documentId, auth.userId)

    return { success: true }
  }
}
