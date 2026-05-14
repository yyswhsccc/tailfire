import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type DisbursementStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'returned' | 'cancelled'

export interface AdminDisbursementListItem {
  id: string
  invoiceId: string
  invoiceNumber: string
  icLegalName: string
  userId: string
  amountCents: number
  currency: string
  rail: string
  provider: string
  payoutAccountMask: string
  status: DisbursementStatus
  idempotencyKey: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminDisbursementDetail extends AdminDisbursementListItem {
  payoutAccountId: string
  fxRateToCad: string | null
  cadEquivalentBaseCents: number | null
  cadEquivalentTaxCents: number | null
  cadEquivalentTotalCents: number | null
  fxRateSource: string | null
  fxRateDate: string | null
  attempts: Array<{
    id: string
    attemptNumber: number
    provider: string
    rail: string
    outcome: 'sent' | 'failed' | 'returned' | 'cancelled' | null
    reason: string | null
    manualReference: string | null
    manualProofStoragePath: string | null
    manualSentBy: string | null
    startedAt: string
    completedAt: string | null
  }>
  invoice: {
    id: string
    invoiceNumber: string
    icLegalName: string
    reportableBaseCents: number
    taxCents: number
    totalCents: number
    currency: string
  }
}

export const useAdminDisbursements = (status?: DisbursementStatus | 'all') =>
  useQuery<AdminDisbursementListItem[]>({
    queryKey: ['ic-payouts', 'admin', 'disbursements', status ?? 'all'],
    queryFn: () =>
      api.get(`/ic-payouts/admin/disbursements${status && status !== 'all' ? `?status=${status}` : ''}`),
  })

export const useAdminDisbursementDetail = (id: string | null) =>
  useQuery<AdminDisbursementDetail>({
    queryKey: ['ic-payouts', 'admin', 'disbursements', id],
    queryFn: () => api.get(`/ic-payouts/admin/disbursements/${id}`),
    enabled: !!id,
  })

export const useMarkSent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reference, proofPath }: { id: string; reference: string; proofPath?: string }) =>
      api.post(`/ic-payouts/admin/disbursements/${id}/mark-sent`, { reference, proofPath }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'disbursements'] }),
  })
}

export const useMarkFailed = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/ic-payouts/admin/disbursements/${id}/mark-failed`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'disbursements'] }),
  })
}

export const useUploadProof = () => {
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return api.postFormData<{ storagePath: string }>(
        `/ic-payouts/admin/disbursements/${id}/upload-proof`,
        form,
      )
    },
  })
}
