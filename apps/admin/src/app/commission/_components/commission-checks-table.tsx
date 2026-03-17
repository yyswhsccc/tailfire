'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import type { CommissionCheckResponseDto } from '@tailfire/shared-types/api'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
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
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No commission checks found.</p>
  }

  return (
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
            <TableCell className="text-right font-medium">{formatCurrency(check.checkAmountCents)}</TableCell>
            <TableCell>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(check.status)}`}>
                {check.status.charAt(0).toUpperCase() + check.status.slice(1)}
              </span>
            </TableCell>
            {isAdmin && (
              <TableCell>
                {check.status === 'submitted' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => onAccept?.(check.id)}>Accept</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onReject?.(check.id)}>Reject</Button>
                  </div>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
