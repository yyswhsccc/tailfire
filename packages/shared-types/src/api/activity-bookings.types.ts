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
}

export type ActivityBookingsListResponseDto = {
  activities: ActivityBookingResponseDto[]
  total: number
  // Pagination deferred for MVP
}
