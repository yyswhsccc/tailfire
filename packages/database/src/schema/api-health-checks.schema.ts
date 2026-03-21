/**
 * API Health Checks Schema
 *
 * Stores periodic health check results for all external API providers.
 * Used by the API Health Dashboard to display provider status.
 * Retention: 7 days, cleaned up by daily BullMQ job.
 */

import { pgTable, uuid, varchar, boolean, integer, text, timestamp, index } from 'drizzle-orm/pg-core'

// ============================================================================
// TABLE: api_health_checks
// ============================================================================

export const apiHealthChecks = pgTable(
  'api_health_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 50 }).notNull(),
    success: boolean('success').notNull(),
    responseMs: integer('response_ms'),
    error: text('error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ahc_provider_time').on(table.provider, table.checkedAt),
  ],
)

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ApiHealthCheck = typeof apiHealthChecks.$inferSelect
export type NewApiHealthCheck = typeof apiHealthChecks.$inferInsert
