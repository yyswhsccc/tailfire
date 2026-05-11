'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { useAdminDisbursementDetail } from '@/hooks/use-ic-admin-disbursements'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout'
import { ManualSendForm } from '../../[id]/_components/manual-send-form'
import { MarkFailedForm } from '../../[id]/_components/mark-failed-form'
import { AccountDetailsDialog } from '../../[id]/_components/account-details-dialog'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatRail(rail: string): string {
  const map: Record<string, string> = {
    interac_etransfer: 'Interac e-Transfer',
    eft: 'EFT',
    wise: 'Wise',
    wire: 'Wire',
    visa_direct: 'Visa Direct',
  }
  return map[rail] ?? rail
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return <Badge variant="outline" className="text-yellow-600 border-yellow-400">In progress</Badge>
  }
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    sent: 'default',
    failed: 'destructive',
    returned: 'secondary',
    cancelled: 'outline',
  }
  return <Badge variant={variants[outcome] ?? 'outline'}>{outcome}</Badge>
}

function StatusBadge({ status }: { status: string }) {
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

export default function DisbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { isAdmin, isLoading: userLoading } = useUser()
  const { data: disbursement, isLoading } = useAdminDisbursementDetail(id)

  const [sendOpen, setSendOpen] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const [destOpen, setDestOpen] = useState(false)

  if (!userLoading && !isAdmin) {
    router.replace('/commission')
    return null
  }

  if (isLoading || userLoading) {
    return (
      <DashboardLayout>
        <div className="py-8">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!disbursement) {
    return (
      <DashboardLayout>
        <div className="py-8">
          <p className="text-sm text-muted-foreground">Disbursement not found.</p>
        </div>
      </DashboardLayout>
    )
  }

  const canAct = disbursement.status === 'sending'

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <Link
              href="/commission/disbursements?view=disbursements"
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Disbursements
            </Link>
            <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
              {disbursement.invoiceNumber} <StatusBadge status={disbursement.status} />
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{disbursement.icLegalName}</p>
          </div>
          {canAct && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFailOpen(true)}>
                Mark Failed
              </Button>
              <Button onClick={() => setSendOpen(true)}>
                Mark Sent
              </Button>
            </div>
          )}
        </header>

        {/* Summary */}
        <section className="grid grid-cols-2 gap-6 rounded border p-4 bg-muted/20 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase text-muted-foreground mb-2">Payout</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono font-medium">
                {formatCents(disbursement.amountCents, disbursement.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span>{disbursement.provider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rail</span>
              <span>{formatRail(disbursement.rail)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(disbursement.createdAt)}</span>
            </div>
            {disbursement.completedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>{formatDate(disbursement.completedAt)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase text-muted-foreground mb-2">Destination</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account</span>
              <span className="font-mono">{disbursement.payoutAccountMask}</span>
            </div>
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => setDestOpen(true)}>
                View destination
              </Button>
            </div>
          </div>
        </section>

        {/* Invoice summary */}
        <section className="rounded border p-4 bg-muted/20 text-sm space-y-1">
          <div className="text-xs font-medium uppercase text-muted-foreground mb-2">Invoice</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice #</span>
            <span className="font-mono">{disbursement.invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base</span>
            <span className="font-mono">{formatCents(disbursement.invoice.reportableBaseCents, disbursement.invoice.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono">{formatCents(disbursement.invoice.taxCents, disbursement.invoice.currency)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono">{formatCents(disbursement.invoice.totalCents, disbursement.invoice.currency)}</span>
          </div>
          <div className="mt-2">
            <Link
              href={`/commission/disbursements/${disbursement.invoiceId}`}
              className="text-xs text-muted-foreground hover:underline"
            >
              View invoice detail →
            </Link>
          </div>
        </section>

        {/* Attempts */}
        <section>
          <h3 className="font-medium mb-2">Attempt history</h3>
          {disbursement.attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Rail</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disbursement.attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell>{attempt.attemptNumber}</TableCell>
                    <TableCell>{attempt.provider}</TableCell>
                    <TableCell>{formatRail(attempt.rail)}</TableCell>
                    <TableCell className="text-xs">{formatDate(attempt.startedAt)}</TableCell>
                    <TableCell><OutcomeBadge outcome={attempt.outcome} /></TableCell>
                    <TableCell className="font-mono text-xs">
                      {attempt.manualReference ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {attempt.reason ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Dialogs */}
        <ManualSendForm
          disbursementId={id}
          open={sendOpen}
          onClose={() => setSendOpen(false)}
        />
        <MarkFailedForm
          disbursementId={id}
          open={failOpen}
          onClose={() => setFailOpen(false)}
        />
        <AccountDetailsDialog
          open={destOpen}
          onClose={() => setDestOpen(false)}
          rail={disbursement.rail}
          mask={disbursement.payoutAccountMask}
          currency={disbursement.currency}
        />
      </div>
    </DashboardLayout>
  )
}
