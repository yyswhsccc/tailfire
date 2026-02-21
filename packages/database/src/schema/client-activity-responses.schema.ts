/**
 * Client Activity Responses Schema
 *
 * Per-activity confirm/decline from clients against a specific published version.
 * Activity IDs reference snapshot data (no FK - may not exist in live tables).
 */

import { pgTable, pgEnum, uuid, integer, varchar, text, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

import { trips, itineraries } from './trips.schema'
import { contacts } from './contacts.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const clientActivityResponseTypeEnum = pgEnum('client_activity_response_type', [
  'confirmed',
  'declined',
])

// ============================================================================
// TABLE: client_activity_responses
// ============================================================================

export const clientActivityResponses = pgTable(
  'client_activity_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),

    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),

    activityId: uuid('activity_id').notNull(), // No FK — snapshot activity

    versionNumber: integer('version_number').notNull(),

    response: clientActivityResponseTypeEnum('response').notNull(),

    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    contactName: varchar('contact_name', { length: 255 }).notNull(),

    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.itineraryId, table.activityId, table.versionNumber),
    index('idx_car_itinerary_version').on(table.itineraryId, table.versionNumber),
    index('idx_car_trip').on(table.tripId),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const clientActivityResponsesRelations = relations(clientActivityResponses, ({ one }) => ({
  trip: one(trips, {
    fields: [clientActivityResponses.tripId],
    references: [trips.id],
  }),
  itinerary: one(itineraries, {
    fields: [clientActivityResponses.itineraryId],
    references: [itineraries.id],
  }),
  contact: one(contacts, {
    fields: [clientActivityResponses.contactId],
    references: [contacts.id],
  }),
}))
