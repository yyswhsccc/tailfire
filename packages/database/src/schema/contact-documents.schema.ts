/**
 * Contact Documents Schema
 *
 * Documents associated with contacts (passports, visas, IDs, insurance, etc.)
 */

import { pgTable, uuid, varchar, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { contacts } from './contacts.schema'

// Valid contact document types
export const VALID_CONTACT_DOCUMENT_TYPES = [
  'passport',
  'visa',
  'id_document',
  'travel_insurance',
  'medical',
  'contract',
  'invoice',
  'receipt',
  'authorization',
  'other',
] as const

export type ContactDocumentType = (typeof VALID_CONTACT_DOCUMENT_TYPES)[number]

export const contactDocuments = pgTable(
  'contact_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),

    documentType: varchar('document_type', { length: 100 }),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size'), // Size in bytes

    // Audit fields
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by'),
  },
  (table) => ({
    contactIdIdx: index('idx_contact_documents_contact_id').on(table.contactId),
    documentTypeIdx: index('idx_contact_documents_document_type').on(table.documentType),
    documentTypeCheck: check(
      'contact_documents_type_check',
      sql`${table.documentType} IS NULL OR ${table.documentType} IN ('passport', 'visa', 'id_document', 'travel_insurance', 'medical', 'contract', 'invoice', 'receipt', 'authorization', 'other')`
    ),
  })
)

// Relations
export const contactDocumentsRelations = relations(contactDocuments, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactDocuments.contactId],
    references: [contacts.id],
  }),
}))

// TypeScript types
export type ContactDocument = typeof contactDocuments.$inferSelect
export type NewContactDocument = typeof contactDocuments.$inferInsert
