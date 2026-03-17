import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AgentCommissionDueDto,
  CommissionCheckResponseDto,
  CommissionSummaryResponseDto,
  PaginatedCommissionChecksResponseDto,
  CommissionCheckFilterDto,
  PendingReceivablesFilterDto,
  PendingReceivablesResponseDto,
  CreateDepositDto,
  FinalizeDepositDto,
  DepositDetailResponseDto,
} from '@tailfire/shared-types/api'

export const commissionKeys = {
  all: ['commission'] as const,
  due: () => [...commissionKeys.all, 'due'] as const,
  checks: (filter?: CommissionCheckFilterDto) => [...commissionKeys.all, 'checks', filter] as const,
  checkDetail: (id: string) => [...commissionKeys.all, 'check', id] as const,
  summary: () => [...commissionKeys.all, 'summary'] as const,
  receivables: (filter?: PendingReceivablesFilterDto) => [...commissionKeys.all, 'receivables', filter] as const,
  deposits: () => [...commissionKeys.all, 'deposits'] as const,
  depositDetail: (id: string) => [...commissionKeys.all, 'deposit', id] as const,
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

export function usePendingReceivables(filter: PendingReceivablesFilterDto = {}) {
  const params = new URLSearchParams()
  if (filter.supplierId) params.set('supplierId', filter.supplierId)
  if (filter.search) params.set('search', filter.search)
  if (filter.departureDateFrom) params.set('departureDateFrom', filter.departureDateFrom)
  if (filter.departureDateTo) params.set('departureDateTo', filter.departureDateTo)
  if (filter.status) params.set('status', filter.status)
  if (filter.page) params.set('page', String(filter.page))
  if (filter.limit) params.set('limit', String(filter.limit))
  const qs = params.toString()

  return useQuery({
    queryKey: commissionKeys.receivables(filter),
    queryFn: () => api.get<PendingReceivablesResponseDto>(`/commission/receivables${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateDeposit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDepositDto) =>
      api.post<DepositDetailResponseDto>('/commission/deposits', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
    },
  })
}

export function useFinalizeDeposit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FinalizeDepositDto }) =>
      api.post<DepositDetailResponseDto>(`/commission/deposits/${id}/finalize`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
    },
  })
}

export function useDepositDetail(id: string | null) {
  return useQuery({
    queryKey: commissionKeys.depositDetail(id || ''),
    queryFn: () => api.get<DepositDetailResponseDto>(`/commission/deposits/${id}`),
    enabled: !!id,
  })
}
