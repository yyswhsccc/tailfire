'use client'

import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface PortalPayment {
  id: string
  tripId: string
  versionNumber: number
  status: string
  paymentSummary: {
    totalAmountCents?: number
    paidAmountCents?: number
    remainingAmountCents?: number
    currency?: string
    installments?: Array<{
      dueDate: string
      amountCents: number
      status: string
    }>
  } | null
  sentAt: string | null
  createdAt: string | null
}

export function usePortalPayments() {
  return useQuery({
    queryKey: ['portal', 'payments'],
    queryFn: () => portalApi<PortalPayment[]>('/portal/my-payments'),
  })
}
