/**
 * Tags Schema
 *
 * Multi-tenant, type-aware tagging system for organizing trips, contacts,
 * tasks, calendar events, emails, and other entities.
 *
 * Tag types:
 * - system: Admin-managed, visible to all agents in the agency (read-only for agents)
 * - agent: Private to the creating agent, only they can see/edit
 */

import { pgTable, uuid, varchar, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'
import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'
import { trips } from './trips.schema'
import { contacts } from './contacts.schema'
import { calendarEvents } from './calendar-events.schema'
import { emailLogs } from './email.schema'

/**
 * Tags Table
 * Central repository of all tags, scoped to agency with type awareness
 */
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }), // e.g., 'trip-type', 'client-status', 'custom'
  color: varchar('color', { length: 7 }), // Hex color like #8B5CF6
  agencyId: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 10 }).notNull().default('system'), // 'system' | 'agent'
  createdBy: uuid('created_by').references(() => userProfiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('idx_tags_name').on(table.name),
  agencyIdx: index('idx_tags_agency').on(table.agencyId),
  typeIdx: index('idx_tags_type').on(table.type),
}))

/**
 * Trip Tags Junction Table
 * Many-to-many relationship between trips and tags
 */
export const tripTags = pgTable('trip_tags', {
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tripId, table.tagId] }),
  tripIdIdx: index('idx_trip_tags_trip_id').on(table.tripId),
  tagIdIdx: index('idx_trip_tags_tag_id').on(table.tagId),
}))

/**
 * Contact Tags Junction Table
 * Many-to-many relationship between contacts and tags
 */
export const contactTags = pgTable('contact_tags', {
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.contactId, table.tagId] }),
  contactIdIdx: index('idx_contact_tags_contact_id').on(table.contactId),
  tagIdIdx: index('idx_contact_tags_tag_id').on(table.tagId),
}))

/**
 * Calendar Event Tags Junction Table
 * Many-to-many relationship between calendar events and tags
 */
export const calendarEventTags = pgTable('calendar_event_tags', {
  calendarEventId: uuid('calendar_event_id').notNull().references(() => calendarEvents.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.calendarEventId, table.tagId] }),
  eventIdIdx: index('idx_calendar_event_tags_event').on(table.calendarEventId),
  tagIdIdx: index('idx_calendar_event_tags_tag').on(table.tagId),
}))

/**
 * Email Log Tags Junction Table
 * Many-to-many relationship between email logs and tags
 */
export const emailLogTags = pgTable('email_log_tags', {
  emailLogId: uuid('email_log_id').notNull().references(() => emailLogs.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.emailLogId, table.tagId] }),
  emailIdIdx: index('idx_email_log_tags_email').on(table.emailLogId),
  tagIdIdx: index('idx_email_log_tags_tag').on(table.tagId),
}))
