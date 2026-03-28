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
  OCR_PROCESSING: 'ocr-processing',
  ENRICHMENT: 'enrichment',
  DOCUMENT_RENDER: 'document-render',
  EMAIL_SYNC: 'email-sync',
  VACATION_SEARCH: 'vacation-search',
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

  // Payment reminder jobs (TICO-compliant)
  PAYMENT_REMINDER: 'payment.reminder',
  PAYMENT_OVERDUE_CHECK: 'payment.overdue_check',

  // Departure reminder jobs
  DEPARTURE_REMINDER: 'departure.reminder',

  // Post-trip automation jobs
  POST_TRIP_THANK_YOU: 'post_trip.thank_you',
  POST_TRIP_FEEDBACK: 'post_trip.feedback',

  // Recurring jobs
  RECURRING_BIRTHDAY_CHECK: 'recurring.birthday_check',
  RECURRING_OVERDUE_PAYMENT_SCAN: 'recurring.overdue_payment_scan',
  RECURRING_TASK_ASSIGNMENT_DIGEST: 'recurring.task_assignment_digest',
  RECURRING_TASK_DUE_REMINDER: 'recurring.task_due_reminder',

  // OCR processing jobs
  OCR_EXTRACT: 'ocr.extract',

  // Enrichment jobs
  HOTEL_PHOTO_ENRICHMENT: 'hotel.photo_enrichment',
  CRUISE_CATALOG_ENRICHMENT: 'cruise.catalog_enrichment',
  ACTIVITY_GEOCODING: 'activity.geocoding',

  // Notification jobs
  NOTIFICATION_SEND: 'notification.send',
  NOTIFICATION_EMAIL_ONLY: 'notification.email_only',
  NOTIFICATION_PUSH: 'notification.push',
  NOTIFICATION_EMAIL: 'notification.email',
  NOTIFICATION_SMS: 'notification.sms',

  // Document render jobs
  DOCUMENT_RENDER_PDF: 'document.render_pdf',

  // Insurance automation jobs
  INSURANCE_PROPOSAL_EMAIL: 'insurance.proposal.email',

  // Email sync jobs (queue registered in EmailAccountsModule, NOT here)
  EMAIL_SYNC: 'email.sync',
  EMAIL_DISPATCH_SYNC: 'email.dispatch_sync',

  // Vacation pricing jobs
  VACATION_SEARCH: 'vacation_search',
  VACATION_HOTEL_ENRICHMENT: 'vacation_hotel_enrichment',
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
  agencyId?: string
  metadata?: Record<string, unknown>
}

/**
 * Payment reminder job for TICO-compliant payment notifications
 */
export interface PaymentReminderJobData {
  type: 'payment.reminder'
  expectedPaymentItemId: string
  tripId: string
  contactId: string
  agencyId: string
  reminderType: '7_days_before' | '3_days_before' | 'due_date' | '1_day_overdue'
}

/**
 * Departure reminder job for pre-trip notifications
 */
export interface DepartureReminderJobData {
  type: 'departure.reminder'
  tripId: string
  contactId: string
  agencyId: string
  daysBeforeDeparture: 30 | 14 | 7 | 1
}

/**
 * Post-trip automation job for thank-you and feedback emails
 */
export interface PostTripJobData {
  type: 'post_trip.thank_you' | 'post_trip.feedback'
  tripId: string
  contactId: string
  agencyId: string
}

/**
 * Recurring job data for daily checks
 */
export interface RecurringJobData {
  type: 'recurring.birthday_check' | 'recurring.overdue_payment_scan' | 'recurring.task_assignment_digest' | 'recurring.task_due_reminder'
  agencyId?: string // Optional - if not provided, runs for all agencies
}

// ============================================================================
// Notification Job Types
// ============================================================================

/**
 * Notification job for push notifications and alerts
 */
export interface NotificationJobData {
  type: 'notification.send' | 'notification.email_only' | 'notification.push' | 'notification.email' | 'notification.sms'
  userId?: string
  agencyId?: string
  title: string
  body: string
  category?: string
  actionUrl?: string
  metadata?: Record<string, unknown>
  // For notification.email_only (contact emails)
  contactId?: string
  templateSlug?: string
  context?: Record<string, unknown>
}

