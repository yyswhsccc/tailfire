/**
 * Consumer Activity Schema
 *
 * Tracks OTA browsing events (page views, searches, board saves, AI chat starts)
 * keyed by sessionId. contactId is backfilled when identity links on registration.
 */

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'

// ============================================================================
// TABLE: consumer_activity
// ============================================================================

export const consumerActivity = pgTable(
  'consumer_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id').notNull(),
    contactId: uuid('contact_id').references(() => contacts.id),
    event: text('event').notNull(), // page_view, search, ai_chat_start, board_save
    entityType: text('entity_type'), // destination, ship, cruise_line, sailing, region, deal
    entitySlug: text('entity_slug'),
    entityName: text('entity_name'),
    searchQuery: jsonb('search_query'), // { destination, dates, cruiseLine, resultCount }
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_consumer_activity_session').on(table.sessionId),
    index('idx_consumer_activity_contact').on(table.contactId),
    index('idx_consumer_activity_created').on(table.createdAt),
  ],
)

// ============================================================================
// TypeScript types
// ============================================================================

export type ConsumerActivity = typeof consumerActivity.$inferSelect
export type NewConsumerActivity = typeof consumerActivity.$inferInsert
