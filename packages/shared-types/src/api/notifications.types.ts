/**
 * Notification Types
 *
 * Shared types for platform notifications used by both API and frontend.
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

/**
 * Notification channels
 */
export type NotificationChannel = 'email' | 'push' | 'platform'

/**
 * Platform notification status
 */
export type PlatformNotificationStatus = 'unread' | 'read' | 'dismissed'

/**
 * Platform notification as returned by the API
 */
export interface PlatformNotification {
  id: string
  userId: string
  agencyId: string
  category: string
  title: string
  body: string
  actionUrl: string | null
  metadata: Record<string, unknown> | null
  status: PlatformNotificationStatus
  notificationType: string | null
  entityType: string | null
  entityId: string | null
  createdAt: string
  readAt: string | null
  dismissedAt: string | null
}

/**
 * Query parameters for GET /notifications
 */
export interface GetNotificationsParams {
  limit?: number
  cursor?: string
  includeRead?: boolean
  includeDismissed?: boolean
  category?: NotificationCategory
}

/**
 * Response from GET /notifications
 */
export interface NotificationsListResponse {
  notifications: PlatformNotification[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Response from GET /notifications/unread-count
 */
export interface UnreadCountResponse {
  count: number
}

/**
 * Response from mark as read/dismiss operations
 */
export interface NotificationActionResponse {
  success: boolean
  count?: number
}

/**
 * Request body for POST /notifications/mark-multiple-read
 */
export interface MarkMultipleAsReadRequest {
  notificationIds: string[]
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  id: string
  userId: string
  agencyId: string
  emailEnabled: boolean
  pushEnabled: boolean
  platformEnabled: boolean
  categoryPreferences?: Partial<Record<NotificationCategory, NotificationChannel[]>>
  quietHoursStart: string | null
  quietHoursEnd: string | null
  timezone: string
  pushTokenCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Request body for updating notification preferences
 */
export interface UpdateNotificationPreferencesRequest {
  emailEnabled?: boolean
  pushEnabled?: boolean
  platformEnabled?: boolean
  categoryPreferences?: Partial<Record<NotificationCategory, NotificationChannel[]>>
  quietHoursStart?: string | null
  quietHoursEnd?: string | null
  timezone?: string
}

/**
 * Push token info (without sensitive token value)
 */
export interface PushTokenInfo {
  device: string
  platform: 'ios' | 'android' | 'web'
  createdAt: string
  lastUsed?: string
}

/**
 * Request body for registering a push token
 */
export interface RegisterPushTokenRequest {
  token: string
  device: string
  platform: 'ios' | 'android' | 'web'
}
