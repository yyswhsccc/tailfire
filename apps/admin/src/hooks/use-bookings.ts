/**
 * Bookings Hook
 *
 * React Query hooks for bookings CRUD operations and activity linking.
 * Uses the new bookings API endpoints.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  PackageResponseDto,
  TripPackageTotalsDto,
  CreatePackageDto,
  UpdatePackageDto,
  PackageFilterDto,
  LinkActivitiesToPackageDto,
  UnlinkActivitiesFromPackageDto,
  MarkPackageAsBookedDto,
  UnlinkedActivitiesResponseDto,
  PackageLinkedActivityDto,
  ActivityTravelerDto,
  TravelerLinkItemDto,
  TravelerBookingDto,
} from '@tailfire/shared-types'

// Query Keys
export const bookingKeys = {
  all: ['bookings'] as const,
  lists: () => [...bookingKeys.all, 'list'] as const,
  list: (filters: PackageFilterDto) => [...bookingKeys.lists(), filters] as const,
  details: () => [...bookingKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookingKeys.details(), id] as const,
  linkedActivities: (bookingId: string) => [...bookingKeys.detail(bookingId), 'linkedActivities'] as const,
  tripTotals: (tripId: string) => [...bookingKeys.all, 'tripTotals', tripId] as const,
  unlinkedActivities: (tripId: string, itineraryId?: string) =>
    [...bookingKeys.all, 'unlinkedActivities', tripId, itineraryId] as const,
}

export const activityTravelerKeys = {
  all: ['activity-travelers'] as const,
  lists: () => [...activityTravelerKeys.all, 'list'] as const,
  list: (activityId: string) => [...activityTravelerKeys.lists(), activityId] as const,
}

export const travelerBookingKeys = {
  all: ['traveler-bookings'] as const,
  lists: () => [...travelerBookingKeys.all, 'list'] as const,
  list: (activityId: string) => [...travelerBookingKeys.lists(), activityId] as const,
  tripList: (tripId: string) => [...travelerBookingKeys.all, 'trip', tripId] as const,
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch travelers linked to a specific activity
 * Uses endpoint: GET /activities/:id/travelers
 */
export function useActivityTravelers(activityId: string | null | undefined) {
  return useQuery({
    queryKey: activityTravelerKeys.list(activityId || ''),
    queryFn: () => api.get<ActivityTravelerDto[]>(`/activities/${activityId}/travelers`),
    enabled: !!activityId,
  })
}

/**
 * Fetch per-traveler bookings for a specific activity
 * Uses endpoint: GET /activities/:id/traveler-bookings
 */
export function useTravelerBookings(activityId: string | null | undefined) {
  return useQuery({
    queryKey: travelerBookingKeys.list(activityId || ''),
    queryFn: () => api.get<TravelerBookingDto[]>(`/activities/${activityId}/traveler-bookings`),
    enabled: !!activityId,
    staleTime: 30_000,
  })
}

/**
 * Fetch all traveler bookings for a trip (batch fetch for bookings tab)
 * Uses endpoint: GET /trips/:tripId/traveler-bookings
 */
export function useTripTravelerBookings(tripId: string | null | undefined) {
  return useQuery({
    queryKey: travelerBookingKeys.tripList(tripId || ''),
    queryFn: () => api.get<TravelerBookingDto[]>(`/trips/${tripId}/traveler-bookings`),
    enabled: !!tripId,
    staleTime: 30_000,
  })
}

/**
 * Fetch list of bookings (packages) for a trip
 * Uses trip-scoped endpoint: GET /trips/:tripId/packages
 * Returns full package data - pagination is handled client-side if needed
 */
export function useBookings(filters: PackageFilterDto = {}) {
  return useQuery({
    queryKey: bookingKeys.list(filters),
    queryFn: () => api.get<PackageResponseDto[]>(`/trips/${filters.tripId}/packages`),
    enabled: !!filters.tripId, // Only fetch when tripId is provided
  })
}

interface UseBookingOptions {
  enabled?: boolean
}

/**
 * Fetch single booking by ID with linked activities
 * Uses global activities endpoint: GET /activities/:id
 */
export function useBooking(id: string | null, options?: UseBookingOptions) {
  const { enabled = true } = options ?? {}

  return useQuery({
    queryKey: bookingKeys.detail(id || ''),
    queryFn: () => api.get<PackageResponseDto>(`/activities/${id}`),
    enabled: !!id && enabled,
  })
}

/**
 * Fetch aggregated booking totals for a trip
 * Uses trip-scoped endpoint: GET /trips/:tripId/packages/totals
 */
export function useTripBookingTotals(tripId: string | null) {
  return useQuery({
    queryKey: bookingKeys.tripTotals(tripId || ''),
    queryFn: () => api.get<TripPackageTotalsDto>(`/trips/${tripId}/packages/totals`),
    enabled: !!tripId,
  })
}

/**
 * Fetch unlinked activities for a trip
 * These are activities not linked to any booking/package
 * Uses trip-scoped endpoint: GET /trips/:tripId/unlinked-activities
 */
