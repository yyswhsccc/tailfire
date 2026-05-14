/**
 * Payment Schedules React Query Hooks
 *
 * Provides hooks for fetching and mutating activity-level payment schedules.
 * Integrates with TanStack Query for caching and optimistic updates.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  PaymentScheduleConfigDto,
  CreatePaymentScheduleConfigDto,
  UpdatePaymentScheduleConfigDto,
  CreateExpectedPaymentItemDto,
  UpdateExpectedPaymentItemDto,
  ExpectedPaymentItemDto,
  PaymentTransactionDto,
  CreatePaymentTransactionDto,
  PaymentTransactionListResponseDto,
  TripExpectedPaymentDto,
  TripPaymentTransactionDto,
  ContactPaymentTransactionDto,
} from '@tailfire/shared-types/api'
import { useToast } from './use-toast'

// ============================================================================
// Query Keys
// ============================================================================

export const paymentScheduleKeys = {
  all: ['payment-schedules'] as const,
  byActivityPricing: (activityPricingId: string) =>
    [...paymentScheduleKeys.all, 'activity-pricing', activityPricingId] as const,
  transactions: (expectedPaymentItemId: string) =>
    [...paymentScheduleKeys.all, 'transactions', expectedPaymentItemId] as const,
  tripExpectedPayments: (tripId: string) =>
    [...paymentScheduleKeys.all, 'trip-expected-payments', tripId] as const,
  tripTransactions: (tripId: string) =>
    [...paymentScheduleKeys.all, 'trip-transactions', tripId] as const,
  contactTransactions: (contactId: string) =>
    [...paymentScheduleKeys.all, 'contact-transactions', contactId] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Fetch payment schedule config for an activity pricing ID
 */
export function usePaymentSchedule(activityPricingId: string | null) {
  return useQuery({
    queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId || ''),
    queryFn: async () => {
      if (!activityPricingId) return null
      const result = await api.get<PaymentScheduleConfigDto | null>(
        `/payment-schedules/activity-pricing/${activityPricingId}`
      )
      // Ensure we return null instead of undefined when no schedule exists
      return result || null
    },
    enabled: !!activityPricingId,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create payment schedule configuration
 */
export function useCreatePaymentSchedule() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (data: CreatePaymentScheduleConfigDto) => {
      return api.post<PaymentScheduleConfigDto>('/payment-schedules', data)
    },
    onSuccess: (newSchedule) => {
      // Invalidate the payment schedule cache for this activity pricing
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(newSchedule.activityPricingId),
      })

      toast({
        title: 'Payment schedule created',
        description: 'Payment schedule has been successfully created.',
      })
    },
    onError: (error: any, variables) => {
      // If the server says a schedule already exists (race or stale cache),
      // refresh the local query so the form re-renders with the existing
      // schedule instead of stranding the user on a destructive toast.
      // Bug #346 — user clicks Create, server says "already exists", page
      // doesn't update on its own.
      const message = error?.message || ''
      const isAlreadyExists =
        error?.status === 409 ||
        /already exists/i.test(message)

      if (isAlreadyExists && variables?.activityPricingId) {
        queryClient.invalidateQueries({
          queryKey: paymentScheduleKeys.byActivityPricing(variables.activityPricingId),
        })
        toast({
          title: 'Schedule already exists',
          description: 'Loaded the existing schedule for this activity.',
        })
        return
      }

      toast({
        title: 'Failed to create payment schedule',
        description: message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Update payment schedule configuration
 */
export function useUpdatePaymentSchedule(activityPricingId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (data: UpdatePaymentScheduleConfigDto) => {
      return api.patch<PaymentScheduleConfigDto>(
        `/payment-schedules/activity-pricing/${activityPricingId}`,
        data
      )
    },
    onMutate: async (updatedData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      // Snapshot previous value
      const previousSchedule = queryClient.getQueryData<PaymentScheduleConfigDto>(
        paymentScheduleKeys.byActivityPricing(activityPricingId)
      )

      // Optimistically update
      if (previousSchedule) {
        // Extract nested DTOs from updatedData to avoid type mismatch
        // (UpdateDTO has different shape than ResponseDTO for nested items)
        const { expectedPaymentItems: _updatedItems, creditCardGuarantee: _updatedGuarantee, ...restUpdatedData } = updatedData
        const optimisticData: PaymentScheduleConfigDto = {
          ...previousSchedule,
          ...restUpdatedData,
          depositPercentage: restUpdatedData.depositPercentage != null
            ? String(restUpdatedData.depositPercentage)
            : previousSchedule.depositPercentage,
          updatedAt: new Date().toISOString(),
        }
        queryClient.setQueryData<PaymentScheduleConfigDto>(
          paymentScheduleKeys.byActivityPricing(activityPricingId),
          optimisticData
        )
      }

      return { previousSchedule }
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousSchedule) {
        queryClient.setQueryData(
          paymentScheduleKeys.byActivityPricing(activityPricingId),
          context.previousSchedule
        )
      }

      toast({
        title: 'Failed to update payment schedule',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
    onSuccess: () => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      toast({
        title: 'Payment schedule updated',
        description: 'Payment schedule has been successfully updated.',
      })
    },
  })
}

/**
 * Delete payment schedule configuration
 */
export function useDeletePaymentSchedule(activityPricingId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async () => {
      return api.delete(`/payment-schedules/activity-pricing/${activityPricingId}`)
    },
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      // Snapshot previous value
      const previousSchedule = queryClient.getQueryData<PaymentScheduleConfigDto>(
        paymentScheduleKeys.byActivityPricing(activityPricingId)
      )

      // Optimistically remove
      queryClient.setQueryData(
        paymentScheduleKeys.byActivityPricing(activityPricingId),
        null
      )

      return { previousSchedule }
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousSchedule) {
        queryClient.setQueryData(
          paymentScheduleKeys.byActivityPricing(activityPricingId),
          context.previousSchedule
        )
      }

      toast({
        title: 'Failed to delete payment schedule',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
    onSuccess: () => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      toast({
        title: 'Payment schedule deleted',
        description: 'Payment schedule has been successfully deleted.',
      })
    },
  })
}

