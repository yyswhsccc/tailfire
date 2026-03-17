'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { AgentCommissionDueDto } from '@tailfire/shared-types/api'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

interface AgentPayableTableProps {
  data: AgentCommissionDueDto[]
  onRecordPayout?: (userId: string) => void
}

export function AgentPayableTable({ data, onRecordPayout }: AgentPayableTableProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No payable commissions at this time.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Commission Due</TableHead>
          <TableHead className="text-right">Adjustments</TableHead>
          <TableHead className="text-right">Total Payable</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((agent) => (
          <TableRow key={agent.userId}>
            <TableCell className="font-medium">{agent.userName}</TableCell>
            <TableCell className="text-right">{agent.bookingCount}</TableCell>
            <TableCell className="text-right">{formatCurrency(agent.commissionDueCents)}</TableCell>
            <TableCell className="text-right">{formatCurrency(agent.adjustmentsCents)}</TableCell>
            <TableCell className="text-right font-semibold">{formatCurrency(agent.totalDueCents)}</TableCell>
            <TableCell>
              {onRecordPayout && (
                <Button size="sm" variant="outline" onClick={() => onRecordPayout(agent.userId)}>
                  Record Payout
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
