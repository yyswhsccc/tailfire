'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { useAdminInvoiceDetail, useApproveInvoice, useRejectInvoice } from '@/hooks/use-ic-admin-invoices'
import { Button } from '@/components/ui/button'
import { DashboardLayout } from '@/components/layout'
import { InvoiceStatusBadge } from '../_components/invoice-status-badge'
import { RejectDialog } from '../_components/reject-dialog'
import { useToast } from '@/hooks/use-toast'

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

export default function DisbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const { isAdmin, isLoading: userLoading } = useUser()
  const { data: invoice, isLoading } = useAdminInvoiceDetail(id)
  const approve = useApproveInvoice()
  const reject = useRejectInvoice()

  if (!userLoading && !isAdmin) {
    router.replace('/commission')
    return null
  }

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(id)
      toast({ title: 'Invoice approved', description: `Invoice ${invoice?.invoiceNumber} approved.` })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast({ title: 'Approve failed', description: message, variant: 'destructive' })
    }
  }

  const handleReject = async (reason: string) => {
    try {
      await reject.mutateAsync({ id, reason })
      toast({ title: 'Invoice rejected', description: 'IC has been notified.' })
      router.push('/commission/disbursements')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast({ title: 'Reject failed', description: message, variant: 'destructive' })
    }
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

  if (!invoice) {
    return (
      <DashboardLayout>
        <div className="py-8">
          <p className="text-sm text-muted-foreground">Invoice not found.</p>
        </div>
      </DashboardLayout>
    )
  }

  const canActOnInvoice = invoice.status === 'submitted'

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <Link href="/commission/disbursements" className="text-sm text-muted-foreground hover:underline">
              ← Queue
            </Link>
            <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
              {invoice.invoiceNumber} <InvoiceStatusBadge status={invoice.status} />
            </h1>
          </div>
          <div className="flex gap-2">
            {invoice.pdfUrl && (
              <Button asChild variant="outline">
                <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">View PDF</a>
              </Button>
            )}
            {canActOnInvoice && (
              <>
                <RejectDialog
                  trigger={<Button variant="outline">Reject</Button>}
                  onConfirm={handleReject}
                  invoiceNumber={invoice.invoiceNumber}
                />
                <Button onClick={handleApprove} disabled={approve.isPending}>
                  {approve.isPending ? 'Approving…' : 'Approve'}
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 rounded border p-4 bg-muted/20">
          <div>
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-1">For (Supplier)</h3>
            <div className="font-medium">{invoice.icLegalName}</div>
            <div className="text-sm">{invoice.icAddress.street}</div>
            <div className="text-sm">
              {invoice.icAddress.city}, {invoice.icAddress.province} {invoice.icAddress.postalCode}
            </div>
            {invoice.icGstHstNumber && (
              <div className="text-sm">GST/HST: {invoice.icGstHstNumber}</div>
            )}
            {invoice.icSinOrBnMask && (
              <div className="text-sm">SIN/BN: {invoice.icSinOrBnMask}</div>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-1">Audit info</h3>
            <div className="text-sm">Invoice date: {invoice.invoiceDate}</div>
            <div className="text-sm">Currency: {invoice.currency}</div>
            <div className="text-sm">
              Place of supply: {invoice.placeOfSupplyJurisdiction} ({invoice.placeOfSupplyRule})
            </div>
            <div className="text-sm">
              Tax: {invoice.taxType} @ {(invoice.taxRateBp / 100).toFixed(2)}%
            </div>
            {invoice.reservationCheckId && (
              <div className="text-sm">
                Reservation check ID: <code className="text-xs">{invoice.reservationCheckId}</code>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-medium mb-2">Line items</h3>
          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Trip</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map(line => (
                  <tr key={line.id} className="border-t">
                    <td className="p-2 capitalize">{line.lineType}</td>
                    <td className="p-2">{line.tripRef ?? '—'}</td>
                    <td className="p-2">{line.description ?? '—'}</td>
                    <td className={`p-2 text-right font-mono tabular-nums${line.amountCents < 0 ? ' text-red-600' : ''}`}>
                      {formatCents(line.amountCents, line.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/20">
                <tr>
                  <td colSpan={3} className="p-2 text-right">Subtotal:</td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {formatCents(invoice.reportableBaseCents, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="p-2 text-right">Tax ({invoice.taxType}):</td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {formatCents(invoice.taxCents, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="p-2 text-right font-medium">Total:</td>
                  <td className="p-2 text-right font-mono tabular-nums font-medium">
                    {formatCents(invoice.totalCents, invoice.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {invoice.status === 'rejected' && invoice.rejectedReason && (
          <section className="rounded border border-destructive bg-destructive/5 p-4">
            <h3 className="text-sm font-medium text-destructive">Rejection reason</h3>
            <p className="text-sm mt-1">{invoice.rejectedReason}</p>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
