/**
 * Email System Schema
 *
 * Implements email logging and templating for trip confirmations and notifications.
 * MVP approach: Send + Log + Templates (Phases A & B)
 */

import { pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { trips } from './trips.schema'
import { contacts } from './contacts.schema'
import { itineraryActivities } from './activities.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const emailStatusEnum = pgEnum('email_status', [
  'pending',
  'sent',
  'failed',
  'filtered'
])

export const emailCategoryEnum = pgEnum('email_category', [
  'trip_order',
  'notification',
  'marketing',
  'system',
  'payment',      // Payment reminders
  'client_care',  // Birthday, follow-ups
])

// ============================================================================
// TABLE: email_logs
// ============================================================================

/**
 * Email Logs Table
 * Tracks all sent emails with status, provider info, and context references
 */
export const emailLogs = pgTable('email_logs', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (required for multi-tenancy)
  agencyId: uuid('agency_id').notNull(),

  // Recipients
  toEmail: text('to_email').array().notNull(), // Array of recipient emails
  ccEmail: text('cc_email').array(),
  bccEmail: text('bcc_email').array(),

  // Sender Info
  fromEmail: varchar('from_email', { length: 255 }).notNull(),
  replyTo: varchar('reply_to', { length: 255 }),

  // Content
  subject: text('subject').notNull(),
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),

  // Template Reference (null for non-templated emails)
  templateSlug: varchar('template_slug', { length: 100 }),
  variables: jsonb('variables'), // Variables used for template rendering

  // Status & Provider
  status: emailStatusEnum('status').default('pending').notNull(),
  provider: varchar('provider', { length: 50 }).default('resend'),
  providerMessageId: varchar('provider_message_id', { length: 255 }), // Resend ID
  errorMessage: text('error_message'),

  // Context References (for filtering and linking)
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  activityId: uuid('activity_id').references(() => itineraryActivities.id, { onDelete: 'set null' }),

  // Timestamps
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
}, (table) => ({
  agencyIdIdx: index('idx_email_logs_agency_id').on(table.agencyId),
  tripIdIdx: index('idx_email_logs_trip_id').on(table.tripId),
  contactIdIdx: index('idx_email_logs_contact_id').on(table.contactId),
  statusIdx: index('idx_email_logs_status').on(table.status),
  createdAtIdx: index('idx_email_logs_created_at').on(table.createdAt),
}))

// ============================================================================
// TABLE: email_templates
// ============================================================================

/**
 * Email Templates Table
 * Stores reusable email templates with variable placeholders
 */
export const emailTemplates = pgTable('email_templates', {
  // Primary Key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency Association (null for system templates)
  agencyId: uuid('agency_id'),

  // Template Identity
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),

  // Content (with variable placeholders like {{contact.first_name}})
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),

  // Variable Metadata (list of supported variables for documentation)
  variables: jsonb('variables'), // Array of variable definitions

  // Classification
  category: emailCategoryEnum('category').default('notification'),
  isSystem: boolean('is_system').default(false).notNull(), // System templates can't be deleted
  isActive: boolean('is_active').default(true).notNull(),

  // Audit Fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // FK to users
}, (table) => ({
  slugIdx: index('idx_email_templates_slug').on(table.slug),
  categoryIdx: index('idx_email_templates_category').on(table.category),
  agencyIdIdx: index('idx_email_templates_agency_id').on(table.agencyId),
}))

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  trip: one(trips, {
    fields: [emailLogs.tripId],
    references: [trips.id]
  }),
  contact: one(contacts, {
    fields: [emailLogs.contactId],
    references: [contacts.id]
  }),
  activity: one(itineraryActivities, {
    fields: [emailLogs.activityId],
    references: [itineraryActivities.id]
  }),
}))
