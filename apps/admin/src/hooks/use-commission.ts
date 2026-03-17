import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AgentCommissionDueDto,
  CommissionCheckResponseDto,
  CommissionSummaryResponseDto,
  PaginatedCommissionChecksResponseDto,
  CommissionCheckFilterDto,
} from '@tailfire/shared-types/api'

export const commissionKeys = {
  all: ['commission'] as const,
  due: () => [...commissionKeys.all, 'due'] as const,
  checks: (filter?: CommissionCheckFilterDto) => [...commissionKeys.all, 'checks', filter] as const,
  checkDetail: (id: string) => [...commissionKeys.all, 'check', id] as const,
  summary: () => [...commissionKeys.all, 'summary'] as const,
}

export function useCommissionDue() {
  return useQuery({
    queryKey: commissionKeys.due(),
    queryFn: () => api.get<AgentCommissionDueDto[]>('/commission/due'),
  })
}

export function useCommissionChecks(filter?: CommissionCheckFilterDto) {
  const params = new URLSearchParams()
  if (filter?.checkType) params.set('checkType', filter.checkType)
  if (filter?.status) params.set('status', Array.isArray(filter.status) ? filter.status.join(',') : filter.status)
  if (filter?.page) params.set('page', String(filter.page))
  if (filter?.limit) params.set('limit', String(filter.limit))
  const qs = params.toString()

  return useQuery({
    queryKey: commissionKeys.checks(filter),
    queryFn: () => api.get<PaginatedCommissionChecksResponseDto>(`/commission/checks${qs ? `?${qs}` : ''}`),
  })
}

export function useCommissionCheckDetail(id: string | null) {
  return useQuery({
    queryKey: commissionKeys.checkDetail(id || ''),
    queryFn: () => api.get<CommissionCheckResponseDto>(`/commission/checks/${id}`),
    enabled: !!id,
  })
}

export function useCommissionSummary() {
  return useQuery({
    queryKey: commissionKeys.summary(),
    queryFn: () => api.get<CommissionSummaryResponseDto>('/commission/summary'),
  })
}

export function useClaimCommission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<CommissionCheckResponseDto[]>('/commission/claims/me'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
    },
  })
}

export function useAcceptCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (checkId: string) => api.post(`/commission/checks/${checkId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
    },
  })
}

export function useUpdateCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; notes?: string } }) =>
      api.patch(`/commission/checks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
    },
  })
}
