'use client'

/**
 * AgentClaimsTab
 *
 * The "Claims" tab on /commission. Routes through the
 * NEXT_PUBLIC_IC_PAYOUTS_V2_ENABLED gate:
 *
 *   • V2 enabled  → reads from ic_invoices
 *       - admin: GET /ic-payouts/admin/invoices?status=submitted (+ approve / reject)
 *       - agent: GET /ic-payouts/me/invoices
 *   • V2 disabled → reads legacy commission_checks (status: paid)
 *
 * Per Codex review: do NOT union the two feeds long-term — they have
 * different lifecycle semantics. The cutover flag is the seam.
 *
 * When the flag is undefined / empty, we treat it as disabled so legacy
 * still works for any agency that hasn't been migrated.
 */

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  useAdminInvoices,
  useApproveInvoice,
  useRejectInvoice,
  useCancelInvoice,
  type AdminInvoiceListItem,
} from '@/hooks/use-ic-admin-invoices'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMyInvoices } from '@/hooks/use-ic-claims'
import { CommissionChecksTable } from './commission-checks-table'
import type { CommissionCheckResponseDto } from '@tailfire/shared-types/api'

const V2_ENABLED = process.env.NEXT_PUBLIC_IC_PAYOUTS_V2_ENABLED === 'true'

function formatCurrency(cents: number, currency: string | null | undefined): string {
  const code = (currency || 'CAD').toUpperCase()
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: code }).format(cents / 100)
}

function statusColor(status: string): string {
  switch (status) {
    case 'approved': return 'bg-green-50 text-green-700'
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'draft': return 'bg-gray-50 text-gray-700'
    case 'rejected': return 'bg-red-50 text-red-700'
    case 'cancelled': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-50 text-gray-700'
  }
}

interface AgentClaimsTabProps {
  isAdmin: boolean
  /** Legacy fallback — used only when V2 is disabled. */
  legacyData: CommissionCheckResponseDto[]
  legacyOnAccept?: (checkId: string) => Promise<void> | void
  legacyOnReject?: (checkId: string) => Promise<void> | void
}

export function AgentClaimsTab(props: AgentClaimsTabProps) {
  if (!V2_ENABLED) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{props.isAdmin ? 'Agent Payout Claims' : 'My Claims'}</CardTitle>
          <CardDescription>
            {props.isAdmin ? 'Review and approve agent commission claims' : 'Your submitted commission claims'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommissionChecksTable
            data={props.legacyData}
            isAdmin={props.isAdmin}
            onAccept={props.legacyOnAccept}
            onReject={props.legacyOnReject}
          />
        </CardContent>
      </Card>
    )
  }
  return props.isAdmin ? <AdminClaimsCard /> : <AgentClaimsCard />
}

// ─── V2 admin queue ──────────────────────────────────────────────────────────

function AdminClaimsCard() {
  // Admins toggle between Submitted (the default review queue) and All to
  // reach approved/rejected/cancelled invoices when a stuck-state override
  // is needed.
  const [statusFilter, setStatusFilter] = useState<'submitted' | 'all'>('submitted')
  const { data: invoices, isLoading } = useAdminInvoices(
    statusFilter === 'all' ? undefined : statusFilter,
  )
  const approve = useApproveInvoice()
  const reject = useRejectInvoice()
  const cancel = useCancelInvoice()
  const { toast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)

  const onApprove = async (id: string) => {
    setBusyId(id)
    try {
      await approve.mutateAsync(id)
      toast({ title: 'Claim approved' })
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const onReject = async (id: string) => {
    const reason = window.prompt('Reason for rejecting this claim?')
    if (!reason) return
    setBusyId(id)
    try {
      await reject.mutateAsync({ id, reason })
      toast({ title: 'Claim rejected' })
    } catch (e: any) {
      toast({ title: 'Reject failed', description: e?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const onCancel = async (id: string) => {
    const reason = window.prompt(
      'Why are you cancelling this claim?\n\n(Duplicate, stuck state, admin error, IC asked to redo…)',
    )
    if (!reason) return
    setBusyId(id)
    try {
      await cancel.mutateAsync({ id, reason })
      toast({ title: 'Claim cancelled' })
    } catch (e: any) {
      toast({ title: 'Cancel failed', description: e?.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Agent Payout Claims</CardTitle>
          <CardDescription>
            IC commission claims awaiting review. Approve to send to the disbursements queue, reject for a value judgement, or cancel to void a duplicate / stuck claim.
          </CardDescription>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'submitted' | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !invoices || invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {statusFilter === 'submitted'
              ? 'No claims to review right now. Submitted claims will appear here.'
              : 'No claims at all in this agency yet.'}
          </p>
        ) : (
          <InvoiceTable
            invoices={invoices}
            showAgent
            busyId={busyId}
            onApprove={onApprove}
            onReject={onReject}
            onCancel={onCancel}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ─── V2 agent personal list ──────────────────────────────────────────────────

function AgentClaimsCard() {
  const { data: invoices, isLoading } = useMyInvoices() as { data: AdminInvoiceListItem[] | undefined; isLoading: boolean }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Claims</CardTitle>
        <CardDescription>
          The commission claims you have submitted. Approved claims become payouts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !invoices || invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            You haven&apos;t submitted any claims yet.
          </p>
        ) : (
          <InvoiceTable invoices={invoices} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Shared invoice table (used by both admin and agent V2 views) ───────────

interface InvoiceTableProps {
  invoices: AdminInvoiceListItem[]
  showAgent?: boolean
  busyId?: string | null
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  /** Admin-only cancel — duplicate / stuck override. */
  onCancel?: (id: string) => void
}

function InvoiceTable({ invoices, showAgent, busyId, onApprove, onReject, onCancel }: InvoiceTableProps) {
  const showActions = !!(onApprove || onReject || onCancel)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          {showAgent && <TableHead>IC</TableHead>}
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          {showActions && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => {
          // Cancel is allowed pre-disbursement-in-flight. The server enforces
          // the disbursement check, so the UI only filters by invoice status:
          // draft/submitted/approved are eligible.
          const canCancel =
            !!onCancel && (inv.status === 'draft' || inv.status === 'submitted' || inv.status === 'approved')
          return (
            <TableRow key={inv.id}>
              <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
              {showAgent && <TableCell>{inv.icLegalName}</TableCell>}
              <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(inv.totalCents, inv.currency)}
              </TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusColor(inv.status)}`}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {inv.status === 'submitted' && onApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === inv.id}
                        onClick={() => onApprove(inv.id)}
                      >
                        Approve
                      </Button>
                    )}
                    {inv.status === 'submitted' && onReject && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === inv.id}
                        onClick={() => onReject(inv.id)}
                      >
                        Reject
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={busyId === inv.id}
                        onClick={() => onCancel!(inv.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// Re-exported for use elsewhere if needed
export { V2_ENABLED as IC_PAYOUTS_V2_ENABLED }
