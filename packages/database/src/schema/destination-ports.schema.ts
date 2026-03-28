/**
 * Destination Ports Schema
 *
 * Maps cruise ports to destinations. No FK on port_id because cruise_ports
 * lives in the catalog schema (FDW on dev/preview, local on prod).
 */

import { pgTable, uuid, text, numeric, boolean, timestamp, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { destinations } from './destinations.schema'

// ============================================================================
// TABLE: destination_ports
// ============================================================================

export const destinationPorts = pgTable('destination_ports', {
  // Composite PK columns
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),

  // References catalog.cruise_ports(id) — no FK due to FDW
  portId: uuid('port_id').notNull(),

  // How this match was established
  matchMethod: text('match_method').notNull(),
  // CHECK (match_method IN ('seed','exact','geo','manual')) enforced in migration SQL

  // Match confidence score (0.0000 – 1.0000)
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('1.0'),

  // Whether this is the primary port for the destination
  isPrimary: boolean('is_primary').notNull().default(true),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.destinationId, table.portId] }),
  portUnique: uniqueIndex('destination_ports_port_unique').on(table.portId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const destinationPortsRelations = relations(destinationPorts, ({ one }) => ({
  destination: one(destinations, {
    fields: [destinationPorts.destinationId],
    references: [destinations.id],
  }),
}))

// ============================================================================
// TypeScript types
// ============================================================================

export type DestinationPort = typeof destinationPorts.$inferSelect
export type NewDestinationPort = typeof destinationPorts.$inferInsert
