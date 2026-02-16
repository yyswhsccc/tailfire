/**
 * Calendar Events Schema
 *
 * Standalone calendar events (meetings, calls, follow-ups) that can be
 * linked to contacts and/or trips. Unlike other calendar sources (tasks,
 * payments, birthdays), these are first-class persisted events.
 */

import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'
import { contacts } from './contacts.schema'
import { trips } from './trips.schema'

// ============================================================================
// TABLE: calendar_events
// ============================================================================

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Timing
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    allDay: boolean('all_day').default(false).notNull(),

    // Sub-type classification
    eventType: varchar('event_type', { length: 50 }).notNull().default('meeting'),

    // Entity references (both optional, both can be set)
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'cascade',
    }),
    tripId: uuid('trip_id').references(() => trips.id, {
      onDelete: 'cascade',
    }),

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
    // Range queries by agency
    index('idx_calendar_events_agency_start')
      .on(table.agencyId, table.startAt),
    // Contact events
    index('idx_calendar_events_contact_start')
      .on(table.contactId, table.startAt)
      .where(sql`${table.contactId} IS NOT NULL`),
    // Trip events
    index('idx_calendar_events_trip_start')
      .on(table.tripId, table.startAt)
      .where(sql`${table.tripId} IS NOT NULL`),
  ]
)

// ============================================================================
// RELATIONS
// ============================================================================

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  agency: one(agencies, {
    fields: [calendarEvents.agencyId],
    references: [agencies.id],
  }),
  contact: one(contacts, {
    fields: [calendarEvents.contactId],
    references: [contacts.id],
  }),
  trip: one(trips, {
    fields: [calendarEvents.tripId],
    references: [trips.id],
  }),
  createdByUser: one(userProfiles, {
    fields: [calendarEvents.createdBy],
    references: [userProfiles.id],
    relationName: 'calendarEventCreator',
  }),
  updatedByUser: one(userProfiles, {
    fields: [calendarEvents.updatedBy],
    references: [userProfiles.id],
    relationName: 'calendarEventUpdater',
  }),
}))
