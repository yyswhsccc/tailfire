/**
 * Notification System Types
 *
 * Type definitions for the multi-channel notification system.
 */

/**
 * Notification categories - used to route notifications based on user preferences
 */
export type NotificationCategory =
  | 'payment_reminders'
  | 'trip_updates'
  | 'client_care'
  | 'booking_alerts'
  | 'system_alerts'
  | 'assignment'
  | 'collaboration'
  | 'payment_alert'
  | 'contact_share'

/**
 * Valid notification category values for validation
 */
export const NOTIFICATION_CATEGORY_VALUES = [
  'payment_reminders',
  'trip_updates',
  'client_care',
  'booking_alerts',
  'system_alerts',
  'assignment',
  'collaboration',
  'payment_alert',
  'contact_share',
] as const

/**
 * Notification channels
 */
export type NotificationChannel = 'email' | 'push' | 'platform'

/**
 * Category preferences - maps categories to enabled channels
 */
export interface CategoryPreferences {
  payment_reminders?: NotificationChannel[]
  trip_updates?: NotificationChannel[]
  client_care?: NotificationChannel[]
  booking_alerts?: NotificationChannel[]
  system_alerts?: NotificationChannel[]
  assignment?: NotificationChannel[]
  collaboration?: NotificationChannel[]
  payment_alert?: NotificationChannel[]
  contact_share?: NotificationChannel[]
}

/**
 * Parameters for sending a notification to a user
 */
export interface SendNotificationParams {
  /** Target user ID */
  userId: string
  /** Notification category for routing */
  category: NotificationCategory
  /** Notification title */
  title: string
  /** Notification body content */
  body: string
  /** Additional data/metadata */
  data?: Record<string, unknown>
  /** Force specific channels (overrides preferences) */
  forceChannels?: NotificationChannel[]
  /** Skip quiet hours check */
  skipQuietHours?: boolean
  /** Deep link URL for in-app navigation */
  actionUrl?: string
}

/**
 * Parameters for sending an email to a contact (no user preferences)
 */
export interface SendToContactParams {
  /** Target contact ID */
  contactId: string
  /** Agency ID for context */
  agencyId: string
  /** Email template slug */
  templateSlug: string
  /** Template context for variable resolution */
  context: EmailContext
  /** Trip ID (optional, for template context) */
  tripId?: string
  /** Activity ID (optional, for template context) */
  activityId?: string
  /** Payment item ID (optional, for template context) */
  paymentItemId?: string
  /** Actor ID (for audit logging) */
  createdBy?: string
}

/**
 * Email context for template rendering
 */
export interface EmailContext {
  agencyId?: string
  tripId?: string
  contactId?: string
  activityId?: string
  agentId?: string
  paymentItemId?: string
  /** Additional custom variables */
  customVariables?: Record<string, string>
}

/**
 * Result of a notification send operation
 */
export interface NotificationResult {
  /** Channels that were attempted */
  channels: NotificationChannel[]
  /** Results for each channel */
  results: {
    email?: { success: boolean; error?: string }
    push?: { success: boolean; sentCount?: number; failedCount?: number; error?: string }
    platform?: { success: boolean; notificationId?: string; error?: string }
  }
}

/**
 * Push notification payload
 */
export interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
  /** Deep link URL */
  actionUrl?: string
}

/**
 * Push token for device registration
 */
export interface PushToken {
  token: string
  device: string
  platform: 'ios' | 'android' | 'web'
  createdAt: string
  lastUsed?: string
}

/**
 * Result of a push notification send
 */
export interface PushResult {
  success: number
  failed: number
  failedTokens?: string[]
}
