'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { AgentCommissionDueDto } from '@tailfire/shared-types/api'
import { ClaimBuilder } from './claim-builder'
import { IC_PAYOUTS_V2_ENABLED } from './agent-claims-tab'
import { AgentAdjustmentsDialog } from './agent-adjustments-dialog'

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100)
}

interface AgentPayableTableProps {
  data: AgentCommissionDueDto[]
  onRecordPayout?: (userId: string) => void
}

export function AgentPayableTable({ data, onRecordPayout }: AgentPayableTableProps) {
  // Per-row adjustments dialog state. Single dialog, fed by the clicked row,
  // keeps the table markup clean.
  const [adjustingAgent, setAdjustingAgent] = useState<{ userId: string; userName: string; currency: string } | null>(null)

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No payable commissions at this time.</p>
  }

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Commission Due</TableHead>
          <TableHead className="text-right">Adjustments</TableHead>
          <TableHead className="text-right">Total Payable</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((agent) => (
          <TableRow key={`${agent.userId}-${agent.currency}`}>
            <TableCell className="font-medium">{agent.userName}</TableCell>
            <TableCell>{agent.currency}</TableCell>
            <TableCell className="text-right">{agent.bookingCount}</TableCell>
            <TableCell className="text-right">{formatCurrency(agent.commissionDueCents, agent.currency)}</TableCell>
            <TableCell className="text-right">
              {/*
                Clickable adjustments figure — opens the agent-adjustments
                management dialog so admins can add/edit/delete inline. The
                figure shown is the rolled-up pending net from
                getCommissionDue, so closing the dialog refreshes here too.
              */}
              <button
                type="button"
                className="underline-offset-2 hover:underline text-right tabular-nums"
                onClick={() => setAdjustingAgent({ userId: agent.userId, userName: agent.userName, currency: agent.currency })}
                aria-label={`Manage adjustments for ${agent.userName}`}
              >
                {formatCurrency(agent.adjustmentsCents, agent.currency)}
              </button>
            </TableCell>
            <TableCell className="text-right font-semibold">{formatCurrency(agent.totalDueCents, agent.currency)}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-2">
                {/*
                  V2: admins can submit a claim AS the agent. The resulting
                  invoice still belongs to the IC; an admin still has to
                  approve it from the Agent Claims tab. This reuses
                  ClaimBuilder by passing onBehalfOfUserId.
                */}
                {IC_PAYOUTS_V2_ENABLED && (
                  <ClaimBuilder
                    onBehalfOfUserId={agent.userId}
                    onBehalfOfName={agent.userName}
                    trigger={
                      <Button size="sm" variant="outline">
                        Generate claim
                      </Button>
                    }
                  />
                )}
                {onRecordPayout && (
                  <Button size="sm" variant="outline" onClick={() => onRecordPayout(agent.userId)}>
                    Record Payout
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>

    {/*
      Single dialog rendered at table root, opened with the clicked row's
      context. Closing it nulls the state so the dialog unmounts and
      query state resets for the next agent.
    */}
    {adjustingAgent && (
      <AgentAdjustmentsDialog
        userId={adjustingAgent.userId}
        userName={adjustingAgent.userName}
        currency={adjustingAgent.currency}
        open
        onOpenChange={(o) => !o && setAdjustingAgent(null)}
      />
    )}
    </>
  )
}
