/**
 * Trip Shares Schema
 *
 * Implements explicit sharing of trips between users within an agency.
 * This is separate from trip_collaborators which handles commission splits.
 * trip_shares is for access control only.
 */

import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { trips } from './trips.schema'

// ============================================================================
// TABLE: trip_shares
// ============================================================================

export const tripShares = pgTable('trip_shares', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  sharedWithUserId: uuid('shared_with_user_id').notNull(),

  // Agency Association (required for RLS)
  agencyId: uuid('agency_id').notNull(),

  // Access Level: 'read' = view only, 'write' = can modify
  accessLevel: varchar('access_level', { length: 10 }).notNull().default('read'),

  // Sharing metadata
  sharedBy: uuid('shared_by').notNull(),
  sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),

  // Extended sharing (group bookings, vacation coverage, expiry)
  reason: text('reason'),
  scopedContactId: uuid('scoped_contact_id'),
  grantedBy: uuid('granted_by'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Constraint: A trip can only be shared once with a specific user
  uniqueTripShare: unique('unique_trip_share').on(table.tripId, table.sharedWithUserId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const tripSharesRelations = relations(tripShares, ({ one }) => ({
  trip: one(trips, {
    fields: [tripShares.tripId],
    references: [trips.id],
  }),
}))
