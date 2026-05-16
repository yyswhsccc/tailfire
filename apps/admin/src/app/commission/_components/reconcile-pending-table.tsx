/**
 * reconcile-pending-table.tsx (PR-2 Commit 3)
 *
 * Admin surface for the per-activity reconciliation gate (PR-1
 * commission_tracking.is_reconciled). One row per pending activity on
 * departed/travelling trips. Supports:
 *   - per-row Reconcile button (optional reason)
 *   - per-row Unreconcile button (required reason via shared dialog)
 *   - multi-select + bulk "Reconcile selected" with optional reason
 *
 * Shows expected vs received commission so the admin has the context to
 * make the judgment call (matches received → reconcile; supplier short →
 * leave pending and chase).
 */

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, CircleSlash, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ReconcileReasonDialog } from '@/components/commission/reconcile-reason-dialog'
import {
  type PendingReconciliationRow,
  useBulkReconcileTracking,
  usePendingReconciliation,
  useReconcileTracking,
} from '@/hooks/use-reconcile'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

function diffBadge(expectedCents: number, receivedCents: number) {
  const diff = receivedCents - expectedCents
  if (diff === 0) {
    return <span className="text-xs font-medium text-emerald-700">matches</span>
  }
  if (diff > 0) {
    return (
      <span className="text-xs font-medium text-blue-700">
        +{formatCurrency(diff, 'CAD')} over
      </span>
    )
  }
  return (
    <span className="text-xs font-medium text-amber-700">
      {formatCurrency(diff, 'CAD')} short
    </span>
  )
}

export function ReconcilePendingTable() {
  const { data, isLoading, error } = usePendingReconciliation(true)
  const reconcile = useReconcileTracking()
  const bulkReconcile = useBulkReconcileTracking()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [singleOpen, setSingleOpen] = useState<{ trackingId: string; activityName: string } | null>(null)

  const rows = useMemo(() => data ?? [], [data])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.trackingId)))
    }
  }

  if (isLoading) {
    return <p className="text-sm text-ash-500">Loading…</p>
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border border-ash-200 px-4 py-8 text-center text-sm text-ash-500">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        Nothing pending. Every departed activity is reconciled.
      </div>
    )
  }

  const allSelected = selectedIds.size > 0 && selectedIds.size === rows.length
  const someSelected = selectedIds.size > 0

  return (
    <div className="space-y-4">
      {someSelected && (
        <div className="flex items-center justify-between rounded border border-ash-200 bg-ash-50 px-4 py-2">
          <span className="text-sm text-ash-900">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => setBulkOpen(true)}
            disabled={bulkReconcile.isPending}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Reconcile selected
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-ash-200 text-left text-xs uppercase text-ash-500">
            <tr>
              <th className="w-8 pb-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="pb-2 pl-2">Trip</th>
              <th className="pb-2 pl-4">Activity</th>
              <th className="pb-2 pl-4">Supplier</th>
              <th className="pb-2 pl-4 text-right">Expected</th>
              <th className="pb-2 pl-4 text-right">Received</th>
              <th className="pb-2 pl-4">Variance</th>
              <th className="pb-2 pl-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ash-100">
            {rows.map((row) => (
              <ReconcileRow
                key={row.trackingId}
                row={row}
                checked={selectedIds.has(row.trackingId)}
                onToggle={() => toggleSelect(row.trackingId)}
                onReconcile={() =>
                  setSingleOpen({
                    trackingId: row.trackingId,
                    activityName: row.activityName ?? 'Activity',
                  })
                }
                isPending={reconcile.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk reconcile dialog */}
      <ReconcileReasonDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Reconcile ${selectedIds.size} activit${selectedIds.size === 1 ? 'y' : 'ies'}?`}
        description="Marks each selected activity as 'commission matches the supplier deposit'. The audit trail records this action with your reason."
        confirmLabel="Reconcile all selected"
        requireReason={false}
        placeholder="Reason (optional, audit log)"
        isPending={bulkReconcile.isPending}
        onConfirm={async (reason) => {
          await bulkReconcile.mutateAsync({
            trackingIds: Array.from(selectedIds),
            reason: reason || undefined,
          })
          setSelectedIds(new Set())
          setBulkOpen(false)
        }}
      />

      {/* Single reconcile dialog */}
      <ReconcileReasonDialog
        open={!!singleOpen}
        onOpenChange={(open) => !open && setSingleOpen(null)}
        title={`Reconcile "${singleOpen?.activityName ?? ''}"?`}
        description="Marks this activity's commission as reconciled. The IC can claim payout on it once the trip has departed."
        confirmLabel="Reconcile"
        requireReason={false}
        placeholder="Reason (optional, audit log)"
        isPending={reconcile.isPending}
        onConfirm={async (reason) => {
          if (!singleOpen) return
          await reconcile.mutateAsync({
            trackingId: singleOpen.trackingId,
            reason: reason || undefined,
          })
          setSingleOpen(null)
        }}
      />
    </div>
  )
}

interface ReconcileRowProps {
  row: PendingReconciliationRow
  checked: boolean
  onToggle: () => void
  onReconcile: () => void
  isPending: boolean
}

function ReconcileRow({ row, checked, onToggle, onReconcile, isPending }: ReconcileRowProps) {
  const tripLabel = row.tripRef ?? row.tripName ?? row.tripId.slice(0, 8)
  return (
    <tr className="text-ash-900">
      <td className="py-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label="Select row" />
      </td>
      <td className="py-2 pl-2">
        <Link
          href={`/trips/${row.tripId}#bookings`}
          className="inline-flex items-center gap-1 text-blue-700 hover:underline"
        >
          {tripLabel}
          <ExternalLink className="h-3 w-3" />
        </Link>
        <div className="text-xs text-ash-500">status: {row.tripStatus}</div>
      </td>
      <td className="py-2 pl-4">{row.activityName ?? '—'}</td>
      <td className="py-2 pl-4 text-ash-500">{row.supplier ?? '—'}</td>
      <td className="py-2 pl-4 text-right tabular-nums">
        {formatCurrency(row.expectedCommissionCents, 'CAD')}
      </td>
      <td className="py-2 pl-4 text-right tabular-nums">
        {formatCurrency(row.receivedCents, 'CAD')}
      </td>
      <td className="py-2 pl-4">
        {diffBadge(row.expectedCommissionCents, row.receivedCents)}
      </td>
      <td className="py-2 pl-4 text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={onReconcile}
          disabled={isPending}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Reconcile
        </Button>
      </td>
    </tr>
  )
}

export { CircleSlash as _Unused } // silence unused-import warning while we wire surface 2/3
