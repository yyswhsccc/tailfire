'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useDeleteCheck } from '@/hooks/use-commission'
import { useToast } from '@/hooks/use-toast'
import { confirmDialog } from '@/components/ui/confirmation-dialog'
import { CheckEditDialog } from './check-edit-dialog'
import type { CommissionCheckResponseDto } from '@tailfire/shared-types/api'

// Format using the row's currency so USD checks don't render as CAD.
// Fall back to CAD only when the row truly has no currency (legacy rows).
function formatCurrency(cents: number, currency: string | null | undefined): string {
  const code = (currency || 'CAD').toUpperCase()
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: code }).format(cents / 100)
}

function getStatusColor(status: string) {
  switch (status) {
    case 'accepted': return 'bg-green-50 text-green-700'
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'pending': return 'bg-yellow-50 text-yellow-700'
    case 'cancelled': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-50 text-gray-700'
  }
}

interface CommissionChecksTableProps {
  data: CommissionCheckResponseDto[]
  isAdmin: boolean
  onAccept?: (checkId: string) => void
  onReject?: (checkId: string) => void
}

export function CommissionChecksTable({ data, isAdmin, onAccept, onReject }: CommissionChecksTableProps) {
  // Edit/Delete state — admin row-level CRUD (B2).
  // Edit re-uses the PATCH endpoint via CheckEditDialog. Delete is a soft
  // void via status='cancelled' — the server reverses settlements +
  // adjustments atomically (see commission.service.ts).
  const [editing, setEditing] = useState<CommissionCheckResponseDto | null>(null)
  const deleteCheck = useDeleteCheck()
  const { toast } = useToast()

  const handleDelete = async (check: CommissionCheckResponseDto) => {
    const ok = await confirmDialog({
      title: 'Cancel this commission check?',
      description: `Check #${check.checkNumber} will be marked Cancelled. ${
        check.checkType === 'paid'
          ? 'Linked settlements will be reversed and reconciled adjustments will be re-opened.'
          : 'This removes the check from active reconciliation.'
      } This is reversible — Cancelled checks remain in the audit trail.`,
      confirmLabel: 'Cancel check',
      cancelLabel: 'Keep',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await deleteCheck.mutateAsync(check.id)
      toast({ title: 'Check cancelled', description: `#${check.checkNumber} is now Cancelled.` })
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Delete failed'
      toast({ title: 'Cancel failed', description: msg, variant: 'destructive' })
    }
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No commission checks found.</p>
  }

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Check #</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>{isAdmin ? 'Agent / Supplier' : 'From / To'}</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          {isAdmin && <TableHead></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((check) => (
          <TableRow key={check.id}>
            <TableCell className="font-mono text-sm">{check.checkNumber}</TableCell>
            <TableCell>
              <Badge variant="outline">{check.checkType === 'received' ? 'Received' : 'Paid'}</Badge>
            </TableCell>
            <TableCell>{check.checkType === 'received' ? check.senderName : check.recipientName}</TableCell>
            <TableCell>{formatDate(check.checkDate)}</TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(check.checkAmountCents, check.currency)}</TableCell>
            <TableCell>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(check.status)}`}>
                {check.status.charAt(0).toUpperCase() + check.status.slice(1)}
              </span>
            </TableCell>
            {isAdmin && (
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {check.status === 'submitted' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAccept?.(check.id)}>Accept</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onReject?.(check.id)}>Reject</Button>
                    </>
                  )}
                  {/*
                    Row-level CRUD menu. Edit + Delete are admin-only and are
                    intentionally available for all non-locked rows (the server
                    enforces accepted/cancelled lock on the PATCH path).
                  */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={`Actions for check ${check.checkNumber}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditing(check)}
                        disabled={check.status === 'cancelled'}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(check)}
                        disabled={check.status === 'cancelled'}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Cancel / void
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>

    {/* Edit dialog — rendered once, fed by row state */}
    <CheckEditDialog check={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  )
}