export function useUnlinkedActivities(tripId: string | null, itineraryId?: string) {
  return useQuery({
    queryKey: bookingKeys.unlinkedActivities(tripId || '', itineraryId),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (itineraryId) params.append('itineraryId', itineraryId)
      const queryString = params.toString()
      const url = `/trips/${tripId}/unlinked-activities${queryString ? `?${queryString}` : ''}`
      return api.get<UnlinkedActivitiesResponseDto>(url)
    },
    enabled: !!tripId,
  })
}

/**
 * Fetch linked activities for a specific booking
 * Used for expandable rows in booking list to show activity details
 * with parent-child grouping (e.g., port_info under cruise)
 * Uses children endpoint: GET /activities/:id/children
 */
export function useBookingLinkedActivities(bookingId: string | null) {
  return useQuery({
    queryKey: bookingKeys.linkedActivities(bookingId || ''),
    queryFn: () => api.get<PackageLinkedActivityDto[]>(`/activities/${bookingId}/children`),
    enabled: !!bookingId,
    // Stale time to reduce refetches when expanding/collapsing rows
    staleTime: 30_000,
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new booking (package)
 * Uses global activities endpoint: POST /activities
 */
export function useCreateBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreatePackageDto) =>
      api.post<PackageResponseDto>('/activities', {
        ...data,
        activityType: 'package',
        itineraryDayId: null, // Packages are floating (no day association)
      }),
    onSuccess: (newBooking) => {
      // Invalidate bookings list for this trip
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      // Invalidate trip totals
      queryClient.invalidateQueries({
        queryKey: bookingKeys.tripTotals(newBooking.tripId),
      })
      // Invalidate unlinked activities (use prefix key to match all itinerary variants)
      queryClient.invalidateQueries({
        queryKey: [...bookingKeys.all, 'unlinkedActivities', newBooking.tripId],
      })
      // Invalidate activities queries so they reflect new package link
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itineraryDays'] })
    },
  })
}

/**
 * Update existing booking with optimistic updates
 * Uses global activities endpoint: PATCH /activities/:id
 */
export function useUpdateBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePackageDto }) =>
      api.patch<PackageResponseDto>(`/activities/${id}`, data),

    onMutate: async (variables) => {
      const { id, data } = variables

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookingKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: bookingKeys.lists() })

      // Snapshot previous values
      const previousBooking = queryClient.getQueryData<PackageResponseDto>(
        bookingKeys.detail(id)
      )

      // Optimistically update detail cache
      if (previousBooking) {
        queryClient.setQueryData<PackageResponseDto>(bookingKeys.detail(id), (old) => {
          if (!old) return old
          return { ...old, ...data } as PackageResponseDto
        })
      }

      return { previousBooking }
    },

    onError: (_error, variables, context) => {
      // Rollback on error
      if (context?.previousBooking) {
        queryClient.setQueryData(
          bookingKeys.detail(variables.id),
          context.previousBooking
        )
      }
    },

    onSettled: (result) => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      if (result) {
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detail(result.id),
        })
        queryClient.invalidateQueries({
          queryKey: bookingKeys.tripTotals(result.tripId),
        })
      }
    },
  })
}

/**
 * Delete booking
 * Linked activities will have parent_activity_id set to null (ON DELETE SET NULL)
 * Uses global activities endpoint: DELETE /activities/:id
 */
export function useDeleteBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, tripId }: { id: string; tripId: string }) =>
      api.delete(`/activities/${id}`).then(() => ({ id, tripId })),

    onMutate: async ({ id }) => {
      // Cancel queries
      await queryClient.cancelQueries({ queryKey: bookingKeys.detail(id) })

      // Remove from cache
      queryClient.removeQueries({ queryKey: bookingKeys.detail(id) })
    },

    onSuccess: ({ tripId }) => {
      // Invalidate lists and totals
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: bookingKeys.tripTotals(tripId),
      })
    },
  })
}

// ============================================================================
// ACTIVITY LINKING MUTATIONS
// ============================================================================

/**
 * Link activities to a booking (package)
 * Uses children endpoint: POST /activities/:id/children
 */
export function useLinkActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingId, activityIds }: { bookingId: string; activityIds: string[] }) => {
      await api.post<PackageLinkedActivityDto[]>(`/activities/${bookingId}/children`, {
        activityIds,
      } as LinkActivitiesToPackageDto)
      // Fetch the full package to return consistent type
      return api.get<PackageResponseDto>(`/activities/${bookingId}`)
    },

    onMutate: async ({ bookingId, activityIds }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: bookingKeys.lists() })
      await queryClient.cancelQueries({ queryKey: [...bookingKeys.all, 'unlinkedActivities'] })

      // Optimistically remove linked activities from all unlinked queries
      queryClient.setQueriesData<UnlinkedActivitiesResponseDto>(
        { queryKey: [...bookingKeys.all, 'unlinkedActivities'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            activities: old.activities.filter((a) => !activityIds.includes(a.id)),
          }
        },
      )

      // Optimistically update booking detail — mark as stale so it refetches
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) })
    },

    onSuccess: (result) => {
      // Refetch to get authoritative server state
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(result.id) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      queryClient.invalidateQueries({ queryKey: bookingKeys.tripTotals(result.tripId) })
      queryClient.invalidateQueries({
        queryKey: [...bookingKeys.all, 'unlinkedActivities', result.tripId],
      })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itineraryDays'] })
    },

    onError: () => {
      // On error, refetch everything to restore correct state
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      queryClient.invalidateQueries({ queryKey: [...bookingKeys.all, 'unlinkedActivities'] })
    },
  })
}