// ============================================================================
// OCR Processing Job Types
// ============================================================================

/**
 * OCR extraction job data for async processing
 */
export interface OcrExtractJobData {
  type: 'ocr.extract'
  jobId: string
  fileStoragePath: string | null
  documentType?: string
  tripId?: string
  contactId?: string
  agencyId: string
  userId: string
}

// ============================================================================
// Enrichment Job Types
// ============================================================================

/**
 * Hotel photo enrichment job — searches Google Places and imports cover photos
 */
export interface HotelPhotoEnrichmentJobData {
  type: 'hotel.photo_enrichment'
  activityId: string
  hotelName: string
  address?: string | null
  agencyId: string
  userId: string
  maxPhotos?: number
}

/**
 * Cruise catalog enrichment job — matches against Traveltek catalog and enriches with ship photos, port calls, region
 */
export interface CruiseCatalogEnrichmentJobData {
  type: 'cruise.catalog_enrichment'
  activityId: string
  cruiseLineName?: string | null
  shipName?: string | null
  departureDate?: string | null
  nights?: number | null
  departurePort?: string | null
  voyageCode?: string | null
  agencyId: string
}

/**
 * Activity geocoding job — resolves location to coordinates based on activity type
 */
export interface ActivityGeocodingJobData {
  type: 'activity.geocoding'
  activityId: string
  activityType: string
  propertyName?: string | null
  address?: string | null
  departureAirportCode?: string | null
  locationName?: string | null
  portName?: string | null
  agencyId: string
}

// ============================================================================
// Insurance Automation Job Types
// ============================================================================

/**
 * Insurance proposal email job data
 * Sends a waiver form link to a traveler (and their dependents if any)
 */
export interface InsuranceProposalEmailData {
  type: 'insurance.proposal.email'
  tripId: string
  recipientTravelerId: string
  recipientName: string
  recipientEmail: string
  dependentTravelerIds: string[]
  formToken: string
  agencyId: string
  tripName: string
}

// ============================================================================
// Document Render Job Types
// ============================================================================

/**
 * Document render job for generating PDFs from templates via puppeteer-core
 */
export interface DocumentRenderJobData {
  templateSlug: string
  contextParams: {
    agencyId: string
    tripId?: string
    contactId?: string
    activityId?: string
    agentId?: string
    paymentItemId?: string
  }
  additionalVariables?: Record<string, unknown>
  outputFormat: 'pdf'
  tripOrderId?: string
  requestedBy?: string
}

// ============================================================================
// Email Sync Job Types (queue registered in EmailAccountsModule, NOT AutomationModule)
// ============================================================================

export interface EmailSyncJobData {
  type: 'email.sync' | 'email.dispatch_sync'
  emailAccountId?: string // required for 'email.sync'
}

// ============================================================================
// Vacation Search Job Types
// ============================================================================

export interface VacationSearchJobData {
  gatewayCode: string
  destDep: string
  dateDep: string // YYYYMMDD
  duration: string
  nbAdults: number
  nbRooms: number
  allInclusive: boolean
  cacheKey: string
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
  name: string
  status: JobStatus
  progress?: number
  data?: Record<string, unknown>
  failedReason?: string
  processedOn?: number
  finishedOn?: number
  timestamp?: number
  delay?: number
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

/**
 * Generate deterministic job ID for payment reminders
 */
export function getPaymentReminderJobId(paymentItemId: string, reminderType: string): string {
  return `payment:${paymentItemId}:reminder:${reminderType}`
}

/**
 * Generate deterministic job ID for departure reminders
 */
export function getDepartureReminderJobId(tripId: string, daysBeforeDeparture: number): string {
  return `trip:${tripId}:departure:${daysBeforeDeparture}d`
}

/**
 * Generate deterministic job ID for post-trip automation
 */
export function getPostTripJobId(tripId: string, type: 'thank_you' | 'feedback'): string {
  return `trip:${tripId}:${type}`
}

/**
 * Generate deterministic job ID for insurance proposal emails
 */
export function getInsuranceProposalJobId(tripId: string, travelerId: string): string {
  return `insurance:${tripId}:${travelerId}`
}
