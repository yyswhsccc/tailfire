/**
 * Trip Group Shares Schema
 *
 * Implements explicit sharing of trip groups between users within an agency.
 * Mirrors trip_shares but for group-level access control.
 * Includes a source column to distinguish manual shares from auto-shares
 * (created when a trip owner's trip is added to a group).
 */

import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tripGroups } from './trips.schema'

// ============================================================================
// TABLE: trip_group_shares
// ============================================================================

export const tripGroupShares = pgTable('trip_group_shares', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  tripGroupId: uuid('trip_group_id').notNull().references(() => tripGroups.id, { onDelete: 'cascade' }),
  sharedWithUserId: uuid('shared_with_user_id').notNull(),

  // Agency Association (required for RLS)
  agencyId: uuid('agency_id').notNull(),

  // Access Level: 'read' = view only, 'write' = can modify
  accessLevel: varchar('access_level', { length: 10 }).notNull().default('read'),

  // Sharing metadata
  sharedBy: uuid('shared_by').notNull(),
  sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),

  // Source: 'manual' = user-created, 'auto_trip_owner' = system-created when trip added
  source: varchar('source', { length: 20 }).notNull().default('manual'),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Constraint: A group can only be shared once with a specific user
  uniqueTripGroupShare: unique('unique_trip_group_share').on(table.tripGroupId, table.sharedWithUserId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const tripGroupSharesRelations = relations(tripGroupShares, ({ one }) => ({
  tripGroup: one(tripGroups, {
    fields: [tripGroupShares.tripGroupId],
    references: [tripGroups.id],
  }),
}))
