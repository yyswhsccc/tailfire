/**
 * Proposal Comments Schema
 *
 * Per-activity and per-day commenting on shared trip proposals.
 * Supports both client (via share token) and agent (authenticated) comments.
 * Activity and day IDs may reference snapshot entities (no FK constraints).
 */

import { pgTable, pgEnum, uuid, integer, text, varchar, boolean, timestamp, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

import { trips, itineraries } from './trips.schema'
import { contacts } from './contacts.schema'
import { userProfiles } from './user-profiles.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const proposalCommentAuthorTypeEnum = pgEnum('proposal_comment_author_type', [
  'client',
  'agent',
])

// ============================================================================
// TABLE: proposal_comments
// ============================================================================

export const proposalComments = pgTable(
  'proposal_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),

    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),

    // No FK — may reference snapshot activity IDs that no longer exist in live tables
    activityId: uuid('activity_id'),

    // No FK — may reference snapshot day IDs
    dayId: uuid('day_id'),

    // Published version this comment is scoped to (server-set)
    versionNumber: integer('version_number'),

    authorType: proposalCommentAuthorTypeEnum('author_type').notNull(),

    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),

    userId: uuid('user_id').references(() => userProfiles.id, {
      onDelete: 'set null',
    }),

    authorName: varchar('author_name', { length: 255 }).notNull(),
    content: text('content').notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_proposal_comments_trip_id').on(table.tripId),
    index('idx_proposal_comments_itinerary_id').on(table.itineraryId),
    index('idx_proposal_comments_activity_id').on(table.activityId),
    index('idx_proposal_comments_day_id').on(table.dayId),
    index('idx_proposal_comments_version').on(table.itineraryId, table.versionNumber),
    check(
      'chk_author_refs',
      sql`(${table.authorType} = 'client' AND ${table.contactId} IS NOT NULL AND ${table.userId} IS NULL) OR (${table.authorType} = 'agent' AND ${table.userId} IS NOT NULL AND ${table.contactId} IS NULL)`,
    ),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const proposalCommentsRelations = relations(proposalComments, ({ one }) => ({
  trip: one(trips, {
    fields: [proposalComments.tripId],
    references: [trips.id],
  }),
  itinerary: one(itineraries, {
    fields: [proposalComments.itineraryId],
    references: [itineraries.id],
  }),
  contact: one(contacts, {
    fields: [proposalComments.contactId],
    references: [contacts.id],
  }),
  user: one(userProfiles, {
    fields: [proposalComments.userId],
    references: [userProfiles.id],
  }),
}))
