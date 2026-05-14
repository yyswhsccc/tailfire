'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { useAdminInvoices } from '@/hooks/use-ic-admin-invoices'
import { useAdminDisbursements } from '@/hooks/use-ic-admin-disbursements'
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
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout'
import { InvoiceStatusBadge } from './_components/invoice-status-badge'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatAge(d: string): string {
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatRail(rail: string): string {
  const map: Record<string, string> = {
    interac_etransfer: 'e-Transfer',
    eft: 'EFT',
    wise: 'Wise',
    wire: 'Wire',
    visa_direct: 'Visa Direct',
  }
  return map[rail] ?? rail
}

function DisbursementStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    queued: 'outline',
    sending: 'secondary',
    sent: 'default',
    failed: 'destructive',
    returned: 'secondary',
    cancelled: 'outline',
  }
  return <Badge variant={variants[status] ?? 'outline'}>{status}</Badge>
}

const VIEW_OPTIONS = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'disbursements', label: 'Disbursements' },
] as const

const INVOICE_STATUS_FILTERS = [
  { value: 'submitted', label: 'Submitted (queue)' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
] as const

const DISBURSEMENT_STATUS_FILTERS = [
  { value: 'sending', label: 'Pending send' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'all', label: 'All' },
] as const

// Inner component — reads searchParams inside Suspense boundary
function DisbursementsQueueInner() {
  const { isAdmin, isLoading: userLoading } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()

  const viewParam = searchParams.get('view')
  const [view, setView] = useState<'invoices' | 'disbursements'>(
    viewParam === 'disbursements' ? 'disbursements' : 'invoices',
  )
  const [invoiceFilter, setInvoiceFilter] = useState<string>('submitted')
  const [disbursementFilter, setDisbursementFilter] = useState<string>('sending')

  const invoiceStatusParam = invoiceFilter === 'all' ? undefined : invoiceFilter
  const disbursementStatusParam = disbursementFilter === 'all' ? undefined : disbursementFilter

  const { data: invoices = [], isLoading: invoicesLoading } = useAdminInvoices(
    view === 'invoices' ? invoiceStatusParam : undefined,
  )
  const { data: disbursements = [], isLoading: disbursementsLoading } = useAdminDisbursements(
    view === 'disbursements' ? (disbursementFilter === 'all' ? 'all' : (disbursementStatusParam as any)) : undefined,
  )

  if (!userLoading && !isAdmin) {
    router.replace('/commission')
    return null
  }

  const handleViewChange = (v: string) => {
    setView(v as 'invoices' | 'disbursements')
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">IC commission disbursements</h1>
          <p className="text-sm text-muted-foreground">Review IC commission claims and manage payouts.</p>
        </header>

        {/* Top-level view toggle */}
        <Tabs value={view} onValueChange={handleViewChange}>
          <TabsList>
            {VIEW_OPTIONS.map(v => (
              <TabsTrigger key={v.value} value={v.value}>{v.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {view === 'invoices' && (
          <>
            <Tabs value={invoiceFilter} onValueChange={setInvoiceFilter}>
              <TabsList>
                {INVOICE_STATUS_FILTERS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {invoicesLoading ? (
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
          </>
        )}

        {view === 'disbursements' && (
          <>
            <Tabs value={disbursementFilter} onValueChange={setDisbursementFilter}>
              <TabsList>
                {DISBURSEMENT_STATUS_FILTERS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {disbursementsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : disbursements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No disbursements in this state.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>IC</TableHead>
                    <TableHead>Rail</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disbursements.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.invoiceNumber}</TableCell>
                      <TableCell>{d.icLegalName}</TableCell>
                      <TableCell>{formatRail(d.rail)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.payoutAccountMask}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium">
                        {formatCents(d.amountCents, d.currency)}
                      </TableCell>
                      <TableCell><DisbursementStatusBadge status={d.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatAge(d.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/commission/disbursements/d/${d.id}`}>Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function DisbursementsQueuePage() {
  return (
    <Suspense fallback={null}>
      <DisbursementsQueueInner />
    </Suspense>
  )
}
