/**
 * Email Attachments Schema
 *
 * Stores attachment metadata for synced emails.
 * Actual file content is fetched on-demand from IMAP and cached in storage.
 */

import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { syncedEmails } from './synced-emails.schema'

export const emailAttachments = pgTable('email_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').notNull().references(() => syncedEmails.id, { onDelete: 'cascade' }),

  // Attachment info
  filename: varchar('filename', { length: 500 }),
  contentType: varchar('content_type', { length: 255 }),
  sizeBytes: integer('size_bytes'),
  contentId: varchar('content_id', { length: 255 }), // for inline images (CID)
  isInline: boolean('is_inline').notNull().default(false),

  // IMAP part reference (for on-demand fetch)
  imapPartId: varchar('imap_part_id', { length: 100 }),

  // Cached storage (populated on first access)
  storagePath: text('storage_path'),
  storageUrl: text('storage_url'),
  isCached: boolean('is_cached').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const emailAttachmentsRelations = relations(emailAttachments, ({ one }) => ({
  email: one(syncedEmails, {
    fields: [emailAttachments.emailId],
    references: [syncedEmails.id],
  }),
}))

export type EmailAttachment = typeof emailAttachments.$inferSelect
export type NewEmailAttachment = typeof emailAttachments.$inferInsert
