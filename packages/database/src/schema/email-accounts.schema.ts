/**
 * Email Accounts Schema
 *
 * Stores IMAP/SMTP connection details for agent personal email accounts.
 * Credentials are encrypted with AES-256-GCM via EncryptionService.
 *
 * IMPORTANT: This is part of the EmailAccountsModule (agent mailbox).
 * It is completely separate from the EmailModule (Resend transactional emails).
 * Do NOT import from or reference apps/api/src/email/ in any email-accounts code.
 */

import { pgTable, uuid, varchar, boolean, timestamp, jsonb, integer, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userProfiles } from './user-profiles.schema'

export const emailAccounts = pgTable('email_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull(),

  // Display
  emailAddress: varchar('email_address', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),

  // IMAP config (encrypted credentials stored in credentials jsonb)
  imapHost: varchar('imap_host', { length: 255 }).notNull(),
  imapPort: integer('imap_port').notNull().default(993),
  imapTls: boolean('imap_tls').notNull().default(true),

  // SMTP config
  smtpHost: varchar('smtp_host', { length: 255 }).notNull(),
  smtpPort: integer('smtp_port').notNull().default(465),
  smtpTls: boolean('smtp_tls').notNull().default(true),

  // Encrypted credentials (AES-256-GCM via EncryptionService)
  // Stores: { username, password }
  credentials: jsonb('credentials').notNull(),

  // Sync state
  isActive: boolean('is_active').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  syncState: jsonb('sync_state').default({}), // { folders: { INBOX: { uidValidity, highestModSeq, lastUid } } }

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const emailAccountsRelations = relations(emailAccounts, ({ one }) => ({
  user: one(userProfiles, {
    fields: [emailAccounts.userId],
    references: [userProfiles.id],
  }),
}))

export type EmailAccount = typeof emailAccounts.$inferSelect
export type NewEmailAccount = typeof emailAccounts.$inferInsert
