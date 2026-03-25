/**
 * Automation Job History Schema
 *
 * Permanent audit trail for automation jobs.
 * Redis has TTL on jobs, so this table provides long-term history.
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { trips } from './trips.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const automationJobStatusEnum = pgEnum('automation_job_status', [
  'queued',
  'processing',
  'completed',
  'failed',
  'paused',
  'cancelled',
])

// ============================================================================
// TABLE: automation_job_history
// ============================================================================

export const automationJobHistory = pgTable('automation_job_history', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Job Identification
  queueName: varchar('queue_name', { length: 50 }).notNull(),
  jobId: varchar('job_id', { length: 100 }).notNull(),
  jobType: varchar('job_type', { length: 100 }).notNull(),

  // Job Data
  jobData: jsonb('job_data').notNull().$type<Record<string, unknown>>(),

  // Status
  status: automationJobStatusEnum('status').notNull(),
  errorMessage: text('error_message'),

  // Trip association
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),

  // Timing
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by'),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AutomationJobHistory = typeof automationJobHistory.$inferSelect
export type NewAutomationJobHistory = typeof automationJobHistory.$inferInsert
export type AutomationJobStatus = (typeof automationJobStatusEnum.enumValues)[number]
