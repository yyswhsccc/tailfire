'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { useAdminInvoices } from '@/hooks/use-ic-admin-invoices'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { DashboardLayout } from '@/components/layout'
import { InvoiceStatusBadge } from './_components/invoice-status-badge'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

const STATUS_FILTERS = [
  { value: 'submitted', label: 'Submitted (queue)' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
] as const

export default function DisbursementsQueuePage() {
  const { isAdmin, isLoading: userLoading } = useUser()
  const router = useRouter()
  const [filter, setFilter] = useState<string>('submitted')
  const statusParam = filter === 'all' ? undefined : filter
  const { data: invoices = [], isLoading } = useAdminInvoices(statusParam)

  if (!userLoading && !isAdmin) {
    router.replace('/commission')
    return null
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">IC commission disbursements</h1>
          <p className="text-sm text-muted-foreground">Review and approve IC commission claims.</p>
        </header>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {STATUS_FILTERS.map(f => (
              <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices in this state.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>IC</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(inv.submittedAt)}</TableCell>
                  <TableCell>{inv.icLegalName}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCents(inv.reportableBaseCents, inv.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCents(inv.taxCents, inv.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-medium">
                    {formatCents(inv.totalCents, inv.currency)}
                  </TableCell>
                  <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/commission/disbursements/${inv.id}`}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  )
}
