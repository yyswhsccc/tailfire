/**
 * OCR Processing Processor
 *
 * BullMQ processor for async OCR extraction jobs.
 * Handles extraction when the sync path times out (>30s).
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { Job } from 'bullmq'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { OcrService } from '../../ocr/ocr.service'
import { StorageService } from '../../trips/storage.service'
import { QUEUES, JOB_TYPES } from '../automation.types'
import type { OcrExtractJobData } from '../automation.types'
import type { OcrDocumentType } from '../../ocr/ocr.types'

const { ocrImportJobs } = schema

@Processor(QUEUES.OCR_PROCESSING)
@Injectable()
export class OcrProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessingProcessor.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly ocrService: OcrService,
    private readonly storageService: StorageService,
  ) {
    super()
  }

  async process(job: Job<OcrExtractJobData>): Promise<void> {
    if (job.name !== JOB_TYPES.OCR_EXTRACT) {
      this.logger.warn(`Unknown job type: ${job.name}`)
      return
    }

    await this.handleOcrExtract(job)
  }

  private async handleOcrExtract(job: Job<OcrExtractJobData>): Promise<void> {
    const { jobId, fileStoragePath, documentType } = job.data
    const startTime = Date.now()

    this.logger.log({ message: 'Starting async OCR extraction', jobId })

    try {
      // Download file from storage
      if (!fileStoragePath) {
        throw new Error('No file storage path — cannot process async extraction')
      }

      const fileBuffer = await this.storageService.downloadDocument(fileStoragePath)
      if (!fileBuffer) {
        throw new Error(`File not found at storage path: ${fileStoragePath}`)
      }

      // Run extraction (no timeout for async path)
      const extraction = await this.ocrService.extractFromPdf(
        fileBuffer,
        {
          documentType: documentType as OcrDocumentType | undefined,
          tripId: job.data.tripId,
          contactId: job.data.contactId,
        },
      )

      const processingTimeMs = Date.now() - startTime

      // Update job with results
      await this.db.client
        .update(ocrImportJobs)
        .set({
          status: 'preview_ready',
          detectedDocumentType: extraction.documentType,
          extractionResult: extraction as unknown as Record<string, unknown>,
          tokensPrompt: extraction.usage?.promptTokens ?? null,
          tokensCompletion: extraction.usage?.completionTokens ?? null,
          model: extraction.model ?? null,
          processingTimeMs,
          completedAt: new Date(),
        })
        .where(eq(ocrImportJobs.id, jobId))

      this.logger.log({
        message: 'Async OCR extraction complete',
        jobId,
        documentType: extraction.documentType,
        processingTimeMs,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error({
        message: 'Async OCR extraction failed',
        jobId,
        error: errorMessage,
      })

      await this.db.client
        .update(ocrImportJobs)
        .set({
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(ocrImportJobs.id, jobId))

      throw error
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`OCR job ${job.id} started processing`)
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.log(`OCR job ${job.id} completed`)
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error(`OCR job ${job.id} failed: ${error.message}`)
  }
}
