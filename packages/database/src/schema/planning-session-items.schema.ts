/**
 * Planning Session Items Schema
 *
 * Stores saved/hearted items in the journey tracker. Each item represents
 * a product (sailing, tour, destination, etc.) that a visitor has expressed
 * interest in during a planning session.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { planningSessions } from './planning-sessions.schema'

// ============================================================================
// TABLE: planning_session_items
// ============================================================================

export const planningSessionItems = pgTable('planning_session_items', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // FK → planning_sessions (cascade delete when session is removed)
  sessionId: uuid('session_id')
    .notNull()
    .references(() => planningSessions.id, { onDelete: 'cascade' }),

  // Entity type discriminator
  // CHECK (entity_type IN ('sailing','tour','destination','hotel','flight','activity','cruise_line','ship'))
  // — enforced in migration SQL
  entityType: text('entity_type').notNull(),

  // The ID or slug of the referenced entity
  entityId: text('entity_id').notNull(),

  // Display name (denormalized for fast rendering without FK joins)
  name: text('name').notNull(),

  // Thumbnail image URL
  thumbnailUrl: text('thumbnail_url'),

  // Whether the visitor has hearted/favorited this item
  hearted: boolean('hearted').default(false),

  // Optional agent/visitor notes on this item
  notes: text('notes'),

  // Flexible metadata (prices, dates, cabin categories, etc.)
  metadata: jsonb('metadata').default({}),

  // Timestamp
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index('planning_session_items_session_id_idx').on(
    table.sessionId,
  ),
  entityTypeIdx: index('planning_session_items_entity_type_idx').on(
    table.entityType,
  ),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const planningSessionItemsRelations = relations(
  planningSessionItems,
  ({ one }) => ({
    session: one(planningSessions, {
      fields: [planningSessionItems.sessionId],
      references: [planningSessions.id],
    }),
  }),
)

// ============================================================================
// TypeScript types
// ============================================================================

export type PlanningSessionItem = typeof planningSessionItems.$inferSelect
export type NewPlanningSessionItem = typeof planningSessionItems.$inferInsert
