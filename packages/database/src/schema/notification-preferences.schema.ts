/**
 * Notification Preferences Schema
 *
 * Stores per-user notification channel configurations and preferences.
 * Supports multi-channel delivery (email, push, platform/in-app).
 */

import { pgTable, uuid, boolean, jsonb, time, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { userProfiles } from './user-profiles.schema'
import { agencies } from './agencies.schema'

/**
 * Notification category types
 */
export type NotificationCategory =
  | 'payment_reminders'
  | 'trip_updates'
  | 'client_care'
  | 'booking_alerts'
  | 'system_alerts'

/**
 * Notification channel types
 */
export type NotificationChannel = 'email' | 'push' | 'platform'

/**
 * Category preferences mapping - which channels to use for each category
 */
export interface CategoryPreferences {
  payment_reminders?: NotificationChannel[]
  trip_updates?: NotificationChannel[]
  client_care?: NotificationChannel[]
  booking_alerts?: NotificationChannel[]
  system_alerts?: NotificationChannel[]
}

/**
 * Push token information for device-specific notifications
 */
export interface PushToken {
  token: string
  device: string
  platform: 'ios' | 'android' | 'web'
  createdAt: string
  lastUsed?: string
}

/**
 * Default category preferences for new users
 */
export const DEFAULT_CATEGORY_PREFERENCES: CategoryPreferences = {
  payment_reminders: ['email', 'platform'],
  trip_updates: ['email', 'push', 'platform'],
  client_care: ['email'],
  booking_alerts: ['email', 'push', 'platform'],
  system_alerts: ['platform'],
}

/**
 * Notification Preferences Table
 *
 * Stores user-level notification settings including:
 * - Channel toggles (email, push, platform)
 * - Category-specific preferences
 * - Push notification tokens
 * - Quiet hours configuration
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // Channel toggles
    emailEnabled: boolean('email_enabled').default(true).notNull(),
    pushEnabled: boolean('push_enabled').default(false).notNull(),
    platformEnabled: boolean('platform_enabled').default(true).notNull(),

    // Category-specific preferences (which channels per category)
    categoryPreferences: jsonb('category_preferences')
      .$type<CategoryPreferences>()
      .default(DEFAULT_CATEGORY_PREFERENCES),

    // Push notification tokens array
    pushTokens: jsonb('push_tokens').$type<PushToken[]>().default([]),

    // Quiet hours (optional - notifications deferred during these hours)
    quietHoursStart: time('quiet_hours_start'),
    quietHoursEnd: time('quiet_hours_end'),
    timezone: varchar('timezone', { length: 50 }).default('America/Toronto'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Each user has exactly one preferences row
    userIdUnique: uniqueIndex('notification_preferences_user_id_unique').on(table.userId),
  })
)

/**
 * Type inference helpers
 */
export type NotificationPreference = typeof notificationPreferences.$inferSelect
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert
