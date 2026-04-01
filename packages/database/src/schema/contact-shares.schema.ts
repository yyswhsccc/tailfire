/**
 * Contact Shares Schema
 *
 * Implements explicit sharing of contacts between users within an agency.
 * Supports basic (name, email, phone) and full (all sensitive fields) access levels.
 */

import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { contacts } from './contacts.schema'

// ============================================================================
// TABLE: contact_shares
// ============================================================================

export const contactShares = pgTable('contact_shares', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  sharedWithUserId: uuid('shared_with_user_id').notNull(),

  // Agency Association (required for RLS)
  agencyId: uuid('agency_id').notNull(),

  // Access Level: 'basic' = name/email/phone only, 'full' = all fields including sensitive
  accessLevel: varchar('access_level', { length: 10 }).notNull().default('basic'),

  // Sharing metadata
  sharedBy: uuid('shared_by').notNull(),
  sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),

  // Extended sharing (group bookings, vacation coverage, expiry)
  reason: text('reason'),
  grantedBy: uuid('granted_by'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Constraint: A contact can only be shared once with a specific user
  uniqueContactShare: unique('unique_contact_share').on(table.contactId, table.sharedWithUserId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const contactSharesRelations = relations(contactShares, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactShares.contactId],
    references: [contacts.id],
  }),
}))
