/**
 * OCR Processing Processor
 *
 * BullMQ processor for async OCR extraction jobs.
 * Handles extraction when the sync path times out (>30s).
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { Job } from 'bullmq'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { OcrService } from '../../ocr/ocr.service'
import { StorageService } from '../../trips/storage.service'
import { QUEUES, JOB_TYPES } from '../automation.types'
import type { OcrExtractJobData } from '../automation.types'
import type { OcrDocumentType, OcrExtractionResult } from '../../ocr/ocr.types'

const { ocrImportJobs, ocrSupplierRunbooks } = schema

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
      let extraction = await this.ocrService.extractFromPdf(
        fileBuffer,
        {
          documentType: documentType as OcrDocumentType | undefined,
          tripId: job.data.tripId,
          contactId: job.data.contactId,
        },
      )

      // Resolve supplier and look up runbook
      const supplierName = extraction.supplierName
        || this.getExtractedSupplierName(extraction)

      let runbookId: string | null = null
      let hintsApplied = false

      if (supplierName) {
        const runbook = await this.findRunbookBySupplier(supplierName, extraction.documentType)
        if (runbook) {
          runbookId = runbook.id

          // Re-extract with hints if confidence is acceptable (>0.6)
          if (extraction.confidence > 0.6) {
            this.logger.log({
              message: 'Async path: re-extracting with supplier hints',
              supplierName,
              runbookId: runbook.id,
              jobId,
            })
            const reExtraction = await this.ocrService.extractFromPdf(
              fileBuffer,
              {
                documentType: extraction.documentType,
                tripId: job.data.tripId,
                contactId: job.data.contactId,
                extractionHints: runbook.extractionHints,
              },
            )
            extraction = { ...reExtraction, supplierName: extraction.supplierName }
            hintsApplied = true
          }
        }
      }

      const processingTimeMs = Date.now() - startTime

      // Match travelers to contacts
      let contactMatches: unknown[] = []
      try {
        contactMatches = await this.matchTravelersToContacts(
          extraction.travelers,
          job.data.agencyId,
        )
      } catch (error) {
        this.logger.warn({
          message: 'Failed to match travelers in async path — continuing without matches',
          jobId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // Update job with results
      await this.db.client
        .update(ocrImportJobs)
        .set({
          status: 'preview_ready',
          detectedDocumentType: extraction.documentType,
          extractionResult: extraction as unknown as Record<string, unknown>,
          enrichedResult: { contactMatches } as unknown as Record<string, unknown>,
          tokensPrompt: extraction.usage?.promptTokens ?? null,
          tokensCompletion: extraction.usage?.completionTokens ?? null,
          model: extraction.model ?? null,
          runbookId,
          hintsApplied,
          processingTimeMs,
          completedAt: new Date(),
        })
        .where(eq(ocrImportJobs.id, jobId))

      this.logger.log({
        message: 'Async OCR extraction complete',
        jobId,
        documentType: extraction.documentType,
        supplierName,
        hintsApplied,
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

  /**
   * Look up runbook by supplier + document type (same logic as OcrImportService).
   */
  private async findRunbookBySupplier(
    supplierName: string,
    documentType: string,
  ): Promise<{ id: string; extractionHints: string } | null> {
    try {
      const normalized = supplierName.trim().toLowerCase()
      if (!normalized) return null

      // Exact normalized match
      const [exact] = await this.db.client
        .select({
          id: ocrSupplierRunbooks.id,
          extractionHints: ocrSupplierRunbooks.extractionHints,
        })
        .from(ocrSupplierRunbooks)
        .where(
          and(
            sql`LOWER(TRIM(${ocrSupplierRunbooks.supplierName})) = ${normalized}`,
            eq(ocrSupplierRunbooks.documentType, documentType),
          ),
        )
        .limit(1)

      if (exact) return exact

      // ILIKE substring fallback
      const [fuzzy] = await this.db.client
        .select({
          id: ocrSupplierRunbooks.id,
          extractionHints: ocrSupplierRunbooks.extractionHints,
        })
        .from(ocrSupplierRunbooks)
        .where(
          and(
            sql`(LOWER(${ocrSupplierRunbooks.supplierName}) ILIKE '%' || ${normalized} || '%'
              OR ${normalized} ILIKE '%' || LOWER(${ocrSupplierRunbooks.supplierName}) || '%')`,
            eq(ocrSupplierRunbooks.documentType, documentType),
          ),
        )
        .limit(1)

      return fuzzy || null
    } catch {
      return null
    }
  }

  /**
   * Extract supplier name from nested extraction result fields.
   */
  private getExtractedSupplierName(extraction: OcrExtractionResult): string | null {
    switch (extraction.documentType) {
      case 'flight_confirmation':
        return extraction.flight?.airline || null
      case 'hotel_confirmation':
        return extraction.lodging?.propertyName || null
      case 'cruise_confirmation':
        return extraction.cruise?.cruiseLineName || null
      case 'transportation_confirmation':
        return extraction.transportation?.companyName || null
      case 'dining_confirmation':
        return extraction.dining?.restaurantName || null
      case 'package_confirmation':
        return extraction.package?.supplierName || null
      default:
        return null
    }
  }

  /**
   * Simple contact matching for async path — finds existing contacts by name.
   * Mirrors OcrImportService.matchTravelersToContacts but uses agencyId directly.
   */
  private async matchTravelersToContacts(
    travelers: OcrExtractionResult['travelers'],
    agencyId: string,
  ): Promise<unknown[]> {
    if (!travelers?.length) return []

    const { contacts } = schema
    const matches = []

    for (const traveler of travelers) {
      if (!traveler.firstName || !traveler.lastName) continue
      try {
        const firstName = this.titleCase(traveler.firstName)
        const lastName = this.titleCase(traveler.lastName)

        const [existing] = await this.db.client
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.agencyId, agencyId),
              eq(contacts.firstName, firstName),
              eq(contacts.lastName, lastName),
            ),
          )
          .limit(1)

        matches.push({
          traveler: { firstName, lastName, dateOfBirth: traveler.dateOfBirth || null },
          existingContact: existing || null,
          matchType: existing ? 'exact' : 'none',
        })
      } catch {
        matches.push({
          traveler: { firstName: traveler.firstName, lastName: traveler.lastName },
          existingContact: null,
          matchType: 'none',
        })
      }
    }
    return matches
  }

  private titleCase(name: string): string {
    return name
      .toLowerCase()
      .replace(/(?:^|\s|-)(\w)/g, (match) => match.toUpperCase())
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
