/**
 * Client Portal Users Schema
 *
 * Maps Supabase client auth users to existing contacts records.
 * Enables clients (travelers) to access the portal and view/approve itineraries.
 */

import { pgTable, uuid, varchar, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { contacts } from './contacts.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const clientPortalStatusEnum = pgEnum('client_portal_status', [
  'invited',
  'active',
  'disabled',
])

// ============================================================================
// TABLE: client_portal_users
// ============================================================================

export const clientPortalUsers = pgTable('client_portal_users', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Supabase auth user (created at invite time via admin.createUser)
  supabaseUserId: uuid('supabase_user_id').notNull().unique(),

  // Agency scoping (for RLS)
  agencyId: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'restrict' }),

  // Link to existing contact record
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),

  // Denormalized for quick lookup
  email: varchar('email', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),

  // Status
  status: clientPortalStatusEnum('status').default('invited').notNull(),

  // Invite token security (SHA-256 hash, not plaintext)
  inviteTokenHash: varchar('invite_token_hash', { length: 128 }),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  inviteConsumedAt: timestamp('invite_consumed_at', { withTimezone: true }),

  // Invite tracking
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow(),
  invitedBy: uuid('invited_by'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueContactAgency: unique('unique_contact_agency').on(table.contactId, table.agencyId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const clientPortalUsersRelations = relations(clientPortalUsers, ({ one }) => ({
  agency: one(agencies, {
    fields: [clientPortalUsers.agencyId],
    references: [agencies.id],
  }),
  contact: one(contacts, {
    fields: [clientPortalUsers.contactId],
    references: [contacts.id],
  }),
}))
