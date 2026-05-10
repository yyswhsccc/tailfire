import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgencyTaxFilingConfig {
  agencyId: string
  legalName: string
  payerAccountNumber: string
  transmitterNumber: string | null
  filingAddress: {
    street: string
    city: string
    province: string
    postalCode: string
  }
  filingProvince: string
  filingContactName: string | null
  filingContactEmail: string | null
  filingContactPhone: string | null
  effectiveFrom: string
  effectiveTo: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertTaxFilingRequest {
  legalName: string
  payerAccountNumber: string
  transmitterNumber?: string
  filingAddress: {
    street: string
    city: string
    province: string
    postalCode: string
  }
  filingProvince: string
  filingContactName?: string
  filingContactEmail?: string
  filingContactPhone?: string
  effectiveFrom: string
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const agencyTaxFilingKeys = {
  all: ['agency-tax-filing'] as const,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAgencyTaxFiling() {
  return useQuery<AgencyTaxFilingConfig | null>({
    queryKey: agencyTaxFilingKeys.all,
    queryFn: async () => {
      try {
        return await api.get<AgencyTaxFilingConfig>('/ic-payouts/admin/tax-filing-config')
      } catch (err: unknown) {
        // 404 means not yet created — return null, not an error
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
          return null
        }
        throw err
      }
    },
  })
}

export function useUpsertAgencyTaxFiling() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertTaxFilingRequest) =>
      api.put<AgencyTaxFilingConfig>('/ic-payouts/admin/tax-filing-config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: agencyTaxFilingKeys.all }),
  })
}
