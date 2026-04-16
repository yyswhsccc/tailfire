/**
 * Trip Orders React Query Hooks
 *
 * Provides hooks for managing Trip Order snapshots including:
 * - Listing trip order versions
 * - Generating new snapshots
 * - Finalizing drafts
 * - Downloading PDFs from snapshots
 * - Sending emails from snapshots
 *
 * Note: Auth (agencyId, userId) is derived from JWT on the server.
 * The agencyId param in hooks is only used for cache keys and enabled checks.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from './use-toast'

// ============================================================================
// Types
// ============================================================================

export interface TripOrderSnapshot {
  id: string
  tripId: string
  agencyId: string
  versionNumber: number
  orderData: unknown
  paymentSummary: unknown
  bookingDetails: unknown
  businessConfig: unknown
  status: 'draft' | 'finalized' | 'sent'
  createdAt: string
  finalizedAt?: string
  sentAt?: string
  createdBy?: string
  finalizedBy?: string
  sentBy?: string
  emailLogId?: string
}

// userId is derived from JWT on server
export interface SendStoredTripOrderEmailParams {
  to: string[]
  cc?: string[]
  bcc?: string[]
  customSubject?: string
  customMessage?: string
}

interface SendTripOrderEmailResponse {
  success: boolean
  emailLogId?: string
  providerMessageId?: string
  recipients: string[]
  error?: string
}

// ============================================================================
// Query Keys
// ============================================================================

export interface ComplianceCheckResult {
  compliant: boolean
  violations: string[]
}

export const tripOrderKeys = {
  all: ['trip-orders'] as const,
  byTrip: (tripId: string) => [...tripOrderKeys.all, 'trip', tripId] as const,
  latest: (tripId: string) => [...tripOrderKeys.all, 'trip', tripId, 'latest'] as const,
  detail: (id: string) => [...tripOrderKeys.all, 'detail', id] as const,
  compliance: (id: string) => [...tripOrderKeys.all, 'compliance', id] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Fetch all trip order versions for a trip
 * @param agencyId - Used for enabled check only (auth is JWT-based)
 */
export function useTripOrders(
  tripId: string,
  agencyId: string | null,
  options?: Omit<UseQueryOptions<TripOrderSnapshot[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: tripOrderKeys.byTrip(tripId),
    queryFn: async () => {
      return api.get<TripOrderSnapshot[]>(`/trips/${tripId}/trip-orders`)
    },
    enabled: !!tripId && !!agencyId,
    ...options,
  })
}

/**
 * Fetch the latest trip order version for a trip
 * @param agencyId - Used for enabled check only (auth is JWT-based)
 */
export function useLatestTripOrder(
  tripId: string,
  agencyId: string | null,
  options?: Omit<UseQueryOptions<TripOrderSnapshot | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: tripOrderKeys.latest(tripId),
    queryFn: async () => {
      return api.get<TripOrderSnapshot | null>(`/trips/${tripId}/trip-orders/latest`)
    },
    enabled: !!tripId && !!agencyId,
    ...options,
  })
}

/**
 * Fetch a specific trip order by ID
 * @param agencyId - Used for enabled check only (auth is JWT-based)
 */
export function useTripOrder(
  id: string,
  agencyId: string | null,
  options?: Omit<UseQueryOptions<TripOrderSnapshot>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: tripOrderKeys.detail(id),
    queryFn: async () => {
      return api.get<TripOrderSnapshot>(`/trip-orders/${id}`)
    },
    enabled: !!id && !!agencyId,
    ...options,
  })
}

/**
 * Check TICO compliance for a trip order
 * Returns violations that must be resolved before finalization
 */
export function useTripOrderCompliance(
  id: string | null,
  options?: Omit<UseQueryOptions<ComplianceCheckResult>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: tripOrderKeys.compliance(id ?? ''),
    queryFn: async () => {
      return api.get<ComplianceCheckResult>(`/trip-orders/${id}/compliance`)
    },
    enabled: !!id,
    ...options,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Generate a new trip order snapshot
 * Creates a new versioned snapshot of the current trip data
 * Note: userId is derived from JWT on server
 */
export function useGenerateTripOrderSnapshot(tripId: string) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return api.post<TripOrderSnapshot>(`/trips/${tripId}/trip-orders`)
    },
    onSuccess: (data) => {
      // Invalidate list queries to refresh
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.byTrip(tripId) })
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.latest(tripId) })

      toast({
        title: 'Invoice generated',
        description: `Version ${data.versionNumber} created successfully.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to generate invoice',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Finalize a trip order (draft -> finalized)
 * Once finalized, the snapshot cannot be modified
 * Note: userId is derived from JWT on server
 */
export function useFinalizeTripOrder() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return api.post<TripOrderSnapshot>(`/trip-orders/${id}/finalize`)
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.byTrip(data.tripId) })
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.latest(data.tripId) })
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.detail(data.id) })

      toast({
        title: 'Invoice finalized',
        description: 'The invoice has been finalized and is ready to send.',
      })
    },
    onError: (error: any) => {
      // Extract TICO compliance violations from structured error response
      const violations = error?.response?.violations || error?.violations
      const description = violations?.length
        ? `${violations.length} compliance issue${violations.length > 1 ? 's' : ''}: ${violations[0]}`
        : error.message || 'An unexpected error occurred.'

      toast({
        title: 'Cannot finalize — compliance check failed',
        description,
        variant: 'destructive',
      })
    },
  })
}

/**
 * Download PDF from a stored trip order snapshot
 * Note: Auth is handled by JWT in Authorization header
 */
export function useDownloadStoredTripOrder() {
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

      // Get auth headers from supabase session
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`${API_URL}/trip-orders/${id}/download`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to download invoice')
      }

      return response.blob()
    },
    onSuccess: (blob, variables) => {
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${variables.id.slice(0, 8)}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'Invoice downloaded',
        description: 'Your invoice PDF has been downloaded.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to download invoice',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Preview PDF from a stored trip order snapshot
 * Opens the PDF in a new browser tab for review before sending
 */
export function usePreviewStoredTripOrder() {
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`${API_URL}/trip-orders/${id}/download`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to preview invoice')
      }

      return response.blob()
    },
    onSuccess: (blob) => {
      // Open PDF in new tab for preview
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      // Revoke after a delay to give the tab time to load
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to preview invoice',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

/**
 * Send trip order email from stored snapshot
 * Marks the order as sent after successful email delivery
 * Note: userId is derived from JWT on server
 */
export function useSendStoredTripOrderEmail() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      params,
    }: {
      id: string
      params: SendStoredTripOrderEmailParams
    }) => {
      return api.post<SendTripOrderEmailResponse>(`/trip-orders/${id}/send-email`, params)
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh status
      queryClient.invalidateQueries({ queryKey: tripOrderKeys.all })

      toast({
        title: 'Invoice sent',
        description: `Invoice sent to ${data.recipients.join(', ')}.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send invoice',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}
