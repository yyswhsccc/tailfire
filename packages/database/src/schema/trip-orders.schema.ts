/**
 * Trip Orders Schema
 *
 * Stores Trip Order JSON snapshots with versioning for invoice generation.
 * Each trip can have multiple versions of Trip Orders (draft -> finalized -> sent).
 */

import { pgTable, uuid, integer, timestamp, pgEnum, jsonb, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { trips } from './trips.schema'
import { emailLogs } from './email.schema'
import { documentTemplates } from './document-templates.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const tripOrderStatusEnum = pgEnum('trip_order_status', [
  'draft',
  'finalized',
  'sent'
])

// ============================================================================
// TABLE: trip_orders
// ============================================================================

/**
 * Trip Orders Table
 * Stores immutable JSON snapshots of trip orders with versioning
 */
export const tripOrders = pgTable('trip_orders', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign Keys
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull(),

  // Versioning
  versionNumber: integer('version_number').notNull().default(1),

  // JSON Snapshots (immutable once created)
  orderData: jsonb('order_data').notNull(), // TICOTripOrder structure
  paymentSummary: jsonb('payment_summary'), // TripOrderPaymentSummary
  bookingDetails: jsonb('booking_details'), // TripOrderBookingDetail[]
  businessConfig: jsonb('business_config'), // BusinessConfiguration

  // Status Workflow: draft -> finalized -> sent
  status: tripOrderStatusEnum('status').default('draft').notNull(),

  // Timestamps for workflow tracking
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),

  // Audit: who performed each action
  createdBy: uuid('created_by'), // FK to users
  finalizedBy: uuid('finalized_by'), // FK to users
  sentBy: uuid('sent_by'), // FK to users

  // Link to email log when sent
  emailLogId: uuid('email_log_id').references(() => emailLogs.id, { onDelete: 'set null' }),

  // Template pinning (snapshot which template version was used)
  templateId: uuid('template_id'),
  templateVersion: integer('template_version'),
}, (table) => ({
  // Indexes
  tripIdIdx: index('idx_trip_orders_trip_id').on(table.tripId),
  agencyIdIdx: index('idx_trip_orders_agency_id').on(table.agencyId),
  statusIdx: index('idx_trip_orders_status').on(table.status),
  createdAtIdx: index('idx_trip_orders_created_at').on(table.createdAt),
  // Unique constraint
  uniqueTripVersion: unique('unique_trip_version').on(table.tripId, table.versionNumber),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const tripOrdersRelations = relations(tripOrders, ({ one }) => ({
  trip: one(trips, {
    fields: [tripOrders.tripId],
    references: [trips.id]
  }),
  emailLog: one(emailLogs, {
    fields: [tripOrders.emailLogId],
    references: [emailLogs.id]
  }),
  documentTemplate: one(documentTemplates, {
    fields: [tripOrders.templateId],
    references: [documentTemplates.id]
  }),
}))