/**
 * Update an expected payment item
 */
export function useUpdateExpectedPaymentItem(activityPricingId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: UpdateExpectedPaymentItemDto }) => {
      return api.patch<ExpectedPaymentItemDto>(
        `/payment-schedules/expected-payment-items/${itemId}`,
        data
      )
    },
    onMutate: async ({ itemId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      // Snapshot previous value
      const previousSchedule = queryClient.getQueryData<PaymentScheduleConfigDto>(
        paymentScheduleKeys.byActivityPricing(activityPricingId)
      )

      // Optimistically update
      if (previousSchedule?.expectedPaymentItems) {
        const updatedItems = previousSchedule.expectedPaymentItems.map((item) =>
          item.id === itemId
            ? { ...item, ...data, updatedAt: new Date().toISOString() }
            : item
        )

        queryClient.setQueryData<PaymentScheduleConfigDto>(
          paymentScheduleKeys.byActivityPricing(activityPricingId),
          {
            ...previousSchedule,
            expectedPaymentItems: updatedItems,
          }
        )
      }

      return { previousSchedule }
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousSchedule) {
        queryClient.setQueryData(
          paymentScheduleKeys.byActivityPricing(activityPricingId),
          context.previousSchedule
        )
      }

      toast({
        title: 'Failed to update payment item',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
    onSuccess: () => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      toast({
        title: 'Payment item updated',
        description: 'Expected payment item has been successfully updated.',
      })
    },
  })
}

/**
 * Add an expected payment item to an existing payment schedule config
 */