/**
 * Unlink activities from a booking (package)
 * Uses children endpoint: DELETE /activities/:id/children
 */
export function useUnlinkActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingId, activityIds }: { bookingId: string; activityIds: string[] }) => {
      await api.delete<PackageLinkedActivityDto[]>(`/activities/${bookingId}/children`, {
        body: JSON.stringify({ activityIds } as UnlinkActivitiesFromPackageDto),
      })
      // Fetch the full package to return consistent type
      return api.get<PackageResponseDto>(`/activities/${bookingId}`)
    },

    onSuccess: (result) => {
      // Invalidate booking detail and lists
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(result.id) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      // Invalidate trip totals (unlinked activities count changed)
      queryClient.invalidateQueries({ queryKey: bookingKeys.tripTotals(result.tripId) })
      // Invalidate ALL unlinked activities queries for this trip (regardless of itinerary filter)
      // Use prefix key to match all itinerary variants
      queryClient.invalidateQueries({
        queryKey: [...bookingKeys.all, 'unlinkedActivities', result.tripId],
      })
      // Invalidate activities queries
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itineraryDays'] })
    },
  })
}

// ============================================================================
// MARK AS BOOKED MUTATION
// ============================================================================

/**
 * Mark a booking as booked/confirmed
 * Uses PATCH /activities/:id with status and isBooked fields
 */
export function useMarkAsBooked() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ bookingId, data }: { bookingId: string; data: MarkPackageAsBookedDto }) =>
      api.patch<PackageResponseDto>(`/activities/${bookingId}`, {
        status: 'confirmed',
        isBooked: true,
        confirmationNumber: data.confirmationNumber,
        bookingDate: data.bookingDate,
      }),

    onSuccess: (result, { bookingId }) => {
      // Invalidate booking detail, lists, and totals
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      if (result.tripId) {
        queryClient.invalidateQueries({ queryKey: bookingKeys.tripTotals(result.tripId) })
        queryClient.invalidateQueries({ queryKey: bookingKeys.unlinkedActivities(result.tripId) })
      }
      // Refresh Trip Overview (itinerary activities show isBooked/status)
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
    },
  })
}

// ============================================================================
// TRAVELER LINKING MUTATIONS
// ============================================================================

/**
 * Link travelers to a booking (package) or activity
 * Uses travelers endpoint: POST /activities/:id/travelers
 * Supports both legacy (tripTravelerIds) and v2 (links with loyalty) shapes
 */
export function useLinkTravelers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingId,
      tripTravelerIds,
      links,
    }: {
      bookingId: string
      tripTravelerIds?: string[]
      links?: TravelerLinkItemDto[]
    }) => {
      const body = links ? { links } : { tripTravelerIds }
      await api.post(`/activities/${bookingId}/travelers`, body)
      // Fetch the full package to return consistent type
      return api.get<PackageResponseDto>(`/activities/${bookingId}`)
    },

    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(result.id) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      queryClient.invalidateQueries({ queryKey: activityTravelerKeys.list(result.id) })
    },
  })
}

/**
 * Unlink travelers from a booking (package)
 * Uses travelers endpoint: DELETE /activities/:id/travelers
 */
export function useUnlinkTravelers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingId, tripTravelerIds }: { bookingId: string; tripTravelerIds: string[] }) => {
      await api.delete(`/activities/${bookingId}/travelers`, {
        body: JSON.stringify({ tripTravelerIds }),
      })
      // Fetch the full package to return consistent type
      return api.get<PackageResponseDto>(`/activities/${bookingId}`)
    },

    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(result.id) })
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() })
      queryClient.invalidateQueries({ queryKey: activityTravelerKeys.list(result.id) })
    },
  })
}

// ============================================================================
// INSTALLMENT MUTATIONS
// ============================================================================

// NOTE: Installments are now managed through the payment schedule system.
// Use the payment schedule endpoints (expected_payment_items, payment_transactions)
// instead of the old package-specific installment endpoints.
// See: usePaymentSchedules hook in use-payment-schedules.ts

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format package status for display
 */
export function getPackageStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    completed: 'Completed',
  }
  return labels[status] || status
}

/**
 * Get package status badge variant
 */
export function getPackageStatusVariant(
  status: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return 'default'
    case 'pending':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

/**
 * Format payment status for display
 */
export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    unpaid: 'Unpaid',
    deposit_paid: 'Deposit Paid',
    paid: 'Paid',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
  }
  return labels[status] || status
}

/**
 * Get payment status badge variant
 */
export function getPaymentStatusVariant(
  status: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'paid':
      return 'default'
    case 'deposit_paid':
    case 'partially_refunded':
      return 'secondary'
    case 'refunded':
      return 'destructive'
    default:
      return 'outline'
  }
}
