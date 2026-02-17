/**
 * OCR Import Controller
 *
 * Endpoints for uploading, previewing, and confirming OCR document imports.
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { schema } from '@tailfire/database'
import { FileInterceptor } from '@nestjs/platform-express'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { OcrImportService } from './ocr-import.service'
import { OcrPreviewDto, OcrConfirmDto } from './dto/ocr-import.dto'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

const { ocrSupplierRunbooks } = schema

@Controller('ocr-import')
export class OcrImportController {
  constructor(
    private readonly ocrImportService: OcrImportService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Upload a PDF/image and get a structured extraction preview.
   * Returns immediately if extraction completes within 30s,
   * otherwise returns a job ID for polling.
   */
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(new BadRequestException(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG`), false)
        } else {
          callback(null, true)
        }
      },
    }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: OcrPreviewDto,
    @GetAuthContext() auth: AuthContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required')
    }

    return this.ocrImportService.preview(file, dto, auth)
  }

  /**
   * Confirm a previewed extraction — creates trips, activities, contacts, etc.
   */
  @Post('confirm')
  async confirm(
    @Body() dto: OcrConfirmDto,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.ocrImportService.confirm(dto, auth)
  }

  /**
   * Poll job status for async extractions.
   */
  @Get('status/:jobId')
  async getStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.ocrImportService.getJobStatus(jobId, auth)
  }

  // ============================================================================
  // Runbook CRUD
  // ============================================================================

  /**
   * List all supplier extraction runbooks.
   */
  @Get('runbooks')
  async listRunbooks() {
    const runbooks = await this.db.client
      .select()
      .from(ocrSupplierRunbooks)
      .orderBy(ocrSupplierRunbooks.supplierName)
    return { runbooks }
  }

  /**
   * Create a new supplier extraction runbook.
   */
  @Post('runbooks')
  async createRunbook(
    @Body() body: { supplierName: string; documentType: string; extractionHints: string; exampleFields?: Record<string, unknown> },
  ) {
    if (!body.supplierName || !body.documentType || !body.extractionHints) {
      throw new BadRequestException('supplierName, documentType, and extractionHints are required')
    }

    const [runbook] = await this.db.client
      .insert(ocrSupplierRunbooks)
      .values({
        supplierName: body.supplierName.trim(),
        documentType: body.documentType.trim(),
        extractionHints: body.extractionHints,
        exampleFields: body.exampleFields || null,
      })
      .returning()

    return runbook
  }

  /**
   * Update a runbook's extraction hints.
   */
  @Patch('runbooks/:id')
  async updateRunbook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { extractionHints?: string; exampleFields?: Record<string, unknown> },
  ) {
    const [existing] = await this.db.client
      .select()
      .from(ocrSupplierRunbooks)
      .where(eq(ocrSupplierRunbooks.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Runbook ${id} not found`)
    }

    const [updated] = await this.db.client
      .update(ocrSupplierRunbooks)
      .set({
        ...(body.extractionHints !== undefined && { extractionHints: body.extractionHints }),
        ...(body.exampleFields !== undefined && { exampleFields: body.exampleFields }),
        updatedAt: new Date(),
      })
      .where(eq(ocrSupplierRunbooks.id, id))
      .returning()

    return updated
  }

  /**
   * Delete a runbook.
   */
  @Delete('runbooks/:id')
  async deleteRunbook(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const [existing] = await this.db.client
      .select()
      .from(ocrSupplierRunbooks)
      .where(eq(ocrSupplierRunbooks.id, id))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Runbook ${id} not found`)
    }

    await this.db.client
      .delete(ocrSupplierRunbooks)
      .where(eq(ocrSupplierRunbooks.id, id))

    return { deleted: true }
  }
}
