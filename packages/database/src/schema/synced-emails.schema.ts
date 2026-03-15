/**
 * Synced Emails Schema
 *
 * Stores email messages synced from agent IMAP accounts.
 * Body content is lazily loaded on-demand (not during background sync).
 *
 * IMAP idempotency: unique index on (email_account_id, folder, imap_uid)
 * ensures upsert-safe re-sync without duplicates.
 */

import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { emailAccounts } from './email-accounts.schema'

export const syncedEmails = pgTable('synced_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailAccountId: uuid('email_account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull(),

  // IMAP identifiers
  messageId: varchar('message_id', { length: 512 }), // RFC Message-ID header
  imapUid: integer('imap_uid'), // null for outbound emails; NOT NULL for IMAP-synced (unique partial index)
  folder: varchar('folder', { length: 255 }).notNull().default('INBOX'),

  // Threading
  inReplyTo: varchar('in_reply_to', { length: 512 }),
  referencesHeader: text('references_header'), // space-separated Message-IDs
  threadId: uuid('thread_id'), // computed thread grouping

  // Headers
  fromAddress: varchar('from_address', { length: 255 }),
  fromName: varchar('from_name', { length: 255 }),
  toAddresses: jsonb('to_addresses').default([]), // [{ address, name }]
  ccAddresses: jsonb('cc_addresses').default([]), // [{ address, name }]
  bccAddresses: jsonb('bcc_addresses').default([]), // [{ address, name }]
  subject: varchar('subject', { length: 1000 }),
  date: timestamp('date', { withTimezone: true }),

  // Body (lazily loaded — null until user opens email)
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  snippet: varchar('snippet', { length: 500 }), // first ~200 chars of text for list view

  // Flags
  isSeen: boolean('is_seen').notNull().default(false),
  isFlagged: boolean('is_flagged').notNull().default(false),
  isAnswered: boolean('is_answered').notNull().default(false),
  isDraft: boolean('is_draft').notNull().default(false),

  // Direction
  isOutbound: boolean('is_outbound').notNull().default(false),

  // Contact matching (computed on sync)
  matchedContactIds: jsonb('matched_contact_ids').default([]), // uuid[]

  // Size
  sizeBytes: integer('size_bytes'),
  hasAttachments: boolean('has_attachments').notNull().default(false),

  // Raw storage (optional — for re-parsing)
  rawStoragePath: text('raw_storage_path'),

  // Audit
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE partial index for IMAP idempotency — defined in migration SQL as partial WHERE imap_uid IS NOT NULL
  // Drizzle's uniqueIndex doesn't support partial indexes, so this is a regular index for ORM awareness
  idxUniqueImapIdentity: uniqueIndex('idx_synced_emails_unique_imap').on(table.emailAccountId, table.folder, table.imapUid),
  idxAccountFolder: index('idx_synced_emails_account_folder').on(table.emailAccountId, table.folder),
  idxMessageId: index('idx_synced_emails_message_id').on(table.messageId),
  idxDate: index('idx_synced_emails_date').on(table.date),
  idxAgency: index('idx_synced_emails_agency_id').on(table.agencyId),
  idxThreadId: index('idx_synced_emails_thread_id').on(table.threadId),
  idxMatchedContacts: index('idx_synced_emails_matched_contacts').using('gin', table.matchedContactIds),
}))

export const syncedEmailsRelations = relations(syncedEmails, ({ one }) => ({
  emailAccount: one(emailAccounts, {
    fields: [syncedEmails.emailAccountId],
    references: [emailAccounts.id],
  }),
}))

export type SyncedEmail = typeof syncedEmails.$inferSelect
export type NewSyncedEmail = typeof syncedEmails.$inferInsert
