'use client'

import { usePortalPayments } from '@/hooks/use-portal-payments'
import { CreditCard, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

function formatCurrency(cents: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLES: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  paid: { icon: CheckCircle, color: 'text-green-600 bg-green-50', label: 'Paid' },
  pending: { icon: Clock, color: 'text-amber-600 bg-amber-50', label: 'Pending' },
  overdue: { icon: AlertCircle, color: 'text-red-600 bg-red-50', label: 'Overdue' },
}

export default function PaymentsPage() {
  const { data: payments, isLoading, error } = usePortalPayments()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-3">
        <CreditCard className="size-6 text-phoenix-gold" />
        <div>
          <h1 className="text-2xl font-bold text-phoenix-charcoal">Payments</h1>
          <p className="text-sm text-gray-500">Your trip payment history and upcoming installments</p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          Unable to load payment history. Please try again.
        </div>
      )}

      {payments && payments.length === 0 && (
        <div className="mt-12 text-center">
          <CreditCard className="mx-auto size-12 text-gray-200" />
          <h2 className="mt-4 text-lg font-semibold text-phoenix-charcoal">No payments yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Payment details will appear here once your trip is booked.
          </p>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="mt-6 space-y-4">
          {payments.map((payment) => {
            const summary = payment.paymentSummary
            const total = summary?.totalAmountCents ?? 0
            const paid = summary?.paidAmountCents ?? 0
            const remaining = summary?.remainingAmountCents ?? (total - paid)
            const currency = summary?.currency || 'CAD'

            return (
              <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Invoice #{payment.versionNumber}</p>
                    <p className="text-xs text-gray-400">Sent {formatDate(payment.sentAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-phoenix-charcoal">{formatCurrency(total, currency)}</p>
                    {remaining > 0 && (
                      <p className="text-xs text-amber-600">{formatCurrency(remaining, currency)} remaining</p>
                    )}
                    {remaining <= 0 && total > 0 && (
                      <p className="text-xs text-green-600">Paid in full</p>
                    )}
                  </div>
                </div>

                {summary?.installments && summary.installments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-gray-500">Payment Schedule</p>
                    {summary.installments.map((inst, i) => {
                      const style = STATUS_STYLES[inst.status] || STATUS_STYLES.pending!
                      const Icon = style.icon
                      return (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`size-4 ${style.color.split(' ')[0]}`} />
                            <span className="text-sm">{formatDate(inst.dueDate)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{formatCurrency(inst.amountCents, currency)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.color}`}>
                              {style.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
