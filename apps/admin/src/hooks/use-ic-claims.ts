import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface EligibleItemDto {
  checkItemId: string
  tripRef: string | null
  description: string | null
  commissionCents: number
}

export interface EligibleAdjustmentDto {
  adjustmentId: string
  description: string
  amountCents: number
}

export interface EligibleByCurrencyDto {
  currency: string
  items: EligibleItemDto[]
  adjustments: EligibleAdjustmentDto[]
}

export interface EligibleResponseDto {
  itemsByCurrency: EligibleByCurrencyDto[]
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const icClaimsKeys = {
  eligible: ['ic-payouts', 'me', 'eligible'] as const,
  invoices: ['ic-payouts', 'me', 'invoices'] as const,
  invoice: (id: string) => ['ic-payouts', 'me', 'invoices', id] as const,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const useEligibleForClaim = () =>
  useQuery<EligibleResponseDto>({
    queryKey: icClaimsKeys.eligible,
    queryFn: () => api.get<EligibleResponseDto>('/ic-payouts/me/eligible'),
  })

export const useSubmitClaim = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (selectedCheckItemIds: string[]) =>
      api.post<{ invoices: Array<{ id: string }> }>('/ic-payouts/me/claims', { selectedCheckItemIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: icClaimsKeys.eligible })
      qc.invalidateQueries({ queryKey: icClaimsKeys.invoices })
    },
  })
}

export const useMyInvoices = () =>
  useQuery({
    queryKey: icClaimsKeys.invoices,
    queryFn: () => api.get('/ic-payouts/me/invoices'),
  })

export const useMyInvoiceDetail = (id: string | null) =>
  useQuery({
    queryKey: id ? icClaimsKeys.invoice(id) : ['ic-payouts', 'me', 'invoices', null],
    queryFn: () => api.get(`/ic-payouts/me/invoices/${id}`),
    enabled: !!id,
  })
