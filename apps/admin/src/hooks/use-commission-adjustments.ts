import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AdjustmentType = 'agent' | 'company' | 'backend'
export type AdjustmentStatus = 'pending' | 'reconciled'

export interface CommissionAdjustmentDto {
  id: string
  agencyId: string
  description: string
  amountCents: number
  currency: string
  adjustmentType: AdjustmentType
  agentUserId: string | null
  companyName: string | null
  status: AdjustmentStatus
  checkId: string | null
  source: string | null
  sourceRef: string | null
  taxType: string | null
  taxRate: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdjustmentListResponse {
  data: CommissionAdjustmentDto[]
  pagination?: { total: number; page: number; limit: number; totalPages: number }
}

export interface CreateAdjustmentPayload {
  description: string
  amountCents: number
  currency?: string
  adjustmentType: AdjustmentType
  agentUserId?: string | null
  companyName?: string | null
  taxType?: string | null
  taxRate?: number | null
}

export interface UpdateAdjustmentPayload {
  description?: string
  amountCents?: number
  adjustmentType?: AdjustmentType
  agentUserId?: string | null
  companyName?: string | null
  taxType?: string | null
  taxRate?: number | null
}

const adjKeys = {
  all: ['commission', 'adjustments'] as const,
  list: (params: { agentUserId?: string; status?: AdjustmentStatus } = {}) =>
    [...adjKeys.all, 'list', params] as const,
}

/**
 * List adjustments, optionally filtered to a single agent + status. The
 * "Payable by Agent" row-expand uses this to show that agent's pending
 * adjustments inline.
 */
export function useAdjustments(params: { agentUserId?: string; status?: AdjustmentStatus } = {}) {
  return useQuery<AdjustmentListResponse>({
    queryKey: adjKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams()
      if (params.agentUserId) qs.set('agentUserId', params.agentUserId)
      if (params.status) qs.set('status', params.status)
      const s = qs.toString()
      return api.get<AdjustmentListResponse>(`/commission/adjustments${s ? `?${s}` : ''}`)
    },
  })
}

export function useCreateAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAdjustmentPayload) => api.post('/commission/adjustments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adjKeys.all })
      // Payable-by-Agent totals roll up adjustments — keep them in sync.
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}

export function useUpdateAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAdjustmentPayload }) =>
      api.patch(`/commission/adjustments/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adjKeys.all })
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}

export function useDeleteAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/commission/adjustments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adjKeys.all })
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}
