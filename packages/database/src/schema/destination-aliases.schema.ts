/**
 * Destination Aliases Schema
 *
 * Multiple names per destination — handles alternate spellings,
 * transliterations, and locale-specific names for fuzzy matching.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { destinations } from './destinations.schema'

// ============================================================================
// TABLE: destination_aliases
// ============================================================================

export const destinationAliases = pgTable('destination_aliases', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Parent destination
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),

  // Alias text and normalized version for matching
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),

  // Locale (ISO 639-1)
  locale: text('locale').notNull().default('en'),

  // Where this alias came from (e.g., 'cruise_port', 'tour_operator', 'manual', 'serpapi')
  source: text('source').notNull(),

  // Whether this is the primary/canonical alias for this locale
  isPrimary: boolean('is_primary').notNull().default(false),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  destinationIdx: index('destination_aliases_destination_idx').on(table.destinationId),
  normalizedIdx: index('destination_aliases_normalized_idx').on(table.normalizedAlias),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const destinationAliasesRelations = relations(destinationAliases, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationAliases.destinationId],
    references: [destinations.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type DestinationAlias = typeof destinationAliases.$inferSelect
export type NewDestinationAlias = typeof destinationAliases.$inferInsert
