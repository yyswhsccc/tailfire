'use client'

import { useArchivePayoutAccount } from '@/hooks/use-ic-payouts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api'
import type { IcPayoutAccountDto, IcPayoutRail } from '@tailfire/shared-types/api'

// ─── Rail labels ──────────────────────────────────────────────────────────────

const RAIL_LABELS: Record<IcPayoutRail, string> = {
  interac_etransfer: 'Interac e-Transfer',
  eft: 'EFT',
  wise: 'Wise',
  wire: 'Wire',
  visa_direct: 'Visa Direct',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountsTable({ accounts }: { accounts: IcPayoutAccountDto[] }) {
  const archive = useArchivePayoutAccount()
  const { toast } = useToast()

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No payout accounts yet. Add one to start receiving commissions.
      </p>
    )
  }

  const handleArchive = async (id: string, label: string) => {
    try {
      await archive.mutateAsync(id)
      toast({ title: `"${label}" archived` })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to archive account'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Currency</TableHead>
          <TableHead>Rail</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((a) => (
          <TableRow key={a.id}>
            <TableCell>
              {a.label}
              {a.isDefaultForCurrency && (
                <Badge variant="secondary" className="ml-2">
                  Default
                </Badge>
              )}
            </TableCell>
            <TableCell>{a.currency}</TableCell>
            <TableCell>{RAIL_LABELS[a.rail]}</TableCell>
            <TableCell className="font-mono text-xs">{a.detailsMask}</TableCell>
            <TableCell>
              <Badge
                variant={
                  a.status === 'active'
                    ? 'default'
                    : a.status === 'archived'
                      ? 'outline'
                      : 'secondary'
                }
              >
                {a.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {a.status !== 'archived' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() => handleArchive(a.id, a.label)}
                >
                  Archive
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
