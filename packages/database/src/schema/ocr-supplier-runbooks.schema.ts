/**
 * OCR Supplier Runbooks Schema
 *
 * Stores per-supplier, per-document-type extraction hints for the OCR system.
 * Global scope (no agency_id) since supplier invoice formats don't vary by agency.
 */

import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const ocrSupplierRunbooks = pgTable(
  'ocr_supplier_runbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierName: varchar('supplier_name', { length: 255 }).notNull(),
    documentType: varchar('document_type', { length: 100 }).notNull(),
    extractionHints: text('extraction_hints').notNull(),
    exampleFields: jsonb('example_fields'),
    successCount: integer('success_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplierDocTypeUnique: uniqueIndex('idx_ocr_supplier_runbooks_unique').on(
      table.supplierName,
      table.documentType,
    ),
    lookupIdx: index('idx_ocr_supplier_runbooks_lookup').on(
      table.supplierName,
      table.documentType,
    ),
  }),
)

export type OcrSupplierRunbook = typeof ocrSupplierRunbooks.$inferSelect
export type NewOcrSupplierRunbook = typeof ocrSupplierRunbooks.$inferInsert
