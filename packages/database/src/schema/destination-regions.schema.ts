/**
 * Destination Regions Schema
 *
 * Maps cruise regions to destinations. No FK on cruise_region_id because
 * cruise_regions lives in the catalog schema (FDW on dev/preview, local on prod).
 */

import { pgTable, uuid, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { destinations } from './destinations.schema'

// ============================================================================
// TABLE: destination_regions
// ============================================================================

export const destinationRegions = pgTable('destination_regions', {
  // Composite PK columns
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),

  // References catalog.cruise_regions(id) — no FK due to FDW
  cruiseRegionId: uuid('cruise_region_id').notNull(),

  // Whether this is the primary region for the destination
  isPrimary: boolean('is_primary').notNull().default(false),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.destinationId, table.cruiseRegionId] }),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const destinationRegionsRelations = relations(destinationRegions, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationRegions.destinationId],
    references: [destinations.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type DestinationRegion = typeof destinationRegions.$inferSelect
export type NewDestinationRegion = typeof destinationRegions.$inferInsert
