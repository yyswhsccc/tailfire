'use client'

/**
 * Trip Automation Job History React Query Hooks
 *
 * Provides hooks for viewing and managing per-trip automation job history:
 * - List job history for a trip
 * - Pause / Resume / Cancel individual jobs
 * - Insurance preview and initiation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface AutomationJob {
  id: string
  queueName: string
  jobId: string
  jobType: string
  jobData: Record<string, unknown>
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused' | 'cancelled'
  errorMessage?: string
  scheduledFor?: string
  startedAt?: string
  completedAt?: string
  tripId?: string
  pausedAt?: string
  cancelledAt?: string
  cancelledBy?: string
  createdAt: string
}

export interface InsurancePreviewTraveler {
  id: string
  contactId: string
  firstName: string
  lastName: string
  email: string | null
  dateOfBirth: string | null
  age: number | null
  isMinor: boolean
  insuranceStatus: string | null
  guardian: { travelerId: string; name: string } | null
  needsGuardianAssignment: boolean
}

export interface InsurancePreview {
  tripId: string
  tripName: string
  travelers: InsurancePreviewTraveler[]
}

// ============================================================================
// Query Keys
// ============================================================================

export const tripAutomationKeys = {
  all: ['trip-automations'] as const,
  list: (tripId: string) => [...tripAutomationKeys.all, tripId] as const,
  insurancePreview: (tripId: string) =>
    [...tripAutomationKeys.all, 'insurance-preview', tripId] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Fetch automation job history for a trip
 */
export function useTripAutomations(tripId: string) {
  return useQuery({
    queryKey: tripAutomationKeys.list(tripId),
    queryFn: () => api.get<AutomationJob[]>(`/trips/${tripId}/automations`),
    enabled: !!tripId,
  })
}

/**
 * Fetch insurance preview (travelers with minor detection)
 */
export function useInsurancePreview(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripAutomationKeys.insurancePreview(tripId),
    queryFn: () => api.get<InsurancePreview>(`/trips/${tripId}/insurance/preview`),
    enabled: !!tripId && enabled,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Pause a queued automation job
 */
export function usePauseAutomation(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post(`/trips/${tripId}/automations/${jobId}/pause`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripAutomationKeys.list(tripId) })
    },
  })
}

/**
 * Resume a paused automation job
 */
export function useResumeAutomation(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post(`/trips/${tripId}/automations/${jobId}/resume`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripAutomationKeys.list(tripId) })
    },
  })
}

/**
 * Cancel a queued or paused automation job
 */
export function useCancelAutomation(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post(`/trips/${tripId}/automations/${jobId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripAutomationKeys.list(tripId) })
    },
  })
}

/**
 * Initiate insurance proposal emails for selected travelers
 */
export function useInitiateInsurance(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      travelerIds: string[]
      guardianOverrides?: Record<string, string>
      scheduledFor?: string
    }) => api.post(`/trips/${tripId}/insurance/initiate`, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripAutomationKeys.list(tripId) })
      qc.invalidateQueries({
        queryKey: tripAutomationKeys.insurancePreview(tripId),
      })
    },
  })
}
