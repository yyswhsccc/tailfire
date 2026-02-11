/**
 * Automation System Types
 *
 * Job definitions and types for the centralized automation system using BullMQ.
 */

import type { TripStatus } from '@tailfire/shared-types'

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUES = {
  TRIP_AUTOMATION: 'trip-automation',
  CLIENT_CARE: 'client-care',
  NOTIFICATIONS: 'notifications',
} as const

// Alias for backward compatibility
export const QUEUE_NAMES = QUEUES

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

// ============================================================================
// Job Type Constants
// ============================================================================

export const JOB_TYPES = {
  // Trip automation jobs
  TRIP_STATUS_TRANSITION: 'trip.status.transition',
  TRIP_REMINDER: 'trip.reminder',
  TRIP_BACKFILL: 'trip.backfill',

  // Client care jobs
  CLIENT_WELCOME: 'client.welcome',
  CLIENT_POST_TRIP: 'client.post_trip',
  CLIENT_BIRTHDAY: 'client.birthday',
  CLIENT_FOLLOW_UP: 'client.follow_up',

  // Notification jobs
  NOTIFICATION_PUSH: 'notification.push',
  NOTIFICATION_EMAIL: 'notification.email',
  NOTIFICATION_SMS: 'notification.sms',
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]

// ============================================================================
// Job Types
// ============================================================================

/**
 * Trip status transition job
 * Used for automatic transitions based on start/end dates
 */
export interface TripStatusTransitionJobData {
  type: 'trip.status.transition'
  tripId: string
  toStatus: TripStatus
  reason: 'scheduled' | 'manual'
}

/**
 * Trip reminder job
 * Used for sending reminders about upcoming trips or payments
 */
export interface TripReminderJobData {
  type: 'trip.reminder'
  tripId: string
  reminderType: 'departure_upcoming' | 'payment_due'
}

/**
 * Backfill job for existing trips on deployment
 */
export interface TripBackfillJobData {
  type: 'trip.backfill'
  batchSize?: number
  offset?: number
  agencyId?: string
}

/**
 * Union of all trip automation job types
 */
export type TripAutomationJobData =
  | TripStatusTransitionJobData
  | TripReminderJobData
  | TripBackfillJobData

// ============================================================================
// Client Care Job Types
// ============================================================================

/**
 * Client care job for automated communications
 */
export interface ClientCareJobData {
  type: 'client.welcome' | 'client.post_trip' | 'client.birthday' | 'client.follow_up'
  contactId: string
  tripId?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Notification Job Types
// ============================================================================

/**
 * Notification job for push notifications and alerts
 */
export interface NotificationJobData {
  type: 'notification.push' | 'notification.email' | 'notification.sms'
  userId?: string
  agencyId?: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Job Options
// ============================================================================

export interface ScheduleOptions {
  /** Delay in milliseconds */
  delay?: number
  /** Priority (lower = higher priority) */
  priority?: number
  /** Custom job ID for deduplication */
  jobId?: string
  /** Retry attempts */
  attempts?: number
  /** Backoff strategy */
  backoff?: {
    type: 'exponential' | 'fixed'
    delay: number
  }
}

// ============================================================================
// Job Status
// ============================================================================

export type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'unknown'

export interface JobStatusInfo {
  id: string
  status: JobStatus
  progress?: number
  data?: Record<string, unknown>
  failedReason?: string
  processedOn?: number
  finishedOn?: number
}

// ============================================================================
// Deterministic Job ID Helpers
// ============================================================================

/**
 * Generate deterministic job ID for trip status transitions
 * This ensures only one job per status per trip exists
 */
export function getTripTransitionJobId(tripId: string, toStatus: TripStatus): string {
  return `trip:${tripId}:${toStatus}`
}

/**
 * Generate deterministic job ID for trip reminders
 */
export function getTripReminderJobId(tripId: string, reminderType: string): string {
  return `trip:${tripId}:reminder:${reminderType}`
}
