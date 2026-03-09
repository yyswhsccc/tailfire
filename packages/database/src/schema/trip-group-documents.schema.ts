/**
 * Trip Group Documents Schema
 *
 * Documents (PDFs, contracts, etc.) associated with trip groups.
 */

import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tripGroups } from './trips.schema'

export const tripGroupDocuments = pgTable(
  'trip_group_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripGroupId: uuid('trip_group_id')
      .notNull()
      .references(() => tripGroups.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 100 }),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by'),
  },
  (table) => [
    index('idx_trip_group_documents_group').on(table.tripGroupId),
  ]
)

export const tripGroupDocumentsRelations = relations(tripGroupDocuments, ({ one }) => ({
  tripGroup: one(tripGroups, {
    fields: [tripGroupDocuments.tripGroupId],
    references: [tripGroups.id],
  }),
}))

export type TripGroupDocument = typeof tripGroupDocuments.$inferSelect
export type NewTripGroupDocument = typeof tripGroupDocuments.$inferInsert
