import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AdminInvoiceListItem {
  id: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  icLegalName: string
  userId: string
  reportableBaseCents: number
  taxCents: number
  totalCents: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  rejectedReason: string | null
}

export interface AdminInvoiceDetail extends AdminInvoiceListItem {
  icAddress: { street: string; city: string; province: string; postalCode: string }
  icDomicileProvince: string
  icGstHstNumber: string | null
  icSinOrBnMask: string | null
  placeOfSupplyJurisdiction: string
  placeOfSupplyRule: string
  taxType: string
  taxRateBp: number
  pdfUrl: string | null
  rctiAuthorizationId: string
  reservationCheckId: string | null
  lines: Array<{
    id: string
    lineType: 'commission' | 'adjustment'
    description: string | null
    tripRef: string | null
    amountCents: number
    currency: string
  }>
}

export const useAdminInvoices = (status?: string) =>
  useQuery<AdminInvoiceListItem[]>({
    queryKey: ['ic-payouts', 'admin', 'invoices', status ?? 'all'],
    queryFn: () =>
      api.get(`/ic-payouts/admin/invoices${status ? `?status=${status}` : ''}`),
  })

export const useAdminInvoiceDetail = (id: string | null) =>
  useQuery<AdminInvoiceDetail>({
    queryKey: ['ic-payouts', 'admin', 'invoices', id],
    queryFn: () => api.get(`/ic-payouts/admin/invoices/${id}`),
    enabled: !!id,
  })

export const useApproveInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/ic-payouts/admin/invoices/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'invoices'] }),
  })
}

export const useRejectInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/ic-payouts/admin/invoices/${id}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'invoices'] }),
  })
}

/**
 * Admin-only cancel — for duplicate / stuck claims. Distinct from reject:
 * neutral framing, allowed on approved invoices (as long as no disbursement
 * has gone in-flight), and unwinds the reservation the same way reject does.
 *
 * Server enforces the source-state policy; the UI just renders the button
 * conditionally based on `status`.
 */
export const useCancelInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/ic-payouts/admin/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ic-payouts', 'admin', 'invoices'] })
      // Cancel unwinds the reservation → commission rollups change too.
      qc.invalidateQueries({ queryKey: ['commission'] })
    },
  })
}
