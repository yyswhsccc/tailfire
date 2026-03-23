/**
 * Activity Bookings Hook
 *
 * React Query hooks for activity booking status management.
 *
 * Key Distinction:
 * - Activity = Core entity (tour, flight, dining, transportation, custom-cruise, package, etc.)
 * - Package = An activity type that holds sub-activities
 * - Booking = A status applied to an activity (bookingStatus field + bookingDate)
 *
 * API: /bookings/activities
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  MarkActivityBookedDto,
  ActivityBookingsFilterDto,
  ActivityBookingResponseDto,
  ActivityBookingsListResponseDto,
} from '@tailfire/shared-types'

export interface BookingValidationError {
  message: string
  code: string
}

export interface BookingValidationResult {
  valid: boolean
  errors: BookingValidationError[]
}

// Query Keys
export const activityBookingKeys = {
  all: ['activity-bookings'] as const,
  lists: () => [...activityBookingKeys.all, 'list'] as const,
  list: (filters: ActivityBookingsFilterDto) => [...activityBookingKeys.lists(), filters] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch activities with booking information
 */
export function useActivityBookings(filters: ActivityBookingsFilterDto) {
  return useQuery({
    queryKey: activityBookingKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('tripId', filters.tripId)
      if (filters.itineraryId) params.set('itineraryId', filters.itineraryId)
      if (filters.bookingStatus) params.set('bookingStatus', filters.bookingStatus)

      return api.get<ActivityBookingsListResponseDto>(`/bookings/activities?${params.toString()}`)
    },
    enabled: !!filters.tripId,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Mark an activity as booked
 *
 * Business rules:
 * - Activities with packageId cannot be booked individually (400 error)
 * - Activities with activityType 'package' CAN be booked
 * - bookingDate defaults to today if not provided
 */
export function useMarkActivityBooked() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      activityId,
      data,
    }: {
      activityId: string
      data?: MarkActivityBookedDto
    }) => {
      const body: MarkActivityBookedDto = {
        ...data,
      }
      return api.post<ActivityBookingResponseDto>(
        `/bookings/activities/${activityId}/mark`,
        body
      )
    },
    onSuccess: () => {
      // Invalidate activity-related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
      queryClient.invalidateQueries({ queryKey: activityBookingKeys.all })
    },
  })
}

/**
 * Remove booking status from an activity
 *
 * Business rules:
 * - Activities with packageId cannot be unmarked individually (400 error)
 * - Sets bookingStatus to 'unbooked' and bookingDate to null
 */
export function useUnmarkActivityBooked() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (activityId: string) => {
      return api.post<ActivityBookingResponseDto>(`/bookings/activities/${activityId}/unmark`)
    },
    onSuccess: () => {
      // Invalidate activity-related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
      queryClient.invalidateQueries({ queryKey: activityBookingKeys.all })
    },
  })
}

/**
 * Validate booking requirements without changing state (dry run)
 */
export function useValidateBooking() {
  return useMutation({
    mutationFn: async (activityId: string) => {
      return api.get<BookingValidationResult>(`/bookings/activities/${activityId}/validate`)
    },
  })
}
