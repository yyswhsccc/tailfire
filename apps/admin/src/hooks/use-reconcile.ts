/**
 * use-reconcile.ts (PR-2 Commit 3)
 *
 * Hooks for the per-activity reconciliation gate (PR-1 schema + endpoints).
 *
 *  - usePendingReconciliation()      GET  /commission/tracking/pending-reconciliation
 *  - useReconcileTracking()          POST /commission/tracking/:id/reconcile
 *  - useUnreconcileTracking()        POST /commission/tracking/:id/unreconcile    (reason required)
 *  - useBulkReconcileTracking()      POST /commission/tracking/bulk-reconcile
 *
 * The shared <ReconcileReasonDialog /> component (next file) drives the
 * required-reason capture for the unreconcile flow.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PendingReconciliationRow {
  trackingId: string
  activityPricingId: string
  tripId: string
  tripRef: string | null
  tripName: string | null
  tripStatus: string
  activityName: string | null
  supplier: string | null
  expectedCommissionCents: number
  receivedCents: number
}

export interface ReconcileResult {
  trackingId: string
  activityPricingId: string
  isReconciled: boolean
  reconciliationDate: string | null
  reconciledBy: string | null
}

export const reconcileKeys = {
  all: ['commission-reconcile'] as const,
  pending: () => [...reconcileKeys.all, 'pending'] as const,
}

export function usePendingReconciliation(enabled: boolean = true) {
  return useQuery({
    queryKey: reconcileKeys.pending(),
    queryFn: () =>
      api.get<PendingReconciliationRow[]>('/commission/tracking/pending-reconciliation'),
    enabled,
  })
}

export function useReconcileTracking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ trackingId, reason }: { trackingId: string; reason?: string }) =>
      api.post<ReconcileResult>(`/commission/tracking/${trackingId}/reconcile`, {
        reason: reason ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reconcileKeys.all })
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}

export function useUnreconcileTracking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ trackingId, reason }: { trackingId: string; reason: string }) =>
      api.post<ReconcileResult>(`/commission/tracking/${trackingId}/unreconcile`, {
        reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reconcileKeys.all })
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}

export function useBulkReconcileTracking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ trackingIds, reason }: { trackingIds: string[]; reason?: string }) =>
      api.post<{ reconciledCount: number; results: ReconcileResult[] }>(
        '/commission/tracking/bulk-reconcile',
        { trackingIds, reason: reason ?? undefined },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reconcileKeys.all })
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}
