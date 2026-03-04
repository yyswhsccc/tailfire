'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'
import type { PaymentDueSummary } from '@/hooks/use-dashboard'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

interface PaymentsDueWidgetProps {
  payments: PaymentDueSummary[]
}

export function PaymentsDueWidget({ payments }: PaymentsDueWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Payments Due</CardTitle>
          <Link href="/trips" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2" />
            <p className="text-sm">No payments due</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/trips/${payment.tripId}`}
                    className="text-sm font-medium hover:underline truncate block"
                  >
                    {payment.tripName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{payment.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium ${payment.isOverdue ? 'text-red-600' : ''}`}>
                    {formatCurrency(payment.expectedAmountCents - payment.paidAmountCents)}
                  </p>
                  {payment.dueDate && (
                    <p className={`text-xs ${payment.isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {payment.isOverdue ? 'Overdue · ' : ''}
                      {format(new Date(payment.dueDate), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
