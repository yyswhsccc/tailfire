/**
 * Consumer Insights Schema
 *
 * Stores AI-generated summaries and purchase signals derived from
 * consumer browsing activity and AI concierge conversations.
 */

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { contacts } from './contacts.schema'

// ============================================================================
// TABLE: consumer_insights
// ============================================================================

export const consumerInsights = pgTable(
  'consumer_insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id),
    type: text('type').notNull(), // ai_conversation_summary, purchase_signal, browsing_pattern
    summary: text('summary'),
    facts: jsonb('facts'),
    metadata: jsonb('metadata'), // messageCount, toolsUsed, sessionDuration
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_consumer_insights_contact').on(table.contactId),
  ],
)

// ============================================================================
// TypeScript types
// ============================================================================

export type ConsumerInsight = typeof consumerInsights.$inferSelect
export type NewConsumerInsight = typeof consumerInsights.$inferInsert
