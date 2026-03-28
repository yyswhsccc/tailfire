/**
 * Destinations Schema
 *
 * Universal hub entity that unifies cruise ports, tour cities, and enrichment
 * data into a single addressable destination. Supports hierarchical parent/child
 * relationships (e.g., port_city → country → region).
 */

import { pgTable, uuid, text, varchar, numeric, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================================================
// TABLE: destinations
// ============================================================================

export const destinations = pgTable('destinations', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // URL-friendly unique identifier
  slug: text('slug').unique().notNull(),

  // Display name and normalized (lowercased, ASCII-folded) version for matching
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),

  // Classification
  destinationType: text('destination_type').notNull(),
  // CHECK (destination_type IN ('city','port_city','island','region','country','resort_area'))
  // enforced in migration SQL

  // Geography
  countryCode: varchar('country_code', { length: 2 }),
  adminArea: text('admin_area'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),

  // Hierarchy (self-referencing)
  parentDestinationId: uuid('parent_destination_id'),
  // FK to destinations(id) enforced in migration SQL (self-reference)

  // Curation workflow
  sourceStatus: text('source_status').notNull().default('seeded'),
  // CHECK (source_status IN ('seeded','matched','reviewed','hidden'))

  contentStatus: text('content_status').notNull().default('seeded'),
  // CHECK (content_status IN ('seeded','enriched','reviewed','published'))

  // Content
  summary: text('summary'),
  heroImageUrl: text('hero_image_url'),

  // Extensible metadata (SerpAPI enrichment, weather, visa info, etc.)
  metadata: jsonb('metadata').notNull().default({}),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  normalizedNameIdx: index('destinations_normalized_name_idx').on(table.normalizedName, table.countryCode),
  typeIdx: index('destinations_type_idx').on(table.destinationType),
  slugIdx: index('destinations_slug_idx').on(table.slug),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const destinationsRelations = relations(destinations, ({ one, many }) => ({
  parent: one(destinations, {
    fields: [destinations.parentDestinationId],
    references: [destinations.id],
    relationName: 'parentChild',
  }),
  children: many(destinations, {
    relationName: 'parentChild',
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type Destination = typeof destinations.$inferSelect
export type NewDestination = typeof destinations.$inferInsert
