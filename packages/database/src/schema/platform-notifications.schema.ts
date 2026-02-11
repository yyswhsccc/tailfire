/**
 * Platform Notifications Schema
 *
 * In-app notifications displayed in the Tailfire admin dashboard.
 * These are always delivered regardless of user preferences.
 */

import { pgTable, uuid, varchar, text, jsonb, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { userProfiles } from './user-profiles.schema'
import { agencies } from './agencies.schema'

/**
 * Notification status enum
 */
export const platformNotificationStatusEnum = pgEnum('platform_notification_status', [
  'unread',
  'read',
  'dismissed',
])

/**
 * Platform Notifications Table
 *
 * Stores in-app notifications for users including:
 * - Category and priority
 * - Title and body content
 * - Deep link URL for navigation
 * - Read/dismissed status tracking
 */
export const platformNotifications = pgTable(
  'platform_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // Notification content
    category: varchar('category', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),

    // Optional deep link for in-app navigation
    actionUrl: varchar('action_url', { length: 500 }),

    // Additional metadata (entity IDs, etc.)
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Status tracking
    status: platformNotificationStatusEnum('status').default('unread').notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (table) => ({
    // Primary query: unread notifications for a user
    userStatusIdx: index('platform_notifications_user_status_idx').on(table.userId, table.status),
    // For cleanup: find old notifications by agency
    agencyCreatedIdx: index('platform_notifications_agency_created_idx').on(
      table.agencyId,
      table.createdAt
    ),
  })
)

/**
 * Type inference helpers
 */
export type PlatformNotification = typeof platformNotifications.$inferSelect
export type NewPlatformNotification = typeof platformNotifications.$inferInsert
