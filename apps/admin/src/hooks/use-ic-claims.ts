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

/**
 * Eligible items for the authenticated IC's own claim flow.
 * Pass an `onBehalfOfUserId` to switch into admin "generate claim for
 * agent" mode — the request hits /ic-payouts/admin/users/:id/eligible.
 */
export const useEligibleForClaim = (onBehalfOfUserId?: string) =>
  useQuery<EligibleResponseDto>({
    // Cache key disambiguates self vs admin-target so we don't bleed data
    // between admin-generated claim sessions and the admin's own claim flow.
    queryKey: onBehalfOfUserId
      ? (['ic-payouts', 'admin', 'eligible', onBehalfOfUserId] as const)
      : icClaimsKeys.eligible,
    queryFn: () =>
      api.get<EligibleResponseDto>(
        onBehalfOfUserId
          ? `/ic-payouts/admin/users/${onBehalfOfUserId}/eligible`
          : '/ic-payouts/me/eligible',
      ),
    enabled: onBehalfOfUserId === undefined || onBehalfOfUserId.length > 0,
  })

/**
 * Submit a claim. Pass `onBehalfOfUserId` to submit AS that IC (admin only).
 * The resulting invoice belongs to the IC; the admin's id is recorded on
 * the audit event via the controller.
 */
export const useSubmitClaim = (onBehalfOfUserId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (selectedCheckItemIds: string[]) =>
      api.post<{ invoices: Array<{ id: string }> }>(
        onBehalfOfUserId
          ? `/ic-payouts/admin/users/${onBehalfOfUserId}/claims`
          : '/ic-payouts/me/claims',
        { selectedCheckItemIds },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: icClaimsKeys.eligible })
      qc.invalidateQueries({ queryKey: icClaimsKeys.invoices })
      if (onBehalfOfUserId) {
        qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'eligible', onBehalfOfUserId] })
        // Admin queue refreshes too — new submitted invoice should appear.
        qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'invoices'] })
        // And the /commission Payable-by-Agent total now drops by the claimed amount.
        qc.invalidateQueries({ queryKey: ['commission'] })
      }
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
