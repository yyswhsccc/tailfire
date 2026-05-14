'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// TODO(future task): Add a decrypt-on-demand admin endpoint
// (GET /ic-payouts/admin/payout-accounts/:id/details) that returns the cleartext
// account details, audit-logged against the admin user. For now, only the mask
// is shown — full account details are visible only at provider-send time.

interface Props {
  open: boolean
  onClose: () => void
  rail: string
  mask: string
  currency: string
  label?: string
}

function formatRail(rail: string): string {
  const map: Record<string, string> = {
    interac_etransfer: 'Interac e-Transfer',
    eft: 'EFT (Electronic Funds Transfer)',
    wise: 'Wise',
    wire: 'Wire Transfer',
    visa_direct: 'Visa Direct',
  }
  return map[rail] ?? rail
}

export function AccountDetailsDialog({ open, onClose, rail, mask, currency, label }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payout destination</DialogTitle>
          <DialogDescription>
            Full account details are visible only at provider-send time. The mask below is sufficient to confirm the destination before sending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded border p-4 bg-muted/20 text-sm">
          {label && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Label</span>
              <span className="font-medium">{label}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rail</span>
            <span className="font-medium">{formatRail(rail)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account</span>
            <span className="font-mono font-medium">{mask}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium">{currency}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Full account details (account numbers, transit codes) are encrypted and accessed only when the payout provider processes the transfer.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