export function useAddExpectedPaymentItem(activityPricingId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ configId, data }: { configId: string; data: CreateExpectedPaymentItemDto }) => {
      return api.post<ExpectedPaymentItemDto>(
        `/payment-schedules/${configId}/expected-payment-items`,
        data
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      toast({
        title: 'Payment item added',
        description: 'Expected payment item has been added.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to add payment item',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Delete an expected payment item
 */
export function useDeleteExpectedPaymentItem(activityPricingId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (itemId: string) => {
      return api.delete(`/payment-schedules/expected-payment-items/${itemId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })

      toast({
        title: 'Payment item deleted',
        description: 'Expected payment item has been deleted.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete payment item',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Assign a contact to an expected payment item (trip-level, invalidates trip caches)
 */
export function useAssignPaymentContact(tripId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ itemId, contactId }: { itemId: string; contactId: string | null }) => {
      return api.patch<ExpectedPaymentItemDto>(
        `/payment-schedules/expected-payment-items/${itemId}`,
        { contactId }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.tripExpectedPayments(tripId),
      })
      // Also invalidate contact transaction caches (any contact)
      queryClient.invalidateQueries({
        queryKey: [...paymentScheduleKeys.all, 'contact-transactions'],
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign contact',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

// ============================================================================
// Payment Transaction Queries
// ============================================================================

/**
 * Fetch payment transactions for an expected payment item
 */
export function usePaymentTransactions(expectedPaymentItemId: string | null) {
  return useQuery({
    queryKey: paymentScheduleKeys.transactions(expectedPaymentItemId || ''),
    queryFn: async () => {
      if (!expectedPaymentItemId) return null
      return api.get<PaymentTransactionListResponseDto>(
        `/payment-schedules/expected-payment-items/${expectedPaymentItemId}/transactions`
      )
    },
    enabled: !!expectedPaymentItemId,
  })
}

/**
 * Fetch expected payment items for a trip
 */
export function useTripExpectedPayments(tripId: string | null) {
  return useQuery({
    queryKey: paymentScheduleKeys.tripExpectedPayments(tripId || ''),
    queryFn: async () => {
      if (!tripId) return []
      return api.get<TripExpectedPaymentDto[]>(`/trips/${tripId}/expected-payments`)
    },
    enabled: !!tripId,
  })
}

/**
 * Fetch payment transactions for a trip
 */
export function useTripPaymentTransactions(tripId: string | null) {
  return useQuery({
    queryKey: paymentScheduleKeys.tripTransactions(tripId || ''),
    queryFn: async () => {
      if (!tripId) return []
      return api.get<TripPaymentTransactionDto[]>(`/trips/${tripId}/payment-transactions`)
    },
    enabled: !!tripId,
  })
}

// ============================================================================
// Payment Transaction Mutations
// ============================================================================

/**
 * Create a payment transaction
 */
export function useCreatePaymentTransaction(activityPricingId: string, tripId?: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (data: CreatePaymentTransactionDto) => {
      return api.post<PaymentTransactionDto>('/payment-schedules/transactions', data)
    },
    onSuccess: (transaction) => {
      // Invalidate the payment schedule to refresh paidAmountCents
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })
      // Invalidate the transactions list for this expected payment item
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.transactions(transaction.expectedPaymentItemId),
      })
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: paymentScheduleKeys.tripExpectedPayments(tripId),
        })
        queryClient.invalidateQueries({
          queryKey: paymentScheduleKeys.tripTransactions(tripId),
        })
        // Refresh Bookings tab (payment status computed from transactions)
        queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] })
        queryClient.invalidateQueries({ queryKey: ['bookings', 'tripTotals', tripId] })
        queryClient.invalidateQueries({ queryKey: ['bookings', 'unlinkedActivities', tripId] })
      }
      // Refresh Trip Overview (activities may show updated payment status)
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })

      toast({
        title: 'Payment recorded',
        description: 'Payment transaction has been successfully recorded.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to record payment',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Delete a payment transaction
 */
export function useDeletePaymentTransaction(activityPricingId: string, expectedPaymentItemId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (transactionId: string) => {
      return api.delete(`/payment-schedules/transactions/${transactionId}`)
    },
    onSuccess: () => {
      // Invalidate the payment schedule to refresh paidAmountCents
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.byActivityPricing(activityPricingId),
      })
      // Invalidate the transactions list for this expected payment item
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.transactions(expectedPaymentItemId),
      })

      toast({
        title: 'Transaction deleted',
        description: 'Payment transaction has been successfully deleted.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete transaction',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Update the contact ("Paid By") on a payment transaction
 */
export function useUpdateTransactionContact(tripId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ transactionId, contactId }: { transactionId: string; contactId: string | null }) => {
      return api.patch<PaymentTransactionDto>(
        `/payment-schedules/transactions/${transactionId}/contact`,
        { contactId }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.tripTransactions(tripId),
      })
      // Also invalidate contact transaction caches
      queryClient.invalidateQueries({
        queryKey: [...paymentScheduleKeys.all, 'contact-transactions'],
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update contact',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Delete a payment transaction from trip-level view (invalidates trip + contact keys)
 */
export function useDeletePaymentTransactionFromTrip(tripId: string, contactId?: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (transactionId: string) => {
      return api.delete(`/payment-schedules/transactions/${transactionId}`)
    },
    onSuccess: () => {
      // Invalidate trip-level payment keys
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.tripTransactions(tripId),
      })
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.tripExpectedPayments(tripId),
      })
      // Invalidate contact transactions if provided
      if (contactId) {
        queryClient.invalidateQueries({
          queryKey: paymentScheduleKeys.contactTransactions(contactId),
        })
      }
      // Broad invalidation for activity-level caches
      queryClient.invalidateQueries({
        queryKey: paymentScheduleKeys.all,
        predicate: (query) =>
          query.queryKey[1] === 'activity-pricing' || query.queryKey[1] === 'transactions',
      })
      // Refresh bookings tab
      queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'tripTotals', tripId] })

      toast({
        title: 'Transaction deleted',
        description: 'Payment transaction has been successfully deleted.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete transaction',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Fetch payment transactions for a contact across all their trips
 */
export function useContactPaymentTransactions(contactId: string | null) {
  return useQuery({
    queryKey: paymentScheduleKeys.contactTransactions(contactId || ''),
    queryFn: async () => {
      if (!contactId) return []
      return api.get<ContactPaymentTransactionDto[]>(`/contacts/${contactId}/payment-transactions`)
    },
    enabled: !!contactId,
  })
}
