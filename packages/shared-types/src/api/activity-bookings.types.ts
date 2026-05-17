/**
 * Activity Bookings API Types
 *
 * Types for the /bookings/activities endpoints that manage activity booking status.
 *
 * Key Distinction:
 * - Activity = Core entity (tour, flight, dining, transportation, custom-cruise, package, etc.)
 * - Package = An activity type that holds sub-activities
 * - Booking = A status applied to an activity (bookingStatus field + bookingDate)
 */

import type { ActivityBookingStatus } from './activities.types'

// Booking Validation

export interface BookingValidationError {
  message: string
  code: string
}

export interface BookingValidationResult {
  valid: boolean
  errors: BookingValidationError[]
}

// Request DTOs

export type MarkActivityBookedDto = {
  bookingDate?: string // YYYY-MM-DD format, defaults to today
  passportVerified?: boolean // Agent confirms all traveler passports have been validated
  nonRefundableAmountCents?: number // Non-refundable portion of deposit, in cents
}

export type ActivityBookingsFilterDto = {
  tripId: string // Required - enforces tenant scoping
  itineraryId?: string
  bookingStatus?: ActivityBookingStatus // Defaults to 'booked'
}

// Cancellation (#452): cancelling a booked activity must record reason +
// refund decision. The DB constraint requires all three to be set whenever
// booking_status='cancelled', so the API will reject incomplete payloads.
export type CancellationRefundDecision =
  | 'full_refund_pending'
  | 'partial_refund_pending'
  | 'no_refund'
  | 'supplier_retains'

export type CancelActivityBookingDto = {
  cancellationReason: string
  refundDecision: CancellationRefundDecision
  refundAmountCents?: number | null // Required for partial_refund_pending; informational for full/no
  cancellationNotes?: string | null
}

// 409 returned by /unmark when the booking has payments or a confirmation #
// — caller must route the user to the cancel-with-policy dialog instead.
export type UnmarkBlockedResponse = {
  code: 'BOOKING_HAS_PAYMENTS_USE_CANCEL'
  activityId: string
  paymentTotalCents: number
  paymentCount: number
  hasConfirmationNumber: boolean
  hint: string
}

// Response DTOs

export type ActivityBookingResponseDto = {
  id: string
  name: string
  activityType: string
  bookingStatus: ActivityBookingStatus
  bookingDate: string | null // YYYY-MM-DD format (UTC)
  parentActivityId: string | null // If set and parent is a package, this activity cannot be booked directly
  paymentScheduleMissing: boolean
  bookable: boolean // false if parentActivityId points to a package (child of package)
  blockedReason: 'part_of_package' | null
  cascadedCount?: number // Number of package children that were also marked booked
}

export type ActivityBookingsListResponseDto = {
  activities: ActivityBookingResponseDto[]
  total: number
  // Pagination deferred for MVP
}
