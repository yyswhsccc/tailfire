/**
 * Planning Session Messages Schema
 *
 * Stores the AI Concierge conversation transcript. Each message (user,
 * assistant, system, or tool) is a row, enabling full replay and
 * context reconstruction for any planning session.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { planningSessions } from './planning-sessions.schema'

// ============================================================================
// TABLE: planning_session_messages
// ============================================================================

export const planningSessionMessages = pgTable('planning_session_messages', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // FK → planning_sessions (cascade delete when session is removed)
  sessionId: uuid('session_id')
    .notNull()
    .references(() => planningSessions.id, { onDelete: 'cascade' }),

  // Message role
  // CHECK (role IN ('user','assistant','system','tool')) — enforced in migration SQL
  role: text('role').notNull(),

  // Message text content
  content: text('content').notNull(),

  // Tool call fields (populated when role = 'tool')
  toolName: text('tool_name'),
  toolArgs: jsonb('tool_args'),
  toolResult: jsonb('tool_result'),

  // Token accounting
  tokenCount: integer('token_count'),

  // Model that generated this message (e.g., 'gpt-4o-mini')
  modelId: text('model_id'),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  // Primary retrieval pattern: all messages for a session in chronological order
  sessionCreatedIdx: index('planning_session_messages_session_created_idx').on(
    table.sessionId,
    table.createdAt,
  ),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const planningSessionMessagesRelations = relations(
  planningSessionMessages,
  ({ one }) => ({
    session: one(planningSessions, {
      fields: [planningSessionMessages.sessionId],
      references: [planningSessions.id],
    }),
  }),
)

// ============================================================================
// TypeScript types
// ============================================================================

export type PlanningSessionMessage = typeof planningSessionMessages.$inferSelect
export type NewPlanningSessionMessage =
  typeof planningSessionMessages.$inferInsert
