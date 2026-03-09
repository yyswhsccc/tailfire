/**
 * Notes Schema
 *
 * Central notes table for internal agent notes on contacts, trips, and other entities.
 * Uses separate FK columns (not polymorphic) for referential integrity with CASCADE.
 */

import { pgTable, uuid, text, boolean, timestamp, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'
import { trips, tripGroups } from './trips.schema'
import { contacts } from './contacts.schema'

// ============================================================================
// TABLE: notes
// ============================================================================

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    content: text('content').notNull(),

    // Entity references (exactly one must be set)
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'cascade',
    }),
    tripGroupId: uuid('trip_group_id').references(() => tripGroups.id, { onDelete: 'cascade' }),

    isPinned: boolean('is_pinned').default(false).notNull(),

    // Audit fields
    createdBy: uuid('created_by')
      .notNull()
      .references(() => userProfiles.id),
    updatedBy: uuid('updated_by').references(() => userProfiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Composite indexes for sorted queries
    index('idx_notes_contact_pinned_created')
      .on(table.contactId, table.isPinned, table.createdAt)
      .where(sql`${table.contactId} IS NOT NULL`),
    index('idx_notes_trip_pinned_created')
      .on(table.tripId, table.isPinned, table.createdAt)
      .where(sql`${table.tripId} IS NOT NULL`),
    index('idx_notes_trip_group_pinned_created')
      .on(table.tripGroupId, table.isPinned, table.createdAt)
      .where(sql`${table.tripGroupId} IS NOT NULL`),
    // CHECK: exactly one entity FK must be set
    check(
      'notes_entity_check',
      sql`(CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN trip_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1`
    ),
  ]
)

// ============================================================================
// RELATIONS
// ============================================================================

export const notesRelations = relations(notes, ({ one }) => ({
  agency: one(agencies, {
    fields: [notes.agencyId],
    references: [agencies.id],
  }),
  trip: one(trips, {
    fields: [notes.tripId],
    references: [trips.id],
  }),
  contact: one(contacts, {
    fields: [notes.contactId],
    references: [contacts.id],
  }),
  tripGroup: one(tripGroups, {
    fields: [notes.tripGroupId],
    references: [tripGroups.id],
  }),
  createdByUser: one(userProfiles, {
    fields: [notes.createdBy],
    references: [userProfiles.id],
    relationName: 'noteCreator',
  }),
  updatedByUser: one(userProfiles, {
    fields: [notes.updatedBy],
    references: [userProfiles.id],
    relationName: 'noteUpdater',
  }),
}))
