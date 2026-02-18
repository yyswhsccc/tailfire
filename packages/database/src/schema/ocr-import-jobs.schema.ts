/**
 * OCR Import Jobs Schema
 *
 * Stores OCR document import job state, extraction results, and preview data.
 * Supports both synchronous and async (BullMQ) processing flows.
 */

import { pgTable, uuid, varchar, text, integer, timestamp, index, jsonb, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const OCR_JOB_STATUSES = ['pending', 'processing', 'preview_ready', 'confirmed', 'failed'] as const
export type OcrJobStatusDb = (typeof OCR_JOB_STATUSES)[number]

export const ocrImportJobs = pgTable(
  'ocr_import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull(),
    userId: uuid('user_id').notNull(),

    // Job status
    status: varchar('status', { length: 20 }).notNull().default('pending'),

    // File info
    fileStoragePath: text('file_storage_path'),
    fileName: varchar('file_name', { length: 255 }),
    fileMimeType: varchar('file_mime_type', { length: 100 }),

    // Document type
    detectedDocumentType: varchar('detected_document_type', { length: 50 }),
    confirmedDocumentType: varchar('confirmed_document_type', { length: 50 }),

    // Result references (populated on confirm)
    tripId: uuid('trip_id'),
    contactId: uuid('contact_id'),
    activityId: uuid('activity_id'),

    // Extraction data (JSONB)
    extractionResult: jsonb('extraction_result'),
    enrichedResult: jsonb('enriched_result'),

    // Error tracking
    errorMessage: text('error_message'),

    // Token usage and model info
    tokensPrompt: integer('tokens_prompt'),
    tokensCompletion: integer('tokens_completion'),
    model: varchar('model', { length: 50 }),
    promptVersion: varchar('prompt_version', { length: 20 }).default('1.0'),

    // Runbook traceability
    runbookId: uuid('runbook_id'),

    // Performance tracking
    processingTimeMs: integer('processing_time_ms'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    agencyIdIdx: index('idx_ocr_import_jobs_agency_id').on(table.agencyId),
    statusIdx: index('idx_ocr_import_jobs_status').on(table.status),
    userCreatedIdx: index('idx_ocr_import_jobs_user_created').on(table.userId, table.createdAt),
    statusCheck: check(
      'ocr_import_jobs_status_check',
      sql`${table.status} IN ('pending', 'processing', 'preview_ready', 'confirmed', 'failed')`,
    ),
  }),
)

// TypeScript types
export type OcrImportJob = typeof ocrImportJobs.$inferSelect
export type NewOcrImportJob = typeof ocrImportJobs.$inferInsert
